"use client";

import { useI18n } from "@/components/i18n-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, isCategory, LANGUAGES, TIMEZONES, TONES } from "@/lib/business";
import type { BusinessLanguage, Tone } from "@/lib/database.types";
import { cn } from "@/lib/utils";

// The business profile fields, shared by onboarding and settings. Controlled: the parent owns the values.

export type BusinessValues = {
  name: string;
  category: string;
  city: string;
  description: string;
  tone: Tone;
  language: BusinessLanguage;
  timezone: string;
};

export function BusinessFields({
  values,
  onChange,
  showTimezone = false,
  nameError,
}: {
  values: BusinessValues;
  onChange: (patch: Partial<BusinessValues>) => void;
  showTimezone?: boolean;
  nameError?: string | null;
}) {
  const { t } = useI18n();
  const b = t.business;

  const categoryItems = CATEGORIES.map((c) => ({ value: c, label: b.categories[c] }));
  // A category typed elsewhere stays selectable as it is.
  if (values.category && !isCategory(values.category)) categoryItems.push({ value: values.category as (typeof CATEGORIES)[number], label: values.category });
  const languageItems = LANGUAGES.map((l) => ({ value: l, label: b.languages[l] }));
  const zones = TIMEZONES.includes(values.timezone) ? TIMEZONES : [values.timezone, ...TIMEZONES];
  const timezoneItems = zones.map((z) => ({ value: z, label: z.replaceAll("_", " ") }));

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="biz-name">
          {b.name} <span className="text-destructive" aria-hidden>*</span>
        </Label>
        <Input
          id="biz-name"
          required
          maxLength={120}
          autoComplete="organization"
          placeholder={b.namePlaceholder}
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "biz-name-error" : undefined}
        />
        {nameError && (
          <p id="biz-name-error" className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="biz-category">{b.category}</Label>
          <Select value={values.category || null} onValueChange={(v) => onChange({ category: v ?? "" })} items={categoryItems}>
            <SelectTrigger id="biz-category">
              <SelectValue placeholder={b.categoryPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {categoryItems.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="biz-city">{b.city}</Label>
          <Input
            id="biz-city"
            maxLength={120}
            autoComplete="address-level2"
            placeholder={b.cityPlaceholder}
            value={values.city}
            onChange={(e) => onChange({ city: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="biz-description">{b.description}</Label>
        <Textarea
          id="biz-description"
          rows={4}
          maxLength={2000}
          placeholder={b.descriptionPlaceholder}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">{b.tone}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TONES.map((tone) => (
            <label
              key={tone}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border bg-background p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                values.tone === tone ? "border-primary/60 bg-primary-soft" : "hover:bg-accent",
              )}
            >
              <input
                type="radio"
                name="tone"
                value={tone}
                checked={values.tone === tone}
                onChange={() => onChange({ tone })}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{b.tones[tone]}</span>
                <span className="text-xs text-muted-foreground">{b.toneHints[tone]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={cn("grid gap-5", showTimezone && "sm:grid-cols-2")}>
        <div className="grid gap-2">
          <Label htmlFor="biz-language">{b.language}</Label>
          <Select value={values.language} onValueChange={(v) => v && onChange({ language: v as BusinessLanguage })} items={languageItems}>
            <SelectTrigger id="biz-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageItems.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showTimezone && (
          <div className="grid gap-2">
            <Label htmlFor="biz-timezone">{b.timezone}</Label>
            <Select value={values.timezone} onValueChange={(v) => v && onChange({ timezone: v })} items={timezoneItems}>
              <SelectTrigger id="biz-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneItems.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
