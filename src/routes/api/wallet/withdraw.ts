import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";
import { NETWORK_TO_CURRENCY, createPayout, estimateFee, writeOffFromSubPartner } from "@/lib/nowpayments.server";

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
        const currency = NETWORK_TO_CURRENCY[net];
        const addr = (body.address ?? "").trim();
        const amt = Number(body.amount);

        if (!currency) return Response.json({ error: "Invalid network" }, { status: 400 });
        if (addr.length < 10) return Response.json({ error: "Invalid address" }, { status: 400 });
        if (!Number.isFinite(amt) || amt <= 0)
          return Response.json({ error: "Invalid amount" }, { status: 400 });

        const sb = admin();

        // 1. Atomic balance check + debit (single round trip with RPC would be ideal,
        // but we do read+update; rely on update WHERE balance >= amt for safety).
        const { data: wallet } = await sb
          .from("wallets")
          .select("balance")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (!wallet || Number(wallet.balance) < amt) {
          return Response.json({ error: "Insufficient balance" }, { status: 400 });
        }

        const { error: debitErr, data: debited } = await sb
          .from("wallets")
          .update({ balance: Number(wallet.balance) - amt, updated_at: new Date().toISOString() })
          .eq("user_id", auth.user.id)
          .gte("balance", amt)
          .select("balance")
          .maybeSingle();
        if (debitErr || !debited) {
          return Response.json({ error: "Could not lock balance" }, { status: 409 });
        }

        // 2. Estimate fee (best-effort).
        const fee = (await estimateFee(currency, amt)) ?? 0;
        const net_amount = Math.max(0, amt - fee);

        // 3. Record pending withdrawal.
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
            .update({ balance: Number(wallet.balance), updated_at: new Date().toISOString() })
            .eq("user_id", auth.user.id);
          return Response.json({ error: "Could not record withdrawal" }, { status: 500 });
        }

        // 4. Call NOWPayments payout.
        const origin = new URL(request.url).origin;
        try {
          const r = await createPayout({
            address: addr,
            amount: amt,
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
            description: `Withdrawal ${amt.toFixed(2)} USDT → ${addr.slice(0, 6)}…${addr.slice(-4)}`,
            reference_id: wRow.id,
          });
          return Response.json({ ok: true, withdrawal_id: wRow.id, fee });
        } catch (e: any) {
          // refund on payout failure
          await sb
            .from("wallets")
            .update({ balance: Number(wallet.balance), updated_at: new Date().toISOString() })
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
