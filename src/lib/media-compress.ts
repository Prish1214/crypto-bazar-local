// Client-side image compression — every uploaded photo is compressed in the
// browser BEFORE it is stored, to cut upload time on mobile data and storage.
// Photos are resized to fit within maxDim and re-encoded as JPEG.

const DEFAULTS = { maxDim: 1600, quality: 0.82 };

function isCompressible(type: string | undefined) {
  if (!type) return false;
  // Never re-encode GIF (animation) / SVG (vector) — pass through untouched.
  return type.startsWith("image/") && type !== "image/gif" && type !== "image/svg+xml";
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall through to <img> path */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/**
 * Compress an image blob. Resolves with a JPEG blob (or the original blob
 * when compression is not applicable / fails, so uploads never break).
 */
export async function compressImage(
  input: Blob | File,
  opts?: { maxDim?: number; quality?: number },
): Promise<Blob> {
  const { maxDim, quality } = { ...DEFAULTS, ...opts };
  try {
    if (!isCompressible(input.type)) return input;
    const bitmap = await loadBitmap(input);
    const srcW = "width" in bitmap ? bitmap.width : 0;
    const srcH = "height" in bitmap ? bitmap.height : 0;
    if (!srcW || !srcH) return input;

    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return input;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    // Keep the compressed result only when it is actually smaller.
    if (out && out.size > 0 && out.size < input.size) return out;
    return input;
  } catch {
    return input;
  }
}

export function isImageFile(file: File | Blob) {
  return isCompressible(file.type);
}
