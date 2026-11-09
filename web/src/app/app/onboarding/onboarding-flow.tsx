"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AgencyBrandFields, isHttpsUrl, type BrandValues } from "@/components/app/agency-brand-fields";
import { useI18n } from "@/components/i18n-provider";
import { ForAgency, ForBusiness } from "@/components/landing/illustrations";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost, type WorkspaceResponse } from "@/lib/api";
import type { BusinessLanguage } from "@/lib/database.types";
import { OnboardingForm } from "./onboarding-form";
import "@/components/landing/landing.css";

type Step = "kind" | "business" | "agency";

/**
 * First step: "for your business or are you an agency?".
 * - Business: today's onboarding form, unchanged (the insert's trigger makes a 'business' workspace).
 * - Agency: name and optional logo → POST /api/workspace (kind 'agency'), then the page shows
 *   "Add your first client" (the server sees an agency workspace with no business yet).
 */
export function OnboardingFlow({ userId, defaultLanguage }: { userId: string; defaultLanguage: BusinessLanguage }) {
  const { t } = useI18n();
  const k = t.kind;
  const router = useRouter();
  const [step, setStep] = useState<Step>("kind");
  const [brand, setBrand] = useState<BrandValues>({ brandName: "", logoUrl: "" });
  const [nameError, setNameError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  async function saveAgency(e?: React.FormEvent) {
    e?.preventDefault();
    const name = brand.brandName.trim();
    const logo = brand.logoUrl.trim();
    if (!name) {
      setNameError(k.agencyNameRequired);
      document.getElementById("agency-name")?.focus();
      return;
    }
    if (logo && !isHttpsUrl(logo)) {
      setLogoError(k.logoUrlInvalid);
      document.getElementById("agency-logo")?.focus();
      return;
    }
    setSaving(true);
    try {
      await apiPost<WorkspaceResponse>("/api/workspace", { kind: "agency", brand_name: name, logo_url: logo || null });
      // Stays disabled while the page reloads into "Add your first client".
      startTransition(() => router.refresh());
    } catch (err) {
      setSaving(false);
      const a = err instanceof ApiError ? err : null;
      if (a?.error === "bad_logo_url") setLogoError(k.logoUrlInvalid);
      else toast.error(a?.error === "network" ? t.common.backendDown : (a?.message ?? t.common.genericError));
    }
  }

  const back = (
    <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" onClick={() => setStep("kind")}>
      <ArrowLeft aria-hidden /> {k.back}
    </Button>
  );

  if (step === "business")
    return (
      <div className="grid gap-1">
        {back}
        <p className="mt-2 text-sm font-semibold text-primary-ink">{t.onboarding.kicker}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.022em]">{t.onboarding.title}</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{t.onboarding.subtitle}</p>
        <OnboardingForm userId={userId} defaultLanguage={defaultLanguage} />
      </div>
    );

  if (step === "agency")
    return (
      <form onSubmit={saveAgency} className="grid gap-1" noValidate>
        {back}
        <p className="mt-2 text-sm font-semibold text-primary-ink">{k.agencyKicker}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.022em]">{k.agencyTitle}</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{k.agencySubtitle}</p>
        <div className="mt-6 grid gap-6">
          <AgencyBrandFields
            values={brand}
            nameError={nameError}
            logoError={logoError}
            onChange={(p) => {
              if (p.brandName !== undefined) setNameError(null);
              if (p.logoUrl !== undefined) setLogoError(null);
              setBrand((v) => ({ ...v, ...p }));
            }}
          />
          <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-end" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {saving ? k.saving : k.continue}
            {!saving && <ArrowRight aria-hidden />}
          </Button>
        </div>
      </form>
    );

  const options = [
    { id: "business" as const, ...k.business, ill: <ForBusiness yes={t.landing.how.yes} /> },
    { id: "agency" as const, ...k.agency, ill: <ForAgency yes={t.landing.how.yes} /> },
  ];
  return (
    <div className="grid gap-1">
      <p className="text-sm font-semibold text-primary-ink">{k.kicker}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.022em]">{k.title}</h1>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">{k.subtitle}</p>
      <div className="ill-vars mt-6 grid gap-3 sm:grid-cols-2" data-kind-choice>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setStep(o.id)}
            data-kind={o.id}
            className="group grid content-start gap-4 rounded-2xl border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow,transform] outline-none hover:border-primary/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/60 active:translate-y-px"
          >
            <span className="block rounded-xl bg-canvas px-2 py-3">{o.ill}</span>
            <span className="grid gap-1">
              <span className="flex items-center justify-between gap-2 text-[0.9375rem] font-semibold">
                {o.title}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
              </span>
              <span className="text-sm text-pretty text-muted-foreground">{o.text}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
