import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { getSession, requireBusiness } from "@/lib/session";
import { AccountsGrid } from "./accounts-grid";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.accounts.title };
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string | string[] }> }) {
  const [, { supabase }, params] = await Promise.all([requireBusiness(), getSession(), searchParams]);
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name, profile_picture, status")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const connected = typeof params.connected === "string" ? params.connected : null;
  return <AccountsGrid accounts={data ?? []} connected={connected} />;
}
