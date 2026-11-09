import { BrandLogo, brandIdFor } from "@/components/brand-icons";
import { platformInfo } from "@/lib/platforms";
import { cn } from "@/lib/utils";

/**
 * A network's official logo (components/brand-icons.tsx). By default on a neutral rounded tile, so logos
 * of different shapes line up; `bare` drops the tile for small inline badges. Decorative unless `label`
 * is given. Networks we have no logo for get a tile with their initials.
 */
export function PlatformIcon({ platform, className, bare = false, label }: { platform: string; className?: string; bare?: boolean; label?: string }) {
  const id = brandIdFor(platform);
  if (id && bare) return <BrandLogo id={id} label={label} className={cn("size-5", className)} />;
  if (id)
    return (
      <span
        className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs", className)}
        {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      >
        <BrandLogo id={id} className="size-[58%]" />
      </span>
    );
  const p = platformInfo(platform);
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[0.6875rem] leading-none font-bold tracking-tight text-white shadow-xs ring-1 ring-black/5 select-none dark:ring-white/10",
        className,
      )}
      style={{ background: p.color }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {p.glyph}
    </span>
  );
}
