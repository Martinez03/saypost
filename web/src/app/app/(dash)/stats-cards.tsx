"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCheck, Link2, Newspaper, RotateCw, Star } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, type Stats } from "@/lib/api";
import { formatNumber } from "@/lib/format";

// KPI cards from GET /api/stats. Every number may be null (Zernio doesn't give it) and the backend may be down:
// both show a dash, never a broken page.

export function StatsCards() {
  const { t, lang } = useI18n();
  const k = t.home.kpis;
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setStats(await apiGet<Stats>("/api/stats"));
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const num = (n: number | null | undefined, digits = 0) => (typeof n === "number" && Number.isFinite(n) ? formatNumber(n, lang, digits) : "—");
  const reviews = stats?.reviews ?? null;
  const reviewLine = [
    typeof reviews?.total === "number" ? k.reviews(reviews.total) : null,
    typeof reviews?.unanswered === "number" && reviews.unanswered > 0 ? k.unanswered(reviews.unanswered) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const cards = [
    { label: k.accounts, value: num(stats?.accounts), icon: Link2 },
    { label: k.posts, value: num(stats?.postsLast7d), icon: Newspaper },
    { label: k.pending, value: num(stats?.pendingActions), icon: CheckCheck },
    { label: k.rating, value: num(reviews?.averageRating, 1), icon: Star, sub: reviewLine || null },
  ];

  return (
    <section aria-label={k.title} className="grid gap-3">
      {state === "error" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span>{k.error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RotateCw aria-hidden /> {t.common.retry}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 wide:grid-cols-2">
        {cards.map(({ label, value, icon: Icon, sub }) => (
          <div key={label} className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 text-[0.8125rem] text-muted-foreground">
              <span className="min-w-0 truncate">{label}</span>
              <Icon className="size-4 shrink-0" aria-hidden />
            </div>
            {state === "loading" ? (
              <Skeleton className="h-8 w-14" />
            ) : (
              <p className="num text-[1.75rem] leading-none font-semibold tracking-[-0.03em]">{value}</p>
            )}
            {sub && state === "ok" && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
