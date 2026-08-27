import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";
import {
  NETWORK_TO_CURRENCY,
  createSubPartner,
  generateDepositAddress,
} from "@/lib/nowpayments.server";

export const Route = createFileRoute("/api/wallet/deposit-address")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return await handleDepositAddress(request);
        } catch (e: any) {
          console.error("[deposit-address] unhandled", e);
          return Response.json(
            { error: e?.message || "Deposit address service failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});

async function handleDepositAddress(request: Request) {
  const auth = await userFromRequest(request);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { network } = (await request.json().catch(() => ({}))) as { network?: string };
  const net = (network ?? "").toLowerCase();
  const currency = NETWORK_TO_CURRENCY[net];
  if (!currency) return Response.json({ error: "Invalid network" }, { status: 400 });

  const userDb = auth.client;

  // 1. Existing address? Always return the persisted one — never regenerate.
  // Use the signed-in user's DB session for reads so a service-key issue cannot
  // break users who already have a permanent address.
  const { data: existing, error: selErr } = await userDb
    .from("deposit_addresses")
    .select("address")
    .eq("user_id", auth.user.id)
    .eq("network", net)
    .maybeSingle();
  if (selErr) {
    console.error("[deposit-address] select failed", selErr);
    return Response.json({ error: `DB read failed: ${selErr.message}` }, { status: 500 });
  }
  if (existing?.address) return Response.json({ address: existing.address, network: net });

  // 2. Ensure sub-partner exists.
  const { data: profile } = await userDb
    .from("profiles")
    .select("id, username, nowpayments_sub_partner_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  let subPartnerId = profile?.nowpayments_sub_partner_id as string | null;
  if (!subPartnerId) {
    try {
      subPartnerId = await createSubPartner(
        profile?.username || `cb_${auth.user.id.slice(0, 8)}`,
      );
      await userDb
        .from("profiles")
        .update({ nowpayments_sub_partner_id: subPartnerId })
        .eq("id", auth.user.id);
    } catch (e: any) {
      return Response.json(
        { error: `Could not create sub-partner: ${e.message}` },
        { status: 502 },
      );
    }
  }

  // 3. Generate address via NOWPayments.
  const origin = new URL(request.url).origin;
  let address: string;
  let paymentId: string | undefined;
  try {
    const r = await generateDepositAddress({
      subPartnerId,
      currency,
      ipnCallbackUrl: `${origin}/api/public/webhooks/nowpayments`,
    });
    address = r.address;
    paymentId = r.paymentId;
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 502 });
  }

  // 4. Persist permanently (idempotent on user_id+network unique constraint).
  const savePayload = {
    user_id: auth.user.id,
    network: net,
    currency,
    address,
    payment_id: paymentId,
  };

  let upErr: any = null;
  try {
    const { error } = await admin()
      .from("deposit_addresses")
      .upsert(savePayload, { onConflict: "user_id,network", ignoreDuplicates: true });
    upErr = error;
  } catch (e) {
    upErr = e;
  }

  if (upErr) {
    console.error("[deposit-address] admin upsert failed", upErr);
    const { error: userUpErr } = await userDb
      .from("deposit_addresses")
      .upsert(savePayload, { onConflict: "user_id,network", ignoreDuplicates: true });
    if (userUpErr) {
      console.error("[deposit-address] user upsert failed", userUpErr);
      return Response.json(
        { error: `Could not save address: ${userUpErr.message}` },
        { status: 500 },
      );
    }
  }

  // 5. Re-read to guarantee we return the persisted (canonical) address
  //    even if another concurrent request wrote first.
  const { data: saved } = await userDb
    .from("deposit_addresses")
    .select("address")
    .eq("user_id", auth.user.id)
    .eq("network", net)
    .maybeSingle();

  return Response.json({ address: saved?.address ?? address, network: net });
}
