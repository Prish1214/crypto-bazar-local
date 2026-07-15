// API base URL + native fetch rewriter.
//
// - On the web build (SSR), same-origin `/api/...` and `/_serverFn/...` work as-is.
// - Inside Capacitor (Android WebView), the app is served from
//   `capacitor://localhost` (or `http://localhost`), so relative API paths would
//   404. `VITE_API_BASE_URL` provides the hosted origin (e.g.
//   `https://crypto-bazar-local.lovable.app`), and installNativeFetchRewriter()
//   patches window.fetch so every existing `/api/*` and `/_serverFn/*` call is
//   transparently sent to that origin.
//
// This lets us reuse ALL existing fetch call sites and TanStack server-function
// calls unchanged in the mobile bundle.

export const API_BASE_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";

/** Prepend API_BASE_URL to a relative path. Safe on web (returns as-is). */
export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

/** Should absolute-URL rewriting be active? True inside Capacitor / native shell. */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

let installed = false;

/**
 * Patch window.fetch to rewrite same-origin `/api/*` and `/_serverFn/*` calls to
 * the hosted API_BASE_URL when running inside Capacitor. Idempotent, no-op on
 * the web build or when API_BASE_URL is unset.
 */
export function installNativeFetchRewriter(): void {
  if (installed) return;
  if (typeof window === "undefined") return;
  if (!API_BASE_URL) return;
  if (!isNativeShell()) return;

  const originalFetch = window.fetch.bind(window);

  const shouldRewrite = (url: string): boolean => {
    return url.startsWith("/api/") || url.startsWith("/_serverFn/");
  };

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      if (typeof input === "string" && shouldRewrite(input)) {
        return originalFetch(apiUrl(input), init);
      }
      if (input instanceof URL) {
        // Absolute URL — pass through.
        return originalFetch(input, init);
      }
      if (input instanceof Request && shouldRewrite(new URL(input.url, "http://x").pathname)) {
        const path = new URL(input.url, "http://x").pathname + new URL(input.url, "http://x").search;
        const rewritten = new Request(apiUrl(path), input);
        return originalFetch(rewritten, init);
      }
    } catch {
      // fall through to original
    }
    return originalFetch(input as RequestInfo, init);
  }) as typeof window.fetch;

  installed = true;
  // eslint-disable-next-line no-console
  console.info("[api-base] Native fetch rewriter installed →", API_BASE_URL);
}
