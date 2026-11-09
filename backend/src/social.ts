// Events from the business's social accounts (Zernio webhooks + polling) → proposals for the owner.
import { createAction, deliverProposals, type ReplyCommentPayload, type ReplyDmPayload, type ReplyReviewPayload } from "./actions.js";
import { draftReply } from "./agent/drafts.js";
import { syncAccounts } from "./accounts.js";
import { addEvent, db, getBusiness, getBusinessByProfile, markSeen, upsertAccount, type Business } from "./db.js";
import { handleOwnerMessage, type InboxMessageEvent } from "./inbound.js";
import { platformName, stars, t } from "./i18n.js";
import { sendToOwner } from "./whatsapp.js";
import * as zernio from "./zernio.js";

/** Zernio webhook events handled by dispatch(). scripts/setup-zernio-webhook.mjs subscribes to exactly these. */
export const WEBHOOK_EVENTS = [
  "message.received",
  "review.new",
  "comment.received",
  "account.connected",
  "account.disconnected",
  "post.published",
  "post.partial",
  "post.failed",
] as const;

interface Base {
  id: string;
  event: string;
  profiles?: { id: string; externalId: string | null }[];
}

async function businessFor(ev: Base, profileId?: string): Promise<Business | null> {
  const ext = ev.profiles?.find((p) => p.externalId)?.externalId;
  if (ext) {
    const b = await getBusiness(ext).catch(() => null);
    if (b) return b;
  }
  const pid = profileId ?? ev.profiles?.[0]?.id;
  return pid ? getBusinessByProfile(pid) : null;
}

export async function dispatch(ev: Base & Record<string, unknown>): Promise<void> {
  switch (ev.event) {
    case "message.received": {
      const m = ev as unknown as Base & InboxMessageEvent;
      if (m.account.platform === "whatsapp") return handleOwnerMessage(m);
      return onDm(ev, m);
    }
    case "review.new":
      return onReview(ev, (ev as unknown as { review: ReviewEv }).review, (ev as unknown as { account?: { id?: string; accountId?: string } }).account);
    case "comment.received":
      return onComment(ev, ev as unknown as CommentEv);
    case "account.connected":
      return onAccountConnected(ev, (ev as unknown as { account: AccountEv }).account);
    case "account.disconnected": {
      const acc = (ev as unknown as { account?: { accountId?: string; id?: string } }).account;
      const id = acc?.accountId ?? acc?.id;
      if (id) await db.from("social_accounts").update({ status: "disconnected" }).eq("zernio_account_id", id);
      return;
    }
    case "post.published":
    case "post.partial":
    case "post.failed":
      return onPost(ev);
    default:
      return;
  }
}

// ------------------------------------------------------------------ reviews
interface ReviewEv {
  id: string;
  platform: string;
  rating?: number;
  text?: string;
  reviewer?: { name?: string };
  hasReply?: boolean;
  recommendationType?: string | null;
}

export async function onReview(ev: Base | null, review: ReviewEv, account?: { id?: string; accountId?: string }, bizIn?: Business): Promise<void> {
  const biz = bizIn ?? (ev ? await businessFor(ev) : null);
  if (!biz || review.hasReply) return;
  if (!(await markSeen(`review:${review.id}`, biz.id))) return;
  const accountId = account?.accountId ?? account?.id;
  if (!accountId) return;
  const s = t(biz.language);
  const who = review.reviewer?.name ?? "?";
  await addEvent(biz.id, "review.new", `${who} ${stars(review.rating, review.recommendationType)} · ${platformName(review.platform)}`, {
    text: review.text ?? "",
    rating: review.rating ?? null,
    platform: review.platform,
  });
  if (!biz.notify_reviews) return;
  const reply = await draftReply(biz, "review", { author: who, rating: review.rating ?? null, text: review.text ?? "", platform: review.platform });
  const payload: ReplyReviewPayload = { reviewId: review.id, accountId, platform: review.platform, message: reply };
  const action = await createAction(biz, {
    kind: "reply_review",
    title: `${biz.language === "en" ? "Reply to review by" : "Respuesta a la reseña de"} ${who}`,
    preview: reply,
    payload,
    context: { platform: review.platform, author: who, rating: review.rating ?? null, text: review.text ?? "" },
    source: "webhook",
    supersede: (p) => p.kind === "reply_review" && (p.payload as { reviewId?: string }).reviewId === review.id,
  });
  const intro = `${s.newReview(who, stars(review.rating, review.recommendationType), platformName(review.platform), (review.text ?? "").slice(0, 600))}\n\n${s.proposedReply(reply)}`;
  await deliverProposals(biz, [action], intro);
}

