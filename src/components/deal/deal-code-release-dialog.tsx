import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { Fingerprint, Lock, Loader2, AlertTriangle, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/pin-input";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { isBiometricEnrolledLocally, unlockCodeWithBiometric } from "@/lib/deal-code";
import { toast } from "sonner";

export function DealCodeReleaseDialog({
  open, onOpenChange, dealId, amountLabel, onReleased,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId: string;
  amountLabel: string;
  onReleased: () => Promise<void> | void;
}) {
  const { user, session } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    if (!open) { setCode(""); setBusy(false); }
    if (user) setBioAvailable(isBiometricEnrolledLocally(user.id));
  }, [open, user?.id]);

  const submit = async (submittedCode: string) => {
    if (!/^\d{6}$/.test(submittedCode)) return toast.error("Enter your 6-digit Deal Code");
    setBusy(true);
    try {
      // Always pull a fresh access token — the cached session token may be
      // expired (idle mobile tabs), which would surface as a plain "Unauthorized".
      let token = (await supabase.auth.getSession()).data.session?.access_token
        ?? session?.access_token;
      if (!token) {
        const refreshed = await supabase.auth.refreshSession();
        token = refreshed.data.session?.access_token ?? undefined;
      }
      if (!token) throw new Error("Your session expired. Please sign in again.");

      const r = await fetch(apiUrl("/api/deals/release"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ deal_id: dealId, code: submittedCode }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 && (j.error === "Unauthorized" || j.error === "Session expired")) {
          throw new Error("Your session expired. Please sign in again and retry.");
        }
        throw new Error(j.error || "Release failed");
      }
      toast.success(`Escrow released — ${amountLabel} sent to buyer`);
      onOpenChange(false);
      await onReleased();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const useBiometric = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const c = await unlockCodeWithBiometric(user.id);
      await submit(c);
    } catch (e: any) { toast.error(e.message); setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Shield className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center font-display">Authorize escrow release</DialogTitle>
          <DialogDescription className="text-center">
            Enter your 6-digit Deal Code to release <b>{amountLabel}</b> to the buyer.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <PinInput value={code} onChange={setCode} autoFocus masked disabled={busy} />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>Never share your Deal Code. Staff will never ask for it.</div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <Button variant="hero" disabled={busy || code.length !== 6} onClick={() => submit(code)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Lock className="h-4 w-4" /> Release escrow</>)}
          </Button>
          {bioAvailable && (
            <Button variant="outline" disabled={busy} onClick={useBiometric}>
              <Fingerprint className="h-4 w-4" /> Use biometric instead
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
