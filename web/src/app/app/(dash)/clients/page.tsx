import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { selectBusiness } from "@/app/app/actions";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";
import { isCategory } from "@/lib/business";
import { getBusinesses, getSession, requireBusiness } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.agency.clientsTitle };
}

/** Every business in the user's workspaces with a short summary, and a way to switch to it. */
export default async function ClientsPage() {
  const [current, all, { supabase }, { t }] = await Promise.all([requireBusiness(), getBusinesses(), getSession(), getI18n()]);
  const ids = all.map((b) => b.id);
  const [accounts, pending] = await Promise.all([
    supabase.from("social_accounts").select("business_id").eq("status", "connected").in("business_id", ids),
    supabase.from("actions").select("business_id").eq("status", "pending").in("business_id", ids),
  ]);
  const count = (rows: { business_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.business_id === id).length;
  const g = t.agency;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={g.clientsTitle}
        description={g.clientsSubtitle}
        actions={
          <Link href="/app/clients/new" className={buttonVariants()}>
            <Plus aria-hidden /> {g.addClient}
          </Link>
        }
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {all.map((b) => {
          const n = count(accounts.data, b.id);
          const p = count(pending.data, b.id);
          const here = b.id === current.id;
          const meta = [isCategory(b.category) ? t.business.categories[b.category] : b.category, b.city].filter(Boolean).join(" · ");
          return (
            <li key={b.id} className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs" data-business={b.id}>
              <div className="min-w-0">
                <h2 className="truncate text-[0.9375rem] font-semibold">{b.name}</h2>
                {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={n > 0 ? "positive" : "secondary"}>{g.accounts(n)}</Badge>
                <Badge variant={b.whatsapp_status === "active" ? "positive" : "secondary"}>{g.whatsapp[b.whatsapp_status]}</Badge>
                {p > 0 && <Badge variant="warning">{g.pending(p)}</Badge>}
                {b.approval_mode === "agency_dashboard" && <Badge variant="outline">{g.agencyBadge}</Badge>}
              </div>
              <div className="flex justify-end">
                {here ? (
                  <Badge variant="default">{g.working}</Badge>
                ) : (
                  <form action={selectBusiness.bind(null, b.id, "/app")}>
                    <Button type="submit" variant="outline" size="sm">
                      {g.open} <ArrowRight aria-hidden />
                    </Button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
