import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AlertOctagon, Loader2 } from "lucide-react";
import { db, uploadDealFile, sendSystemMessage } from "@/lib/db";
import { toast } from "sonner";

interface Props {
  dealId: string;
  userId: string;
  disabled?: boolean;
}

export function DisputeButton({ dealId, userId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 12) return toast.error("Please describe the issue (min 12 characters)");
    setBusy(true);
    try {
      let evidence_url: string | null = null;
      if (file) {
        const r = await uploadDealFile(dealId, userId, file, file.name.split(".").pop() ?? "bin");
        evidence_url = r.url;
      }
      const { error: e1 } = await db.from("disputes").insert({
        deal_id: dealId, opened_by: userId, reason: reason.trim(), evidence_url, status: "open",
      } as any);
      if (e1) throw e1;
      const { error: e2 } = await db.from("deals")
        .update({ status: "disputed", updated_at: new Date().toISOString() })
        .eq("id", dealId);
      if (e2) throw e2;
      await sendSystemMessage(dealId, userId, `⚠️ Dispute opened — reason: ${reason.trim().slice(0, 140)}. KryptoBazar admins will review.`);
      toast.success("Dispute filed — escrow frozen for review");
      setOpen(false); setReason(""); setFile(null);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            Escrow stays frozen until a KryptoBazar admin reviews the case.
            Be specific — false disputes hurt your trust score.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="reason">What went wrong?</Label>
            <Textarea id="reason" rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Seller didn't show up; cash count was short; counterparty refused to release USDT after cash handover…" />
          </div>
          <div>
            <Label htmlFor="evidence">Evidence (optional — photo / video)</Label>
            <Input id="evidence" type="file" accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="hero" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} File dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
