import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";
import { NETWORK_TO_CURRENCY, createPayout, writeOffFromSubPartner, getSubPartnerBalance } from "@/lib/nowpayments.server";

export const Route = createFileRoute("/api/wallet/withdraw")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const amt = Number(body.amount);

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

        // 3. Atomic balance debit; rely on update WHERE balance >= amt for safety.
        const { error: debitErr, data: debited } = await sb
          .from("wallets")
          .update({ balance: walletBalance - amt, updated_at: new Date().toISOString() })
          .eq("user_id", auth.user.id)
          .gte("balance", amt)
          .select("balance")
          .maybeSingle();
        if (debitErr || !debited) {
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
          await sb
            .from("wallets")
            .update({ balance: walletBalance, updated_at: new Date().toISOString() })
            .eq("user_id", auth.user.id);
          return Response.json({ error: "Could not record withdrawal" }, { status: 500 });
        }

        // 5. Two-step: write-off custody → master, then payout from master.
        //    NOWPayments requires payouts to draw from the master balance.
        //    `write-off` transfers the user's confirmed custody funds up to
        //    the master account; then `/payout` sends them on-chain.
        const origin = new URL(request.url).origin;
        let payoutResult: { payoutId: string; raw: any } | null = null;
        let payoutError = "";
        let usedCurrency = currency;
        let sentAmount = payoutAmount;

        outer: for (const cand of candidates) {
          const readback = floorNowAmount(custodyBalances[cand] ?? 0);
          const tries: number[] = [payoutAmount];
          if (readback > 0 && readback < payoutAmount) tries.push(readback);

          for (let i = 0; i < tries.length && i < 6; i++) {
            const tryAmt = floorNowAmount(tries[i]);
            if (tryAmt <= 0) continue;
            // Step A: write-off from custody to master.
            try {
              await writeOffFromSubPartner({
                subPartnerId: subId,
                currency: cand,
                amount: tryAmt,
              });
            } catch (e: any) {
              payoutError = String(e?.message ?? "");
              if (/insufficient|not enough|balance/i.test(payoutError)) {
                const m = payoutError.match(/([0-9]+\.[0-9]+|[0-9]+)/);
                const parsed = m ? Number(m[1]) : NaN;
                const next = Number.isFinite(parsed) && parsed > 0 && parsed < tryAmt
                  ? floorNowAmount(parsed)
                  : floorNowAmount(tryAmt * 0.99);
                if (next > 0 && next < tryAmt && !tries.includes(next)) tries.push(next);
              }
              continue;
            }
            // Step B: payout from master to destination address.
            try {
              payoutResult = await createPayout({
                address: addr,
                amount: tryAmt,
                currency: cand,
                ipnCallbackUrl: `${origin}/api/public/webhooks/nowpayments`,
              });
              usedCurrency = cand;
              sentAmount = tryAmt;
              break outer;
            } catch (e: any) {
              payoutError = String(e?.message ?? "");
              if (/insufficient|not enough|liquidity|balance/i.test(payoutError)) {
                const m = payoutError.match(/([0-9]+\.[0-9]+|[0-9]+)/);
                const parsed = m ? Number(m[1]) : NaN;
                const next = Number.isFinite(parsed) && parsed > 0 && parsed < tryAmt
                  ? floorNowAmount(parsed)
                  : floorNowAmount(tryAmt * 0.99);
                if (next > 0 && next < tryAmt && !tries.includes(next)) tries.push(next);
              }
            }
          }
        }

        if (payoutResult) {
          await sb
            .from("withdrawals")
            .update({
              status: "processing",
              nowpayments_payout_id: payoutResult.payoutId,
              raw: payoutResult.raw,
              net_amount: sentAmount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", wRow.id);
          await sb.from("transactions").insert({
            user_id: auth.user.id,
            type: "withdraw",
            amount: amt,
            network: net,
            description: `Withdrawal ${sentAmount.toFixed(8)} USDT after ${(SERVICE_FEE_RATE * 100).toFixed(0)}% service fee → ${addr.slice(0, 6)}…${addr.slice(-4)}`,
            reference_id: wRow.id,
          });
          return Response.json({ ok: true, withdrawal_id: wRow.id, fee, net_amount: sentAmount });
        }

        // Refund and report.
        await sb
          .from("wallets")
          .update({ balance: walletBalance, updated_at: new Date().toISOString() })
          .eq("user_id", auth.user.id);
        await sb
          .from("withdrawals")
          .update({ status: "failed", raw: { error: payoutError } })
          .eq("id", wRow.id);
        return Response.json({ error: providerAuthMessage(payoutError) }, { status: 502 });
      },
    },
  },
});

const EPSILON = 1e-8;
const SERVICE_FEE_RATE = 0.05;

const CURRENCY_ALIASES: Record<string, string[]> = {
  usdttrc20: ["usdttrc20", "usdttron"],
  usdtbsc: ["usdtbsc", "usdtbep20"],
  usdterc20: ["usdterc20", "usdt"],
  usdtmatic: ["usdtmatic", "usdtpolygon"],
};

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
    return "Withdrawal provider liquidity is insufficient for this payout. The user wallet was refunded automatically; add enough USDT to the NOWPayments master payout balance or enable enough platform reserve to cover provider/network costs, then retry.";
  }
  return `Payout failed: ${raw}`;
}
