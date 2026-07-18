import { createFileRoute } from "@tanstack/react-router";
import { userFromRequest, admin } from "@/lib/supabase.server";

// Validates the magic-link "rotate" nonce that was emailed to the user
// and rotates their Deal Code. The user must:
//   1) be signed in (proves session)
//   2) present the same nonce that /api/deal-code/request-otp set
//   3) present it before it expires (15 min)
export const Route = createFileRoute("/api/deal-code/change")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as {
          nonce?: string; new_code?: string;
        };
        const nonce = String(body.nonce ?? "").trim();
        const newCode = String(body.new_code ?? "").trim();
        if (!nonce) return Response.json({ error: "Missing verification link — request a new one" }, { status: 400 });
        if (!/^\d{6}$/.test(newCode)) return Response.json({ error: "New Deal Code must be 6 digits" }, { status: 400 });
        if (/^(\d)\1{5}$/.test(newCode) || newCode === "123456" || newCode === "654321") {
          return Response.json({ error: "Choose a less predictable Deal Code" }, { status: 400 });
        }

        const sb = admin();
        const { data: prof, error: pErr } = await sb.from("profiles")
          .select("deal_code_rotate_nonce, deal_code_rotate_expires_at")
          .eq("id", auth.user.id).maybeSingle();
        if (pErr) return Response.json({ error: pErr.message }, { status: 500 });
        if (!prof?.deal_code_rotate_nonce || prof.deal_code_rotate_nonce !== nonce) {
          return Response.json({ error: "Invalid verification link" }, { status: 401 });
        }
        if (!prof.deal_code_rotate_expires_at || new Date(prof.deal_code_rotate_expires_at).getTime() < Date.now()) {
          return Response.json({ error: "Verification link expired — request a new one" }, { status: 401 });
        }

        const salt = crypto.randomUUID().replace(/-/g, "");
        const hash = await sha256Hex(`${salt}:${newCode}`);
        const { error } = await sb.from("profiles")
          .update({
            deal_code_hash: hash,
            deal_code_salt: salt,
            deal_code_updated_at: new Date().toISOString(),
            // biometric_enabled is per-device (WebAuthn credential + local cache).
            // Rotating the code doesn't invalidate the platform authenticator, and
            // the current device re-links its cached code via refreshCachedCode().
            deal_code_rotate_nonce: null,
            deal_code_rotate_expires_at: null,
          })
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
