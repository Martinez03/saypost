// Pending actions: everything that publishes, replies or deletes is stored here first and only runs
// after the owner's "yes" (WhatsApp button/text) or an approval in the dashboard. Enforced in code.
import { ownerGetsResult, proposalDelivery } from "./approval.js";
import { addEvent, db, getAction, getBusiness, listAccounts, type ActionKind, type ActionRow, type Business } from "./db.js";
import { platformName, t } from "./i18n.js";
import { sendToOwner } from "./whatsapp.js";
import * as zernio from "./zernio.js";

export interface PublishPayload {
  targets: { platform: string; accountId: string; text: string }[];
  caption: string;
  mediaUrls: string[];
  scheduleAt: string | null; // local datetime in the business timezone, or null = now
  timezone: string;
}
export interface ReplyReviewPayload {
  reviewId: string;
  accountId: string;
  platform: string;
  message: string;
}
export interface ReplyCommentPayload {
  postId: string;
  commentId: string;
  accountId: string;
  platform: string;
  message: string;
}
export interface ReplyDmPayload {
  conversationId: string;
  accountId: string;
  platform: string;
  message: string;
}
export interface CancelPostPayload {
  postId: string;
}

/** Platforms that cannot publish without a photo or video. */
const NEEDS_MEDIA = new Set(["instagram", "tiktok", "pinterest", "youtube"]);
const MAX_LEN: Record<string, number> = { twitter: 280, googlebusiness: 1500, bluesky: 300, threads: 500 };

export async function createAction(
  biz: Business,
  a: { kind: ActionKind; title: string; preview: string; payload: object; context?: object | null; source: ActionRow["source"]; supersede?: (p: ActionRow) => boolean },
): Promise<ActionRow> {
  if (a.supersede) {
    const pending = (await db.from("actions").select("*").eq("business_id", biz.id).eq("status", "pending")).data as ActionRow[] | null;
    const ids = (pending ?? []).filter(a.supersede).map((p) => p.id);
    if (ids.length) await db.from("actions").update({ status: "superseded", decided_at: new Date().toISOString() }).in("id", ids);
  }
  const { data, error } = await db
    .from("actions")
    .insert({ business_id: biz.id, kind: a.kind, title: a.title.slice(0, 200), preview: a.preview, payload: a.payload, context: a.context ?? null, source: a.source })
    .select()
    .single();
  if (error) throw new Error(`createAction: ${error.message}`);
  return data as ActionRow;
}

/**
 * Tells the owner about new pending actions, as the business's approval mode says (approval.ts):
 * the preview with Yes/No buttons, a single "your agency reviews it" note, or nothing (dashboard only).
 */
export async function deliverProposals(biz: Business, actions: ActionRow[], intro?: string): Promise<void> {
  let note = false;
  for (const a of actions) {
    const how = proposalDelivery(biz.approval_mode, a.source);
    if (how === "buttons") await proposeToOwner(biz, a, intro);
    else if (how === "agency_note") note = true;
  }
  if (note) await sendToOwner(biz, t(biz.language).agencyReviews);
}

/** Sends the preview of a pending action to the owner with Yes/No buttons. */
async function proposeToOwner(biz: Business, action: ActionRow, intro?: string): Promise<void> {
  const s = t(biz.language);
  const question = action.kind === "publish" ? s.askConfirmPublish : action.kind === "cancel_post" ? s.askConfirmCancel : s.askConfirmReply;
  const body = [intro, action.kind === "publish" ? action.preview : intro ? null : action.preview, question].filter(Boolean).join("\n\n");
  await sendToOwner(biz, body, [
    { title: s.yes, payload: `approve:${action.id}` },
    { title: s.no, payload: `reject:${action.id}` },
  ]);
}

/** Atomically claims a pending action. Returns null if it was already decided. */
async function claim(id: string, status: "approved" | "rejected", via: "whatsapp" | "dashboard"): Promise<ActionRow | null> {
  const { data, error } = await db
    .from("actions")
    .update({ status, decided_at: new Date().toISOString(), decided_via: via })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw new Error(`claim: ${error.message}`);
  return data as ActionRow | null;
}

export async function rejectAction(id: string, via: "whatsapp" | "dashboard"): Promise<ActionRow | null> {
  const row = await claim(id, "rejected", via);
  if (row) {
    const biz = await getBusiness(row.business_id);
    await addEvent(row.business_id, "action.rejected", t(biz?.language ?? "es").evRejected(row.title), { actionId: row.id, kind: row.kind });
  }
  return row;
}

