import { createClient, type SupportedStorage } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jponeelmwvkufvsuxyes.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";

// In Capacitor, localStorage inside the WebView can be evicted by the OS.
// Wrap @capacitor/preferences as a Supabase SupportedStorage adapter so the
// session survives app restarts. Falls back to localStorage on web / SSR.
function pickAuthStorage(): SupportedStorage | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  const isNative = !!w.Capacitor?.isNativePlatform?.();
  if (!isNative) return window.localStorage;

  // Lazily load @capacitor/preferences to avoid pulling it into the web bundle.
  const cache = new Map<string, string>();
  let ready: Promise<void> | null = null;
  const ensure = async () => {
    if (ready) return ready;
    ready = (async () => {
      const { Preferences } = await import("@capacitor/preferences");
      const { keys } = await Preferences.keys();
      await Promise.all(
        keys.map(async (k) => {
          const { value } = await Preferences.get({ key: k });
          if (value != null) cache.set(k, value);
        }),
      );
    })();
    return ready;
  };
  // Fire preload but don't block sync API.
  void ensure();

  return {
    getItem: (key: string) => cache.get(key) ?? null,
    setItem: (key: string, value: string) => {
      cache.set(key, value);
      void import("@capacitor/preferences").then(({ Preferences }) =>
        Preferences.set({ key, value }),
      );
    },
    removeItem: (key: string) => {
      cache.delete(key);
      void import("@capacitor/preferences").then(({ Preferences }) =>
        Preferences.remove({ key }),
      );
    },
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: pickAuthStorage(),
  },
});
