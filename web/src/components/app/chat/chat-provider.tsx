"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { ApiError, api, type ChatRequest, type ChatResponse } from "@/lib/api";
import type { Action, Message } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

// The web chat's state, shared by the Chat page and the floating sheet: one conversation per business
// (WhatsApp and web messages), the proposal cards made from the web, and the turn in flight. It lives in
// the dashboard layout, so a turn keeps going while the user moves between pages.

export type ChatMessage = Pick<Message, "id" | "direction" | "kind" | "body" | "media_url" | "channel" | "created_at"> & {
  /** A message being sent from this browser (not stored yet). */
  local?: boolean;
};

type Outgoing = { text: string; image?: { data: string; type: string; previewUrl: string }; audio?: { data: string; type: string } };

type ChatState = {
  businessId: string;
  businessName: string;
  agencyMode: boolean;
  timeZone: string;
  /** Oldest first; null until the first load. */
  messages: ChatMessage[] | null;
  /** Proposals made from the web chat (source "dashboard"), newest first. */
  actions: Action[];
  loadFailed: boolean;
  /** The agent is working on a message from this browser. */
  working: boolean;
  /** It answered 202: the reply will land in the thread. */
  slow: boolean;
  error: { message: string; retry?: () => void } | null;
  dismissError: () => void;
  /** A reply arrived while no chat was open. */
  unread: boolean;
  /** Sends a message; `retryable` failures show a Retry button (the composer keeps it cleared). */
  send: (input: Outgoing) => Promise<{ ok: boolean; retryable: boolean }>;
  /** Puts an updated action (after approve/reject) in place and reloads the thread. */
  actionDecided: (action: Action | null) => Promise<void>;
  /** A mounted chat view (useChatViewer): polls while at least one is open. Returns the unregister. */
  registerViewer: () => () => void;
};

const Ctx = createContext<ChatState | null>(null);

const POLL_MS = 4000;
const SLOW_GIVE_UP_MS = 3 * 60_000;

