import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { getI18n } from "@/i18n/server";
import { getBusiness, getSession } from "@/lib/session";
import { OnboardingForm } from "./onboarding-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.onboarding.title };
}

export default async function OnboardingPage() {
  const [{ userId }, business, { t, lang }] = await Promise.all([getSession(), getBusiness(), getI18n()]);
  if (business) redirect("/app");

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-canvas">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-16 sm:px-6">
        <div className="rounded-2xl border bg-background p-5 shadow-xs sm:p-8">
          <p className="text-sm font-semibold text-primary-ink">{t.onboarding.kicker}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.022em]">{t.onboarding.title}</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{t.onboarding.subtitle}</p>
          <OnboardingForm userId={userId} defaultLanguage={lang} />
        </div>
      </main>
    </div>
  );
}
