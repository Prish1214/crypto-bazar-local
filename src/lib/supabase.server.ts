// Server-only Supabase clients (user-scoped + service role).
import { createClient } from "@supabase/supabase-js";

// IMPORTANT: must match the project the client uses (src/integrations/supabase/client.ts)
const SUPABASE_URL = "https://jponeelmwvkufvsuxyes.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";

/** Admin client (bypasses RLS) — webhook + credit_deposit only. */
export function admin() {
  const key = process.env.CB_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("CB_SUPABASE_SERVICE_ROLE_KEY missing");
  // Always use the canonical project URL — service-role key must be from this project.
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verify a bearer token from the Authorization header → returns user. */
export async function userFromRequest(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token || token === "undefined" || token === "null") {
    console.warn("[userFromRequest] missing bearer token", { hasHeader: !!auth });
    return null;
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    console.warn("[userFromRequest] getUser failed", { msg: error?.message, status: (error as any)?.status });
    return null;
  }
  return { user: data.user, client, token };
}
