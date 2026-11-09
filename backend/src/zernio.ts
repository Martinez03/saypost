// Thin REST client for the Zernio API (https://zernio.com/openapi.yaml). Only the calls Saypost uses.
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export class ZernioError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function call<T>(method: string, path: string, opts: { query?: Query; body?: unknown; idempotent?: boolean } = {}): Promise<T> {
  if (!config.zernioKey) throw new ZernioError(500, null, "ZERNIO_API_KEY is not set");
  const url = new URL(config.zernioBase + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { Authorization: `Bearer ${config.zernioKey}` };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotent) headers["Idempotency-Key"] = randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(Number(res.headers.get("retry-after") ?? "2"), 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    if (!res.ok) {
      const msg = (json as { error?: string; message?: string } | null)?.message ?? (json as { error?: string } | null)?.error ?? text.slice(0, 300);
      throw new ZernioError(res.status, json, `Zernio ${method} ${path} → ${res.status}: ${msg}`);
    }
    return json as T;
  }
  throw new ZernioError(429, null, "Zernio rate limit");
}

// ---------------------------------------------------------------- profiles & accounts
export interface ZProfile {
  _id: string;
  name: string;
  externalId?: string | null;
}

export async function findProfileByExternalId(externalId: string): Promise<ZProfile | null> {
  const r = await call<{ profiles?: ZProfile[] }>("GET", "/profiles", { query: { externalId } });
  return r.profiles?.find((p) => p.externalId === externalId) ?? null;
}

export async function createProfile(name: string, externalId: string, timezone: string): Promise<ZProfile> {
  const r = await call<{ profile: ZProfile }>("POST", "/profiles", {
    body: { name, externalId, timezone, description: "Saypost business" },
    idempotent: true,
  });
  return r.profile;
}

export interface ZAccount {
  _id: string;
  platform: string;
  profileId: string | { _id: string };
  username?: string;
  displayName?: string;
  profilePicture?: string | null;
  isActive: boolean;
  needsReconnection?: boolean;
}

export async function listAccounts(profileId: string): Promise<ZAccount[]> {
  const r = await call<{ accounts: ZAccount[] }>("GET", "/accounts", { query: { profileId } });
  return r.accounts ?? [];
}

export async function deleteAccount(accountId: string): Promise<void> {
  await call("DELETE", `/accounts/${accountId}`);
}

/** `extra`: more query parameters, e.g. the branded welcome screen (welcome, brandName, logoUrl, primaryColor). */
export async function connectUrl(platform: string, profileId: string, redirectUrl: string, extra: Query = {}): Promise<string> {
  const r = await call<{ authUrl: string }>("GET", `/connect/${platform}`, {
    query: { ...extra, profileId, redirect_url: redirectUrl },
  });
  return r.authUrl;
}

// ---------------------------------------------------------------- WhatsApp sandbox & inbox
export interface SandboxSession {
  id: string;
  phoneE164: string;
  status: "pending" | "active";
  expiresAt: string;
}

export async function sandboxStart(phone: string): Promise<{ session: SandboxSession; sandboxNumber: string }> {
  return call("POST", "/whatsapp/sandbox/sessions", { body: { phone } });
}

export async function sandboxSessions(): Promise<{ sessions: SandboxSession[]; sandboxNumber: string | null }> {
  return call("GET", "/whatsapp/sandbox/sessions");
}

export interface SendOptions {
  message?: string;
  attachmentUrl?: string;
  attachmentType?: "image" | "video" | "audio" | "file";
  /** WhatsApp renders these as reply buttons (max 3, title ≤ 20 chars). The payload comes back as metadata.interactiveId. */
  buttons?: { title: string; payload: string }[];
}

export async function sendMessage(conversationId: string, accountId: string, opts: SendOptions): Promise<{ messageId?: string }> {
  const body: Record<string, unknown> = { accountId };
  if (opts.message) body.message = opts.message;
  if (opts.attachmentUrl) {
    body.attachmentUrl = opts.attachmentUrl;
    body.attachmentType = opts.attachmentType ?? "image";
  }
  if (opts.buttons?.length) body.buttons = opts.buttons.map((b) => ({ type: "postback", title: b.title.slice(0, 20), payload: b.payload }));
  const r = await call<{ data?: { messageId?: string } }>("POST", `/inbox/conversations/${conversationId}/messages`, { body, idempotent: true });
  return { messageId: r.data?.messageId };
}

/** Read receipts (blue ticks on WhatsApp) and "typing…" while the agent works. Best effort. */
export async function markRead(conversationId: string, accountId: string): Promise<void> {
  await call("POST", `/inbox/conversations/${conversationId}/read`, { body: { accountId } }).catch(() => undefined);
}

export async function typing(conversationId: string, accountId: string): Promise<void> {
  await call("POST", `/inbox/conversations/${conversationId}/typing`, { body: { accountId } }).catch(() => undefined);
}

