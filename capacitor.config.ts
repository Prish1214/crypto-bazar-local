import type { CapacitorConfig } from "@capacitor/cli";

// CryptoBazar Android app.
//
// The Android WebView loads the static SPA build from `dist-mobile/`. All API
// calls (server functions + /api/*) are rewritten at runtime to
// VITE_API_BASE_URL (see src/lib/api-base.ts) which points at the hosted
// TanStack backend on Lovable.
//
// Deep link scheme: cryptobazar://auth/callback — used to bring Supabase
// magic-link redirects back into the app. Must also be added to Supabase Auth →
// URL Configuration → Redirect URLs.
const config: CapacitorConfig = {
  appId: "app.cryptobazar",
  appName: "CryptoBazar",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
