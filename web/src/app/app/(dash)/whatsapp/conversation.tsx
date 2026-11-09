"use client";

/* eslint-disable @next/next/no-img-element -- media URLs come from Zernio */

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCheck, MessageCircle, Mic, Video } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { SectionTitle } from "@/components/app/page-header";
import { useI18n } from "@/components/i18n-provider";
import { Skeleton } from "@/components/ui/skeleton";
import type { Message } from "@/lib/database.types";
import { timeOnly } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;

type Row = Pick<Message, "id" | "direction" | "kind" | "body" | "media_url" | "created_at">;

/** The WhatsApp thread between the owner (right, green) and Saypost (left), refreshed every 5 s while open. */
export function Conversation({ businessId, timeZone }: { businessId: string; timeZone: string }) {
  const { t, lang } = useI18n();
  const w = t.whatsapp;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await createClient()
      .from("messages")
      .select("id, direction, kind, body, media_url, created_at")
      .eq("business_id", businessId)
      // The web chat shares the thread; this page shows the WhatsApp side only.
      .eq("channel", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setRows((data ?? []).reverse());
  }, [businessId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Keep the newest message in view when one arrives.
  useEffect(() => {
    const newest = rows?.at(-1)?.id ?? null;
    if (newest !== null && newest !== lastId.current && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
    lastId.current = newest;
  }, [rows]);

  return (
    <section aria-labelledby="conversation-title" className="grid gap-4">
      <SectionTitle id="conversation-title" title={w.conversationTitle} description={w.conversationSubtitle} />
      {rows === null && !failed ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : failed && !rows ? (
        <p role="alert" className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t.common.genericError}
        </p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={<MessageCircle />} title={w.conversationEmpty} description={w.conversationEmptyText} />
      ) : (
        <div ref={scroller} className="chat-wall max-h-[32rem] overflow-y-auto rounded-xl border p-3 sm:p-4" role="log" aria-live="polite">
          <ol className="grid gap-2">
            {rows.map((m) => {
              const mine = m.direction === "in";
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "grid max-w-[85%] gap-1 rounded-xl px-3 pt-2 pb-1 text-sm shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] sm:max-w-[70%]",
                      mine ? "rounded-tr-sm bg-bubble-out" : "rounded-tl-sm bg-bubble-in",
                    )}
                  >
                    <span className="sr-only">{mine ? w.you : w.saypost}: </span>
                    {m.kind === "image" && m.media_url && (
                      <a href={m.media_url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={m.media_url} alt={w.image} loading="lazy" className="max-h-60 w-full rounded-lg object-cover" />
                      </a>
                    )}
                    {m.kind === "video" && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Video className="size-3.5" aria-hidden />
                        {m.media_url ? (
                          <a href={m.media_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                            {w.video}
                          </a>
                        ) : (
                          w.video
                        )}
                      </span>
                    )}
                    {m.kind === "audio" ? (
                      <p className="whitespace-pre-line [overflow-wrap:anywhere]">
                        <Mic className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-label={w.audio} />
                        {m.body ? <span className="italic">{m.body}</span> : <span className="text-muted-foreground">{w.audio}</span>}
                      </p>
                    ) : (
                      m.body && <p className={cn("whitespace-pre-line [overflow-wrap:anywhere]", m.kind === "system" && "text-muted-foreground italic")}>{m.body}</p>
                    )}
                    <span className="flex items-center justify-end gap-1 text-[0.6875rem] text-muted-foreground">
                      <time dateTime={m.created_at}>{timeOnly(m.created_at, lang, timeZone)}</time>
                      {mine && <CheckCheck className="size-3.5 text-sky-500" aria-hidden />}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