/** Downloads an inbound attachment. WhatsApp URLs need the API key; Meta drops them after a while. */
export async function downloadAttachment(url: string): Promise<{ buf: Buffer; contentType: string }> {
  const needsAuth = url.startsWith(config.zernioBase) || url.includes("zernio.com/api");
  const res = await fetch(url, { headers: needsAuth ? { Authorization: `Bearer ${config.zernioKey}` } : {} });
  if (!res.ok) throw new ZernioError(res.status, null, `download ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
}

// ---------------------------------------------------------------- media
export async function uploadMedia(buf: Buffer, contentType: string, filename: string): Promise<string> {
  const ct = contentType.split(";")[0]!.trim();
  const p = await call<{ uploadUrl: string; publicUrl: string }>("POST", "/media/presign", {
    body: { filename, contentType: ct, size: buf.length },
  });
  const put = await fetch(p.uploadUrl, { method: "PUT", headers: { "Content-Type": ct }, body: new Uint8Array(buf) });
  if (!put.ok) throw new ZernioError(put.status, null, `media upload ${put.status}`);
  return p.publicUrl;
}

// ---------------------------------------------------------------- posts
export interface CreatePostInput {
  content: string;
  mediaItems?: { url: string; type: "image" | "video" }[];
  platforms: { platform: string; accountId: string; customContent?: string }[];
  publishNow?: boolean;
  scheduledFor?: string;
  timezone?: string;
  metadata?: Record<string, string>;
}

export interface ZPost {
  _id: string;
  content?: string;
  status: string;
  scheduledFor?: string;
  publishedAt?: string;
  mediaItems?: { url?: string; type?: string; thumbnail?: string }[];
  platforms?: { platform: string; accountId?: string | { _id: string }; status?: string; platformPostUrl?: string; errorMessage?: string; publishedAt?: string }[];
  createdAt?: string;
}

export async function createPost(input: CreatePostInput): Promise<{ post: ZPost }> {
  return call("POST", "/posts", { body: input, idempotent: true });
}

export async function listPosts(profileId: string, limit = 20): Promise<ZPost[]> {
  const r = await call<{ posts: ZPost[] }>("GET", "/posts", { query: { profileId, limit, sortBy: "created-desc" } }).catch(async (e) => {
    // sortBy values are not documented in our notes; retry without it.
    if (e instanceof ZernioError && e.status === 400) return call<{ posts: ZPost[] }>("GET", "/posts", { query: { profileId, limit } });
    throw e;
  });
  return r.posts ?? [];
}

export async function getPost(postId: string): Promise<ZPost> {
  const r = await call<{ post?: ZPost } & ZPost>("GET", `/posts/${postId}`);
  return r.post ?? r;
}

export async function deletePost(postId: string): Promise<void> {
  await call("DELETE", `/posts/${postId}`);
}

// ---------------------------------------------------------------- reviews & comments
export interface ZReview {
  id: string;
  platform: string;
  accountId: string;
  accountUsername?: string;
  reviewer?: { name?: string };
  rating?: number;
  recommendationType?: string | null;
  text?: string;
  created?: string;
  hasReply?: boolean;
  reply?: { text?: string } | null;
  reviewUrl?: string | null;
}

export async function listReviews(profileId: string, opts: { hasReply?: boolean; limit?: number } = {}): Promise<{ reviews: ZReview[]; averageRating: number | null; total: number | null }> {
  const r = await call<{ data?: ZReview[]; summary?: { totalReviews?: number; averageRating?: number | null } }>("GET", "/inbox/reviews", {
    query: { profileId, hasReply: opts.hasReply, limit: opts.limit ?? 25, sortBy: "date", sortOrder: "desc" },
  });
  return { reviews: r.data ?? [], averageRating: r.summary?.averageRating ?? null, total: r.summary?.totalReviews ?? null };
}

export async function replyReview(reviewId: string, accountId: string, message: string): Promise<unknown> {
  return call("POST", `/inbox/reviews/${encodeURIComponent(reviewId)}/reply`, { body: { accountId, message }, idempotent: true });
}

export async function replyComment(postId: string, accountId: string, message: string, commentId?: string): Promise<unknown> {
  return call("POST", `/inbox/comments/${encodeURIComponent(postId)}`, { body: { accountId, message, commentId }, idempotent: true });
}

// ---------------------------------------------------------------- analytics
export interface ZAnalyticsList {
  overview?: { totalPosts?: number; publishedPosts?: number; scheduledPosts?: number };
  posts?: {
    _id: string;
    content?: string;
    publishedAt?: string;
    platform?: string;
    platformPostUrl?: string;
    analytics?: { impressions?: number; reach?: number; likes?: number; comments?: number; shares?: number; saves?: number; views?: number; engagementRate?: number };
  }[];
}

export async function analytics(profileId: string, fromDate: string, toDate: string): Promise<ZAnalyticsList> {
  return call("GET", "/analytics", { query: { profileId, fromDate, toDate, limit: 50 } });
}
