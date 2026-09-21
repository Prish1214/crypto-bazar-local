import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  showName?: boolean;
}

export function BrandMark({ className, showName = false }: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label={showName ? "KryptoBazar" : undefined}>
      <span className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary text-primary-foreground shadow-sm">
        <span className="font-display text-base font-bold leading-none">K</span>
        <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-background ring-1 ring-primary" />
      </span>
      {showName && <span className="font-display text-sm font-bold">KryptoBazar</span>}
    </span>
  );
}