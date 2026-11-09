import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { getI18n } from "@/i18n/server";
import { requireBusiness } from "@/lib/session";
import { Conversation } from "./conversation";
import { WhatsappPanel } from "./whatsapp-panel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.whatsapp.title };
}

export default async function WhatsappPage() {
  const [business, { t }] = await Promise.all([requireBusiness(), getI18n()]);
  return (
    <div className="grid gap-8">
      <PageHeader title={t.whatsapp.title} description={t.whatsapp.subtitle} />
      <WhatsappPanel initialStatus={business.whatsapp_status} initialPhone={business.owner_phone} />
      <Conversation businessId={business.id} timeZone={business.timezone} />
    </div>
  );
}
