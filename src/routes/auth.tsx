import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Coins, Loader2, ArrowLeft, MailCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinInput } from "@/components/pin-input";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CryptoBazar" },
      { name: "description", content: "Sign in or create your CryptoBazar account." },
    ],
  }),
  component: AuthPage,
});

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
  const [otpStage, setOtpStage] = useState<null | { email: string; profile?: { username: string; full_name: string; city: string } }>(null);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading && user && !otpStage) navigate({ to: "/wallet" });
  }, [user, authLoading, navigate, otpStage]);

  // Countdown for Resend OTP
  useEffect(() => {
    if (!otpStage) return;
    setResendIn(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [otpStage?.email]);

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
    if (mode === "signup") {
      if (usernameStatus !== "available") {
        toast.error("Pick a unique username (3–20 chars, letters/numbers/underscore).");
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const u = username.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            // No magic link — email template should include {{ .Token }}
            emailRedirectTo: undefined,
            data: { full_name: fullName, city, username: u },
          },
        });
        if (error) throw error;
        // If Supabase returned a session immediately (confirmation disabled), skip OTP.
        if (data.session) {
          if (data.user) {
            await supabase.from("profiles").update({ username: u, full_name: fullName, city }).eq("id", data.user.id);
          }
          toast.success("Account created!");
          navigate({ to: "/wallet" });
        } else {
          setOtp("");
          setOtpStage({ email, profile: { username: u, full_name: fullName, city } });
          toast.success("We sent a 6-digit code to your email");
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

  const verifyOtp = async () => {
    if (!otpStage || otp.length !== 6) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: otpStage.email,
        token: otp,
        type: "signup",
      });
      if (error) throw error;
      if (data.user && otpStage.profile) {
        await supabase.from("profiles").update({
          username: otpStage.profile.username,
          full_name: otpStage.profile.full_name,
          city: otpStage.profile.city,
        }).eq("id", data.user.id);
      }
      toast.success("Email verified — welcome!");
      setOtpStage(null);
      navigate({ to: "/wallet" });
    } catch (err: any) {
      toast.error(err?.message ?? "Invalid or expired code");
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    if (!otpStage || resendIn > 0) return;
    const { error } = await supabase.auth.resend({ type: "signup", email: otpStage.email });
    if (error) return toast.error(error.message);
    toast.success("New code sent");
    setResendIn(60);
  };

  return (
    <div className="relative min-h-screen px-4 py-10">
      <div className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

      <div className="mx-auto max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        {otpStage ? (
          <div className="glass-strong rounded-2xl p-6 sm:p-7 shadow-[var(--shadow-elevated)]">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="h-7 w-7 text-primary" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-bold">Verify your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter the 6-digit code we sent to
                <br />
                <span className="font-medium text-foreground">{otpStage.email}</span>
              </p>
            </div>

            <div className="mt-6">
              <PinInput value={otp} onChange={setOtp} autoFocus />
            </div>

            <Button
              variant="hero"
              size="lg"
              className="mt-6 w-full"
              onClick={verifyOtp}
              disabled={verifying || otp.length !== 6}
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><ShieldCheck className="h-4 w-4" /> Verify & continue</>)}
            </Button>

            <div className="mt-4 flex items-center justify-between text-xs">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { setOtpStage(null); setOtp(""); }}
              >
                ← Use a different email
              </button>
              <button
                type="button"
                disabled={resendIn > 0}
                onClick={resendOtp}
                className="font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
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
            {mode === "signin" ? "New to CryptoBazar?" : "Already have an account?"}{" "}
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
