import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { userFromRequest, admin } from "@/lib/supabase.server";
import { withCorsHandlers } from "@/lib/cors";

// Sends a magic-link email to the signed-in user. The link redirects back
// to /settings/deal-code?rotate=<nonce>. The nonce is stored on the
// profile with a 15-minute expiry and validated by /api/deal-code/change.
export const Route = createFileRoute("/api/deal-code/request-otp")({
  server: {
    handlers: withCorsHandlers({
      POST: async ({ request }: { request: Request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const email = auth.user.email;
        if (!email) return Response.json({ error: "No email on account" }, { status: 400 });

        const body = (await request.json().catch(() => ({}))) as { redirect_origin?: string };
        const originHeader = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
        const originFromHeader = (() => { try { return new URL(originHeader).origin; } catch { return null; } })();
        const origin = body.redirect_origin?.replace(/\/+$/, "") || originFromHeader || "";
        if (!origin || !/^https?:\/\//.test(origin)) {
          return Response.json({ error: "Missing app origin" }, { status: 400 });
        }

        // Generate + persist nonce (hash stored, plaintext returned only via email link)
        const nonce = crypto.randomUUID().replace(/-/g, "");
        const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        const sb = admin();
        const { error: upErr } = await sb.from("profiles")
          .update({ deal_code_rotate_nonce: nonce, deal_code_rotate_expires_at: expires })
          .eq("id", auth.user.id);
        if (upErr) return Response.json({ error: upErr.message }, { status: 500 });

        const redirectTo = `${origin}/settings/deal-code?rotate=${nonce}`;

        const url = process.env.SUPABASE_URL || "https://jponeelmwvkufvsuxyes.supabase.co";
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY
          || process.env.SUPABASE_ANON_KEY
          || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";
        const anonClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error } = await anonClient.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
        });
        if (error) return Response.json({ error: error.message }, { status: 502 });
        return Response.json({ ok: true, email });
      },
    }),
  },
});
