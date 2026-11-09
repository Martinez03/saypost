import type { Metadata } from "next";
import { OnboardingForm } from "@/app/app/onboarding/onboarding-form";
import { PageHeader } from "@/components/app/page-header";
import { getI18n } from "@/i18n/server";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.agency.newTitle };
}

/** Adds another business (a client) to the user's workspace, reusing the onboarding form. */
export default async function NewClientPage() {
  const [{ userId }, { t, lang }] = await Promise.all([getSession(), getI18n()]);
  return (
    <div className="grid max-w-2xl gap-2">
      <p className="text-sm font-semibold text-primary-ink">{t.agency.newKicker}</p>
      <PageHeader title={t.agency.newTitle} description={t.agency.newSubtitle} />
      <OnboardingForm userId={userId} defaultLanguage={lang} mode="client" />
    </div>
  );
}
