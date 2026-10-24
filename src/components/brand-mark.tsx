import { cn } from "@/lib/utils";
import kbMark from "@/assets/kb-mark.png.asset.json";

interface BrandMarkProps {
  className?: string;
  showName?: boolean;
}

export function BrandMark({ className, showName = false }: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={showName ? "KryptoBazar" : undefined}>
      <img
        src={kbMark.url}
        alt=""
        className="h-8 w-8 shrink-0 object-contain"
        draggable={false}
      />
      {showName && <span className="font-display text-sm font-bold">KryptoBazar</span>}
    </span>
  );
}
