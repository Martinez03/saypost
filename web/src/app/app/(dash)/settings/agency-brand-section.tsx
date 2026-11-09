"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AgencyBrandFields, isHttpsUrl, type BrandValues } from "@/components/app/agency-brand-fields";
import { SectionTitle } from "@/components/app/page-header";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { ApiError, apiPatch, type WorkspaceResponse } from "@/lib/api";

/**
 * The agency's name and logo, shown to clients on the invite page and Zernio's connect screen.
 * Saved through PATCH /api/workspace (owners only). Not a <form>: it sits inside the settings form.
 */
export function AgencyBrandSection({ initial, canEdit }: { initial: BrandValues; canEdit: boolean }) {
  const { t } = useI18n();
  const b = t.branding;
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dirty = values.brandName.trim() !== saved.brandName.trim() || values.logoUrl.trim() !== saved.logoUrl.trim();

  async function save() {
    if (!canEdit || !dirty || saving) return;
    const logo = values.logoUrl.trim();
    if (logo && !isHttpsUrl(logo)) {
      setLogoError(t.kind.logoUrlInvalid);
      document.getElementById("brand-logo")?.focus();
      return;
    }
    setSaving(true);
    try {
      const { workspace } = await apiPatch<WorkspaceResponse>("/api/workspace", { brand_name: values.brandName.trim() || null, logo_url: logo || null });
      const next = { brandName: workspace.brandName ?? "", logoUrl: workspace.logoUrl ?? "" };
      setValues(next);
      setSaved(next);
      toast.success(b.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.error === "bad_logo_url") setLogoError(t.kind.logoUrlInvalid);
      else toast.error(err?.error === "network" ? t.common.backendDown : (err?.message ?? t.common.genericError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="brand-title" className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6" data-agency-brand>
      <SectionTitle id="brand-title" title={b.title} description={b.subtitle} />
      <AgencyBrandFields
        idPrefix="brand"
        values={values}
        disabled={!canEdit}
        logoError={logoError}
        onEnter={() => void save()}
        onChange={(p) => {
          if (p.logoUrl !== undefined) setLogoError(null);
          setValues((v) => ({ ...v, ...p }));
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{canEdit ? null : b.ownerOnly}</p>
        {canEdit && (
          <Button type="button" variant="outline" onClick={() => void save()} disabled={!dirty || saving}>
            {saving && <Loader2 className="animate-spin" aria-hidden />}
            {saving ? t.common.saving : b.save}
          </Button>
        )}
      </div>
    </section>
  );
}
