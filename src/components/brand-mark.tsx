import { cn } from "@/lib/utils";
// Bundled at build time (not a CDN pointer) so the mark renders on every
// deployment target — Lovable, Vercel and the Capacitor Android build alike.
import kbMarkPng from "@/assets/kb-mark.png";

interface BrandMarkProps {
  className?: string;
  showName?: boolean;
}

export function BrandMark({ className, showName = false }: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={showName ? "KryptoBazar" : undefined}>
      <img
        src={kbMarkPng}
        alt=""
        className="h-8 w-8 shrink-0 object-contain"
        draggable={false}
      />
      {showName && <span className="font-display text-sm font-bold">KryptoBazar</span>}
    </span>
  );
}
