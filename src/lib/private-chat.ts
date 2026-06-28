// Per-conversation AES-GCM encryption for private chats.
// Key derived from conversation_id via PBKDF2. Only conversation
// participants can read conversation_id under RLS, so only they
// can derive the same key.
//
// Wire format stored in private_messages.content:
//   "pc:v1:<base64(iv)>:<base64(ct)>"
// Anything else is treated as plaintext.

const PREFIX = "pc:v1:";
const SALT = new TextEncoder().encode("cryptobazar-private-chat-v1");
const keyCache = new Map<string, Promise<CryptoKey>>();

function subtle(): SubtleCrypto | null {
  return typeof globalThis !== "undefined" ? globalThis.crypto?.subtle ?? null : null;
}

async function deriveKey(convId: string): Promise<CryptoKey> {
  const s = subtle();
  if (!s) throw new Error("WebCrypto unavailable");
  const cached = keyCache.get(convId);
  if (cached) return cached;
  const p = (async () => {
    const base = await s.importKey(
      "raw",
      new TextEncoder().encode(convId),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    return s.deriveKey(
      { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  keyCache.set(convId, p);
  return p;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const a = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptForConversation(convId: string, plaintext: string): Promise<string> {
  try {
    const s = subtle();
    if (!s) return plaintext;
    const key = await deriveKey(convId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await s.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    return `${PREFIX}${b64(iv)}:${b64(ct)}`;
  } catch {
    return plaintext;
  }
}

export async function decryptForConversation(convId: string, payload: string): Promise<string> {
  if (!payload?.startsWith(PREFIX)) return payload;
  try {
    const s = subtle();
    if (!s) return "[encrypted]";
    const [, ivB64, ctB64] = payload.split(":");
    const key = await deriveKey(convId);
    const iv = unb64(ivB64);
    const ct = unb64(ctB64);
    const pt = await s.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return "[unable to decrypt]";
  }
}
