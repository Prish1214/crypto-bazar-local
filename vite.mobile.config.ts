// Static SPA build for Capacitor Android.
//
// This config produces a plain client-only bundle (no SSR, no server routes)
// into `dist-mobile/`. The output is what Capacitor packages into the APK.
//
// Runtime behavior:
// - Every route from src/routes/ still ships as a lazy client chunk.
// - fetch() calls to /api/* and /_serverFn/* are rewritten to VITE_API_BASE_URL
//   (see src/lib/api-base.ts) so the phone hits the hosted Lovable backend.
//
// Env required at build time:
//   VITE_API_BASE_URL=https://crypto-bazar-local.lovable.app
//   VITE_SUPABASE_URL=...
//   VITE_SUPABASE_PUBLISHABLE_KEY=...

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    // Regenerates src/routeTree.gen.ts — same as the web build.
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist-mobile",
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, "index.mobile.html"),
    },
  },
  define: {
    // Force SPA runtime — hides SSR-only branches.
    "import.meta.env.SSR": "false",
  },
});