export function ChatProvider({
  businessId,
  businessName,
  agencyMode,
  timeZone,
  children,
}: {
  businessId: string;
  businessName: string;
  agencyMode: boolean;
  timeZone: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [serverMessages, setServerMessages] = useState<ChatMessage[] | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [outgoing, setOutgoing] = useState<{ message: ChatMessage; afterId: number } | null>(null);
  const [working, setWorking] = useState(false);
  const [slow, setSlow] = useState<{ afterId: number; since: number } | null>(null);
  const [error, setError] = useState<ChatState["error"]>(null);
  const [unread, setUnread] = useState(false);
  const [viewers, setViewers] = useState(0);
  const viewersRef = useRef(0);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    const sb = createClient();
    const [m, a] = await Promise.all([
      sb
        .from("messages")
        .select("id, direction, kind, body, media_url, channel, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(60),
      sb.from("actions").select("*").eq("business_id", businessId).eq("source", "dashboard").order("created_at", { ascending: false }).limit(30),
    ]);
    if (m.error || a.error) {
      setLoadFailed(true);
      return;
    }
    setLoadFailed(false);
    // "system" lines (e.g. "Dropped: …" after a card is discarded) are context for the agent; the card says it.
    const rows = ((m.data ?? []) as ChatMessage[]).filter((r) => r.kind !== "system").reverse();
    lastId.current = rows.reduce((max, r) => Math.max(max, r.id), lastId.current);
    setServerMessages(rows);
    setActions(a.data ?? []);
  }, [businessId]);

  // Poll while a chat view is open or a turn is in flight (WhatsApp messages show up too).
  const polling = viewers > 0 || working || slow !== null;
  useEffect(() => {
    if (!polling) return;
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [polling, load]);

  // A slow turn (202) ends when its reply lands in the thread, or after a few minutes.
  useEffect(() => {
    if (!slow || !serverMessages) return;
    const answered = serverMessages.some((m) => m.id > slow.afterId && m.direction === "out" && m.channel === "web");
    if (answered || Date.now() - slow.since > SLOW_GIVE_UP_MS) {
      setSlow(null);
      setWorking(false);
      if (viewersRef.current === 0) setUnread(true);
      router.refresh();
    }
  }, [slow, serverMessages, router]);

  const send = useCallback(
    async function send(input: Outgoing): Promise<{ ok: boolean; retryable: boolean }> {
      if (working) return { ok: false, retryable: false };
      const afterId = lastId.current;
      const kind = input.image ? "image" : input.audio ? "audio" : "text";
      setOutgoing({
        afterId,
        message: {
          id: -Date.now(),
          direction: "in",
          kind,
          body: input.text,
          media_url: input.image?.previewUrl ?? null,
          channel: "web",
          created_at: new Date().toISOString(),
          local: true,
        },
      });
      setWorking(true);
      setError(null);
      const body: ChatRequest = {
        ...(input.text ? { text: input.text } : {}),
        ...(input.image ? { image: { data: input.image.data, type: input.image.type } } : {}),
        ...(input.audio ? { audio: input.audio } : {}),
      };
      let ok = false;
      let retryable = false;
      let stillWorking = false;
      try {
        const res = await api<ChatResponse>("/api/chat", { method: "POST", body, businessId, timeoutMs: 130_000 });
        if (res.pending) {
          stillWorking = true;
          setSlow({ afterId, since: Date.now() });
        } else if (res.proposals.length) {
          setActions((prev) => [...res.proposals.filter((p) => !prev.some((x) => x.id === p.id)), ...prev]);
        }
        ok = true;
      } catch (e) {
        const err = e instanceof ApiError ? e : null;
        const message =
          err?.status === 429
            ? t.chat.rateLimited
            : err?.error === "transcribe_failed"
              ? t.chat.transcribeFailed
              : err?.error === "file_too_large" || err?.status === 413
                ? t.chat.imageTooBig
                : err?.error === "bad_image"
                  ? t.chat.imageType
                  : err?.error === "network"
                    ? t.common.backendDown
                    : t.chat.sendFailed;
        retryable = !(err?.status === 429 || err?.status === 413 || err?.status === 400 || err?.status === 422);
        setError({ message, retry: retryable ? () => void send(input) : undefined });
      }
      await load().catch(() => undefined);
      setOutgoing(null);
      if (!stillWorking) setWorking(false);
      if (ok && !stillWorking) {
        if (viewersRef.current === 0) setUnread(true);
        // The approvals badge in the sidebar counts pending proposals.
        router.refresh();
      }
      return { ok, retryable };
    },
    [working, businessId, load, router, t],
  );

  const actionDecided = useCallback(
    async (action: Action | null) => {
      if (action) setActions((prev) => prev.map((a) => (a.id === action.id ? action : a)));
      await load().catch(() => undefined);
      router.refresh();
    },
    [load, router],
  );

  const registerViewer = useCallback(() => {
    viewersRef.current += 1;
    setViewers((n) => n + 1);
    setUnread(false);
    return () => {
      viewersRef.current -= 1;
      setViewers((n) => n - 1);
    };
  }, []);

  // The message being sent shows until the server has it (it is stored when its turn starts).
  const messages = useMemo(() => {
    if (!outgoing) return serverMessages;
    if (!serverMessages) return [outgoing.message];
    const stored = serverMessages.some((m) => m.id > outgoing.afterId && m.direction === "in" && m.channel === "web");
    return stored ? serverMessages : [...serverMessages, outgoing.message];
  }, [serverMessages, outgoing]);

  const value: ChatState = {
    businessId,
    businessName,
    agencyMode,
    timeZone,
    messages,
    actions,
    loadFailed,
    working,
    slow: slow !== null,
    error,
    dismissError: () => setError(null),
    unread,
    send,
    actionDecided,
    registerViewer,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat(): ChatState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChat outside ChatProvider");
  return ctx;
}

/** Marks a chat view as open while the calling component is mounted (polling, unread). */
export function useChatViewer() {
  const { registerViewer } = useChat();
  useEffect(() => registerViewer(), [registerViewer]);
}
