import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Every app page starts the same way: title, one line of context, and the page's actions on the right.

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em] [overflow-wrap:anywhere]">{title}</h1>
        {description && <div className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Section title inside a page, with optional actions on the right. */
export function SectionTitle({ title, description, actions, id }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-[0.9375rem] font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