export async function approveAction(id: string, via: "whatsapp" | "dashboard"): Promise<{ row: ActionRow | null; message: string }> {
  const row = await claim(id, "approved", via);
  if (!row) {
    const current = await getAction(id);
    return { row: current, message: "already_decided" };
  }
  const biz = await getBusiness(row.business_id);
  if (!biz) throw new Error("business not found");
  const s = t(biz.language);
  try {
    const { result, summary } = await execute(biz, row);
    const { data } = await db
      .from("actions")
      .update({ status: "done", result, executed_at: new Date().toISOString() })
      .eq("id", row.id)
      .select()
      .single();
    await addEvent(biz.id, `action.done`, row.title, { actionId: row.id, kind: row.kind, ...result });
    if (ownerGetsResult(biz.approval_mode, row.source)) await sendToOwner(biz, summary);
    return { row: data as ActionRow, message: summary };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    console.error(`[action] ${row.kind} ${row.id} failed: ${why}`);
    const { data } = await db.from("actions").update({ status: "failed", error: why.slice(0, 1000) }).eq("id", row.id).select().single();
    await addEvent(biz.id, "action.failed", row.title, { actionId: row.id, kind: row.kind, error: why.slice(0, 300) });
    if (ownerGetsResult(biz.approval_mode, row.source)) await sendToOwner(biz, s.failed(humanError(why)));
    return { row: data as ActionRow, message: why };
  }
}

function humanError(why: string): string {
  const m = why.match(/→ \d+: (.*)$/);
  return (m?.[1] ?? why).slice(0, 200);
}

async function execute(biz: Business, row: ActionRow): Promise<{ result: Record<string, unknown>; summary: string }> {
  const s = t(biz.language);
  switch (row.kind) {
    case "publish":
      return executePublish(biz, row.payload as unknown as PublishPayload);
    case "reply_review": {
      const p = row.payload as unknown as ReplyReviewPayload;
      await zernio.replyReview(p.reviewId, p.accountId, p.message);
      return { result: { platform: p.platform }, summary: s.replied };
    }
    case "reply_comment": {
      const p = row.payload as unknown as ReplyCommentPayload;
      await zernio.replyComment(p.postId, p.accountId, p.message, p.commentId);
      return { result: { platform: p.platform }, summary: s.replied };
    }
    case "reply_dm": {
      const p = row.payload as unknown as ReplyDmPayload;
      await zernio.sendMessage(p.conversationId, p.accountId, { message: p.message });
      return { result: { platform: p.platform }, summary: s.replied };
    }
    case "cancel_post": {
      const p = row.payload as unknown as CancelPostPayload;
      await zernio.deletePost(p.postId);
      return { result: { postId: p.postId }, summary: s.cancelled };
    }
    case "boost":
      throw new Error("boost is not available yet");
  }
}

async function executePublish(biz: Business, p: PublishPayload): Promise<{ result: Record<string, unknown>; summary: string }> {
  const s = t(biz.language);
  const connected = new Map((await listAccounts(biz.id)).map((a) => [a.zernio_account_id, a]));
  const hasMedia = p.mediaUrls.length > 0;
  const skipped: string[] = [];
  const platforms = p.targets
    .filter((tg) => {
      const ok = connected.has(tg.accountId) && (hasMedia || !NEEDS_MEDIA.has(tg.platform));
      if (!ok) skipped.push(platformName(tg.platform));
      return ok;
    })
    .map((tg) => {
      const max = MAX_LEN[tg.platform];
      const text = max && tg.text.length > max ? tg.text.slice(0, max - 1).trimEnd() + "…" : tg.text;
      return { platform: tg.platform, accountId: tg.accountId, customContent: text };
    });
  if (!platforms.length) throw new Error(hasMedia ? "no connected account to publish to" : "these networks need a photo or video");

  const mediaItems = p.mediaUrls.map((url) => ({ url, type: /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) ? ("video" as const) : ("image" as const) }));
  const res = await zernio.createPost({
    content: p.caption,
    mediaItems: mediaItems.length ? mediaItems : undefined,
    platforms,
    ...(p.scheduleAt ? { scheduledFor: p.scheduleAt, timezone: p.timezone } : { publishNow: true }),
    metadata: { source: "saypost", businessId: biz.id },
  });
  const post = res.post;
  const links = (post.platforms ?? [])
    .filter((pl) => pl.platformPostUrl)
    .map((pl) => `• ${platformName(pl.platform)}: ${pl.platformPostUrl}`);
  const names = platforms.map((pl) => platformName(pl.platform)).join(", ");
  let summary = p.scheduleAt ? `${s.scheduled(formatLocal(p.scheduleAt, biz.language))} (${names})` : `${s.published} (${names})`;
  if (links.length) summary += "\n" + links.join("\n");
  const failed = (post.platforms ?? []).filter((pl) => pl.status === "failed");
  if (failed.length) summary += "\n" + s.failed(failed.map((f) => `${platformName(f.platform)}: ${f.errorMessage ?? "error"}`).join("; "));
  if (skipped.length) summary += `\n(${biz.language === "en" ? "Skipped" : "Sin publicar en"}: ${skipped.join(", ")}${hasMedia ? "" : biz.language === "en" ? " — they need a photo" : " — necesitan foto"})`;
  return { result: { postId: post._id, status: post.status, platforms: platforms.map((x) => x.platform), links }, summary };
}

function formatLocal(local: string, lang: "es" | "en"): string {
  const d = new Date(local.length <= 19 ? local + "Z" : local);
  if (Number.isNaN(d.getTime())) return local;
  return d.toLocaleString(lang === "en" ? "en-GB" : "es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
