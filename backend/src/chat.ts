// The dashboard's web chat with the agent (POST /api/chat). Same conversation and same per-business queue
// as WhatsApp; the answer goes back to the web only. Proposals made here are cards in the dashboard and are
// decided only through POST /api/actions/:id/approve | reject. Dependencies are injected so the tests can
// check that nothing reaches WhatsApp.
import type { FastifyInstance } from "fastify";
import { defaultSinkDeps, deliverAgentOutput, runAgent, type AgentOutput, type SinkDeps } from "./agent/agent.js";
import { addEvent, addMessage, getBusiness, type ActionRow, type Business, type Channel, type MessageRow } from "./db.js";
import { t } from "./i18n.js";
import { createRateLimiter } from "./invites.js";
import { enqueue } from "./queue.js";
import { transcribe } from "./transcribe.js";
import * as zernio from "./zernio.js";

export const MAX_TEXT = 4000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Base64 of a 5 MB file plus the JSON around it. */
export const CHAT_BODY_LIMIT = 8 * 1024 * 1024;

const IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/opus", "audio/mp4", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-wav"]);

export interface ChatFile {
  buf: Buffer;
  type: string;
}

export type ParsedChat =
  | { ok: true; text: string; image: ChatFile | null; audio: ChatFile | null }
  | { ok: false; status: 400 | 413; error: string; message: string };

/** Magic bytes, so only real images reach Zernio and Claude. */
function looksLikeImage(buf: Buffer, type: string): boolean {
  const hex = buf.subarray(0, 12).toString("hex");
  switch (type) {
    case "image/jpeg":
      return hex.startsWith("ffd8ff");
    case "image/png":
      return hex.startsWith("89504e47");
    case "image/gif":
      return hex.startsWith("474946");
    case "image/webp":
      return hex.startsWith("52494646") && buf.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

function decodeFile(v: unknown, kind: "image" | "audio"): ChatFile | { error: string; status: 400 | 413 } | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") return { status: 400, error: `bad_${kind}` };
  const o = v as { data?: unknown; type?: unknown };
  const type = typeof o.type === "string" ? o.type.split(";")[0]!.trim().toLowerCase() : "";
  const data = typeof o.data === "string" ? o.data.replace(/^data:[^,]*,/, "") : "";
  if (!data) return { status: 400, error: `bad_${kind}` };
  // Base64 is 4/3 of the bytes: refuse before decoding.
  if (Math.floor((data.length * 3) / 4) > MAX_FILE_BYTES + 3) return { status: 413, error: "file_too_large" };
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(data)) return { status: 400, error: `bad_${kind}` };
  const buf = Buffer.from(data, "base64");
  if (!buf.length) return { status: 400, error: `bad_${kind}` };
  if (buf.length > MAX_FILE_BYTES) return { status: 413, error: "file_too_large" };
  if (kind === "image" && (!IMAGE_EXT[type] || !looksLikeImage(buf, type))) return { status: 400, error: "bad_image" };
  if (kind === "audio" && !AUDIO_TYPES.has(type)) return { status: 400, error: "bad_audio" };
  return { buf, type };
}

/** Validates `{text?, image?: {data, type}, audio?: {data, type}}` (data in base64). */
export function parseChatBody(body: unknown): ParsedChat {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length > MAX_TEXT) return { ok: false, status: 400, error: "text_too_long", message: `At most ${MAX_TEXT} characters` };
  const image = decodeFile(b.image, "image");
  if (image && "error" in image) return { ok: false, status: image.status, error: image.error, message: image.status === 413 ? "Files can be up to 5 MB" : "Send a JPEG, PNG, WebP or GIF image" };
  const audio = decodeFile(b.audio, "audio");
  if (audio && "error" in audio) return { ok: false, status: audio.status, error: audio.error, message: audio.status === 413 ? "Files can be up to 5 MB" : "Unsupported audio format" };
  if (image && audio) return { ok: false, status: 400, error: "bad_request", message: "Send a photo or a voice note, not both" };
  if (!text && !image && !audio) return { ok: false, status: 400, error: "empty", message: "Write something" };
  return { ok: true, text, image, audio };
}

