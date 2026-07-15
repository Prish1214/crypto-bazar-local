// Shared CORS headers for /api/* server routes.
// Needed because the Capacitor Android WebView loads from `capacitor://localhost`
// (or `http://localhost`) and calls the hosted API cross-origin.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

/** Wrap any Response with CORS headers (safe to call on error responses too). */
export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Standard OPTIONS handler for preflight requests. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
