import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let settled = false;

    const applySession = (s: Session | null) => {
      if (!mounted) return;
      settled = true;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    };

    const fallbackTimer = window.setTimeout(() => {
      if (!mounted || settled) return;
      setLoading(false);
    }, 2500);

    (async () => {
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        applySession(s);
      });
      unsubscribe = () => sub.subscription.unsubscribe();

      const { data } = await supabase.auth.getSession();
      applySession(data.session);
    })().catch(() => {
      if (mounted) {
        settled = true;
        setLoading(false);
      }
    }).finally(() => {
      window.clearTimeout(fallbackTimer);
    });

    return () => {
      mounted = false;
      window.clearTimeout(fallbackTimer);
      unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
