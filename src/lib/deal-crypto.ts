// Per-deal AES-GCM encryption for chat messages.
// Key is derived from the deal_id via PBKDF2; only deal participants
// can read deal_id under RLS, so only they can derive the same key.
//
// Wire format (stored in messages.content):
//   "enc:v1:<base64(iv)>:<base64(ciphertext)>"
// Anything not starting with "enc:v1:" is treated as plaintext.

const PREFIX = "enc:v1:";
const SALT = new TextEncoder().encode("cryptobazar-deal-room-v1");
const keyCache = new Map<string, Promise<CryptoKey>>();

function getCrypto(): SubtleCrypto | null {
  if (typeof globalThis === "undefined") return null;
  return globalThis.crypto?.subtle ?? null;
}

async function deriveKey(dealId: string): Promise<CryptoKey> {
  const subtle = getCrypto();
  if (!subtle) throw new Error("WebCrypto unavailable");
  const cached = keyCache.get(dealId);
  if (cached) return cached;
  const promise = (async () => {
    const baseKey = await subtle.importKey(
      "raw",
      new TextEncoder().encode(dealId),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    return subtle.deriveKey(
      { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  keyCache.set(dealId, promise);
  return promise;
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptForDeal(dealId: string, plaintext: string): Promise<string> {
  try {
    const subtle = getCrypto();
    if (!subtle) return plaintext;
    const key = await deriveKey(dealId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
    return `${PREFIX}${b64(iv)}:${b64(ct)}`;
  } catch {
    return plaintext;
  }
}

export async function decryptForDeal(dealId: string, payload: string): Promise<string> {
  if (!payload?.startsWith(PREFIX)) return payload;
  try {
    const subtle = getCrypto();
    if (!subtle) return "[encrypted]";
    const [, ivB64, ctB64] = payload.split(":");
    const key = await deriveKey(dealId);
    const iv = unb64(ivB64);
    const ct = unb64(ctB64);
    const pt = await subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
      key,
      ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer,
    );
    return new TextDecoder().decode(pt);
  } catch {
    return "[unable to decrypt]";
  }
}

export function isEncrypted(payload: string): boolean {
  return !!payload?.startsWith(PREFIX);
}
