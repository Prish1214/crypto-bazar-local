import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  masked?: boolean;
  className?: string;
}

export function PinInput({ value, onChange, length = 6, autoFocus, disabled, masked, className }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { if (autoFocus) refs.current[0]?.focus(); }, [autoFocus]);

  const set = (i: number, v: string) => {
    const digit = v.replace(/\D/g, "").slice(-1);
    const arr = value.padEnd(length, " ").split("");
    arr[i] = digit || " ";
    const next = arr.join("").replace(/\s+$/, "").replace(/ /g, "");
    onChange(next.slice(0, length));
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(t.length, length - 1)]?.focus(); }
  };

  return (
    <div className={cn("flex gap-2 justify-center", className)}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={value[i] ? (masked ? "•" : value[i]) : ""}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          className={cn(
            "h-14 w-11 sm:h-16 sm:w-12 rounded-xl border-2 border-border bg-background text-center text-2xl font-semibold font-mono",
            "outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
            value[i] && "border-primary/60 bg-primary/5",
            disabled && "opacity-60",
          )}
        />
      ))}
    </div>
  );
}
