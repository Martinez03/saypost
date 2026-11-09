import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Link2,
  MessageCircle,
  MessageSquare,
  Mic,
  Send,
  Smartphone,
  Star,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";
import { dateTime, relativeTime } from "@/lib/format";
import { getSession, requireBusiness } from "@/lib/session";
import { cn } from "@/lib/utils";
import { StatsCards } from "./stats-cards";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.home };
}

/** An icon per event type (post.published, review.new, comment.received, action.done…). */
function eventIcon(type: string): { icon: LucideIcon; tone: string } {
  if (type.startsWith("post.")) return { icon: Send, tone: "text-primary" };
  if (type.startsWith("review.")) return { icon: Star, tone: "text-amber-500" };
  if (type.startsWith("comment.")) return { icon: MessageSquare, tone: "text-sky-500" };
  if (type.startsWith("dm.") || type.startsWith("message.")) return { icon: MessageCircle, tone: "text-sky-500" };
  if (type.endsWith(".failed") || type.includes("error")) return { icon: AlertTriangle, tone: "text-destructive" };
  if (type.startsWith("action.")) return { icon: CheckCircle2, tone: "text-positive" };
  if (type.startsWith("account.")) return { icon: Link2, tone: "text-muted-foreground" };
  if (type.startsWith("whatsapp.")) return { icon: Smartphone, tone: "text-positive" };
  return { icon: Activity, tone: "text-muted-foreground" };
}

export default async function HomePage() {
  const [business, { supabase }, { t, lang }] = await Promise.all([requireBusiness(), getSession(), getI18n()]);
  const [accounts, inbound, events] = await Promise.all([
    supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("status", "connected"),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("direction", "in"),
    supabase.from("events").select("id, type, title, created_at").order("created_at", { ascending: false }).limit(20),
  ]);

  const h = t.home;
  const steps = [
    { key: "connect", done: (accounts.count ?? 0) > 0, href: "/app/accounts", icon: Link2, ...h.steps.connect },
    { key: "whatsapp", done: business.whatsapp_status === "active", href: "/app/whatsapp", icon: Smartphone, ...h.steps.whatsapp },
    { key: "voice", done: (inbound.count ?? 0) > 0, href: "/app/whatsapp", icon: Mic, ...h.steps.voice },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done)?.key;
  // eslint-disable-next-line react-hooks/purity -- rendered per request
  const now = Date.now();
  const rows = events.data ?? [];

  return (
    <div className="grid gap-8">
      <PageHeader title={h.greeting(business.name)} description={h.subtitle} />

      {doneCount < steps.length ? (
        <section aria-labelledby="setup-title" className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="setup-title" className="text-[0.9375rem] font-semibold tracking-tight">
              {h.setupTitle}
            </h2>
            <span className="num text-sm text-muted-foreground">{h.setupProgress(doneCount, steps.length)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="grid gap-2 md:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.key}
                className={cn("flex items-start gap-3 rounded-lg border p-3", s.key === nextStep ? "border-primary/40 bg-primary-soft" : "bg-background")}
              >
                {s.done ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-5 shrink-0 text-subtle-foreground" aria-hidden />
                )}
                <div className="grid min-w-0 flex-1 gap-1">
                  <p className={cn("text-sm font-medium", s.done && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                    <span className="sr-only">{i + 1}. </span>
                    {s.title}
                    {s.done && <span className="sr-only"> ({h.done})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.text}</p>
                  {!s.done && (
                    <Link
                      href={s.href}
                      className={cn(buttonVariants({ variant: s.key === nextStep ? "default" : "outline", size: "sm" }), "mt-1 w-fit")}
                    >
                      {s.cta}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p role="status" className="flex items-center gap-2 rounded-xl border bg-primary-soft px-4 py-3 text-sm font-medium text-primary-ink">
          <CheckCircle2 className="size-4" aria-hidden /> {h.setupDone}
        </p>
      )}

      <StatsCards />

      <section aria-labelledby="activity-title" className="grid gap-4">
        <SectionTitle id="activity-title" title={h.activityTitle} description={h.activitySubtitle} />
        {rows.length === 0 ? (
          <EmptyState icon={<Activity />} title={h.activityEmpty} description={h.activityEmptyText} />
        ) : (
          <ul className="divide-y rounded-xl border bg-card shadow-xs">
            {rows.map((e) => {
              const { icon: Icon, tone } = eventIcon(e.type);
              return (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background">
                    <Icon className={cn("size-3.5", tone)} aria-hidden />
                  </span>
                  <p className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">{e.title}</p>
                  <time dateTime={e.created_at} title={dateTime(e.created_at, lang, business.timezone)} className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(e.created_at, lang, now)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
