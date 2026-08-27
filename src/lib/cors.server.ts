// CORS helpers for API routes so the Capacitor Android shell
// (origin https://localhost or capacitor://localhost) can call them.
//
// STANDING RULE: every new route under src/routes/api/ must add an OPTIONS
// handler using corsPreflight() and wrap its responses with withCors().

const ALLOWED_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
]);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "";
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Accept, Origin, apikey, x-nowpayments-sig",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type Handler = (ctx: any) => Response | Promise<Response>;

/**
 * Wrap a route's handler map: every response gets CORS headers and an
 * OPTIONS preflight handler is added automatically.
 */
export function withCorsHandlers<T extends Record<string, Handler>>(handlers: T) {
  const out: Record<string, Handler> = {
    OPTIONS: async ({ request }: any) => corsPreflight(request),
  };
  for (const [method, handler] of Object.entries(handlers)) {
    out[method] = async (ctx: any) => withCors(await handler(ctx), ctx.request);
  }
  return out as T & { OPTIONS: Handler };
}
