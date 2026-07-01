import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { userFromRequest } from "@/lib/supabase.server";

// Sends a 6-digit email OTP to the currently signed-in user's email
// using Supabase's built-in OTP email template. The user then submits
// the OTP together with the new Deal Code to /api/deal-code/change.
export const Route = createFileRoute("/api/deal-code/request-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await userFromRequest(request);
        if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const email = auth.user.email;
        if (!email) return Response.json({ error: "No email on account" }, { status: 400 });

        const url = process.env.SUPABASE_URL || "https://jponeelmwvkufvsuxyes.supabase.co";
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY
          || process.env.SUPABASE_ANON_KEY
          || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";
        const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false },
        });
        if (error) return Response.json({ error: error.message }, { status: 502 });
        return Response.json({ ok: true, email });
      },
    },
  },
});
