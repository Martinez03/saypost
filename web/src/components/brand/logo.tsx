import { cn } from "@/lib/utils";

// Dilo's mark: a speech bubble holding a short voice waveform. Drawn in the bright brand green;
// the bars are white so it reads on light and dark surfaces alike.

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden>
      <path
        d="M16 3C8.82 3 3 8.37 3 15c0 3.1 1.27 5.92 3.36 8.05L5.2 28.2a.8.8 0 0 0 1.1.9l5.37-2.43c1.36.42 2.8.63 4.33.63 7.18 0 13-5.37 13-12S23.18 3 16 3Z"
        className="fill-brand-bright"
      />
      <g fill="#fff">
        <rect x="9.3" y="12.6" width="2.4" height="5.2" rx="1.2" />
        <rect x="13.1" y="9.6" width="2.4" height="11.2" rx="1.2" />
        <rect x="16.9" y="11.4" width="2.4" height="7.6" rx="1.2" />
        <rect x="20.7" y="13.4" width="2.4" height="3.6" rx="1.2" />
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[1.0625rem] font-semibold tracking-[-0.03em]", className)}>
      <LogoMark className={markClassName} />
      <span>Dilo</span>
    </span>
  );
}
