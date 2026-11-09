"use client";

/* eslint-disable @next/next/no-img-element -- media URLs come from Zernio (or are local previews) */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Building2, ImagePlus, Loader2, Maximize2, Mic, Monitor, RotateCw, SendHorizontal, Square, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-icons";
import { LogoMark } from "@/components/brand/logo";
import { useI18n } from "@/components/i18n-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Action } from "@/lib/database.types";
import { timeOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useChat, useChatViewer, type ChatMessage } from "./chat-provider";
import { blobToBase64, canRecord, MAX_FILE_BYTES, prepareImage, recorderMimeType, type PreparedImage } from "./media";
import { ProposalCard } from "./proposal-card";
import { WaText } from "./wa-text";

// The chat with Saypost: the business's whole thread (WhatsApp and web, each bubble marked), proposal cards
// with Approve / Discard, a typing indicator while the agent works, and a composer with photo and voice.
// Used by the Chat page and by the floating sheet; both share one state (chat-provider.tsx).

type Item = { type: "message"; message: ChatMessage } | { type: "proposal"; action: Action };

/**
 * Messages and web proposals in one timeline. A proposal is created while the agent works, before its reply
 * is stored, so the cards of a turn go right after that turn's reply (the next web message from Saypost).
 */
export function buildTimeline(messages: ChatMessage[], actions: Action[]): Item[] {
  const first = messages[0]?.created_at;
  const queue = [...actions].filter((a) => !first || a.created_at >= first).sort((x, y) => x.created_at.localeCompare(y.created_at));
  const out: Item[] = [];
  let i = 0;
  for (const message of messages) {
    const before: Item[] = [];
    while (i < queue.length && !message.local && queue[i]!.created_at <= message.created_at) before.push({ type: "proposal", action: queue[i++]! });
    if (before.length && message.direction === "out" && message.channel === "web") out.push({ type: "message", message }, ...before);
    else out.push(...before, { type: "message", message });
  }
  while (i < queue.length) out.push({ type: "proposal", action: queue[i++]! });
  return out;
}

