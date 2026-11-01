import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Camera, FileImage, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { LiveCameraCapture } from "@/components/deal/live-camera-capture";
import { useAuth } from "@/hooks/use-auth";
import { fetchMyKyc, submitKyc, uploadKycDocument, type KycVerification } from "@/lib/kyc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kyc")({
  head: () => ({ meta: [{ title: "Identity verification — KryptoBazar" }] }),
  component: () => (
    <RequireAuth>
      <KycPage />
    </RequireAuth>
  ),
});

function KycPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [kyc, setKyc] = useState<KycVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfieKey, setSelfieKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const cardInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const row = await fetchMyKyc(user.id);
    setKyc(row);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const onCardPicked = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please choose a photo of your Aadhaar card"); return; }
    setCardFile(f);
  };

  const submit = async () => {
    if (!user) return;
    if (!cardFile) { toast.error("Add a photo of your Aadhaar card"); return; }
    if (!selfieFile) { toast.error("Capture your live selfie"); return; }
    setSubmitting(true);
    try {
      const idPath = await uploadKycDocument(user.id, "id-card", cardFile);
      const selfiePath = await uploadKycDocument(user.id, "selfie", selfieFile);
      const { error } = await submitKyc(user.id, idPath, selfiePath);
      if (error) throw new Error(error);
      toast.success("Submitted — our team will review it shortly");
      setCardFile(null);
      setSelfieFile(null);
      setSelfieKey((k) => k + 1);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-lg">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10">
            <BadgeCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold">Verify your identity</h1>
            <p className="text-xs text-muted-foreground">Required before you can trade on KryptoBazar.</p>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center rounded-2xl border border-border bg-card p-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : kyc?.status === "pending" ? (
          <WaitingReview onRefresh={load} onSignOut={signOut} />
        ) : kyc?.status === "approved" ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <ShieldCheck className="mx-auto h-12 w-12 text-emerald-600" />
            <h2 className="mt-3 font-display text-lg font-bold">You're verified</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your identity has been confirmed. Happy trading!</p>
            <Button variant="hero" className="mt-5 w-full" onClick={() => navigate({ to: "/wallet" })}>
              Go to Wallet
            </Button>
          </div>
        ) : kyc?.status === "rejected" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                <span className="font-semibold">Verification rejected</span>
              </div>
              {kyc.admin_notes && (
                <p className="mt-2 text-sm text-muted-foreground">Reviewer note: {kyc.admin_notes}</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">Please re-submit clearer photos below.</p>
            </div>
            <KycForm
              cardFile={cardFile} selfieFile={selfieFile} selfieKey={selfieKey}
              submitting={submitting}
              onCardPicked={onCardPicked} onSelfie={setSelfieFile}
              onRetakeSelfie={() => { setSelfieFile(null); setSelfieKey((k) => k + 1); }}
              onPickCardClick={() => cardInputRef.current?.click()}
              onSubmit={submit}
            />
          </div>
        ) : (
          <KycForm
            cardFile={cardFile} selfieFile={selfieFile} selfieKey={selfieKey}
            submitting={submitting}
            onCardPicked={onCardPicked} onSelfie={setSelfieFile}
            onRetakeSelfie={() => { setSelfieFile(null); setSelfieKey((k) => k + 1); }}
            onPickCardClick={() => cardInputRef.current?.click()}
            onSubmit={submit}
          />
        )}

        <input
          ref={cardInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => { onCardPicked(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
        />
      </div>
    </PageShell>
  );
}

function KycForm({
  cardFile, selfieFile, selfieKey, submitting,
  onCardPicked, onSelfie, onRetakeSelfie, onPickCardClick, onSubmit,
}: {
  cardFile: File | null;
  selfieFile: File | null;
  selfieKey: number;
  submitting: boolean;
  onCardPicked: (f: File | null) => void;
  onSelfie: (f: File) => void;
  onRetakeSelfie: () => void;
  onPickCardClick: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Step 1 — Aadhaar card photo */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">1 · Aadhaar card photo</span>
          {cardFile && <span className="text-[11px] text-emerald-600">Ready ✓</span>}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Photo of your original card. All four corners visible, details readable. We only use it for verification and never show it to other users.
        </p>
        {cardFile ? (
          <div className="flex items-center gap-3">
            <img src={URL.createObjectURL(cardFile)} alt="Aadhaar card" className="h-20 w-28 rounded-xl border border-border object-cover" />
            <Button size="sm" variant="glass" onClick={onPickCardClick}>Change photo</Button>
          </div>
        ) : (
          <Button variant="glass" className="w-full" onClick={onPickCardClick}>
            <Camera className="mr-2 h-4 w-4" /> Take / choose card photo
          </Button>
        )}
      </div>

      {/* Step 2 — Live selfie */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">2 · Live selfie</span>
          {selfieFile && <span className="text-[11px] text-emerald-600">Ready ✓</span>}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Captured live with a timestamp — gallery uploads are not accepted for the selfie.
        </p>
        {selfieFile ? (
          <div className="flex items-center gap-3">
            <img src={URL.createObjectURL(selfieFile)} alt="Selfie" className="h-20 w-20 rounded-full border border-border object-cover" />
            <Button size="sm" variant="glass" onClick={onRetakeSelfie}>Retake</Button>
          </div>
        ) : (
          <LiveCameraCapture key={selfieKey} onCapture={onSelfie} />
        )}
      </div>

      <Button variant="hero" size="lg" className="w-full" disabled={submitting} onClick={onSubmit}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
        {submitting ? "Compressing & uploading…" : "Submit for verification"}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Photos are compressed on your phone before upload. An admin reviews every submission manually.
      </p>
    </div>
  );
}

function WaitingReview({ onRefresh, onSignOut }: { onRefresh: () => void; onSignOut: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
      <h2 className="mt-3 font-display text-lg font-bold">Under review</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        Your documents were submitted. An admin reviews them as soon as possible — you'll be unlocked automatically once approved.
      </p>
      <div className={cn("mt-5 grid gap-2")}>
        <Button variant="glass" onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" /> Check status</Button>
        <Button variant="ghost" onClick={onSignOut}>Sign out</Button>
      </div>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Wrong page? <Link to="/auth" className="text-primary underline">Sign in</Link> with the same account to see your status.
      </p>
    </div>
  );
}
