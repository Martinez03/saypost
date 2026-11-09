"use client";

import { useI18n } from "@/components/i18n-provider";
import type { ApprovalMode } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export const APPROVAL_MODES: ApprovalMode[] = ["owner_whatsapp", "agency_dashboard"];

/** Who says "yes" for a business: its owner on WhatsApp, or the agency in the dashboard. */
export function ApprovalModeField({ value, onChange, name = "approval_mode" }: { value: ApprovalMode; onChange: (v: ApprovalMode) => void; name?: string }) {
  const { t } = useI18n();
  const g = t.agency;
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">{g.approvalTitle}</legend>
      {APPROVAL_MODES.map((mode) => {
        const id = `${name}-${mode}`;
        const checked = value === mode;
        return (
          <label
            key={mode}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition-colors hover:bg-foreground/[0.03]",
              checked && "border-primary/60 bg-primary-soft/40",
            )}
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={mode}
              checked={checked}
              onChange={() => onChange(mode)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
              aria-describedby={`${id}-hint`}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{g.modes[mode].label}</span>
              <span id={`${id}-hint`} className="text-xs text-muted-foreground">
                {g.modes[mode].hint}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