// ------------------------------------------------------------------ comments
interface CommentEv extends Base {
  comment: {
    id: string;
    postId: string | null;
    platformPostId: string;
    platform: string;
    text: string;
    author: { id?: string; username?: string; name?: string; isOwnAccount?: boolean };
  };
  post?: { content?: string | null; permalink?: string | null };
  account: { id: string; accountId?: string; platform: string; username: string };
}

async function onComment(ev: Base, c: CommentEv): Promise<void> {
  if (c.comment.author?.isOwnAccount) return;
  const biz = await businessFor(ev);
  if (!biz) return;
  if (!(await markSeen(`comment:${c.comment.id}`, biz.id))) return;
  const who = c.comment.author?.username ? `@${c.comment.author.username}` : c.comment.author?.name ?? "?";
  await addEvent(biz.id, "comment.received", `${who} · ${platformName(c.comment.platform)}`, { text: c.comment.text, permalink: c.post?.permalink ?? null });
  if (!biz.notify_comments) return;
  const reply = await draftReply(biz, "comment", { author: who, text: c.comment.text, postText: c.post?.content ?? null, platform: c.comment.platform });
  const payload: ReplyCommentPayload = {
    postId: c.comment.postId ?? c.comment.platformPostId,
    commentId: c.comment.id,
    accountId: c.account.accountId ?? c.account.id,
    platform: c.comment.platform,
    message: reply,
  };
  const action = await createAction(biz, {
    kind: "reply_comment",
    title: `${biz.language === "en" ? "Reply to" : "Responder a"} ${who} (${platformName(c.comment.platform)})`,
    preview: reply,
    payload,
    context: { platform: c.comment.platform, author: who, text: c.comment.text, post: c.post?.content?.slice(0, 200) ?? null, url: c.post?.permalink ?? null },
    source: "webhook",
    supersede: (p) => p.kind === "reply_comment" && (p.payload as { commentId?: string }).commentId === c.comment.id,
  });
  const s = t(biz.language);
  await deliverProposals(biz, [action], `${s.newComment(who, platformName(c.comment.platform), c.comment.text.slice(0, 500))}\n\n${s.proposedReply(reply)}`);
}

// ------------------------------------------------------------------ DMs (Instagram / Facebook…)
async function onDm(ev: Base, m: InboxMessageEvent): Promise<void> {
  if (m.message.direction !== "incoming") return;
  const biz = await businessFor(ev, m.account.profileId);
  if (!biz) return;
  if (!(await markSeen(`dm:${m.message.id}`, biz.id))) return;
  const text = (m.message.text ?? "").trim();
  if (!text) return;
  const who = m.message.sender.username ? `@${m.message.sender.username}` : m.message.sender.name ?? m.conversation.participantName ?? "?";
  await addEvent(biz.id, "dm.received", `${who} · ${platformName(m.account.platform)}`, { text: text.slice(0, 300) });
  if (!biz.notify_dms) return;
  const reply = await draftReply(biz, "dm", { author: who, text, platform: m.account.platform });
  const payload: ReplyDmPayload = { conversationId: m.conversation.id, accountId: m.account.accountId ?? m.account.id, platform: m.account.platform, message: reply };
  const action = await createAction(biz, {
    kind: "reply_dm",
    title: `${biz.language === "en" ? "Reply to DM from" : "Responder el DM de"} ${who}`,
    preview: reply,
    payload,
    context: { platform: m.account.platform, author: who, text },
    source: "webhook",
    supersede: (p) => p.kind === "reply_dm" && (p.payload as { conversationId?: string }).conversationId === m.conversation.id,
  });
  const s = t(biz.language);
  await deliverProposals(biz, [action], `${s.newDm(who, platformName(m.account.platform), text.slice(0, 500))}\n\n${s.proposedReply(reply)}`);
}