function ChannelMark({ channel }: { channel: ChatMessage["channel"] }) {
  const { t } = useI18n();
  const label = channel === "web" ? t.chat.viaWeb : t.chat.viaWhatsapp;
  return (
    <span className="inline-flex items-center" title={label}>
      {channel === "web" ? <Monitor className="size-3" aria-hidden /> : <BrandLogo id="whatsapp" className="size-3" />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Bubble({ message, timeZone }: { message: ChatMessage; timeZone: string }) {
  const { t, lang } = useI18n();
  const c = t.chat;
  const mine = message.direction === "in";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")} data-message={message.id} data-channel={message.channel}>
      <div
        className={cn(
          "grid max-w-[88%] gap-1 rounded-xl px-3 pt-2 pb-1 text-sm shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] sm:max-w-[75%]",
          mine ? "rounded-tr-sm bg-bubble-out" : "rounded-tl-sm bg-bubble-in",
          message.local && "opacity-80",
        )}
      >
        <span className="sr-only">{mine ? c.you : c.saypost}: </span>
        {message.kind === "image" && message.media_url && (
          <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="block">
            <img src={message.media_url} alt={c.photo} loading="lazy" className="max-h-60 w-full rounded-lg object-cover" />
          </a>
        )}
        {message.kind === "video" && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Video className="size-3.5" aria-hidden />
            {message.media_url ? (
              <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {t.whatsapp.video}
              </a>
            ) : (
              t.whatsapp.video
            )}
          </span>
        )}
        {message.kind === "audio" ? (
          <p className="whitespace-pre-line [overflow-wrap:anywhere]">
            <Mic className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" aria-label={c.voiceNote} />
            {message.body ? <span className="italic">{message.body}</span> : <span className="text-muted-foreground">{c.voiceNote}</span>}
          </p>
        ) : (
          message.body && <WaText text={message.body} className={cn("[overflow-wrap:anywhere]", message.kind === "system" && "text-muted-foreground italic")} />
        )}
        <span className="flex items-center justify-end gap-1.5 text-[0.6875rem] text-muted-foreground">
          <ChannelMark channel={message.channel} />
          {message.local ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <time dateTime={message.created_at}>{timeOnly(message.created_at, lang, timeZone)}</time>}
        </span>
      </div>
    </div>
  );
}

function Typing({ slow }: { slow: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-start" role="status" data-typing>
      <div className="flex items-center gap-2 rounded-xl rounded-tl-sm bg-bubble-in px-3 py-2.5 text-sm shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]">
        <span className="flex items-center gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/70" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
        {slow ? <span className="text-muted-foreground">{t.chat.stillWorking}</span> : <span className="sr-only">{t.chat.typing}</span>}
      </div>
    </div>
  );
}

function EmptyChat({ onPick }: { onPick: (s: { text: string; send: boolean }) => void }) {
  const { t } = useI18n();
  const c = t.chat;
  return (
    <div className="m-auto grid max-w-sm justify-items-center gap-3 px-2 py-8 text-center">
      <LogoMark className="size-11" />
      <div className="grid gap-1">
        <p className="text-[0.9375rem] font-semibold tracking-tight">{c.emptyTitle}</p>
        <p className="text-sm text-pretty text-muted-foreground">{c.emptyText}</p>
      </div>
      <ul className="mt-1 flex flex-wrap justify-center gap-1.5">
        {c.suggestions.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="inline-flex min-h-8 items-center rounded-full border bg-background px-3 py-1 text-[0.8125rem] font-medium shadow-xs transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatHeader({ variant, onClose }: { variant: "page" | "sheet"; onClose?: () => void }) {
  const { t } = useI18n();
  const c = t.chat;
  const { businessName, agencyMode } = useChat();
  return (
    <header className="flex shrink-0 items-center gap-2.5 border-b bg-background px-3 py-2.5 sm:px-4">
      <LogoMark className="size-8" />
      <div className="grid min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{variant === "sheet" ? c.title : c.saypost}</p>
        {agencyMode ? (
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-chat-client>
            <Building2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{c.about(businessName)}</span>
          </p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">{variant === "sheet" ? businessName : c.replies}</p>
        )}
      </div>
      {variant === "sheet" && (
        <div className="flex shrink-0 items-center gap-0.5">
          <Link href="/app/chat" onClick={onClose} className={buttonVariants({ variant: "ghost", size: "icon-sm" })} aria-label={c.openFull} title={c.openFull}>
            <Maximize2 aria-hidden />
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={c.close} title={c.close}>
            <X aria-hidden />
          </Button>
        </div>
      )}
    </header>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const MAX_RECORDING_MS = 120_000;

function Composer({ autoFocus, prefill }: { autoFocus: boolean; prefill: { text: string; nonce: number } | null }) {
  const { t } = useI18n();
  const c = t.chat;
  const chat = useChat();
  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [recording, setRecording] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [micOk, setMicOk] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; cancelled: boolean } | null>(null);

  // Voice notes only where the browser can record (checked after mount: no SSR mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability check
    setMicOk(canRecord());
    return () => {
      const r = rec.current;
      if (r) {
        r.cancelled = true;
        r.recorder.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a suggestion fills the composer
    setText(prefill.text);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [prefill]);

  // Grow with the text, up to about six lines.
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  useEffect(() => {
    if (recording === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - recording >= MAX_RECORDING_MS) rec.current?.recorder.stop();
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  async function submit() {
    const body = text.trim();
    if ((!body && !image) || chat.working || preparing) return;
    const sentImage = image;
    setText("");
    setImage(null);
    const res = await chat.send({ text: body, ...(sentImage ? { image: sentImage } : {}) });
    if (!res.ok && !res.retryable) {
      // No retry offered: give the text back so nothing typed is lost.
      setText((current) => current || body);
      setImage((current) => current ?? sentImage);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      if (prepared === "type") toast.error(c.imageType);
      else if (prepared === "size") toast.error(c.imageTooBig);
      else {
        if (image) URL.revokeObjectURL(image.previewUrl);
        setImage(prepared);
        area.current?.focus();
      }
    } catch {
      toast.error(c.imageType);
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function startRecording() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(c.micDenied);
      return;
    }
    const mimeType = recorderMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const state = { recorder, stream, chunks: [] as Blob[], cancelled: false };
    recorder.ondataavailable = (e) => {
      if (e.data.size) state.chunks.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      rec.current = null;
      setRecording(null);
      if (state.cancelled || !state.chunks.length) return;
      const blob = new Blob(state.chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size > MAX_FILE_BYTES) {
        toast.error(c.imageTooBig);
        return;
      }
      const data = await blobToBase64(blob);
      await chat.send({ text: "", audio: { data, type: (blob.type || "audio/webm").split(";")[0]! } });
    };
    rec.current = state;
    recorder.start();
    const started = Date.now();
    setNow(started);
    setRecording(started);
  }

  function stopRecording(cancel: boolean) {
    const r = rec.current;
    if (!r) return;
    r.cancelled = cancel;
    r.recorder.stop();
  }

  const canSend = (!!text.trim() || !!image) && !chat.working && !preparing;
  const showMic = micOk && !text.trim() && !image;

  if (recording !== null) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-t bg-background p-2.5 sm:p-3" data-recording>
        <Button variant="ghost" size="icon" onClick={() => stopRecording(true)} aria-label={c.cancelRecording} title={c.cancelRecording}>
          <Trash2 aria-hidden />
        </Button>
        <p className="flex flex-1 items-center gap-2 text-sm" role="status">
          <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
          {c.recording} <span className="num text-muted-foreground">{formatElapsed(now - recording)}</span>
        </p>
        <Button size="icon" className="rounded-full" onClick={() => stopRecording(false)} aria-label={c.stopRecording} title={c.stopRecording}>
          <Square className="size-3.5 fill-current" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t bg-background p-2.5 sm:p-3">
      {image && (
        <div className="relative mb-2 w-fit">
          <img src={image.previewUrl} alt={c.photo} className="size-16 rounded-lg object-cover ring-1 ring-border" />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(image.previewUrl);
              setImage(null);
            }}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background shadow outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={c.removeImage}
          >
            <X className="size-3" aria-hidden />
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/*" className="hidden" onChange={(e) => void pickImage(e.target.files?.[0])} tabIndex={-1} />
        <Button type="button" variant="ghost" size="icon" className="mb-0.5" onClick={() => fileInput.current?.click()} disabled={preparing} aria-label={c.attach} title={c.attach}>
          {preparing ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
        </Button>
        <label className="sr-only" htmlFor="chat-input">
          {c.placeholder}
        </label>
        <textarea
          id="chat-input"
          ref={area}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={c.placeholder}
          autoFocus={autoFocus}
          maxLength={4000}
          className="max-h-40 min-h-9 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-[0.4375rem] text-base leading-snug shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 md:text-sm dark:bg-input/10"
        />
        {showMic ? (
          <Button type="button" size="icon-lg" className="rounded-full" onClick={() => void startRecording()} disabled={chat.working} aria-label={c.record} title={c.record}>
            <Mic aria-hidden />
          </Button>
        ) : (
          <Button type="submit" size="icon-lg" className="rounded-full" disabled={!canSend} aria-label={c.send} title={c.send}>
            <SendHorizontal aria-hidden />
          </Button>
        )}
      </form>
      <p className="mt-1.5 hidden px-11 text-[0.6875rem] text-muted-foreground sm:block">{c.keyHint}</p>
    </div>
  );
}

export function ChatPanel({ variant, onClose, className }: { variant: "page" | "sheet"; onClose?: () => void; className?: string }) {
  useChatViewer();
  const { t } = useI18n();
  const c = t.chat;
  const chat = useChat();
  const [prefill, setPrefill] = useState<{ text: string; nonce: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const items = useMemo(() => (chat.messages ? buildTimeline(chat.messages, chat.actions) : null), [chat.messages, chat.actions]);
  const signature = `${items?.length ?? 0}:${items?.at(-1)?.type === "proposal" ? (items.at(-1) as { action: Action }).action.status : ""}:${chat.working}`;

  // Follow new messages unless the user scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [signature]);

  const empty = items !== null && items.length === 0 && !chat.working;

  return (
    <section className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-background", className)} aria-label={c.title} data-chat={variant}>
      <ChatHeader variant={variant} onClose={onClose} />
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        // `relative`: the sr-only labels inside must scroll with it, not stretch the page.
        className="chat-wall relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 sm:p-4"
        role="log"
        aria-live="polite"
        aria-busy={chat.working}
      >
        {items === null ? (
          chat.loadFailed ? (
            <p role="alert" className="m-auto text-sm text-muted-foreground">
              {c.loadFailed}
            </p>
          ) : (
            <div className="mt-auto grid gap-2">
              <Skeleton className="h-10 w-2/3 rounded-xl" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-xl" />
              <Skeleton className="h-16 w-3/4 rounded-xl" />
            </div>
          )
        ) : empty ? (
          <EmptyChat
            onPick={(s) => {
              if (s.send) void chat.send({ text: s.text });
              else setPrefill({ text: s.text, nonce: Date.now() });
            }}
          />
        ) : (
          // minmax(0,1fr): a truncated line (a discarded card) must not widen the column past the panel.
          <ol className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-2">
            {items.map((item) =>
              item.type === "message" ? (
                <li key={`m${item.message.id}`}>
                  <Bubble message={item.message} timeZone={chat.timeZone} />
                </li>
              ) : (
                <li key={`a${item.action.id}`} className="max-w-xl">
                  <ProposalCard action={item.action} onDecided={chat.actionDecided} />
                </li>
              ),
            )}
            {chat.working && (
              <li>
                <Typing slow={chat.slow} />
              </li>
            )}
          </ol>
        )}
      </div>
      {chat.error && (
        <div role="alert" className="flex shrink-0 items-center gap-2 border-t bg-destructive/5 px-3 py-2 text-sm text-destructive sm:px-4">
          <span className="min-w-0 flex-1">{chat.error.message}</span>
          {chat.error.retry && (
            <Button size="sm" variant="outline" onClick={chat.error.retry}>
              <RotateCw aria-hidden /> {t.common.retry}
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={chat.dismissError} aria-label={t.common.cancel}>
            <X aria-hidden />
          </Button>
        </div>
      )}
      <Composer autoFocus={variant === "sheet"} prefill={prefill} />
    </section>
  );
}
