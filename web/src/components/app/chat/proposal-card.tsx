"use client";

/* eslint-disable @next/next/no-img-element -- media URLs come from Zernio */

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Repeat2, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n-provider";
import { PlatformIcon } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api";
import type { Action, ActionStatus, Json } from "@/lib/database.types";
import { platformName } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { WaText } from "./wa-text";

// A proposal from the web chat, as a card in the thread: the exact preview, the networks it goes to, and
// Approve / Discard (the existing /api/actions/:id/approve | reject: the backend executes in code).

const STATUS_VARIANT: Record<ActionStatus, "default" | "secondary" | "destructive" | "warning" | "positive" | "outline"> = {
  pending: "warning",
  approved: "default",
  rejected: "secondary",
  done: "positive",
  failed: "destructive",
  superseded: "outline",
};

const obj = (v: Json | null | undefined) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json | undefined>) : null);
const strings = (v: Json | undefined) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** The networks a proposal goes to: the publish targets, or the platform of the review/comment/DM. */
function platformsOf(action: Action): string[] {
  const payload = obj(action.payload);
  const targets = Array.isArray(payload?.targets) ? payload.targets : [];
  const fromTargets = targets.map((tg) => obj(tg)?.platform).filter((p): p is string => typeof p === "string");
  const single = obj(action.context)?.platform ?? payload?.platform;
  const all = fromTargets.length ? fromTargets : typeof single === "string" ? [single] : [];
  return [...new Set(all)];
}

/** Links of a published post ("• Instagram: https://…" lines in `result.links`). */
function linksOf(action: Action): { name: string; url: string }[] {
  return strings(obj(action.result)?.links)
    .map((line) => line.match(/^•?\s*([^:]+):\s*(https?:\/\/\S+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ name: m[1]!.trim(), url: m[2]! }));
}

export function ProposalCard({ action, onDecided }: { action: Action; onDecided: (action: Action | null) => Promise<void> }) {
  const { t } = useI18n();
  const a = t.approvals;
  const c = t.chat;
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const platforms = platformsOf(action);
  const media = strings(obj(action.payload)?.mediaUrls).slice(0, 4);
  const links = action.status === "done" ? linksOf(action) : [];

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    let updated: Action | null = null;
    try {
      const res = await apiPost<{ action: Action | null }>(`/api/actions/${action.id}/${kind}`, undefined, action.business_id);
      updated = res.action;
      if (kind === "reject") toast.success(a.rejected);
      else if (updated?.status === "failed") toast.error(a.failed, { description: updated.error ?? undefined });
      else if (updated?.status === "done") toast.success(a.done);
      else toast.success(a.approved);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast.error(err?.error === "network" ? t.common.backendDown : (err?.message ?? t.common.genericError));
    } finally {
      await onDecided(updated);
      setBusy(null);
    }
  }

  // Replaced or discarded proposals shrink to one line, so the thread stays readable.
  if (action.status === "superseded" || action.status === "rejected") {
    const Icon = action.status === "superseded" ? Repeat2 : X;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-card/70 px-3 py-2 text-xs text-muted-foreground" data-proposal={action.id}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground/80">{action.title}</span> · {action.status === "superseded" ? c.superseded : a.statuses.rejected}
        </span>
      </div>
    );
  }

  const pending = action.status === "pending";
  return (
    <article
      className={cn("grid gap-3 rounded-xl border bg-card p-3 shadow-xs sm:p-4", pending && "border-primary/35 ring-1 ring-primary/10")}
      aria-labelledby={`proposal-${action.id}`}
      data-proposal={action.id}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{a.kinds[action.kind] ?? action.kind}</Badge>
            <Badge variant={STATUS_VARIANT[action.status] ?? "outline"}>{a.statuses[action.status] ?? action.status}</Badge>
          </div>
          <h3 id={`proposal-${action.id}`} className="text-sm font-semibold [overflow-wrap:anywhere]">
            {action.title}
          </h3>
        </div>
        {platforms.length > 0 && (
          <ul className="flex items-center gap-1" aria-label={`${c.proposalFor}: ${platforms.map(platformName).join(", ")}`}>
            {platforms.map((p) => (
              <li key={p}>
                <PlatformIcon platform={p} className="size-7" />
              </li>
            ))}
          </ul>
        )}
      </header>

      {media.length > 0 && (
        <div className={cn("grid gap-1.5", media.length > 1 && "grid-cols-2")}>
          {media.map((url) =>
            /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-xs underline">
                {t.whatsapp.video}
              </a>
            ) : (
              <img key={url} src={url} alt={c.photo} loading="lazy" className="max-h-56 w-full rounded-lg object-cover ring-1 ring-border" />
            ),
          )}
        </div>
      )}

      <WaText text={action.preview} className="rounded-lg bg-background p-3 text-sm ring-1 ring-border [overflow-wrap:anywhere]" />

      {action.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="[overflow-wrap:anywhere]">
            <span className="font-medium">{a.error}:</span> {action.error}
          </span>
        </p>
      )}

      {links.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={c.postedLinks}>
          {links.map((l) => (
            <li key={l.url}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {l.name} <ExternalLink className="size-3" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => decide("approve")} disabled={busy !== null}>
            {busy === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
            {a.approve}
          </Button>
          <Button variant="outline" onClick={() => decide("reject")} disabled={busy !== null}>
            {busy === "reject" ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
            {a.reject}
          </Button>
        </div>
      )}
    </article>
  );
}
