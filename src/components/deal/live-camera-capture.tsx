import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Live camera capture — no gallery uploads allowed.
 * Streams getUserMedia, captures a single frame, stamps it with date/time
 * and a "LIVE" indicator, returns a JPEG File via onCapture.
 */
export function LiveCameraCapture({
  onCapture,
  busy,
}: {
  onCapture: (file: File) => Promise<void> | void;
  busy?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  const start = async () => {
    setError(null);
    setPreviewUrl(null);
    setPending(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setActive(true);
    } catch (e: any) {
      setError(e?.message ?? "Camera unavailable. Allow camera access and retry.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => () => stop(), []);

  const capture = () => {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);

    // Overlay: live badge + timestamp
    const stamp = new Date();
    const dateStr = stamp.toLocaleDateString();
    const timeStr = stamp.toLocaleTimeString();
    const pad = Math.round(h * 0.02);
    const fontSize = Math.round(h * 0.035);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

    // Bottom dark gradient bar
    const barH = fontSize * 2.4;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(`${dateStr}  ${timeStr}`, pad, h - barH / 2);

    // LIVE badge top-left
    const badgeText = "● LIVE";
    const metrics = ctx.measureText(badgeText);
    const bw = metrics.width + pad * 2;
    const bh = fontSize * 1.6;
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(pad, pad, bw, bh);
    ctx.fillStyle = "#fff";
    ctx.fillText(badgeText, pad * 2, pad + bh / 2);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `cash-live-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPending(file);
        setPreviewUrl(URL.createObjectURL(blob));
        stop();
      },
      "image/jpeg",
      0.9,
    );
  };

  const submit = async () => {
    if (!pending) return;
    await onCapture(pending);
  };

  if (previewUrl && pending) {
    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-border">
          <img src={previewUrl} alt="Live capture preview" className="w-full" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Live photo captured with timestamp
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={start} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> Retake
          </Button>
          <Button variant="hero" size="sm" className="flex-1" onClick={submit} disabled={busy}>
            {busy ? "Uploading…" : "Submit Proof"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!active && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 text-center text-xs text-white/80">
            {error ? (
              <div className="flex flex-col items-center gap-2 px-4">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <span>{error}</span>
              </div>
            ) : (
              <span>Camera off — gallery uploads are not allowed</span>
            )}
          </div>
        )}
        {active && (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            ● LIVE
          </div>
        )}
      </div>
      {!active ? (
        <Button variant="hero" size="lg" className="w-full" onClick={start} disabled={starting}>
          <Camera className="h-4 w-4" /> {starting ? "Opening camera…" : "Open Camera"}
        </Button>
      ) : (
        <Button variant="hero" size="lg" className="w-full" onClick={capture}>
          <Camera className="h-4 w-4" /> Capture Live Photo
        </Button>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        Only live camera capture is accepted as proof. Old screenshots cannot be uploaded.
      </p>
    </div>
  );
}
