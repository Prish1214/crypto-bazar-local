import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { apiUrl } from "@/lib/api-base";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Shield, Fingerprint, Mail, AlertTriangle, Loader2, CheckCircle2, LockKeyhole, Smartphone, MailCheck } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/pin-input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  disableBiometric, enableBiometric, isBiometricEnrolledLocally,
  isPlatformAuthenticatorAvailable, refreshCachedCode,
} from "@/lib/deal-code";
import { toast } from "sonner";

export const Route = createFileRoute("/settings/deal-code")({
  head: () => ({ meta: [{ title: "Deal Code — Settings — CryptoBazar" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ rotate: typeof s.rotate === "string" ? s.rotate : undefined }),
  component: () => <RequireAuth><SettingsDealCode /></RequireAuth>,
});

function SettingsDealCode() {
  const { user, session } = useAuth();
  const { rotate } = useSearch({ from: "/settings/deal-code" });
  const [stage, setStage] = useState<"idle" | "sent" | "new" | "confirm">("idle");
  const [newCode, setNewCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [bioCode, setBioCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioMode, setBioMode] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);
  const [email, setEmail] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = () => {
    setResendIn(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    setEmail(user?.email ?? "");
    if (user) setBioEnrolled(isBiometricEnrolledLocally(user.id));
    isPlatformAuthenticatorAvailable().then(setBioAvailable);
  }, [user?.id]);

  // If the user arrived from a magic link, jump straight to "enter new code".
  useEffect(() => {
    if (rotate && stage === "idle") setStage("new");
  }, [rotate]);

  const token = async () => session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;

  const requestMagicLink = async () => {
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/deal-code/request-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ redirect_origin: window.location.origin }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to send email");
      toast.success(`Verification link sent to ${j.email ?? email}`);
      setStage("sent");
      startCountdown();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (newCode !== confirm) return toast.error("New codes don't match");
    if (!rotate) return toast.error("Open the verification link from your email first");
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/api/deal-code/change"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ nonce: rotate, new_code: newCode }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Change failed");
      toast.success("Deal Code updated");
      // Keep biometric enrolled on this device — just relink cached code to the new one.
      if (user && bioEnrolled) refreshCachedCode(user.id, newCode);
      setStage("idle"); setNewCode(""); setConfirm("");
      window.history.replaceState(null, "", "/settings/deal-code");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const disableDeviceBiometric = async () => {
    if (!user) return;
    disableBiometric(user.id); setBioEnrolled(false);
    await fetch(apiUrl("/api/deal-code/biometric"), {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ enabled: false }),
    }).catch(() => null);
    toast.success("Biometric disabled on this device");
  };

  const enrollBiometric = async () => {
    if (!user || !/^\d{6}$/.test(bioCode)) return toast.error("Enter your 6-digit Deal Code");
    setBusy(true);
    try {
      await enableBiometric(user.id, bioCode);
      setBioEnrolled(true);
      setBioCode("");
      setBioMode(false);
      await fetch(apiUrl("/api/deal-code/biometric"), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ enabled: true }),
      }).catch(() => null);
      toast.success("Biometric enabled on this device");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-lg space-y-3">
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>

        <div className="app-card-compact">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-bold">Deal Code</h1>
                <p className="text-sm text-muted-foreground">Required for escrow release</p>
              </div>
            </div>
            <span className="rounded-full bg-success/10 px-2 py-1 text-[10px] font-semibold text-success">SECURE</span>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>Never share your Deal Code with anyone. It is confidential and required to authorize every deal.</div>
          </div>

          {stage === "idle" && (
            <div className="mt-4 grid gap-2">
              <Button variant="hero" className="w-full" onClick={requestMagicLink} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Mail className="h-4 w-4" /> Change Deal Code</>)}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                We'll email a secure verification link to {email || "your registered email"}.
              </p>
            </div>
          )}

          {stage === "sent" && (
            <div className="mt-5 space-y-3">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <MailCheck className="h-6 w-6" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Verification link sent to<br /><b className="text-foreground">{email}</b>
                </p>
                <p className="text-xs text-muted-foreground">Open the link on this device to continue.</p>
              </div>
              <div className="flex items-center justify-between text-xs">
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setStage("idle")}>Cancel</button>
                <button
                  type="button"
                  disabled={resendIn > 0 || busy}
                  onClick={requestMagicLink}
                  className="font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend link"}
                </button>
              </div>
            </div>
          )}

          {stage === "new" && (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-muted-foreground">Enter your new 6-digit Deal Code.</p>
              <PinInput value={newCode} onChange={setNewCode} autoFocus />
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setStage("idle")}>Back</Button>
                <Button variant="hero" className="flex-1" disabled={newCode.length !== 6} onClick={() => setStage("confirm")}>Next</Button>
              </div>
            </div>
          )}

          {stage === "confirm" && (
            <div className="mt-5 space-y-3">
              <p className="text-sm text-muted-foreground">Confirm your new Deal Code.</p>
              <PinInput value={confirm} onChange={setConfirm} autoFocus masked />
              {confirm.length === 6 && confirm !== newCode && (
                <p className="text-center text-xs text-red-600">Codes don't match</p>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => setStage("new")}>Back</Button>
                <Button variant="hero" className="flex-1" disabled={busy || confirm.length !== 6 || confirm !== newCode} onClick={submit}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Deal Code"}
                </Button>
              </div>
            </div>
          )}

        </div>

        <div className="app-card-compact">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] bg-primary/10 text-primary">
              <Fingerprint className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display text-base font-semibold">Biometric unlock</h2>
              <p className="text-xs text-muted-foreground">
                {bioAvailable
                  ? bioEnrolled
                    ? "Enabled on this device — release escrow with Face ID / Fingerprint."
                    : "Use fingerprint or face to authorize releases faster."
                  : "Not available on this device / browser."}
              </p>
            </div>
            {bioEnrolled && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          </div>
          <div className="mt-4 grid gap-2 rounded-[var(--radius-control)] bg-secondary/60 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> Device-only enrollment</div>
            <div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /> Use Deal Code or biometric at release</div>
          </div>
          {bioAvailable && (
            <Button variant={bioEnrolled ? "outline" : "hero"} className="mt-4 w-full" onClick={bioEnrolled ? disableDeviceBiometric : () => setBioMode(true)}>
              {bioEnrolled ? "Disable biometric on this device" : (<><Fingerprint className="h-4 w-4" /> Enable biometric</>)}
            </Button>
          )}
          {bioMode && !bioEnrolled && (
            <div className="mt-4 space-y-3 rounded-[var(--radius-card)] border border-primary/20 bg-primary/5 p-3">
              <p className="text-sm text-muted-foreground">Enter your current 6-digit Deal Code to link biometric unlock on this device.</p>
              <PinInput value={bioCode} onChange={setBioCode} autoFocus masked />
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={() => { setBioCode(""); setBioMode(false); }}>Cancel</Button>
                <Button variant="hero" className="flex-1" disabled={busy || bioCode.length !== 6} onClick={enrollBiometric}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
