import { Capacitor } from "@capacitor/core";

/**
 * Base origin used when the app runs inside the Capacitor Android shell.
 * On native, the web assets are served from capacitor://localhost, so relative
 * /api/* paths would never reach the server — they must be absolute.
 */
export const NATIVE_API_ORIGIN = "https://crypto-bazar-local.vercel.app";

/**
 * Resolve an API path for the current platform.
 *
 * STANDING RULE: every fetch() to an /api/* endpoint MUST go through apiUrl().
 */
export function apiUrl(path: string): string {
  let isNative = false;
  try {
    isNative = Capacitor.isNativePlatform();
  } catch {
    isNative = false;
  }
  if (!isNative) return path;
  return `${NATIVE_API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
