// Capacitor deep-link handler for auth callbacks.
//
// When the user taps the magic-link email on Android, the OS opens
// `cryptobazar://auth/callback#access_token=...&refresh_token=...`. Capacitor's
// App plugin fires an `appUrlOpen` event; we parse the tokens and hydrate the
// Supabase session, then navigate to /wallet.

import { supabase } from "@/integrations/supabase/client";
import { isNativeShell } from "@/lib/api-base";

let installed = false;

export async function installDeepLinkHandler(
  navigate: (path: string) => void,
): Promise<void> {
  if (installed) return;
  if (!isNativeShell()) return;
  installed = true;

  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", async (event: { url: string }) => {
      const url = event.url ?? "";
      // eslint-disable-next-line no-console
      console.info("[deep-link] received", url);

      // Expected format: cryptobazar://auth/callback#access_token=…&refresh_token=…
      const hashIdx = url.indexOf("#");
      if (hashIdx === -1) return;
      const hash = url.slice(hashIdx + 1);
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          // eslint-disable-next-line no-console
          console.error("[deep-link] setSession failed", error);
          return;
        }
        navigate("/wallet");
        return;
      }

      // Otherwise, if the URL contains a path, navigate to it.
      try {
        const u = new URL(url);
        if (u.pathname && u.pathname !== "/") navigate(u.pathname);
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[deep-link] App plugin unavailable", err);
  }
}

/** Native redirect URL used for magic links on Android. */
export const NATIVE_AUTH_REDIRECT = "cryptobazar://auth/callback";
