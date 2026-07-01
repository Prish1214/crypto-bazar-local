// Client helpers for the Deal Code + optional device biometric unlock.
// The plaintext 6-digit code is never stored in the DB (only a salted hash).
// Biometric is a device-only convenience: on enable, we register a platform
// WebAuthn credential and store the code obfuscated in localStorage. Release
// requires a successful biometric assertion before we auto-fill the code.

const LS_PREFIX = "cb.dc.v1";

function b64u(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function xorMask(code: string, secret: string): string {
  const out: number[] = [];
  for (let i = 0; i < code.length; i++) {
    out.push(code.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
  }
  return btoa(String.fromCharCode(...out));
}
function xorUnmask(payload: string, secret: string): string {
  const bytes = atob(payload);
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
  }
  return String.fromCharCode(...out);
}

export function isBiometricSupported(): boolean {
  return typeof window !== "undefined"
    && !!window.PublicKeyCredential
    && !!(navigator as any).credentials?.create;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;
  try {
    // @ts-expect-error - method exists on modern browsers
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.();
  } catch { return false; }
}

/** Register a platform biometric credential and cache the deal code
 *  obfuscated with the credential id. Returns true on success. */
export async function enableBiometric(userId: string, code: string): Promise<boolean> {
  if (!isBiometricSupported()) throw new Error("Biometric not supported on this device");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "CryptoBazar", id: window.location.hostname },
      user: { id: userIdBytes, name: userId, displayName: "Deal Code" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Biometric registration was cancelled");
  const credId = b64u(cred.rawId);
  localStorage.setItem(`${LS_PREFIX}.cred.${userId}`, credId);
  localStorage.setItem(`${LS_PREFIX}.code.${userId}`, xorMask(code, credId));
  return true;
}

export function isBiometricEnrolledLocally(userId: string): boolean {
  return !!localStorage.getItem(`${LS_PREFIX}.cred.${userId}`)
    && !!localStorage.getItem(`${LS_PREFIX}.code.${userId}`);
}

export function disableBiometric(userId: string) {
  localStorage.removeItem(`${LS_PREFIX}.cred.${userId}`);
  localStorage.removeItem(`${LS_PREFIX}.code.${userId}`);
}

/** Prompt biometric assertion; returns the cached deal code on success. */
export async function unlockCodeWithBiometric(userId: string): Promise<string> {
  const credId = localStorage.getItem(`${LS_PREFIX}.cred.${userId}`);
  const masked = localStorage.getItem(`${LS_PREFIX}.code.${userId}`);
  if (!credId || !masked) throw new Error("Biometric is not enrolled on this device");
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const rawId = Uint8Array.from(atob(credId.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - credId.length % 4) % 4)), (c) => c.charCodeAt(0));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: rawId, type: "public-key" }],
      userVerification: "required",
      timeout: 60_000,
      rpId: window.location.hostname,
    },
  });
  if (!assertion) throw new Error("Biometric verification failed");
  const code = xorUnmask(masked, credId);
  if (!/^\d{6}$/.test(code)) throw new Error("Cached deal code is invalid");
  return code;
}

/** Update the locally-cached code when the user rotates it. */
export function refreshCachedCode(userId: string, newCode: string) {
  const credId = localStorage.getItem(`${LS_PREFIX}.cred.${userId}`);
  if (!credId) return;
  localStorage.setItem(`${LS_PREFIX}.code.${userId}`, xorMask(newCode, credId));
}
