import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { initPushNotifications, clearPushToken } from "@/lib/push";

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

    let pushedFor: string | null = null;

    const applySession = (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);

      const uid = s?.user?.id ?? null;
      if (uid && pushedFor !== uid) {
        pushedFor = uid;
        void initPushNotifications(uid);
      } else if (!uid) {
        pushedFor = null;
      }
    };

    (async () => {
      const { data } = await supabase.auth.getSession();
      applySession(data.session);

      if (!mounted) return;
      const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
        applySession(s);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    })().catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    await clearPushToken(user?.id ?? null);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
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
