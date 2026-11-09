"use client";

/* eslint-disable @next/next/no-img-element -- media comes from Zernio and the networks' CDNs */

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ExternalLink, Newspaper, RotateCw } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { useI18n } from "@/components/i18n-provider";
import { PlatformIcon } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, type Post } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { platformName } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "destructive" | "warning" | "positive" | "outline";

function statusVariant(status: string | null | undefined): BadgeVariant {
  switch ((status ?? "").toLowerCase()) {
    case "published":
      return "positive";
    case "scheduled":
      return "default";
    case "failed":
    case "error":
      return "destructive";
    case "partial":
    case "publishing":
    case "pending":
      return "warning";
    default:
      return "secondary";
  }
}

export function PostsList({ timeZone }: { timeZone: string }) {
  const { t, lang } = useI18n();
  const p = t.posts;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiGet<{ posts: Post[] | null }>("/api/posts");
      setPosts(Array.isArray(res.posts) ? res.posts : []);
      setState("ok");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  const label = (s: string | null | undefined) => (s ? (p.statuses[s.toLowerCase()] ?? s) : null);

  return (
    <div className="grid gap-8">
      <PageHeader
        title={p.title}
        description={p.subtitle}
        actions={
          <Button variant="outline" onClick={() => void load()} disabled={state === "loading"}>
            <RotateCw className={cn(state === "loading" && "animate-spin")} aria-hidden />
            {p.refresh}
          </Button>
        }
      />

      {state === "loading" && !posts ? (
        <div className="grid gap-3" aria-busy>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : state === "error" ? (
        <ErrorState
          title={p.error}
          description={t.common.backendDown}
          action={
            <Button variant="outline" onClick={() => void load()}>
              <RotateCw aria-hidden /> {t.common.retry}
            </Button>
          }
        />
      ) : !posts || posts.length === 0 ? (
        <EmptyState icon={<Newspaper />} title={p.empty} description={p.emptyText} />
      ) : (
        <ul className="grid gap-3">
          {posts.map((post) => {
            const platforms = Array.isArray(post.platforms) ? post.platforms : [];
            const when = post.publishedAt
              ? p.publishedAt(dateTime(post.publishedAt, lang, timeZone))
              : post.scheduledFor
                ? p.scheduledFor(dateTime(post.scheduledFor, lang, timeZone))
                : null;
            return (
              <li key={post.id} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:flex-row">
                {post.mediaUrl && (
                  <img
                    src={post.mediaUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-square w-full shrink-0 rounded-lg border bg-muted object-cover sm:size-24"
                  />
                )}
                <div className="grid min-w-0 flex-1 content-start gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {label(post.status) && <Badge variant={statusVariant(post.status)}>{label(post.status)}</Badge>}
                    {when && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5" aria-hidden />
                        {when}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-4 text-sm whitespace-pre-line [overflow-wrap:anywhere]">{post.content?.trim() || p.noText}</p>
                  {platforms.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {platforms.map((pl, i) => (
                        <li key={`${pl.platform}-${i}`} className="flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2 pl-0.5 text-xs">
                          <PlatformIcon platform={pl.platform} className="size-5 rounded-full text-[0.5rem]" />
                          <span className="font-medium">{platformName(pl.platform)}</span>
                          {label(pl.status) && <span className="text-muted-foreground">· {label(pl.status)}</span>}
                          {pl.url && (
                            <a
                              href={pl.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-primary-ink hover:underline"
                              aria-label={`${p.open} (${platformName(pl.platform)})`}
                            >
                              <ExternalLink className="size-3.5" aria-hidden />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