export interface ChatDeps {
  enqueue<T>(businessId: string, job: () => Promise<T>): Promise<T>;
  /** A fresh copy of the business when its turn comes (notes may have changed in an earlier turn). */
  getBusiness(id: string): Promise<Business | null>;
  addMessage: typeof addMessage;
  addEvent: typeof addEvent;
  uploadMedia(buf: Buffer, contentType: string, filename: string): Promise<string>;
  transcribe(buf: Buffer, contentType: string, businessId: string): Promise<string>;
  runAgent(biz: Business, channel: Channel): Promise<AgentOutput>;
  /** Where the answer may go. The web chat only ever stores it in the thread (deliverAgentOutput). */
  sink: SinkDeps;
  /** Messages per user: each one is a Claude turn. */
  limiter: ReturnType<typeof createRateLimiter>;
  /** How long the request waits for the agent; after that it answers 202 and the reply lands in the thread. */
  timeoutMs: number;
}

export function defaultChatDeps(): ChatDeps {
  return {
    enqueue,
    getBusiness,
    addMessage,
    addEvent,
    uploadMedia: zernio.uploadMedia,
    transcribe,
    runAgent,
    sink: defaultSinkDeps,
    limiter: createRateLimiter({ limit: 20, windowMs: 5 * 60_000 }),
    timeoutMs: 110_000,
  };
}

export interface ChatResponse {
  message: { kind: MessageRow["kind"]; body: string; mediaUrl: string | null };
  reply: string;
  proposals: ActionRow[];
}

/**
 * Registers POST /api/chat on a scope whose preHandler has set `req.biz` and `req.userId` (routes/api.ts).
 * Response: `{message, reply, proposals}` once the agent is done, or `202 {message, pending: true}` if it
 * takes longer than `timeoutMs` (the reply still lands in the thread).
 */
export async function chatRoutes(app: FastifyInstance, deps: ChatDeps = defaultChatDeps()) {
  app.post("/api/chat", { bodyLimit: CHAT_BODY_LIMIT }, async (req, reply) => {
    const biz = req.biz!;
    const fail = (status: number, error: string, message?: string) => reply.code(status).send({ error, message: message ?? error });

    const limit = deps.limiter.hit(req.userId ?? req.ip);
    if (!limit.ok) {
      reply.header("Retry-After", String(limit.retryAfter));
      return fail(429, "rate_limited", "Too many messages. Wait a moment.");
    }
    const input = parseChatBody(req.body);
    if (!input.ok) return fail(input.status, input.error, input.message);

    // Files first: they do not touch the thread, so they do not need the queue.
    let kind: MessageRow["kind"] = "text";
    let body = input.text;
    let mediaUrl: string | null = null;
    if (input.audio) {
      try {
        const transcript = await deps.transcribe(input.audio.buf, input.audio.type, biz.id);
        if (!transcript) throw new Error("empty transcript");
        kind = "audio";
        body = [transcript, input.text].filter(Boolean).join("\n");
      } catch (e) {
        req.log.error({ err: e }, "[chat] transcription failed");
        return fail(422, "transcribe_failed", t(biz.language).transcribeFailed);
      }
    }
    if (input.image) {
      try {
        mediaUrl = await deps.uploadMedia(input.image.buf, input.image.type, `saypost-web-${Date.now()}.${IMAGE_EXT[input.image.type]}`);
        kind = "image";
      } catch (e) {
        req.log.error({ err: e }, "[chat] image upload failed");
        return fail(502, "upload_failed", "The photo could not be uploaded");
      }
    }
    const message = { kind, body, mediaUrl };

    // The message is stored inside the turn, so a WhatsApp turn queued before it never answers it.
    const turn = deps.enqueue(biz.id, async () => {
      const fresh = (await deps.getBusiness(biz.id)) ?? biz;
      await deps.addMessage({ business_id: biz.id, direction: "in", kind, body, media_url: mediaUrl, channel: "web" });
      try {
        const out = await deps.runAgent(fresh, "web");
        await deliverAgentOutput(fresh, "web", out, deps.sink);
        return out;
      } catch (e) {
        await deps.addEvent(biz.id, "agent.error", t(fresh.language).evAgentError, { error: String(e).slice(0, 300), channel: "web" });
        throw e;
      }
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), deps.timeoutMs);
    });
    try {
      const out = await Promise.race([turn, timeout]);
      if (out === "timeout") return reply.code(202).send({ message, pending: true });
      return { message, reply: out.reply, proposals: out.proposals } satisfies ChatResponse;
    } catch (e) {
      req.log.error({ err: e }, "[chat] agent failed");
      return fail(502, "agent_failed", t(biz.language).error);
    } finally {
      clearTimeout(timer);
    }
  });
}
