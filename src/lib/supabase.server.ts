// Server-only Supabase clients (user-scoped + service role).
import { createClient } from "@supabase/supabase-js";

// IMPORTANT: must match the project the client uses (src/integrations/supabase/client.ts)
const DEFAULT_SUPABASE_URL = "https://jponeelmwvkufvsuxyes.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";

function cleanEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/^['\"]|['\"]$/g, "");
  return trimmed || undefined;
}

function normalizeSupabaseUrl(value: string | null | undefined): string | null {
  const raw = cleanEnv(value);
  if (!raw) return null;

  const candidate = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : /^[a-z0-9-]+$/i.test(raw)
      ? `https://${raw}.supabase.co`
      : `https://${raw}`;

  try {
    const url = new URL(candidate);
    const isAllowedHost =
      url.hostname.endsWith(".supabase.co") ||
      url.hostname === "supabase.co" ||
      url.hostname === "localhost" ||
      /^127\.\d+\.\d+\.\d+$/.test(url.hostname);

    if ((url.protocol === "http:" || url.protocol === "https:") && isAllowedHost) {
      return url.origin;
    }
  } catch {
    // Ignore malformed env values and use the app's configured URL below.
  }

  return null;
}

function projectRefFromJwt(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const ref = JSON.parse(atob(padded))?.ref;
    return typeof ref === "string" && /^[a-z0-9-]+$/i.test(ref) ? ref : null;
  } catch {
    return null;
  }
}

function serviceRoleKey() {
  const key = cleanEnv(
    process.env.CB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!key) throw new Error("CB_SUPABASE_SERVICE_ROLE_KEY missing");
  return key;
}

function adminSupabaseUrl(serviceKey: string) {
  const ref = projectRefFromJwt(serviceKey);
  return (
    normalizeSupabaseUrl(ref) ??
    normalizeSupabaseUrl(process.env.CB_SUPABASE_URL) ??
    normalizeSupabaseUrl(process.env.SUPABASE_URL) ??
    DEFAULT_SUPABASE_URL
  );
}

/** Admin client (bypasses RLS) — webhook + credit_deposit only. */
export function admin() {
  const key = serviceRoleKey();
  return createClient(adminSupabaseUrl(key), key, {
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
  const client = createClient(DEFAULT_SUPABASE_URL, SUPABASE_ANON_KEY, {
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
