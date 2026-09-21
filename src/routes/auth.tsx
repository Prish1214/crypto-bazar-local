import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — KryptoBazar" },
      { name: "description", content: "Sign in or create your KryptoBazar account." },
    ],
  }),
  component: AuthPage,
});

const PENDING_KEY = "cb.pendingProfile.v1";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // When session becomes available (fresh login OR magic-link redirect),
  // apply any pending signup-profile fields and route to wallet.
  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (raw) {
          const p = JSON.parse(raw) as { username?: string; full_name?: string; city?: string };
          const patch: any = {};
          if (p.username) patch.username = p.username;
          if (p.full_name) patch.full_name = p.full_name;
          if (p.city) patch.city = p.city;
          if (Object.keys(patch).length) {
            await supabase.from("profiles").update(patch).eq("id", user.id);
          }
          localStorage.removeItem(PENDING_KEY);
        }
      } catch {}
      navigate({ to: "/wallet" });
    })();
  }, [user, authLoading, navigate]);

  // Live username availability check
  useEffect(() => {
    if (mode !== "signup") return;
    const u = username.trim().toLowerCase();
    if (!u) { setUsernameStatus("idle"); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { setUsernameStatus("invalid"); return; }
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase.from("profiles").select("id").eq("username", u).maybeSingle();
      setUsernameStatus(data ? "taken" : "available");
    }, 350);
    return () => clearTimeout(t);
  }, [username, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && usernameStatus !== "available") {
      toast.error("Pick a unique username (3–20 chars, letters/numbers/underscore).");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const u = username.trim().toLowerCase();
        // Cache profile so we can write it after magic-link redirect completes.
        try {
          localStorage.setItem(PENDING_KEY, JSON.stringify({ username: u, full_name: fullName, city }));
        } catch {}
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { full_name: fullName, city, username: u },
          },
        });
        if (error) throw error;
        if (data.session && data.user) {
          // Auto-confirm mode — session immediately available.
          await supabase.from("profiles").update({ username: u, full_name: fullName, city }).eq("id", data.user.id);
          localStorage.removeItem(PENDING_KEY);
          toast.success("Account created!");
          navigate({ to: "/wallet" });
        } else {
          setSentTo(email);
          toast.success("Check your email to confirm your account");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/wallet" });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    if (!sentTo) return;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) return toast.error(error.message);
    toast.success("New confirmation link sent");
  };

  return (
    <div className="relative min-h-screen px-4 py-10">
      <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {sentTo ? (
          <div className="glass-strong rounded-2xl p-6 sm:p-7 shadow-[var(--shadow-elevated)]">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="h-7 w-7 text-primary" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold">Confirm your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to
                <br />
                <span className="font-medium text-foreground">{sentTo}</span>
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Open the link on this device — it will sign you in automatically.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between text-xs">
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setSentTo(null)}>
                ← Use a different email
              </button>
              <button type="button" onClick={resendConfirmation} className="font-medium text-primary">
                Resend link
              </button>
            </div>
          </div>
        ) : (
        <div className="glass-strong rounded-2xl p-7 shadow-[var(--shadow-elevated)]">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[image:var(--gradient-primary)] shadow-[var(--shadow-glow)]">
              <Coins className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to trade USDT in your city."
                : "Start trading USDT locally in minutes."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Alex Carter" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="alex_trader"
                    maxLength={20}
                    required
                  />
                  <p className={`text-xs ${
                    usernameStatus === "available" ? "text-emerald-600" :
                    usernameStatus === "taken" || usernameStatus === "invalid" ? "text-destructive" :
                    "text-muted-foreground"
                  }`}>
                    {usernameStatus === "idle" && "3–20 chars · letters, numbers, underscore. Used for private chat."}
                    {usernameStatus === "checking" && "Checking availability…"}
                    {usernameStatus === "available" && `✓ @${username} is available`}
                    {usernameStatus === "taken" && `@${username} is already taken`}
                    {usernameStatus === "invalid" && "Use 3–20 chars: a–z, 0–9, underscore"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" required />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={6} required />
            </div>

            <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to KryptoBazar?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </div>
        </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground/70">
          By continuing you agree to trade responsibly and follow your local laws.
        </p>
      </div>
    </div>
  );
}
