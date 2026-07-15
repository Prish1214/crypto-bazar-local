
# Convert CryptoBazar to a Capacitor Android app

## Strategy

Keep the existing TanStack Start app deployed on Lovable exactly as it is — it becomes the **API backend** for the mobile app (server functions, `/api/*` routes, NOWPayments webhook, admin analytics, everything). We add a **parallel static SPA build** of the same React UI that runs inside Capacitor on Android and talks to that hosted API over HTTPS.

Why not fully strip SSR: the Lovable preview, publish flow, and email links all depend on the SSR build. Removing it would break your live web experience. Running the same routes as an SPA-only bundle for Android is safer and reversible.

## What gets built

### 1. Static SPA build for mobile

- Add `vite.mobile.config.ts` — a plain Vite React config (no TanStack Start SSR plugin) that reuses `src/`, `src/styles.css`, and the shadcn setup.
- Switch routing for mobile to a small client-router shim: mount all route components from `src/routes/*.tsx` under a memory router. Route files remain unchanged; the shim registers them.
- Output to `dist-mobile/` — this is what Capacitor bundles into the APK.
- New script `bun run build:mobile` produces the static bundle.

### 2. API base URL

- New env `VITE_API_BASE_URL`.
  - Web build: unset → same-origin `/api/...` (unchanged).
  - Mobile build: `https://crypto-bazar-local.lovable.app` → all `fetch("/api/...")` calls become absolute URLs.
- Add tiny `src/lib/api-base.ts` helper and update the ~10 existing `fetch("/api/...`)` call sites to route through it. Server-function calls (`useServerFn`) also need the base URL; wrap `createServerFn` client transport with the base.
- Add CORS headers to every `/api/*` server route (currently same-origin only) + an `OPTIONS` handler on each. Include `Authorization` in allowed headers.

### 3. Capacitor scaffold

- Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/preferences`.
- `capacitor.config.ts` with `webDir: "dist-mobile"`, `appId: "app.cryptobazar"`, `appName: "CryptoBazar"`, deep-link scheme `cryptobazar`.
- Add `android/` platform (created by `npx cap add android`; committed).
- Scripts: `build:mobile`, `cap:sync`, `cap:open:android`.

### 4. Deep-link auth (magic links back into the app)

- Custom scheme + Android App Link: `cryptobazar://auth/callback`.
- New `src/lib/deep-links.ts`: on app start, register `App.addListener("appUrlOpen", ...)`. When URL matches the auth callback, parse `access_token` / `refresh_token` from the fragment and call `supabase.auth.setSession(...)`, then navigate to `/wallet`.
- Auth flow change in `src/routes/auth.tsx`: when running in Capacitor (detected via `Capacitor.isNativePlatform()`), send `emailRedirectTo: "cryptobazar://auth/callback"`. When running on web, keep the current same-origin redirect.
- **Manual step for you**: in Supabase Auth → URL Configuration, add `cryptobazar://auth/callback` to allowed redirect URLs. I'll document this in `docs/CAPACITOR.md`.

### 5. Supabase client for mobile

- The web client uses `localStorage`. On Android WebView this still works, but persists poorly across app restarts in some cases. Swap in `@capacitor/preferences` as the auth storage adapter when running natively. Small change in `src/integrations/supabase/client.ts`.

### 6. Docs

- `docs/CAPACITOR.md`: install Android Studio, run `bun run build:mobile && bun run cap:sync && bun run cap:open:android`, Supabase redirect URL config, Android intent-filter for the deep link, release keystore reminder.

## Explicitly NOT changing

- Web app UX, routes, styling, business logic.
- Any server function or webhook.
- Supabase schema.
- NOWPayments flow.
- `src/routeTree.gen.ts` regeneration — SSR web build stays intact.

## Files changed / added

Added:
- `vite.mobile.config.ts`
- `src/mobile-entry.tsx` (SPA bootstrap for Capacitor)
- `src/mobile-router.tsx` (memory router mounting existing route components)
- `src/lib/api-base.ts`
- `src/lib/deep-links.ts`
- `capacitor.config.ts`
- `docs/CAPACITOR.md`
- `android/` (Capacitor-generated)

Modified:
- `package.json` (deps + scripts)
- `src/integrations/supabase/client.ts` (native storage adapter)
- `src/routes/auth.tsx` (native redirect URL)
- `src/routes/api/**` (add CORS + OPTIONS)
- ~10 `fetch("/api/...")` call sites (use `apiUrl()`)
- `src/start.ts` (bearer attacher already handles auth; verify base URL for native)

## Risks / trade-offs

- **Two builds to maintain.** Web = SSR, Mobile = SPA. Adding a new API route requires no extra work; adding a new page works in both because route files are shared. Adding a new SSR-only feature (loader-fetched OG images) won't be visible in the mobile build.
- **CORS is now real.** Every `/api/*` handler needs CORS headers. I'll do this for all existing routes in the same pass.
- **First-load performance on mobile** depends on the CDN serving `crypto-bazar-local.lovable.app/api/*`. Same latency as the web app today.
- **Deep-link testing** requires an Android device or emulator — I can wire the code but cannot verify the end-to-end tap-link-opens-app flow from here.

## After you approve

I'll implement in this order and stop for verification after step 3:
1. Capacitor scaffold + mobile Vite config + `dist-mobile` build succeeds.
2. API base URL plumbing + CORS on `/api/*`.
3. Deep-link auth + native storage adapter + docs.
