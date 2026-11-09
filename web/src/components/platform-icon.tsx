import { platformInfo } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/** A small rounded tile with the network's glyph and colour (no third-party logo files). */
export function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  const p = platformInfo(platform);
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[0.6875rem] leading-none font-bold tracking-tight text-white shadow-xs ring-1 ring-black/5 select-none dark:ring-white/10",
        className,
      )}
      style={{ background: p.color }}
      aria-hidden
    >
      {p.glyph}
    </span>
  );
}
