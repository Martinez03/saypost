"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { LANGS, LANG_NAMES, type Lang } from "@/i18n";
import { storeLang } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** ES | EN segmented switch: stores the choice in the `lang` cookie and re-renders the server components. */
export function LangToggle({ className }: { className?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Lang) {
    if (next === lang) return;
    storeLang(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t.common.language}
      className={cn("inline-flex h-8 shrink-0 items-center rounded-lg border bg-background p-0.5 text-xs font-medium shadow-xs", pending && "opacity-70", className)}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={l === lang}
          title={LANG_NAMES[l]}
          lang={l}
          className={cn(
            "h-full rounded-md px-2 uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            l === lang ? "bg-primary-soft text-primary-ink" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
          <span className="sr-only"> ({LANG_NAMES[l]})</span>
        </button>
      ))}
    </div>
  );
}
