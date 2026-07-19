// Vite config for Capacitor Android static build.
// Produces a plain SPA in ./dist (with index.html) — no SSR, no Nitro, no server functions.
// Usage: `vite build --config vite.mobile.config.ts`
import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      // Skip API/server route files — Capacitor build is client-only.
      routeFileIgnorePattern: "(api/|\\.server\\.|\\.functions\\.)",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"],
  },
  define: {
    // Force SPA mode — no SSR globals.
    "import.meta.env.SSR": "false",
    "process.env.CAPACITOR": '"true"',
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2020",
    rollupOptions: {
      input: path.resolve(__dirname, "mobile/index.html"),
    },
  },
  base: "./", // relative asset paths required by Capacitor's file:// / capacitor:// scheme
});