// ------------------------------------------------------------------ accounts & posts
interface AccountEv {
  accountId: string;
  profileId: string;
  platform: string;
  username: string;
  displayName?: string;
}

async function onAccountConnected(ev: Base, a: AccountEv): Promise<void> {
  const biz = await businessFor(ev, a.profileId);
  if (!biz) return;
  // The webhook carries no picture: sync the profile's accounts from Zernio so the dashboard gets the
  // avatar (and a sync that already ran is not overwritten with a null picture).
  try {
    await syncAccounts(biz);
  } catch (e) {
    console.error("[account.connected] sync failed, storing the webhook data only:", e instanceof Error ? e.message : e);
    await upsertAccount({
      business_id: biz.id,
      zernio_account_id: a.accountId,
      platform: a.platform,
      username: a.username ?? null,
      display_name: a.displayName ?? null,
      profile_picture: null,
      status: "connected",
    });
  }
  await addEvent(biz.id, "account.connected", `${platformName(a.platform)} ${a.username ? "@" + a.username : ""}`.trim());
  await sendToOwner(biz, t(biz.language).accountConnected(platformName(a.platform), a.username ? `@${a.username}` : ""));
}

async function onPost(ev: Base & Record<string, unknown>): Promise<void> {
  const post = (ev as unknown as { post?: { id?: string; _id?: string; content?: string; platforms?: { platform: string; status?: string; publishedUrl?: string; platformPostUrl?: string; error?: string }[]; metadata?: { businessId?: string } } }).post;
  const bizId = post?.metadata?.businessId;
  const biz = bizId ? await getBusiness(bizId) : await businessFor(ev);
  if (!biz || !post) return;
  const title = (post.content ?? "").slice(0, 80) || "Post";
  await addEvent(biz.id, ev.event, title, { postId: post.id ?? post._id, platforms: post.platforms ?? [] });
  if (ev.event === "post.failed" || ev.event === "post.partial") {
    const failed = (post.platforms ?? []).filter((p) => p.status === "failed").map((p) => platformName(p.platform));
    if (failed.length) await sendToOwner(biz, t(biz.language).postFailed(failed.join(", ")));
  }
}

// ------------------------------------------------------------------ Facebook reviews have no webhook: poll them
export async function pollReviews(): Promise<void> {
  const { data } = await db.from("social_accounts").select("business_id, zernio_account_id, created_at").eq("platform", "facebook").eq("status", "connected");
  for (const row of (data ?? []) as { business_id: string; zernio_account_id: string; created_at: string }[]) {
    const biz = await getBusiness(row.business_id);
    if (!biz?.zernio_profile_id) continue;
    try {
      const { reviews } = await zernio.listReviews(biz.zernio_profile_id, { hasReply: false, limit: 20 });
      for (const r of reviews) {
        if (r.platform !== "facebook" || r.accountId !== row.zernio_account_id) continue;
        // Only reviews written after the page was connected (avoid flooding with old ones).
        if (r.created && new Date(r.created) < new Date(row.created_at)) continue;
        await onReview(null, { id: r.id, platform: r.platform, rating: r.rating, text: r.text, reviewer: r.reviewer, hasReply: r.hasReply, recommendationType: r.recommendationType }, { id: r.accountId }, biz);
      }
    } catch (e) {
      console.error(`[poll] reviews for ${biz.id}:`, e instanceof Error ? e.message : e);
    }
  }
}
