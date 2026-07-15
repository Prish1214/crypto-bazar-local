// Capacitor / mobile SPA bootstrap.
//
// Reuses the same route tree as the web SSR build (src/routeTree.gen.ts) but
// renders it purely client-side with a memory-history-free browser router.
// Installs the native fetch rewriter and the deep-link handler before mount.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./styles.css";
import { routeTree } from "./routeTree.gen";
import { AuthProvider } from "./hooks/use-auth";
import { Toaster } from "./components/ui/sonner";
import { installNativeFetchRewriter } from "./lib/api-base";
import { installDeepLinkHandler } from "./lib/deep-links";

// Install the fetch rewriter as early as possible so every request from
// hydration onward goes to VITE_API_BASE_URL.
installNativeFetchRewriter();

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Wire deep-link handler once the router is available.
installDeepLinkHandler((path) => {
  router.navigate({ to: path }).catch(() => {
    // As a fallback, use hash/location.
    window.location.hash = path;
  });
});

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
