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
        const isPayout = isExternalPayoutPayload(payload);

        if (isPayout) {
          const payoutIds = [
            payload.batch_withdrawal_id,
            payload.payout_id,
            payload.withdrawal_id,
            payload.id,
            payload.result?.id,
            payload.withdrawals?.[0]?.id,
            payload.withdrawals?.[0]?.batch_withdrawal_id,
            payload.result?.withdrawals?.[0]?.id,
            payload.result?.withdrawals?.[0]?.batch_withdrawal_id,
          ]
            .filter(Boolean)
            .map(String);
          const txHash = extractPayoutTxHash(payload);
          const status = mapPayoutStatus(payload.status, txHash, payload);
          for (const payoutId of [...new Set(payoutIds)]) {
            await sb.rpc("update_withdrawal_status", {
              _payout_id: payoutId,
              _status: status,
              _tx_hash: txHash || null,
              _raw: payload,
            });
          }
          return Response.json({ ok: true });
        }

        // Deposit payload
        const npId = String(payload.payment_id ?? payload.id ?? "");
        const txHash = String(
          payload.hash ??
          payload.tx_hash ??
          payload.txid ??
          payload.transaction_hash ??
          payload.payin_hash ??
          payload.payin_tx_hash ??
          payload.outcome_hash ??
          "",
        );
        // Idempotency key MUST be stable across every IPN for the same
        // deposit. NOWPayments sends multiple IPNs (waiting → confirming →
        // sending/finished); earlier ones often lack a tx hash while later
        // ones include it. Always key final crediting by payment id only.
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

        const isFinal = ["finished", "confirmed", "completed", "partially_paid", "sending"].includes(status);

        if (!isFinal) {
          // Progress-only row, prefixed so it never collides with the final
          // credited row keyed by tx hash.
          await sb.from("deposits").upsert(
            {
              user_id: da.user_id,
              nowpayments_payment_id: `pending:${npId}`,
              amount: creditedAmount,
              network: da.network,
              status: status || "pending",
              raw: payload,
            },
            { onConflict: "nowpayments_payment_id" },
          );
          return Response.json({ ok: true, status });
        }

        // Final IPN — key idempotency on the NOWPayments payment id alone.
        // credit_deposit() guards against double-credit: if a row already
        // exists with status='completed' it returns without touching the
        // wallet, so later IPNs (with or without a tx hash) are safe no-ops.
        // Requiring a tx hash here previously blocked small/instant deposits
        // whose "finished" IPN never carried a hash field we recognize.
        const depositKey = String(npId);


        await sb.rpc("credit_deposit", {
          _user_id: da.user_id,
          _amount: creditedAmount,
          _network: da.network,
          _tx_hash: txHash,
          _nowpayments_payment_id: depositKey,
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
  for (const value of [payload.actually_paid, payload.actual_paid, payload.paid_amount, payload.outcome_amount]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && n < 99000) {
      return Math.floor((n + Number.EPSILON) * 100_000_000) / 100_000_000;
    }
  }
  return 0;
}

function mapPayoutStatus(s: string | undefined, txHash?: string | null, raw?: any): string {
  if (isWriteOffToMaster(raw)) return "processing";
  switch ((s ?? "").toLowerCase()) {
    case "finished":
    case "sent":
    case "completed":
      return txHash ? "completed" : "processing";
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

function isExternalPayoutPayload(payload: any): boolean {
  if (isWriteOffToMaster(payload)) return false;
  return !!(
    payload?.payout_id ||
    payload?.batch_withdrawal_id ||
    payload?.withdrawal_id ||
    payload?.withdrawals?.length ||
    payload?.result?.withdrawals?.length
  );
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

function guessNetwork(currency: string | undefined): string {
  const c = (currency ?? "").toLowerCase();
  if (c.includes("trc20")) return "trc20";
  if (c.includes("bsc")) return "bep20";
  if (c.includes("erc20")) return "erc20";
  if (c.includes("matic") || c.includes("polygon")) return "polygon";
  return "unknown";
}
