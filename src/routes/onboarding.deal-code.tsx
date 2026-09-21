import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { apiUrl } from "@/lib/api-base";
import { useEffect, useState } from "react";
import { Shield, Fingerprint, AlertTriangle, CheckCircle2, Lock, Loader2 } from "lucide-react";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/pin-input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  enableBiometric, isBiometricSupported, isPlatformAuthenticatorAvailable,
} from "@/lib/deal-code";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding/deal-code")({
  head: () => ({ meta: [{ title: "Create your Deal Code — KryptoBazar" }] }),
  component: () => <RequireAuth><Onboarding /></RequireAuth>,
});

function Onboarding() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"intro" | "create" | "confirm" | "biometric" | "done">("intro");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [existing, setExisting] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("deal_code_set_at").eq("id", user.id).maybeSingle()
      .then(({ data }) => setExisting(!!data?.deal_code_set_at));
    isPlatformAuthenticatorAvailable().then(setBioAvailable);
  }, [user?.id]);

  useEffect(() => {
    if (existing) navigate({ to: "/marketplace", replace: true });
  }, [existing]);

  const submitCode = async () => {
    if (code !== confirm) return toast.error("Codes don't match");
    setBusy(true);
    try {
      const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
      const r = await fetch(apiUrl("/api/deal-code/set"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Failed to save Deal Code");
      toast.success("Deal Code saved");
      setStep(isBiometricSupported() && bioAvailable ? "biometric" : "done");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const doBiometric = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await enableBiometric(user.id, code);
      const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
      await fetch(apiUrl("/api/deal-code/biometric"), {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled: true }),
      }).catch(() => null);
      toast.success("Biometric unlock enabled");
      setStep("done");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-lg">
        {step === "intro" && (
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-bold">Create your Deal Code</h1>
                <p className="text-sm text-muted-foreground">One-time setup · takes 30 seconds</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed">
              Your <b>6-digit Deal Code</b> is the final authorization step for every escrow release.
              As the seller, you'll enter it to confirm cash received and release USDT to the buyer.
            </p>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <b>Never share your Deal Code with anyone.</b> It is confidential, should only be known by
                the account owner, and is required to authorize every deal. KryptoBazar staff will never
                ask for it.
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {[
                "Stored as a salted hash — plaintext never leaves your device",
                "Optional biometric unlock (Fingerprint / Face ID) after setup",
                "Changing it later requires an email OTP for security",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" /><span>{t}</span>
                </li>
              ))}
            </ul>
            <Button variant="hero" className="mt-6 w-full" onClick={() => setStep("create")}>
              Create Deal Code
            </Button>
          </div>
        )}

        {step === "create" && (
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-lg">
            <div className="mb-5 flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-bold">Choose your 6-digit Deal Code</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Pick something memorable but not obvious. Avoid birthdates or repeating digits.
            </p>
            <PinInput value={code} onChange={setCode} autoFocus />
            <Button variant="hero" className="mt-6 w-full" disabled={code.length !== 6}
              onClick={() => { setConfirm(""); setStep("confirm"); }}>
              Continue
            </Button>
          </div>
        )}

        {step === "confirm" && (
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-lg">
            <h2 className="mb-4 font-display text-xl font-bold">Re-enter your Deal Code</h2>
            <PinInput value={confirm} onChange={setConfirm} autoFocus masked />
            {confirm.length === 6 && confirm !== code && (
              <p className="mt-3 text-center text-xs text-red-600">Codes don't match</p>
            )}
            <div className="mt-6 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setConfirm(""); setStep("create"); }}>Back</Button>
              <Button variant="hero" className="flex-1" disabled={confirm.length !== 6 || busy} onClick={submitCode}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Deal Code"}
              </Button>
            </div>
          </div>
        )}

        {step === "biometric" && (
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Fingerprint className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold">Enable biometric unlock?</h2>
                <p className="text-sm text-muted-foreground">Optional · this device only</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed">
              Use your fingerprint or Face ID to release escrow instead of typing your Deal Code every time.
              Your code stays on this device and is never sent to our servers unencrypted.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button variant="hero" onClick={doBiometric} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Fingerprint className="h-4 w-4" /> Enable biometric</>)}
              </Button>
              <Button variant="ghost" onClick={() => setStep("done")}>Skip for now</Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="rounded-3xl border border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 sm:p-8 shadow-lg text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/20 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="font-display text-xl font-bold">You're all set</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your Deal Code is ready. You can update it any time from Settings.
            </p>
            <Button variant="hero" className="mt-6 w-full" onClick={() => navigate({ to: "/marketplace" })}>
              Go to Marketplace
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
