// Client-only entry for the Capacitor Android SPA build.
// Boots the same TanStack Router used by the web app, but in memory/browser
// history mode without any SSR shell.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { getRouter } from "./router";
import "./styles.css";

const router = getRouter();
// getRouter() attaches a QueryClient to router.options.context.
const queryClient = (router.options.context as { queryClient: import("@tanstack/react-query").QueryClient }).queryClient;

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
