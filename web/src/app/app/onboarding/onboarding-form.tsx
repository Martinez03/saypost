"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { selectBusiness } from "@/app/app/actions";
import { ApprovalModeField } from "@/components/app/approval-mode-field";
import { BusinessFields, type BusinessValues } from "@/components/app/business-fields";
import { SectionTitle } from "@/components/app/page-header";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api";
import { browserTimezone } from "@/lib/business";
import type { ApprovalMode, Business, BusinessLanguage } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/**
 * Onboarding: creates the user's first business through RLS (only the granted insert columns).
 * `client`: adds another business to the user's workspace through the backend (POST /api/businesses),
 * with its approval mode, then switches the dashboard to it.
 */
export function OnboardingForm({ userId, defaultLanguage, mode = "onboarding" }: { userId: string; defaultLanguage: BusinessLanguage; mode?: "onboarding" | "client" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState<BusinessValues>({
    name: "",
    category: "",
    city: "",
    description: "",
    tone: "friendly",
    language: defaultLanguage,
    timezone: "Europe/Madrid",
  });
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("owner_whatsapp");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createClientBusiness(name: string) {
    try {
      const { business } = await apiPost<{ business: Business }>("/api/businesses", {
        name,
        category: values.category || null,
        city: values.city.trim() || null,
        description: values.description.trim() || null,
        tone: values.tone,
        language: values.language,
        timezone: browserTimezone(),
        approval_mode: approvalMode,
      });
      toast.success(t.agency.created);
      await selectBusiness(business.id, "/app");
    } catch (e) {
      // selectBusiness() ends with a redirect, which Next.js signals by throwing: let it through.
      if (!(e instanceof ApiError)) throw e;
      setPending(false);
      toast.error(e.error === "network" ? t.common.backendDown : e.message || t.common.genericError);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setNameError(t.business.nameRequired);
      document.getElementById("biz-name")?.focus();
      return;
    }
    setPending(true);
    if (mode === "client") return createClientBusiness(name);
    const { error } = await createClient()
      .from("businesses")
      .insert({
        owner_id: userId,
        name,
        category: values.category || null,
        city: values.city.trim() || null,
        description: values.description.trim() || null,
        tone: values.tone,
        language: values.language,
        timezone: browserTimezone(),
      });
    if (error) {
      setPending(false);
      // 23505: the business already exists (a second tab, a double click): just go on.
      if (error.code === "23505") return router.replace("/app");
      toast.error(error.message || t.common.genericError);
      return;
    }
    toast.success(t.onboarding.created);
    // Stays disabled while the dashboard loads.
    router.replace("/app");
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-6" noValidate>
      <BusinessFields
        values={values}
        nameError={nameError}
        onChange={(patch) => {
          if (patch.name !== undefined) setNameError(null);
          setValues((v) => ({ ...v, ...patch }));
        }}
      />
      {mode === "client" && (
        <section aria-labelledby="approval-title" className="grid gap-3">
          <SectionTitle id="approval-title" title={t.agency.approvalTitle} description={t.agency.approvalSubtitle} />
          <ApprovalModeField value={approvalMode} onChange={setApprovalMode} />
        </section>
      )}
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-end" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {mode === "client" ? (pending ? t.agency.creating : t.agency.create) : pending ? t.onboarding.submitting : t.onboarding.submit}
      </Button>
    </form>
  );
}
