"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BusinessFields, type BusinessValues } from "@/components/app/business-fields";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { browserTimezone } from "@/lib/business";
import type { BusinessLanguage } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

/** Creates the user's business through RLS (only the granted insert columns), then opens the dashboard. */
export function OnboardingForm({ userId, defaultLanguage }: { userId: string; defaultLanguage: BusinessLanguage }) {
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
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setNameError(t.business.nameRequired);
      document.getElementById("biz-name")?.focus();
      return;
    }
    setPending(true);
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
      <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-end" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? t.onboarding.submitting : t.onboarding.submit}
      </Button>
    </form>
  );
}
