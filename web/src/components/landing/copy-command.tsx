"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

/** A shell command in the dark code well, with a copy button. Without JavaScript the command is still there to select. */
export function CopyCommand({ command }: { command: string }) {
  const { t } = useI18n();
  const s = t.landing.selfHost;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permissions): the text stays selectable.
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--code-bg)] py-1.5 pr-1.5 pl-4 font-mono text-[0.8125rem] text-[var(--code-ink)]">
      <code className="min-w-0 flex-1 overflow-x-auto py-1.5 whitespace-nowrap [scrollbar-width:none]">
        <span className="text-[var(--code-dim)] select-none">$ </span>
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 font-sans text-xs font-medium text-[var(--code-dim)] transition-colors outline-none hover:bg-[color-mix(in_oklab,var(--code-ink)_12%,transparent)] hover:text-[var(--code-ink)] focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        <span aria-live="polite">{copied ? s.copied : s.copy}</span>
      </button>
    </div>
  );
}
