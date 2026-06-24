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
        const auth = await userFromRequest(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const { network } = (await request.json().catch(() => ({}))) as { network?: string };
        const net = (network ?? "").toLowerCase();
        const currency = NETWORK_TO_CURRENCY[net];
        if (!currency) return Response.json({ error: "Invalid network" }, { status: 400 });

        const sb = admin();

        // 1. Existing address?
        const { data: existing } = await sb
          .from("deposit_addresses")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("network", net)
          .maybeSingle();
        if (existing) return Response.json({ address: existing.address, network: net });

        // 2. Ensure sub-partner exists.
        const { data: profile } = await sb
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
            await sb
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

        // 4. Persist.
        await sb.from("deposit_addresses").insert({
          user_id: auth.user.id,
          network: net,
          currency,
          address,
          payment_id: paymentId,
        });

        return Response.json({ address, network: net });
      },
    },
  },
});
