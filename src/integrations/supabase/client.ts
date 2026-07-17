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

  // Supabase supports async storage. Reading Preferences directly avoids the
  // old startup preload of every stored key, which could make Android WebView
  // feel frozen while the keyboard/input was opening.
  let preferencesPromise: Promise<typeof import("@capacitor/preferences").Preferences> | null = null;
  const getPreferences = () => {
    preferencesPromise ??= import("@capacitor/preferences").then((m) => m.Preferences);
    return preferencesPromise;
  };

  return {
    getItem: async (key: string) => {
      const Preferences = await getPreferences();
      const { value } = await Preferences.get({ key });
      return value;
    },
    setItem: async (key: string, value: string) => {
      const Preferences = await getPreferences();
      await Preferences.set({ key, value });
    },
    removeItem: async (key: string) => {
      const Preferences = await getPreferences();
      await Preferences.remove({ key });
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
