import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BadgeCheck, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/verified")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Email verified — KryptoBazar" },
      { name: "description", content: "Your KryptoBazar email address is verified. Sign in to start trading USDT locally." },
      { property: "og:title", content: "Email verified — KryptoBazar" },
      { property: "og:description", content: "Your KryptoBazar email address is verified. Sign in to start trading USDT locally." },
    ],
  }),
  component: VerifiedPage,
});

const PENDING_KEY = "cb.pendingProfile.v1";

function VerifiedPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [saving, setSaving] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  // Apply any profile fields cached at signup, once the session lands.
  useEffect(() => {
    if (loading) return;
    if (!user) { setSaving(false); return; }
    (async () => {
      try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (raw) {
          const p = JSON.parse(raw) as { username?: string; full_name?: string; city?: string };
          const patch: Record<string, string> = {};
          if (p.username) patch.username = p.username;
          if (p.full_name) patch.full_name = p.full_name;
          if (p.city) patch.city = p.city;
          if (Object.keys(patch).length) {
            await supabase.from("profiles").update(patch).eq("id", user.id);
          }
          localStorage.removeItem(PENDING_KEY);
        }
      } catch {}
      setSaving(false);
    })();
  }, [user, loading]);

  const backToLogin = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch {}
    navigate({ to: "/auth" });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <div className="glass-strong w-full max-w-md rounded-2xl p-7 text-center shadow-[var(--shadow-elevated)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
          {loading || saving ? (
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          ) : (
            <BadgeCheck className="h-9 w-9 text-emerald-600" />
          )}
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold">You are verified</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your email address is confirmed. Your KryptoBazar account is ready — sign in to start
          trading USDT in your city.
        </p>

        <div className="mt-7 space-y-2.5">
          {user ? (
            <Button variant="hero" size="lg" className="w-full" onClick={() => navigate({ to: "/wallet" })}>
              Continue to wallet <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="hero" size="lg" className="w-full" onClick={() => navigate({ to: "/auth" })}>
              Go to login <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={backToLogin}
            disabled={signingOut}
          >
            {signingOut && <Loader2 className="h-4 w-4 animate-spin" />} Back to login
          </Button>
        </div>

        <Link to="/" className="mt-5 inline-block text-xs text-muted-foreground hover:text-foreground">
          Back to home
        </Link>
      </div>
    </div>
  );
}
