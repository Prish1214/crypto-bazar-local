import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";

// Seller-only: verify Deal Code, then call complete_deal_release RPC.
export const Route = createFileRoute("/api/deals/release")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

        const { data: ok, error: vErr } = await sb.rpc("verify_deal_code", {
          _user_id: auth.user.id,
          _code: code,
        });
        if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
        if (!ok) return Response.json({ error: "Incorrect Deal Code" }, { status: 401 });

        const { error: rErr } = await sb.rpc("complete_deal_release", { _deal_id: dealId });
        if (rErr) return Response.json({ error: rErr.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
