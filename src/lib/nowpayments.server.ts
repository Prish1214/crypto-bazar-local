// Server-only NOWPayments Custody client.
// Docs: https://documenter.getpostman.com/view/7907941/2s9YsGittd
// Do NOT import this from client code.

const BASE = "https://api.nowpayments.io/v1";

export const NETWORK_TO_CURRENCY: Record<string, string> = {
  trc20: "usdttrc20",
  bep20: "usdtbsc",
  erc20: "usdterc20",
  polygon: "usdtmatic",
};

function apiKey(): string {
  const k = cleanSecret(process.env.NOWPAYMENTS_API_KEY);
  if (!k) throw new Error("NOWPAYMENTS_API_KEY not configured");
  return k;
}

function cleanSecret(value: string | null | undefined): string | undefined {
  let trimmed = value
    ?.trim()
    .replace(/^export\s+/i, "")
    .replace(/^['\"`]|['\"`;]$/g, "");
  const assignment = trimmed?.match(/^[A-Z0-9_]+\s*=\s*(.+)$/i);
  if (assignment?.[1]) {
    trimmed = assignment[1]
      .trim()
      .replace(/^['\"`]|['\"`;]$/g, "");
  }
  return trimmed || undefined;
}

async function np<T = any>(
  path: string,
  init: RequestInit & { auth?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "x-api-key": apiKey(),
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  if (init.auth) headers["Authorization"] = `Bearer ${init.auth}`;
  const r = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await r.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!r.ok) {
    const msg = json?.message || json?.error || `NOWPayments ${path} failed (${r.status})`;
    const printable = typeof msg === "string" ? msg : JSON.stringify(msg);
    throw new Error(`NOWPayments ${path} failed (${r.status}): ${printable}`);
  }
  return json;
}

/** Get a short-lived JWT using account email/password (needed for payouts). */
let cachedJwt: { token: string; expires: number } | null = null;
export async function getJwt(): Promise<string> {
  if (cachedJwt && cachedJwt.expires > Date.now() + 30_000) return cachedJwt.token;
  const email = cleanSecret(process.env.NOWPAYMENTS_EMAIL);
  const password = cleanSecret(process.env.NOWPAYMENTS_PASSWORD);
  if (!email || !password) throw new Error("NOWPAYMENTS_EMAIL/PASSWORD not configured");
  let j: { token: string };
  try {
    j = await np<{ token: string }>("/auth", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  } catch (e: any) {
    cachedJwt = null;
    throw new Error(`${String(e?.message ?? e)}. Check NOWPAYMENTS_EMAIL and NOWPAYMENTS_PASSWORD exactly as your live NOWPayments account login.`);
  }
  cachedJwt = { token: j.token, expires: Date.now() + 4 * 60 * 1000 }; // ~5min token
  return j.token;
}

/** Look up an existing sub-partner by name. */
async function findSubPartnerByName(token: string, name: string): Promise<string | null> {
  const j = await np<any>("/sub-partner?limit=1000", { method: "GET", auth: token });
  const list: any[] = j.result ?? j.data ?? [];
  const match = list.find((p) => p?.name === name);
  return match ? String(match.id ?? match.sub_partner_id) : null;
}

/** Create a custody sub-partner (Billing API). The documented path is
 *  `POST /v1/sub-partner/balance` — it both creates the user and is later
 *  used to fetch the balance. Requires JWT. If the name was already
 *  created in a previous attempt (e.g. response was lost), look it up
 *  via `GET /v1/sub-partner` and return that id instead. */
export async function createSubPartner(name: string): Promise<string> {
  const token = await getJwt();
  try {
    const j = await np<any>("/sub-partner/balance", {
      method: "POST",
      auth: token,
      body: JSON.stringify({ name }),
    });
    const r = j.result ?? j;
    const id = r.id ?? r.sub_partner_id;
    if (id) return String(id);
    // Fall through to lookup if response didn't include an id.
    const existing = await findSubPartnerByName(token, name);
    if (existing) return existing;
    throw new Error("NOWPayments sub-partner id missing in response");
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (/already exist/i.test(msg)) {
      const existing = await findSubPartnerByName(token, name);
      if (existing) return existing;
    }
    throw e;
  }
}

/** Generate a deposit address for a sub-partner + currency. Requires JWT.
 *  The Billing API requires an `amount` field; we pass a large notional so
 *  the user can send any amount up to that ceiling — the address is then
 *  cached per (user, network) in the DB. */
export async function generateDepositAddress(opts: {
  subPartnerId: string;
  currency: string; // e.g. usdttrc20
  ipnCallbackUrl?: string;
}): Promise<{ address: string; paymentId?: string }> {
  const token = await getJwt();
  const body = {
    sub_partner_id: opts.subPartnerId,
    currency: opts.currency,
    amount: 100000, // notional ceiling; user-perceived deposits can be any amount
    ipn_callback_url: opts.ipnCallbackUrl,
  };
  const j = await np<any>("/sub-partner/payment", {
    method: "POST",
    auth: token,
    body: JSON.stringify(body),
  });
  const r = j.result ?? j;
  const address = r.address ?? r.pay_address ?? r.deposit_address;
  if (!address) throw new Error("NOWPayments did not return a deposit address");
  return { address, paymentId: String(r.payment_id ?? r.id ?? "") || undefined };
}

/** Fetch a sub-partner's custody balances. Returns { [currency]: amount }. */
export async function getSubPartnerBalance(
  subPartnerId: string,
): Promise<Record<string, number>> {
  const token = await getJwt();
  const j = await np<any>(`/sub-partner/balance/${subPartnerId}`, {
    method: "GET",
    auth: token,
  });
  const r = j.result ?? j;
  const out: Record<string, number> = {};
  // API returns { balances: { usdttrc20: { amount, pendingAmount }, ... } }
  const balances = r.balances ?? r;
  for (const [k, v] of Object.entries<any>(balances)) {
    if (v && typeof v === "object") out[k.toLowerCase()] = Number(v.amount ?? 0);
    else if (typeof v === "number") out[k.toLowerCase()] = v;
  }
  return out;
}

/** Move funds from a sub-partner custody balance up to the master account.
 *  Required before /payout, since /payout draws from the master balance. */
export async function writeOffFromSubPartner(opts: {
  subPartnerId: string;
  currency: string;
  amount: number;
}): Promise<void> {
  const token = await getJwt();
  await np<any>("/sub-partner/write-off", {
    method: "POST",
    auth: token,
    body: JSON.stringify({
      sub_partner_id: opts.subPartnerId,
      currency: opts.currency,
      amount: opts.amount,
    }),
  });
}

/** Create a payout (withdrawal) to a destination address. */
export async function createPayout(opts: {
  address: string;
  amount: number;
  currency: string;
  ipnCallbackUrl?: string;
}): Promise<{ payoutId: string; raw: any }> {
  const token = await getJwt();
  const j = await np<any>("/payout", {
    method: "POST",
    auth: token,
    body: JSON.stringify({
      ipn_callback_url: opts.ipnCallbackUrl,
      withdrawals: [
        {
          address: opts.address,
          currency: opts.currency,
          amount: opts.amount,
        },
      ],
    }),
  });
  const w = j.withdrawals?.[0] ?? j.result?.withdrawals?.[0];
  const payoutId = String(w?.id ?? j.id ?? "");
  if (!payoutId) throw new Error("NOWPayments did not return a payout id");
  return { payoutId, raw: j };
}

/** Estimate network fee (best-effort; not all currencies supported). */
export async function estimateFee(
  currency: string,
  amount: number,
): Promise<number | null> {
  try {
    const j = await np<any>(
      `/payout/fee?currency=${currency}&amount=${amount}`,
      { method: "GET" },
    );
    const fee = Number(j.fee ?? j.result?.fee ?? 0);
    return Number.isFinite(fee) ? fee : null;
  } catch {
    return null;
  }
}

/** HMAC-SHA512 verify for IPN body (NOWPayments standard). */
export async function verifyIpn(rawBody: string, signature: string): Promise<boolean> {
  const secret = cleanSecret(process.env.NOWPAYMENTS_IPN_SECRET);
  if (!secret) throw new Error("NOWPAYMENTS_IPN_SECRET not configured");
  // NOWPayments signs the JSON body sorted alphabetically.
  const sorted = sortJsonString(rawBody);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(sorted));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare.
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function sortJsonString(raw: string): string {
  try {
    return JSON.stringify(sortKeys(JSON.parse(raw)));
  } catch {
    return raw;
  }
}
function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v)
      .sort()
      .reduce<any>((o, k) => ((o[k] = sortKeys(v[k])), o), {});
  }
  return v;
}
