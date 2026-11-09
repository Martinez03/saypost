"use client";

/* eslint-disable @next/next/no-img-element -- the agency's logo can live on any https host */

import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type BrandValues = { brandName: string; logoUrl: string };

export function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

/** The agency's square tile: its logo, else its first letter, else Saypost's mark. */
export function AgencyTile({ name, logoUrl, className }: { name: string | null; logoUrl: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const base = cn("flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-card", className);
  if (logoUrl && !broken) return <img src={logoUrl} alt="" className={cn(base, "object-cover")} onError={() => setBroken(true)} referrerPolicy="no-referrer" />;
  if (name) return <span className={cn(base, "bg-foreground text-lg font-semibold text-background")} aria-hidden>{name.trim().slice(0, 1).toUpperCase()}</span>;
  return (
    <span className={base} aria-hidden>
      <LogoMark className="size-7" />
    </span>
  );
}

/** Agency name and logo URL (https only), with a live preview of what clients see. */
export function AgencyBrandFields({
  values,
  onChange,
  nameError,
  logoError,
  disabled,
  idPrefix = "agency",
  onEnter,
}: {
  values: BrandValues;
  onChange: (patch: Partial<BrandValues>) => void;
  nameError?: string | null;
  logoError?: string | null;
  disabled?: boolean;
  idPrefix?: string;
  onEnter?: () => void;
}) {
  const { t } = useI18n();
  const k = t.kind;
  const logo = values.logoUrl.trim();
  const onKeyDown = onEnter
    ? (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }
    : undefined;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>{k.agencyName}</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.brandName}
          maxLength={60}
          placeholder={k.agencyNamePlaceholder}
          autoComplete="organization"
          disabled={disabled}
          aria-invalid={!!nameError || undefined}
          aria-describedby={nameError ? `${idPrefix}-name-error` : undefined}
          onChange={(e) => onChange({ brandName: e.target.value })}
          onKeyDown={onKeyDown}
        />
        {nameError && (
          <p id={`${idPrefix}-name-error`} className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-logo`}>
          {k.logoUrl} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
        </Label>
        <div className="flex items-center gap-3">
          <AgencyTile name={values.brandName.trim() || null} logoUrl={logo && isHttpsUrl(logo) ? logo : null} className="size-9 rounded-lg" key={logo} />
          <Input
            id={`${idPrefix}-logo`}
            type="url"
            inputMode="url"
            value={values.logoUrl}
            maxLength={2048}
            placeholder={k.logoUrlPlaceholder}
            disabled={disabled}
            aria-invalid={!!logoError || undefined}
            aria-describedby={`${idPrefix}-logo-hint`}
            onChange={(e) => onChange({ logoUrl: e.target.value })}
            onKeyDown={onKeyDown}
          />
        </div>
        <p id={`${idPrefix}-logo-hint`} className={cn("text-xs", logoError ? "text-destructive" : "text-muted-foreground")}>
          {logoError ?? k.logoUrlHint}
        </p>
      </div>
    </div>
  );
}
