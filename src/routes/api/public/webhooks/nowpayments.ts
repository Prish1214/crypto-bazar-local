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
          const payoutId = String(payload.payout_id ?? payload.id);
          const status = mapPayoutStatus(payload.status);
          await sb.rpc("update_withdrawal_status", {
            _payout_id: payoutId,
            _status: status,
            _tx_hash: payload.hash ?? payload.tx_hash ?? null,
            _raw: payload,
          });
          return Response.json({ ok: true });
        }

        // Deposit payload
        const npId = String(payload.payment_id ?? payload.id ?? "");
        const status = String(payload.payment_status ?? "").toLowerCase();
        const actuallyPaid = Number(payload.outcome_amount ?? payload.actually_paid ?? payload.pay_amount ?? 0);
        const address = payload.pay_address ?? payload.payin_address;
        if (!npId || !address || actuallyPaid <= 0) {
          return Response.json({ ok: true, skipped: true });
        }
        if (!["finished", "confirmed", "completed", "partially_paid"].includes(status)) {
          // Just record progress.
          await sb.from("deposits").upsert(
            {
              user_id: payload._user_id ?? null,
              nowpayments_payment_id: npId,
              amount: actuallyPaid,
              network: payload.network ?? guessNetwork(payload.pay_currency),
              status: status || "pending",
              raw: payload,
            },
            { onConflict: "nowpayments_payment_id" },
          );
          return Response.json({ ok: true, status });
        }

        // Resolve user by deposit address.
        const { data: da } = await sb
          .from("deposit_addresses")
          .select("user_id, network")
          .eq("address", address)
          .maybeSingle();
        if (!da) return Response.json({ ok: true, unknown_address: true });

        await sb.rpc("credit_deposit", {
          _user_id: da.user_id,
          _amount: actuallyPaid,
          _network: da.network,
          _tx_hash: payload.hash ?? payload.tx_hash ?? "",
          _nowpayments_payment_id: npId,
          _raw: payload,
        });
        return Response.json({ ok: true, credited: actuallyPaid });
      },
    },
  },
});

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
