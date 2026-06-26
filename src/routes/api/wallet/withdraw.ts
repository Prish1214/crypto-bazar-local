import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";
import { NETWORK_TO_CURRENCY, createPayout, estimateFee, writeOffFromSubPartner, getSubPartnerBalance } from "@/lib/nowpayments.server";

export const Route = createFileRoute("/api/wallet/withdraw")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

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
        let custodyCurrency = currency;
        let custodySourceAmount = amt;
        let custodyBalances: Record<string, number> = {};

        if (subId) {
          custodyBalances = await getSubPartnerBalance(subId).catch(() => ({}));
          const candidates = CURRENCY_ALIASES[currency] ?? [currency];
          const sufficient = candidates.find((c) => (custodyBalances[c] ?? 0) + EPSILON >= amt);

          if (sufficient) {
            custodyCurrency = sufficient;
          } else {
            const best = candidates
              .map((c) => ({ currency: c, amount: floorNowAmount(custodyBalances[c] ?? 0) }))
              .sort((a, b) => b.amount - a.amount)[0];
            const available = best?.amount ?? 0;
            const shortage = amt - available;

            // If the user is withdrawing the full displayed balance and custody is
            // only slightly lower, reconcile the old over-credit as provider fees
            // instead of blocking the payout.
            const fullBalanceWithdrawal = Math.abs(walletBalance - amt) <= Math.max(0.01, walletBalance * 0.005);
            const smallProviderDelta = shortage > 0 && shortage <= Math.max(0.1, amt * 0.08);

            if (available > 0 && (fullBalanceWithdrawal || smallProviderDelta)) {
              custodyCurrency = best.currency;
              custodySourceAmount = available;
            } else {
              const summary = summarizeBalances(custodyBalances);
              return Response.json(
                {
                  error:
                    `Your confirmed ${net.toUpperCase()} custody balance is ${available.toFixed(8)} USDT, ` +
                    `but you requested ${amt.toFixed(8)} USDT. Current custody: ${summary}. ` +
                    `Withdraw ${available.toFixed(8)} USDT or wait for the deposit to finish confirming.`,
                },
                { status: 400 },
              );
            }
          }
        }

        currency = custodyCurrency;

        // 2. Estimate payout/network fee. The withdrawal amount is the gross
        // wallet debit; the payout amount is what we ask NOWPayments to send.
        const networkFee = (await estimateFee(currency, custodySourceAmount)) ?? 0;
        const payoutAmount = floorNowAmount(Math.max(0, custodySourceAmount - networkFee));
        const fee = floorNowAmount(Math.max(0, amt - payoutAmount));
        const net_amount = payoutAmount;

        if (net_amount <= 0) {
          return Response.json(
            { error: "Withdrawal amount is too small after provider/network fees. Please increase the amount." },
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

        // 5. Move funds from sub-partner custody → master, then call payout.
        const origin = new URL(request.url).origin;
        try {
          if (subId) {
            await writeOffFromSubPartner({ subPartnerId: subId, currency, amount: custodySourceAmount });
          }
          const r = await createPayout({
            address: addr,
            amount: net_amount,
            currency,
            ipnCallbackUrl: `${origin}/api/public/webhooks/nowpayments`,
          });
          await sb
            .from("withdrawals")
            .update({
              status: "processing",
              nowpayments_payout_id: r.payoutId,
              raw: r.raw,
              updated_at: new Date().toISOString(),
            })
            .eq("id", wRow.id);
          await sb.from("transactions").insert({
            user_id: auth.user.id,
            type: "withdraw",
            amount: amt,
            network: net,
            description: `Withdrawal ${net_amount.toFixed(8)} USDT → ${addr.slice(0, 6)}…${addr.slice(-4)}`,
            reference_id: wRow.id,
          });
          return Response.json({ ok: true, withdrawal_id: wRow.id, fee, net_amount });
        } catch (e: any) {
          // refund on payout failure
          await sb
            .from("wallets")
            .update({ balance: walletBalance, updated_at: new Date().toISOString() })
            .eq("user_id", auth.user.id);
          await sb
            .from("withdrawals")
            .update({ status: "failed", raw: { error: e.message } })
            .eq("id", wRow.id);
          const raw = String(e?.message ?? "");
          const friendly = /invalid ip|access denied/i.test(raw)
            ? "Withdrawals are temporarily unavailable: the payment provider is rejecting our server IP. Please contact support — the admin needs to disable IP whitelist on the NOWPayments API key."
            : `Payout failed: ${raw}`;
          return Response.json({ error: friendly }, { status: 502 });
        }
      },
    },
  },
});

const EPSILON = 1e-8;

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
