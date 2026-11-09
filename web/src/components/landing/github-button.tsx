import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn("size-4 shrink-0", className)} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * Link to the repository with the live star count. Without a count (repo not public yet, API down)
 * it is a plain GitHub link: no placeholder number.
 */
export function GithubButton({
  href,
  label,
  stars,
  starsLabel,
  locale,
  size = "md",
  className,
  labelClassName,
}: {
  href: string;
  label: string;
  stars: number | null;
  /** Accessible text for the count, e.g. "120 stars on GitHub". */
  starsLabel: (count: string) => string;
  locale: string;
  size?: "md" | "lg";
  className?: string;
  /** Classes for the visible label, e.g. to hide it on small screens (it stays readable to screen readers). */
  labelClassName?: string;
}) {
  const count = stars === null ? null : new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(stars);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex shrink-0 items-center rounded-lg border border-input/80 bg-card font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 dark:border-input",
        size === "md" ? "h-9 text-sm" : "h-12 rounded-xl text-[0.9375rem]",
        className,
      )}
    >
      <span className={cn("flex items-center gap-2", size === "md" ? "px-3" : "px-5")}>
        <GithubMark className={size === "lg" ? "size-[1.125rem]" : undefined} />
        <span className={labelClassName}>{label}</span>
      </span>
      {count !== null && (
        <span
          className={cn("num flex h-full items-center gap-1 border-l border-input/80 text-muted-foreground group-hover:text-foreground dark:border-input", size === "md" ? "px-2.5" : "px-4")}
        >
          <Star className="size-3.5 fill-current" aria-hidden />
          <span aria-hidden>{count}</span>
          <span className="sr-only">{starsLabel(count)}</span>
        </span>
      )}
    </a>
  );
}
