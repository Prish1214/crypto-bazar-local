import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";
import { withCorsHandlers } from "@/lib/cors";
import {
  NETWORK_TO_CURRENCY,
  createPayout,
  estimateFee,
  getMasterBalance,
  getPayoutStatus,
  getSubPartnerBalance,
  writeOffFromSubPartner,
} from "@/lib/nowpayments.server";

export const Route = createFileRoute("/api/wallet/withdraw")({
  server: {
    handlers: withCorsHandlers({
      GET: async ({ request }: { request: Request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const url = new URL(request.url);
        if (url.searchParams.get("estimate")) {
          const net = (url.searchParams.get("network") ?? "").toLowerCase();
          const amt = Number(url.searchParams.get("amount") ?? 0);
          const currency = NETWORK_TO_CURRENCY[net];
          if (!currency || !Number.isFinite(amt) || amt <= 0) {
            return Response.json({ fee: null });
          }
          const fee = await estimateFee(currency, amt);
          return Response.json({ fee });
        }
        const processed = await processQueuedWithdrawals(auth.user.id, request.url);
        return Response.json({ ok: true, processed });
      },
      POST: async ({ request }: { request: Request }) => {
        const auth = await userFromRequest(request);
        if (!auth) {
          return Response.json(
            { error: "Your login session expired. Please sign out, sign in again, then retry the withdrawal." },
            { status: 401 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as {
          network?: string;
          address?: string;
          amount?: number | string;
        };
        const net = (body.network ?? "").toLowerCase();
        let currency = NETWORK_TO_CURRENCY[net];
        const addr = (body.address ?? "").trim();
        const amt = floorNowAmount(Number(body.amount));

        if (!currency) return Response.json({ error: "Invalid network" }, { status: 400 });
        if (addr.length < 10) return Response.json({ error: "Invalid address" }, { status: 400 });
        if (!Number.isFinite(amt) || amt <= 0)
          return Response.json({ error: "Invalid amount" }, { status: 400 });

        const sb = admin();

        // 1. Check the in-app wallet and the actual NOWPayments custody balance.
        // NOWPayments can credit custody slightly below the user's deposit amount
        // after provider fees. Treat the typed amount as the wallet debit, and
        // send the confirmed custody amount minus payout/network fees.
        const { data: wallet } = await sb
          .from("wallets")
          .select("balance")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        const walletBalance = Number(wallet?.balance ?? 0);
        if (!wallet || walletBalance + EPSILON < amt) {
          return Response.json({ error: "Insufficient balance" }, { status: 400 });
        }

        const { data: prof } = await sb
          .from("profiles")
          .select("nowpayments_sub_partner_id")
          .eq("id", auth.user.id)
          .maybeSingle();

        const subId = prof?.nowpayments_sub_partner_id as string | null;
        if (!subId) {
          return Response.json(
            { error: "Withdrawal setup is incomplete for this wallet. Please generate a deposit address once, then try again." },
            { status: 400 },
          );
        }
        // Candidate currency tickers NOWPayments might use for this network.
        const candidates = CURRENCY_ALIASES[currency] ?? [currency];

        // Best-effort custody readback — informational only. Do NOT block on
        // it: the balance endpoint sometimes returns empty/zero shapes even
        // when funds are confirmed, which previously caused false "no
        // confirmed funds" rejections. We rely on the write-off response to
        // decide what is actually available, and progressively fall back.
        let custodyBalances: Record<string, number> = {};
        try {
          custodyBalances = await getSubPartnerBalance(subId);
        } catch (e: any) {
          console.warn("[withdraw] custody readback failed:", e?.message);
        }

        currency = candidates[0];
        const fee = floorNowAmount(amt * SERVICE_FEE_RATE);
        const payoutAmount = floorNowAmount(amt - fee);
        const net_amount = payoutAmount;

        if (payoutAmount <= 0) {
          return Response.json(
            { error: "Withdrawal amount is too small to process." },
            { status: 400 },
          );
        }

        const selectedCustodyAvailable = maxBalanceForCandidates(custodyBalances, candidates);
        const betterNetwork = findBetterFundedNetwork(custodyBalances, net, payoutAmount);
        if (selectedCustodyAvailable <= EPSILON && betterNetwork) {
          return Response.json(
            {
              error: `Your confirmed custody funds are on ${betterNetwork.label}, not ${net.toUpperCase()}. Select ${betterNetwork.label} on the withdrawal form and use a matching ${betterNetwork.label} address.`,
            },
            { status: 400 },
          );
        }

        // 3. Atomic balance debit; rely on update WHERE balance >= amt for safety.
        const debitOk = await debitWallet(sb, auth.user.id, amt, walletBalance);
        if (!debitOk) {
          return Response.json({ error: "Could not lock balance" }, { status: 409 });
        }

        // 4. Record pending withdrawal.
        const { data: wRow, error: wErr } = await sb
          .from("withdrawals")
          .insert({
            user_id: auth.user.id,
            network: net,
            address: addr,
            amount: amt,
            fee,
            net_amount,
            status: "pending",
          })
          .select("*")
          .single();
        if (wErr || !wRow) {
          // refund
          await refundWallet(sb, auth.user.id, amt);
          return Response.json({ error: "Could not record withdrawal" }, { status: 500 });
        }

        // 5. Payout compensation flow.
        //    The user must receive exactly `payoutAmount` (the "You receive"
        //    figure shown on the confirmation screen — wallet debit minus the
        //    on-chain network fee already netted by NOWPayments). NOWPayments
        //    custody can hold slightly less than the user's wallet balance
        //    because of provider deposit fees. We:
        //      (a) write off whatever custody actually holds (up to
        //          payoutAmount) into the master reserve,
        //      (b) let the platform master reserve cover any shortfall so the
        //          full payoutAmount can leave master, and
        //      (c) log the reserve top-up internally (invisible to the user).
        const origin = new URL(request.url).origin;
        let payoutResult: { payoutId: string; raw: any } | null = null;
        let payoutError = "";
        const sentAmount = payoutAmount; // always what the user was promised
        let writeOffRaw: any = null;
        let writeOffCurrency = candidates[0];
        let writtenOff = 0;
        let payoutSource: "custody_write_off" | "custody_plus_reserve" | "master_reserve" =
          "custody_write_off";

        // Step A: write-off custody → master, as much as the provider allows,
        // capped at payoutAmount. Retries shrink the write-off target only —
        // never the amount the user will receive.
        writeOffLoop: for (const cand of candidates) {
          const readback = floorNowAmount(custodyBalances[cand] ?? 0);
          let target =
            readback > 0 ? Math.min(readback, payoutAmount) : payoutAmount;
          const tried = new Set<number>();
          for (let i = 0; i < 8 && target > 0; i++) {
            const tryAmt = floorNowAmount(target);
            if (tryAmt <= 0 || tried.has(tryAmt)) break;
            tried.add(tryAmt);
            try {
              const wo = await writeOffFromSubPartner({
                subPartnerId: subId,
                currency: cand,
                amount: tryAmt,
              });
              writeOffRaw = wo;
              writeOffCurrency = cand;
              writtenOff = tryAmt;
              break writeOffLoop;
            } catch (e: any) {
              payoutError = String(e?.message ?? "");
              if (!/insufficient|not enough|balance/i.test(payoutError)) break;
              const parsed = parseProviderAvailableAmount(payoutError, cand);
              target =
                Number.isFinite(parsed) && parsed > 0 && parsed < tryAmt
                  ? floorNowAmount(parsed)
                  : floorNowAmount(tryAmt * 0.9);
            }
          }
        }

        const shortfall = floorNowAmount(Math.max(0, payoutAmount - writtenOff));
        payoutSource =
          writtenOff >= payoutAmount
            ? "custody_write_off"
            : writtenOff > 0
              ? "custody_plus_reserve"
              : "master_reserve";

        // Step B: wait a moment for the write-off to settle into master, then
        // pay the FULL payoutAmount from master. If master is short by
        // `shortfall`, that gap is covered by the platform reserve.
        let masterBalancesSnapshot: Record<string, number> = {};
        try {
          masterBalancesSnapshot = await getMasterBalance();
        } catch {}
        if (writtenOff > 0) {
          await waitForMasterLiquidity(writeOffCurrency, payoutAmount);
        }

        const payoutCandidates = [
          writeOffCurrency,
          ...candidates.filter((c) => c !== writeOffCurrency),
        ];
        for (const cand of payoutCandidates) {
          try {
            payoutResult = await createPayout({
              address: addr,
              amount: payoutAmount,
              currency: cand,
              ipnCallbackUrl: `${origin}/api/public/webhooks/nowpayments`,
            });
            writeOffCurrency = cand;
            break;
          } catch (e: any) {
            payoutError = String(e?.message ?? "");
            if (/insufficient|not enough|liquidity|balance/i.test(payoutError)) {
              const ready = await waitForMasterLiquidity(cand, payoutAmount);
              if (ready) {
                try {
                  payoutResult = await createPayout({
                    address: addr,
                    amount: payoutAmount,
                    currency: cand,
                    ipnCallbackUrl: `${origin}/api/public/webhooks/nowpayments`,
                  });
                  writeOffCurrency = cand;
                  break;
                } catch (retryError: any) {
                  payoutError = String(retryError?.message ?? retryError);
                }
              }
            }
          }
        }

        // Record the reserve top-up internally so accounting can reconcile
        // the master balance drawdown against user wallet debits. Best-effort:
        // if the migration hasn't been applied yet, keep the info on the
        // withdrawal row's raw payload.
        if (payoutResult && shortfall > 0) {
          try {
            await sb.from("reserve_adjustments").insert({
              user_id: auth.user.id,
              withdrawal_id: wRow.id,
              currency: writeOffCurrency,
              network: net,
              amount: shortfall,
              reason: "custody_shortfall",
              custody_available: writtenOff,
              payout_amount: payoutAmount,
              raw: {
                custody_balances: custodyBalances,
                master_balances: masterBalancesSnapshot,
                last_write_off_error: payoutError || null,
              },
            });
          } catch (e: any) {
            console.warn("[withdraw] reserve_adjustments insert failed:", e?.message);
          }
        }

        const movedToMaster = writtenOff > 0;

        if (payoutResult) {
          await sb
            .from("withdrawals")
            .update({
              status: "processing",
              nowpayments_payout_id: payoutResult.payoutId,
              raw: {
                payout: payoutResult.raw,
                payout_source: payoutSource,
                write_off: writeOffRaw,
              },
              net_amount: sentAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", wRow.id);
          await sb.from("transactions").insert({
            user_id: auth.user.id,
            type: "withdraw",
            amount: amt,
            network: net,
            description: `Withdrawal ${sentAmount.toFixed(8)} USDT → ${addr.slice(0, 6)}…${addr.slice(-4)}`,
            reference_id: wRow.id,
          });
          return Response.json({ ok: true, withdrawal_id: wRow.id, fee, net_amount: sentAmount });
        }

        if (movedToMaster && payoutError.startsWith("WRITE_OFF_PENDING:")) {
          await sb
            .from("withdrawals")
            .update({
              status: "processing",
              raw: {
                queued_for_payout: true,
                currency: payoutError.split(":")[1],
                note: "NOWPayments accepted the custody write-off request. The payout will be retried without scheduling after the provider confirms the custody-to-payout transfer.",
                payout_amount: sentAmount,
                write_off: writeOffRaw,
              },
              net_amount: sentAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", wRow.id);
          await sb.from("transactions").insert({
            user_id: auth.user.id,
            type: "withdraw",
            amount: amt,
            network: net,
            description: `Withdrawal queued ${sentAmount.toFixed(8)} USDT → ${addr.slice(0, 6)}…${addr.slice(-4)}`,
            reference_id: wRow.id,
          });
          return Response.json({
            ok: true,
            withdrawal_id: wRow.id,
            fee,
            net_amount: sentAmount,
            status: "processing",
            message: "Withdrawal accepted. The custody transfer is pending at NOWPayments and payout will retry automatically until provider liquidity is ready.",
          });
        }

        if (movedToMaster && /insufficient|not enough|liquidity|balance/i.test(payoutError)) {
          await sb
            .from("withdrawals")
            .update({
              status: "processing",
              raw: {
                queued_for_payout: true,
                note: "Custody write-off was accepted, but payout liquidity was not ready. The app will retry the payout without refunding/duplicating the wallet balance.",
                payout_amount: sentAmount,
                last_retry_error: payoutError,
                write_off: writeOffRaw,
              },
              net_amount: sentAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", wRow.id);
          await sb.from("transactions").insert({
            user_id: auth.user.id,
            type: "withdraw",
            amount: amt,
            network: net,
            description: `Withdrawal queued ${sentAmount.toFixed(8)} USDT → ${addr.slice(0, 6)}…${addr.slice(-4)}`,
            reference_id: wRow.id,
          });
          return Response.json({
            ok: true,
            withdrawal_id: wRow.id,
            fee,
            net_amount: sentAmount,
            status: "processing",
            message: "Withdrawal is queued. Provider liquidity is updating and the app will retry the payout automatically.",
          });
        }

        // Refund and report.
        await refundWallet(sb, auth.user.id, amt);
        await sb
          .from("withdrawals")
          .update({ status: "failed", raw: { error: payoutError } })
          .eq("id", wRow.id);
        return Response.json({ error: providerAuthMessage(payoutError) }, { status: 502 });
      },
    }),
  },
});

const EPSILON = 1e-8;
const SERVICE_FEE_RATE = 0;

const CURRENCY_ALIASES: Record<string, string[]> = {
  usdttrc20: ["usdttrc20", "usdttron"],
  usdtbsc: ["usdtbsc", "usdtbep20"],
  usdterc20: ["usdterc20", "usdt"],
  usdtmatic: ["usdtmatic", "usdtpolygon"],
};

async function processQueuedWithdrawals(userId: string, requestUrl: string) {
  const sb = admin();
  const { data: rows } = await sb
    .from("withdrawals")
    .select("id, network, address, net_amount, nowpayments_payout_id, raw")
    .eq("user_id", userId)
    .eq("status", "processing")
    .limit(5);

  if (!rows?.length) return 0;

  const origin = new URL(requestUrl).origin;
  let processed = 0;
  for (const row of rows as any[]) {
    if (row.nowpayments_payout_id) {
      try {
        const status = await getPayoutStatus(String(row.nowpayments_payout_id));
        const w = status?.withdrawals?.[0] ?? status?.result?.withdrawals?.[0] ?? status;
        const txHash = extractPayoutTxHash(w) || extractPayoutTxHash(status);
        const mapped = mapPayoutStatus(w?.status ?? status?.status, txHash, status);
        await sb.rpc("update_withdrawal_status", {
          _payout_id: String(row.nowpayments_payout_id),
          _status: mapped,
          _tx_hash: txHash || null,
          _raw: { ...(row.raw ?? {}), status_check: status },
        });
        processed += 1;
      } catch (e: any) {
        await sb
          .from("withdrawals")
          .update({ raw: { ...(row.raw ?? {}), last_status_error: String(e?.message ?? e) }, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }
      continue;
    }

    const amount = floorNowAmount(Number(row.net_amount ?? row.raw?.payout_amount ?? 0));
    if (amount <= 0) continue;

    const baseCurrency = NETWORK_TO_CURRENCY[String(row.network ?? "").toLowerCase()];
    const candidates = row.raw?.currency
      ? [String(row.raw.currency)]
      : baseCurrency
        ? CURRENCY_ALIASES[baseCurrency] ?? [baseCurrency]
        : [];

    for (const cand of candidates.filter(Boolean)) {
      // Do not block purely on /balance. NOWPayments' balance endpoint can lag
      // or return a different shape while write-off is settling. The real
      // source of truth is the payout response; if it says liquidity is still
      // missing, we keep this row queued and try again later.
      try {
        const payout = await createPayout({
          address: row.address,
          amount,
          currency: cand,
          ipnCallbackUrl: `${origin}/api/public/webhooks/nowpayments`,
        });
        await sb
          .from("withdrawals")
          .update({
            nowpayments_payout_id: payout.payoutId,
            raw: { ...(row.raw ?? {}), payout: payout.raw, queued_for_payout: false },
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        processed += 1;
        break;
      } catch (e: any) {
        await sb
          .from("withdrawals")
          .update({
            raw: { ...(row.raw ?? {}), last_retry_error: String(e?.message ?? e) },
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }
  }
  return processed;
}

async function debitWallet(sb: ReturnType<typeof admin>, userId: string, amount: number, fallbackBalance: number) {
  const rounded = floorNowAmount(amount);
  try {
    const { data, error } = await sb.rpc("lock_wallet_balance", { _user_id: userId, _amount: rounded });
    if (!error) return data !== null && data !== undefined;
  } catch {
    // Migration not installed yet; fallback below.
  }

  const { error, data } = await sb
    .from("wallets")
    .update({ balance: floorNowAmount(fallbackBalance - rounded), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .gte("balance", rounded)
    .select("balance")
    .maybeSingle();
  return !error && !!data;
}

async function refundWallet(sb: ReturnType<typeof admin>, userId: string, amount: number) {
  const rounded = floorNowAmount(amount);
  try {
    const { error } = await sb.rpc("refund_wallet_balance", { _user_id: userId, _amount: rounded });
    if (!error) return;
  } catch {
    // Migration not installed yet; fallback below.
  }

  const { data: current } = await sb.from("wallets").select("balance").eq("user_id", userId).maybeSingle();
  await sb
    .from("wallets")
    .update({ balance: floorNowAmount(Number(current?.balance ?? 0) + rounded), updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

function floorNowAmount(amount: number) {
  const factor = 100_000_000;
  return Math.floor((amount + Number.EPSILON) * factor) / factor;
}

function summarizeBalances(balances: Record<string, number>) {
  return Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${floorNowAmount(v).toFixed(8)}`)
    .join(", ") || "no confirmed funds";
}

function parseProviderAvailableAmount(message: string, currency: string) {
  const normalizedCurrency = currency.replace(/[^a-z0-9]/gi, "");
  const specific = new RegExp(`${normalizedCurrency}[^0-9]{0,40}([0-9]+(?:\\.[0-9]+)?)`, "i").exec(message);
  if (specific?.[1]) return Number(specific[1]);
  const holds = /(?:holds|available|balance|custody)[^0-9]{0,80}([0-9]+(?:\.[0-9]+)?)/i.exec(message);
  if (holds?.[1]) return Number(holds[1]);
  return NaN;
}

function maxBalanceForCandidates(balances: Record<string, number>, candidates: string[]) {
  return candidates.reduce((max, c) => Math.max(max, floorNowAmount(balances[c] ?? 0)), 0);
}

function findBetterFundedNetwork(
  balances: Record<string, number>,
  selectedNetwork: string,
  neededAmount: number,
) {
  for (const [network, currency] of Object.entries(NETWORK_TO_CURRENCY)) {
    if (network === selectedNetwork) continue;
    const candidates = CURRENCY_ALIASES[currency] ?? [currency];
    if (maxBalanceForCandidates(balances, candidates) + EPSILON >= neededAmount) {
      return { network, label: network.toUpperCase() };
    }
  }
  return null;
}

async function tryMasterReservePayout(opts: {
  address: string;
  amount: number;
  candidates: string[];
  origin: string;
}): Promise<{
  payoutResult: { payoutId: string; raw: any } | null;
  sentAmount: number;
  masterBalances: Record<string, number>;
  error: string;
}> {
  let masterBalances: Record<string, number> = {};
  try {
    masterBalances = await getMasterBalance();
  } catch (e: any) {
    return {
      payoutResult: null,
      sentAmount: opts.amount,
      masterBalances,
      error: `master balance read failed: ${String(e?.message ?? e)}`,
    };
  }

  let error = "";
  for (const cand of opts.candidates) {
    const available = floorNowAmount(masterBalances[cand] ?? 0);
    if (available + EPSILON < opts.amount) continue;
    try {
      const payoutResult = await createPayout({
        address: opts.address,
        amount: opts.amount,
        currency: cand,
        ipnCallbackUrl: `${opts.origin}/api/public/webhooks/nowpayments`,
      });
      return { payoutResult, sentAmount: opts.amount, masterBalances, error: "" };
    } catch (e: any) {
      error = String(e?.message ?? e);
    }
  }

  return {
    payoutResult: null,
    sentAmount: opts.amount,
    masterBalances,
    error: error || `master reserve has insufficient same-network balance (${summarizeBalances(masterBalances)})`,
  };
}

function mapPayoutStatus(s: string | undefined, txHash?: string | null, raw?: any): string {
  if (isWriteOffToMaster(raw)) return "processing";
  switch ((s ?? "").toLowerCase()) {
    case "finished":
    case "sent":
    case "completed":
      // NOWPayments also reports custody write-offs as "finished". A user
      // withdrawal is only complete after the external payout has an on-chain
      // transaction hash for the requested address.
      return txHash ? "completed" : "processing";
    case "failed":
    case "rejected":
    case "rejected_not_checked":
      return "failed";
    case "creating":
    case "new":
    case "waiting":
    case "processing":
    default:
      return "processing";
  }
}

function extractPayoutTxHash(input: any): string {
  const candidates = [
    input?.hash,
    input?.tx_hash,
    input?.txid,
    input?.transaction_hash,
    input?.withdrawal_hash,
    input?.payout_hash,
    input?.result?.hash,
    input?.result?.tx_hash,
    input?.withdrawals?.[0]?.hash,
    input?.withdrawals?.[0]?.tx_hash,
    input?.result?.withdrawals?.[0]?.hash,
    input?.result?.withdrawals?.[0]?.tx_hash,
  ];
  return String(candidates.find((v) => typeof v === "string" && v.trim().length > 8) ?? "").trim();
}

function isWriteOffToMaster(input: any): boolean {
  const text = [
    input?.transaction_type,
    input?.type,
    input?.operation,
    input?.event,
    input?.description,
    input?.result?.transaction_type,
    input?.result?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /withdrawal\s*to\s*master|write[-_\s]*off|sub[-_\s]*partner/.test(text);
}

async function waitForMasterLiquidity(currency: string, amount: number) {
  for (let i = 0; i < 4; i++) {
    try {
      const balances = await getMasterBalance();
      if (floorNowAmount(balances[currency] ?? 0) + EPSILON >= amount) return true;
    } catch (e: any) {
      console.warn("[withdraw] master balance readback failed:", e?.message);
    }
    await delay(2000);
  }
  return false;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerAuthMessage(raw: string) {
  if (/NOWPayments \/auth failed \(401\)|NOWPayments \/auth failed \(403\)|unauthori[sz]ed/i.test(raw)) {
    return "NOWPayments rejected the payout login. Update NOWPAYMENTS_EMAIL and NOWPAYMENTS_PASSWORD with the exact live NOWPayments account login, then retry.";
  }
  if (/NOWPayments \/payout failed \(401\)|NOWPayments \/payout failed \(403\)|NOWPayments \/sub-partner/i.test(raw) && /unauthori[sz]ed|access denied/i.test(raw)) {
    return "NOWPayments rejected the payout API credentials. Update the live NOWPAYMENTS_API_KEY, email, and password from the same NOWPayments account that owns the custody balance.";
  }
  if (/invalid ip|ip whitelist/i.test(raw)) {
    return "Withdrawals are temporarily unavailable because the payment provider is rejecting this server IP. Disable the API IP whitelist in NOWPayments, then retry.";
  }
  if (/unauthori[sz]ed|access denied|invalid api|invalid credentials|jwt/i.test(raw)) {
    return "Withdrawal provider authorization failed. Please reconnect the live NOWPayments API key, email, and password for the same account that holds custody funds.";
  }
  if (/insufficient balance|not enough/i.test(raw)) {
    return "Withdrawal could not start because NOWPayments did not accept the custody write-off for this amount/network. The wallet was refunded automatically. Check that the user's deposit is confirmed in the same network custody balance, then retry.";
  }
  return `Payout failed: ${raw}`;
}
