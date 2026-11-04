import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Camera capture — live stream in the browser, native camera intent inside the
 * Android WebView (getUserMedia is unreliable there). The captured frame is
 * stamped with a date/time bar; a single JPEG File is returned via onCapture.
 */
function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Bottom date/time stamp shared by both capture paths. */
function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const stamp = new Date();
  const dateStr = stamp.toLocaleDateString();
  const timeStr = stamp.toLocaleTimeString();
  const pad = Math.round(h * 0.02);
  const fontSize = Math.round(h * 0.035);
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const barH = fontSize * 2.4;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(`${dateStr}  ${timeStr}`, pad, h - barH / 2);
}

/** Decode a captured photo, stamp it, and return a JPEG File. */
async function stampCapturedPhoto(file: Blob): Promise<File> {
  let src: ImageBitmap | HTMLImageElement;
  const url = URL.createObjectURL(file);
  try {
    if (typeof createImageBitmap === "function") {
      src = await createImageBitmap(file);
    } else {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });
      src = img;
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  const w = "width" in src ? src.width : 0;
  const h = "height" in src ? src.height : 0;
  if (!w || !h) throw new Error("bad image");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
  if ("close" in src && typeof src.close === "function") src.close();
  drawStamp(ctx, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("encode failed");
  return new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
}

export function LiveCameraCapture({
  onCapture,
  busy,
  facing = "environment",
}: {
  onCapture: (file: File) => Promise<void> | void;
  busy?: boolean;
  facing?: "user" | "environment";
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);
  const [active, setActive] = useState(false);
  const native = isNativePlatform();

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  useEffect(() => () => stop(), []);

  const openNative = () => {
    setError(null);
    nativeInputRef.current?.click();
  };

  const onNativePicked = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file isn't a photo. Please capture with the camera.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const stamped = await stampCapturedPhoto(f);
      setPreviewUrl(URL.createObjectURL(stamped));
      setPending(stamped);
    } catch {
      setError("Couldn't process that photo. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  const start = async () => {
    if (native) return openNative();
    setError(null);
    setPreviewUrl(null);
    setPending(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
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

    drawStamp(ctx, w, h);

    // LIVE badge top-left (live-stream capture only)
    const pad = Math.round(h * 0.02);
    const fontSize = Math.round(h * 0.035);
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const badgeText = "● LIVE";
    const metrics = ctx.measureText(badgeText);
    const bw = metrics.width + pad * 2;
    const bh = fontSize * 1.6;
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(pad, pad, bw, bh);
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, pad * 2, pad + bh / 2);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-live-${Date.now()}.jpg`, { type: "image/jpeg" });
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
          <img src={previewUrl} alt="Capture preview" className="w-full" />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Photo captured with timestamp
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
              <span>This step uses your camera</span>
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
          <Camera className="h-4 w-4" /> Capture Photo
        </Button>
      )}
      <p className="text-center text-[11px] text-muted-foreground">
        This must be captured directly with your camera.
      </p>

      {/* Hidden native camera-intent input (Android WebView / Capacitor) */}
      {native && (
        <input
          ref={nativeInputRef}
          type="file"
          accept="image/*"
          capture={facing}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.currentTarget.value = "";
            void onNativePicked(f);
          }}
        />
      )}
    </div>
  );
}
