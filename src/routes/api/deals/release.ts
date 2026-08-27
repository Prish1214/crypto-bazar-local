import { createFileRoute } from "@tanstack/react-router";
import { withCorsHandlers } from "@/lib/cors.server";
import { userFromRequest, admin } from "@/lib/supabase.server";

// Seller-only: verify Deal Code, then call complete_deal_release RPC.
export const Route = createFileRoute("/api/deals/release")({
  server: {
    handlers: withCorsHandlers({
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) {
          console.warn("[deals/release] unauthorized — no valid bearer");
          return Response.json({ error: "Session expired" }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as {
          deal_id?: string; code?: string;
        };
        const dealId = String(body.deal_id ?? "");
        const code = String(body.code ?? "").trim();
        if (!dealId) return Response.json({ error: "Missing deal_id" }, { status: 400 });
        if (!/^\d{6}$/.test(code)) return Response.json({ error: "Enter your 6-digit Deal Code" }, { status: 400 });

        const sb = admin();
        const { data: deal, error: dErr } = await sb
          .from("deals").select("id, seller_id, status").eq("id", dealId).maybeSingle();
        if (dErr || !deal) return Response.json({ error: "Deal not found" }, { status: 404 });
        if (deal.seller_id !== auth.user.id) {
          return Response.json({ error: "Only the seller can release escrow" }, { status: 403 });
        }

        // Make sure a Deal Code is actually set — otherwise verify_deal_code
        // just returns false and the user sees a confusing "Incorrect Deal Code".
        const { data: prof } = await sb
          .from("profiles").select("deal_code_hash").eq("id", auth.user.id).maybeSingle();
        if (!prof?.deal_code_hash) {
          return Response.json(
            { error: "No Deal Code set yet. Open Settings → Deal Code to set one." },
            { status: 400 },
          );
        }

        const { data: ok, error: vErr } = await sb.rpc("verify_deal_code", {
          _user_id: auth.user.id,
          _code: code,
        });
        if (vErr) {
          console.error("[deals/release] verify_deal_code failed", vErr);
          return Response.json({ error: vErr.message }, { status: 500 });
        }
        if (!ok) return Response.json({ error: "Incorrect Deal Code" }, { status: 401 });

        const { error: rErr } = await auth.client.rpc("complete_deal_release", { _deal_id: dealId });
        if (rErr) {
          console.error("[deals/release] complete_deal_release failed", rErr);
          return Response.json({ error: rErr.message }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    }),
  },
});
