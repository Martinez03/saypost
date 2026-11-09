import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Nothing here yet: an icon in a soft tile, one sentence on what goes here, and the way to fill it.

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center", className)}>
      {icon && (
        <span className="flex size-11 items-center justify-center rounded-xl border bg-background text-muted-foreground shadow-xs [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
      )}
      <div className="grid max-w-md gap-1">
        <p className="text-[0.9375rem] font-semibold tracking-tight">{title}</p>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** A failed load, with a way to try again. */
export function ErrorState({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-10 text-center", className)}>
      <div className="grid max-w-md gap-1">
        <p className="text-[0.9375rem] font-semibold tracking-tight">{title}</p>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
