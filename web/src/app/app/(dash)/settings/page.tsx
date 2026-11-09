import type { Metadata } from "next";
import { getI18n } from "@/i18n/server";
import { getSession, getWorkspaceContext, requireBusiness } from "@/lib/session";
import { AgencyBrandSection } from "./agency-brand-section";
import { SettingsForm } from "./settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.settings.title };
}

export default async function SettingsPage() {
  const [business, { email }, ctx] = await Promise.all([requireBusiness(), getSession(), getWorkspaceContext()]);
  return (
    <SettingsForm
      id={business.id}
      email={email}
      branding={
        ctx.agencyMode && ctx.workspace ? (
          <AgencyBrandSection
            key={ctx.workspace.id}
            canEdit={ctx.isOwner}
            initial={{ brandName: ctx.workspace.brand_name ?? "", logoUrl: ctx.workspace.logo_url ?? "" }}
          />
        ) : null
      }
      initial={{
        name: business.name,
        category: business.category ?? "",
        city: business.city ?? "",
        description: business.description ?? "",
        tone: business.tone,
        language: business.language,
        timezone: business.timezone,
        notes: business.notes,
        notify_reviews: business.notify_reviews,
        notify_comments: business.notify_comments,
        notify_dms: business.notify_dms,
        approval_mode: business.approval_mode,
      }}
    />
  );
}
