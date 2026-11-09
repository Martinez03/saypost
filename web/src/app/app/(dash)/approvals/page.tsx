import type { Metadata } from "next";
import { AlertTriangle, CheckCheck, Star } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { PlatformIcon } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import type { Dict, Lang } from "@/i18n";
import { getI18n } from "@/i18n/server";
import type { Action, ActionStatus, Json } from "@/lib/database.types";
import { dateTime, relativeTime } from "@/lib/format";
import { platformName } from "@/lib/platforms";
import { getSession, requireBusiness } from "@/lib/session";
import { ActionButtons } from "./action-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.approvals.title };
}

const STATUS_VARIANT: Record<ActionStatus, "default" | "secondary" | "destructive" | "warning" | "positive" | "outline"> = {
  pending: "warning",
  approved: "default",
  rejected: "secondary",
  done: "positive",
  failed: "destructive",
  superseded: "outline",
};

type Context = { platform: string | null; author: string | null; rating: number | null; text: string | null; url: string | null };

const str = (v: Json | undefined): string | null => (typeof v === "string" && v.trim() ? v : null);

/**
 * What triggered the action (the review, comment or DM being answered). The backend writes `context` freely;
 * this reads the usual keys and ignores the rest: platform, author (or authorName / reviewer / from / username),
 * rating (or stars), text (or comment / message / body / review / content), url.
 */
function readContext(raw: Json | null): Context | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Record<string, Json | undefined>;
  const nested = (v: Json | undefined) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : null);
  const authorObj = nested(c.author) ?? nested(c.reviewer) ?? nested(c.from);
  const author =
    str(c.author) ?? str(c.authorName) ?? str(c.author_name) ?? str(c.reviewer) ?? str(c.from) ?? str(c.username) ??
    str(authorObj?.name) ?? str(authorObj?.username) ?? str(authorObj?.displayName) ?? null;
  const ratingRaw = c.rating ?? c.stars;
  const rating = typeof ratingRaw === "number" ? ratingRaw : typeof ratingRaw === "string" && !Number.isNaN(Number(ratingRaw)) ? Number(ratingRaw) : null;
  const text = str(c.text) ?? str(c.comment) ?? str(c.message) ?? str(c.body) ?? str(c.review) ?? str(c.content) ?? null;
  const ctx = { platform: str(c.platform), author, rating, text, url: str(c.url) ?? str(c.permalink) };
  return ctx.author || ctx.text || ctx.rating !== null ? ctx : null;
}

function ActionCard({ action, t, lang, timeZone, now }: { action: Action; t: Dict; lang: Lang; timeZone: string; now: number }) {
  const a = t.approvals;
  const ctx = readContext(action.context);
  const pending = action.status === "pending";
  const decidedVia = action.decided_via ? a.via[action.decided_via] : null;

  return (
    <article className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby={`action-${action.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{a.kinds[action.kind] ?? action.kind}</Badge>
            <Badge variant={STATUS_VARIANT[action.status] ?? "outline"}>{a.statuses[action.status] ?? action.status}</Badge>
          </div>
          <h3 id={`action-${action.id}`} className="text-[0.9375rem] font-semibold [overflow-wrap:anywhere]">
            {action.title}
          </h3>
        </div>
        <time dateTime={action.created_at} title={dateTime(action.created_at, lang, timeZone)} className="text-xs text-muted-foreground">
          {relativeTime(action.created_at, lang, now)}
        </time>
      </header>

      {ctx && (
        <div className="grid gap-1.5 rounded-lg border-l-2 border-border bg-muted/60 px-3 py-2.5 text-sm">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {ctx.platform && <PlatformIcon platform={ctx.platform} className="size-5 rounded-md text-[0.5rem]" />}
            <span>
              {a.inReplyTo}
              {ctx.author && (
                <>
                  {" "}
                  <span className="font-medium text-foreground">{ctx.author}</span>
                </>
              )}
              {ctx.platform && <> · {platformName(ctx.platform)}</>}
            </span>
            {ctx.rating !== null && (
              <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={a.rating(ctx.rating)} role="img">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={i < Math.round(ctx.rating ?? 0) ? "size-3 fill-current" : "size-3 opacity-30"} aria-hidden />
                ))}
              </span>
            )}
          </p>
          {ctx.text && <p className="whitespace-pre-line text-foreground/90 [overflow-wrap:anywhere]">{ctx.text}</p>}
        </div>
      )}

      <p className="rounded-lg bg-background p-3 text-sm whitespace-pre-line ring-1 ring-border [overflow-wrap:anywhere]">{action.preview}</p>

      {action.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="[overflow-wrap:anywhere]">
            <span className="font-medium">{a.error}:</span> {action.error}
          </span>
        </p>
      )}

      {pending ? (
        <ActionButtons id={action.id} />
      ) : (
        action.decided_at && (
          <p className="text-xs text-muted-foreground">
            {a.decided(relativeTime(action.decided_at, lang, now))}
            {decidedVia && ` ${decidedVia}`}
          </p>
        )
      )}
    </article>
  );
}

export default async function ApprovalsPage() {
  const [business, { supabase }, { t, lang }] = await Promise.all([requireBusiness(), getSession(), getI18n()]);
  const [pending, recent] = await Promise.all([
    supabase.from("actions").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(100),
    supabase.from("actions").select("*").neq("status", "pending").order("created_at", { ascending: false }).limit(20),
  ]);
  if (pending.error) throw new Error(pending.error.message);

  const a = t.approvals;
  // eslint-disable-next-line react-hooks/purity -- rendered per request
  const now = Date.now();
  const pendingRows = pending.data ?? [];
  const recentRows = recent.data ?? [];

  return (
    <div className="grid gap-8">
      <PageHeader title={a.title} description={a.subtitle} />

      <section aria-labelledby="pending-title" className="grid gap-4">
        <SectionTitle id="pending-title" title={`${a.pendingTitle}${pendingRows.length ? ` (${pendingRows.length})` : ""}`} />
        {pendingRows.length === 0 ? (
          <EmptyState icon={<CheckCheck />} title={a.empty} description={a.emptyText} />
        ) : (
          <div className="grid gap-4">
            {pendingRows.map((action) => (
              <ActionCard key={action.id} action={action} t={t} lang={lang} timeZone={business.timezone} now={now} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="recent-title" className="grid gap-4">
        <SectionTitle id="recent-title" title={a.recentTitle} />
        {recentRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{a.recentEmpty}</p>
        ) : (
          <div className="grid gap-4">
            {recentRows.map((action) => (
              <ActionCard key={action.id} action={action} t={t} lang={lang} timeZone={business.timezone} now={now} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
