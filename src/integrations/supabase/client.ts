import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jponeelmwvkufvsuxyes.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impwb25lZWxtd3ZrdWZ2c3V4eWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQ0MjQsImV4cCI6MjA5NzcxMDQyNH0.OLXdG3A2Q-qjBaUSCHXG0NywOaLt_2HE_EijSV3Se1o";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});
