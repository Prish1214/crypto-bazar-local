import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CheckCircle2, QrCode, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Deal } from "@/lib/db";
import { toast } from "sonner";

type QRPayload = { v: 1; deal: string; user: string; role: "buyer" | "seller" };

function buildPayload(deal: Deal, isBuyer: boolean): string {
  const payload: QRPayload = {
    v: 1,
    deal: deal.id,
    user: isBuyer ? deal.buyer_id : deal.seller_id,
    role: isBuyer ? "buyer" : "seller",
  };
  return JSON.stringify(payload);
}

export function MutualQRVerification({
  deal, isBuyer, onVerified,
}: {
  deal: Deal;
  isBuyer: boolean;
  onVerified: () => Promise<void>;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const myCode = buildPayload(deal, isBuyer);
  const myDone = isBuyer ? !!deal.buyer_qr_verified_at : !!deal.seller_qr_verified_at;
  const otherDone = isBuyer ? !!deal.seller_qr_verified_at : !!deal.buyer_qr_verified_at;

  const onScan = async (text: string) => {
    try {
      const parsed = JSON.parse(text) as QRPayload;
      const expectedUser = isBuyer ? deal.seller_id : deal.buyer_id;
      if (parsed?.deal !== deal.id || parsed?.user !== expectedUser) {
        toast.error("QR doesn't match this deal's counterparty");
        return;
      }
      await onVerified();
      toast.success("Counterparty verified");
      setScanOpen(false);
    } catch {
      toast.error("Invalid QR code");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold tracking-tight">Mutual QR Verification</h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">In-person</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Show your QR to the other party and scan theirs to confirm the right person is in front of you.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
        <Tile label="You" done={myDone} />
        <Tile label="Counterparty" done={otherDone} />
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
        <div className="rounded-md bg-white p-2">
          <QRCodeSVG value={myCode} size={88} level="M" />
        </div>
        <div className="text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Your QR</div>
          Tap "Scan Counterparty" to verify their code.
        </div>
      </div>

      {!myDone && (
        <Button variant="hero" className="mt-3 w-full" size="sm" onClick={() => setScanOpen(true)}>
          <ScanLine className="h-4 w-4" /> Scan Counterparty's QR
        </Button>
      )}
      {myDone && !otherDone && (
        <p className="mt-3 text-center text-xs text-muted-foreground">Waiting for the other party to scan you…</p>
      )}
      {myDone && otherDone && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-emerald-50/60 px-3 py-2 text-xs font-medium text-emerald-700 dark:bg-emerald-950/20">
          <CheckCircle2 className="h-4 w-4" /> Both parties verified
        </div>
      )}

      <QRScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScan} />
    </div>
  );
}

function Tile({ label, done }: { label: string; done: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-2 ${done ? "border-emerald-600/30 bg-emerald-50/50 text-emerald-700 dark:bg-emerald-950/20" : "border-border"}`}>
      <div className="flex items-center justify-center gap-1 font-semibold">
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <QrCode className="h-3.5 w-3.5" />} {label}
      </div>
      <div>{done ? "Verified" : "Pending"}</div>
    </div>
  );
}

function QRScannerDialog({
  open, onClose, onResult,
}: { open: boolean; onClose: () => void; onResult: (text: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        if (cancelled || !containerRef.current) return;
        const elId = "qr-reader-" + Math.random().toString(36).slice(2, 8);
        containerRef.current.id = elId;
        const scanner = new mod.Html5Qrcode(elId, { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          (decoded: string) => {
            onResult(decoded);
          },
          () => { /* per-frame errors are noisy; ignore */ },
        );
      } catch (e: any) {
        setErr(e?.message ?? "Camera unavailable");
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => s.clear?.());
        scannerRef.current = null;
      }
    };
  }, [open, onResult]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanLine className="h-4 w-4" /> Scan QR Code</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden rounded-lg border border-border bg-black/90">
          <div ref={containerRef} className="aspect-square w-full" />
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <p className="text-xs text-muted-foreground">Hold the counterparty's QR steady inside the frame.</p>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /> Close</Button>
      </DialogContent>
    </Dialog>
  );
}
