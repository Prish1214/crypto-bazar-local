import { createFileRoute } from "@tanstack/react-router";
import { admin } from "@/lib/supabase.server";
import { verifyIpn } from "@/lib/nowpayments.server";

// NOWPayments IPN — credits deposits & updates withdrawal status.
// Public route (/api/public/* bypasses auth) — security is the HMAC signature.
export const Route = createFileRoute("/api/public/webhooks/nowpayments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-nowpayments-sig") ?? "";

        if (process.env.NOWPAYMENTS_IPN_SECRET) {
          const ok = await verifyIpn(raw, sig).catch(() => false);
          if (!ok) return new Response("Invalid signature", { status: 401 });
        }

        let payload: any = {};
        try { payload = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

        const sb = admin();
        const isPayout = !!(payload.payout_id || payload.batch_withdrawal_id);

        if (isPayout) {
          const payoutIds = [payload.batch_withdrawal_id, payload.payout_id, payload.id]
            .filter(Boolean)
            .map(String);
          const status = mapPayoutStatus(payload.status);
          for (const payoutId of [...new Set(payoutIds)]) {
            await sb.rpc("update_withdrawal_status", {
              _payout_id: payoutId,
              _status: status,
              _tx_hash: payload.hash ?? payload.tx_hash ?? null,
              _raw: payload,
            });
          }
          return Response.json({ ok: true });
        }

        // Deposit payload
        const npId = String(payload.payment_id ?? payload.id ?? "");
        const status = String(payload.payment_status ?? "").toLowerCase();
        const creditedAmount = pickDepositCreditAmount(payload);
        const address = payload.pay_address ?? payload.payin_address;
        if (!npId || !address || creditedAmount <= 0) {
          return Response.json({ ok: true, skipped: true });
        }

        // Resolve user by permanent deposit address for every status. Pending
        // IPNs normally do not include our user id, and deposits.user_id is
        // required, so resolve before writing any ledger row.
        const { data: da } = await sb
          .from("deposit_addresses")
          .select("user_id, network")
          .eq("address", address)
          .maybeSingle();
        if (!da) return Response.json({ ok: true, unknown_address: true });

        if (!["finished", "confirmed", "completed", "partially_paid"].includes(status)) {
          // Just record progress.
          await sb.from("deposits").upsert(
            {
              user_id: da.user_id,
              nowpayments_payment_id: npId,
              amount: creditedAmount,
              network: da.network,
              status: status || "pending",
              raw: payload,
            },
            { onConflict: "nowpayments_payment_id" },
          );
          return Response.json({ ok: true, status });
        }

        await sb.rpc("credit_deposit", {
          _user_id: da.user_id,
          _amount: creditedAmount,
          _network: da.network,
          _tx_hash: payload.hash ?? payload.tx_hash ?? "",
          _nowpayments_payment_id: npId,
          _raw: payload,
        });
        return Response.json({ ok: true, credited: creditedAmount });
      },
    },
  },
});

function pickDepositCreditAmount(payload: any): number {
  // Permanent custody addresses are created with a large notional `amount`
  // ceiling. NOWPayments may echo that ceiling back as `amount`,
  // `pay_amount`, or `price_amount`; using those fields is what can create
  // fake wallet balances in the thousands. Only credit the real on-chain paid
  // value. If it is not present yet, skip and wait for the next final IPN.
  const n = Number(payload.actually_paid ?? payload.actual_paid ?? payload.paid_amount);
  if (Number.isFinite(n) && n > 0 && n < 100000) {
    return Math.floor((n + Number.EPSILON) * 100_000_000) / 100_000_000;
  }
  return 0;
}

function mapPayoutStatus(s: string | undefined): string {
  switch ((s ?? "").toLowerCase()) {
    case "finished":
    case "sent":
    case "completed":
      return "completed";
    case "failed":
    case "rejected":
      return "failed";
    case "creating":
    case "waiting":
    case "processing":
    default:
      return "processing";
  }
}

function guessNetwork(currency: string | undefined): string {
  const c = (currency ?? "").toLowerCase();
  if (c.includes("trc20")) return "trc20";
  if (c.includes("bsc")) return "bep20";
  if (c.includes("erc20")) return "erc20";
  if (c.includes("matic") || c.includes("polygon")) return "polygon";
  return "unknown";
}
