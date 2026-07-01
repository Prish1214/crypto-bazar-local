import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";

export const Route = createFileRoute("/api/deal-code/set")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { code?: string };
        const code = String(body.code ?? "").trim();
        if (!/^\d{6}$/.test(code)) {
          return Response.json({ error: "Deal Code must be exactly 6 digits" }, { status: 400 });
        }
        if (/^(\d)\1{5}$/.test(code) || code === "123456" || code === "654321") {
          return Response.json({ error: "Choose a less predictable Deal Code" }, { status: 400 });
        }

        const sb = admin();
        // First-time set only — for changes use /api/deal-code/change (requires OTP).
        const { data: prof } = await sb
          .from("profiles").select("deal_code_hash").eq("id", auth.user.id).maybeSingle();
        if (prof?.deal_code_hash) {
          return Response.json(
            { error: "Deal Code is already set. Use Settings → Change Deal Code (requires email OTP)." },
            { status: 409 },
          );
        }

        const salt = crypto.randomUUID().replace(/-/g, "");
        const hash = await sha256Hex(`${salt}:${code}`);
        const now = new Date().toISOString();
        const { error } = await sb
          .from("profiles")
          .update({ deal_code_hash: hash, deal_code_salt: salt, deal_code_set_at: now, deal_code_updated_at: now })
          .eq("id", auth.user.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
