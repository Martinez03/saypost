import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.meta.login, robots: { index: false } };
}

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <AuthShell t={t}>
      <AuthForm mode="login" />
    </AuthShell>
  );
}
