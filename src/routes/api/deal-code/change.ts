import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { userFromRequest, admin } from "@/lib/supabase.server";

export const Route = createFileRoute("/api/deal-code/change")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as {
          otp?: string; new_code?: string;
        };
        const otp = String(body.otp ?? "").trim();
        const newCode = String(body.new_code ?? "").trim();
        if (!/^\d{6}$/.test(otp)) return Response.json({ error: "Enter the 6-digit email OTP" }, { status: 400 });
        if (!/^\d{6}$/.test(newCode)) return Response.json({ error: "New Deal Code must be 6 digits" }, { status: 400 });
        if (/^(\d)\1{5}$/.test(newCode) || newCode === "123456" || newCode === "654321") {
          return Response.json({ error: "Choose a less predictable Deal Code" }, { status: 400 });
        }
        const email = auth.user.email;
        if (!email) return Response.json({ error: "No email on account" }, { status: 400 });

        // Verify OTP via Supabase (server-side, using anon client — proves the
        // user has access to their inbox before we rotate the code).
        const url = process.env.SUPABASE_URL || "https://jponeelmwvkufvsuxyes.supabase.co";
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY
          || process.env.SUPABASE_ANON_KEY
          || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";
        const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: v, error: vErr } = await anonClient.auth.verifyOtp({ email, token: otp, type: "email" });
        if (vErr || !v?.user || v.user.id !== auth.user.id) {
          return Response.json({ error: "Invalid or expired OTP" }, { status: 401 });
        }

        const salt = crypto.randomUUID().replace(/-/g, "");
        const hash = await sha256Hex(`${salt}:${newCode}`);
        const sb = admin();
        const { error } = await sb.from("profiles")
          .update({
            deal_code_hash: hash,
            deal_code_salt: salt,
            deal_code_updated_at: new Date().toISOString(),
            biometric_enabled: false,
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
