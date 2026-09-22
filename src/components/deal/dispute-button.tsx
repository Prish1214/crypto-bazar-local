import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertOctagon, Loader2, Sparkles } from "lucide-react";
import { db, uploadDealFile, sendSystemMessage } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { apiUrl } from "@/lib/api-base";
import { toast } from "sonner";

interface Props {
  dealId: string;
  userId: string;
  disabled?: boolean;
}

export function DisputeButton({ dealId, userId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  const analyze = async () => {
    if (reason.trim().length < 12) return toast.error("Describe what happened first (min 12 characters)");
    if (resolution.trim().length < 3) return toast.error("Tell us what outcome you're asking for");
    setAnalyzing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again");
      const res = await fetch(apiUrl("/api/disputes/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          dealId,
          details: reason.trim(),
          requestedResolution: resolution.trim(),
          evidenceName: file?.name ?? null,
          evidenceType: file?.type ?? null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { analysis?: string; error?: string } | null;
      if (!res.ok || !json?.analysis) throw new Error(json?.error ?? "Could not analyze the case");
      setAnalysis(json.analysis);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not analyze the case");
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (reason.trim().length < 12) return toast.error("Please describe the issue (min 12 characters)");
    if (resolution.trim().length < 3) return toast.error("Tell us what outcome you're asking for");
    setBusy(true);
    try {
      let evidence_url: string | null = null;
      if (file) {
        const r = await uploadDealFile(dealId, userId, file, file.name.split(".").pop() ?? "bin");
        evidence_url = r.url;
      }
      const fullReason = [
        reason.trim(),
        `\n\nRequested resolution: ${resolution.trim()}`,
        analysis ? `\n\n--- AI case summary (advisory) ---\n${analysis}` : "",
      ].join("");
      const { error: e1 } = await db.from("disputes").insert({
        deal_id: dealId, opened_by: userId, reason: fullReason, evidence_url, status: "open",
      } as any);
      if (e1) throw e1;
      const { error: e2 } = await db.from("deals")
        .update({ status: "disputed", updated_at: new Date().toISOString() })
        .eq("id", dealId);
      if (e2) throw e2;
      await sendSystemMessage(dealId, userId, `⚠️ Dispute opened — reason: ${reason.trim().slice(0, 140)}. KryptoBazar admins will review.`);
      toast.success("Dispute filed — escrow frozen for review");
      setOpen(false); setReason(""); setResolution(""); setFile(null); setAnalysis(null);
    } catch (e: any) {
      toast.error(e.message ?? "Could not file dispute");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="text-destructive border-destructive/30 hover:bg-destructive/10">
          <AlertOctagon className="h-4 w-4" /> Report issue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            Escrow stays frozen until a KryptoBazar admin reviews the case.
            Be specific — false disputes hurt your trust score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reason">What happened?</Label>
            <Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Seller didn't show up; cash count was short; counterparty refused to release USDT after cash handover…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resolution">What outcome are you asking for?</Label>
            <Textarea id="resolution" rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)}
              placeholder="e.g. Refund the escrowed USDT back to me, or complete the trade after the missing cash is paid." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="evidence">Evidence (optional — photo / video)</Label>
            <Input id="evidence" type="file" accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>

          <Button variant="outline" className="w-full" onClick={analyze} disabled={analyzing || busy}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analysis ? "Re-analyze case" : "Analyze case"}
          </Button>

          {analysis && (
            <div className="rounded-xl border border-border/60 bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" /> AI case summary &amp; next steps
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{analysis}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                AI-generated guidance to help you prepare — not a dispute decision. A KryptoBazar
                admin reviews every case.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="hero" onClick={submit} disabled={busy || analyzing}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} File dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
