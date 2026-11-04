import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck, Camera, Check, FileImage, Loader2, RefreshCw, ShieldCheck, UserRound, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell, RequireAuth } from "@/components/site-chrome";
import { Button } from "@/components/ui/button";
import { LiveCameraCapture } from "@/components/deal/live-camera-capture";
import { useAuth } from "@/hooks/use-auth";
import { fetchMyKyc, submitKyc, uploadKycDocument, type KycVerification } from "@/lib/kyc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/kyc")({
  head: () => ({
    meta: [
      { title: "Identity verification — KryptoBazar" },
      { name: "description", content: "Verify your identity to trade securely on KryptoBazar." },
      { property: "og:title", content: "Identity verification — KryptoBazar" },
      { property: "og:description", content: "Verify your identity to trade securely on KryptoBazar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
    if (!selfieFile) { toast.error("Capture your photo with the camera"); return; }
    setSubmitting(true);
    try {
      const idPath = await uploadKycDocument(user.id, "id-card", cardFile);
      const selfiePath = await uploadKycDocument(user.id, "selfie", selfieFile);
      const { error } = await submitKyc(user.id, idPath, selfiePath);
      if (error) throw new Error(error);
      toast.success("Submitted — your identity check is in progress");
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
            <p className="text-xs text-muted-foreground">Required to trade on KryptoBazar.</p>
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
                <span className="font-semibold">Identity check unsuccessful</span>
              </div>
              {kyc.admin_notes && (
                <p className="mt-2 text-sm text-muted-foreground">Note: {kyc.admin_notes}</p>
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

function Stepper({ step1Done, step2Done }: { step1Done: boolean; step2Done: boolean }) {
  const steps = [
    { label: "Identity document", done: step1Done, icon: FileImage },
    { label: "Face check", done: step2Done, icon: UserRound },
    { label: "Done", done: false, icon: Check },
  ];
  return (
    <div className="mb-4 flex items-center">
      {steps.map((s, i) => (
        <div key={s.label} className={cn("flex items-center", i < steps.length - 1 && "flex-1")}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold transition-colors",
                s.done
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {s.done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
            </div>
            <span className={cn(
              "whitespace-nowrap text-[10px] leading-tight",
              s.done ? "font-medium text-emerald-600" : "text-muted-foreground",
            )}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("mx-2 mb-4 h-px flex-1", step1Done && i === 0 ? "bg-emerald-600" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
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
      <Stepper step1Done={!!cardFile} step2Done={!!selfieFile} />

      {/* Step 1 — Identity document */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Identity document</span>
          {cardFile && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              <Check className="h-3 w-3" /> Added
            </span>
          )}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Take a clear photo of your original Aadhaar card — all four corners visible and every detail readable.
        </p>
        {cardFile ? (
          <div className="flex items-center gap-3">
            <img src={URL.createObjectURL(cardFile)} alt="Aadhaar card" className="h-20 w-28 rounded-xl border border-border object-cover" />
            <Button size="sm" variant="glass" onClick={onPickCardClick}>Change photo</Button>
          </div>
        ) : (
          <Button variant="glass" className="w-full" onClick={onPickCardClick}>
            <Camera className="mr-2 h-4 w-4" /> Take photo of your card
          </Button>
        )}
      </div>

      {/* Step 2 — Face check */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Face check</span>
          {selfieFile && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              <Check className="h-3 w-3" /> Added
            </span>
          )}
        </div>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          This step uses your camera — hold your face in the frame and capture.
        </p>
        {selfieFile ? (
          <div className="flex items-center gap-3">
            <img src={URL.createObjectURL(selfieFile)} alt="Selfie" className="h-20 w-20 rounded-full border border-border object-cover" />
            <Button size="sm" variant="glass" onClick={onRetakeSelfie}>Retake</Button>
          </div>
        ) : (
          <LiveCameraCapture key={selfieKey} facing="user" onCapture={onSelfie} />
        )}
      </div>

      <Button variant="hero" size="lg" className="w-full" disabled={submitting} onClick={onSubmit}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
        {submitting ? "Uploading…" : "Submit for verification"}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        Encrypted and used only for your verification.
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
      <h2 className="mt-3 font-display text-lg font-bold">In review</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        Your identity check is in progress. You'll be unlocked automatically as soon as it's approved.
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
