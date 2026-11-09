// Agent tools. Read tools run immediately; propose_* / revise_reply only create pending actions.
import type Anthropic from "@anthropic-ai/sdk";
import { proposalDelivery } from "../approval.js";
import { createAction, type PublishPayload, type ReplyCommentPayload, type ReplyReviewPayload } from "../actions.js";
import { getAction, listAccounts, updateBusiness, type ActionRow, type Business } from "../db.js";
import { platformName, stars } from "../i18n.js";
import * as zernio from "../zernio.js";

type Tool = Anthropic.Beta.BetaTool;

const str = (description: string) => ({ type: "string", description });

/** What the model is told after proposing, so it does not ask a client to confirm in agency mode. */
function whoApproves(biz: Business): string {
  return proposalDelivery(biz.approval_mode, "whatsapp") === "buttons"
    ? "the owner now sees the preview with Yes/No buttons."
    : "their agency reviews it in the dashboard and the system already told the owner so. Do not ask the owner to confirm.";
}

export const TOOLS: Tool[] = [
  {
    name: "propose_post",
    description:
      "Prepare a post for the owner's approval (it is NOT published until they say yes). Replaces any post proposal already waiting. One entry in `targets` per connected account to publish on, each with text adapted to that platform.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        summary: str("One short line describing the post for lists, in the owner's language, e.g. 'Menú del día a 12 € (IG, FB, Google)'."),
        caption: str("The main version of the text (used as default)."),
        targets: {
          type: "array",
          description: "Accounts to publish on, with the adapted text for each.",
          items: {
            type: "object",
            properties: {
              account_id: str("account_id from <connected_accounts>."),
              text: str("Final text for this platform."),
            },
            required: ["account_id", "text"],
            additionalProperties: false,
          },
        },
        media_urls: { type: "array", items: { type: "string" }, description: "Exact [photo]/[video] URLs from the conversation, or empty." },
        schedule_at: { type: ["string", "null"], description: "Local datetime 'YYYY-MM-DDTHH:MM' in the business timezone, or null to publish right after approval." },
      },
      required: ["summary", "caption", "targets", "media_urls", "schedule_at"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_review_reply",
    description: "Prepare a reply to a review (Google Business or Facebook) for the owner's approval. Use review ids from list_reviews.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        review_id: str("Review id from list_reviews."),
        account_id: str("account_id of the review (from list_reviews)."),
        reply: str("The reply text."),
      },
      required: ["review_id", "account_id", "reply"],
      additionalProperties: false,
    },
  },
  {
    name: "revise_reply",
    description:
      "Change the text of a reply (to a review, comment or DM) that is waiting for the owner's approval. Use the id from <waiting_for_owner_approval>. Creates a new proposal that replaces the old one.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { action_id: str("Id of the waiting reply."), reply: str("New reply text.") },
      required: ["action_id", "reply"],
      additionalProperties: false,
    },
  },
  {
    name: "propose_cancel_post",
    description: "Prepare the cancellation of a scheduled (not yet published) post, for the owner's approval. Use post ids from list_posts.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { post_id: str("Post id from list_posts."), summary: str("One line: which post.") },
      required: ["post_id", "summary"],
      additionalProperties: false,
    },
  },
  {
    name: "remember",
    description: "Save a lasting fact or preference about the business that the owner told you (hours, menu, style rules). Runs immediately.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { fact: str("The fact, one short sentence.") },
      required: ["fact"],
      additionalProperties: false,
    },
  },
  {
    name: "list_posts",
    description: "Recent and scheduled posts made through Saypost, with status, time, platforms and links.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "list_reviews",
    description: "Recent reviews on Google Business and Facebook, with rating, text and whether they were answered.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { only_unanswered: { type: "boolean", description: "Only reviews without a reply." } },
      required: ["only_unanswered"],
      additionalProperties: false,
    },
  },
  {
    name: "get_stats",
    description: "Performance of the business's posts over the last N days: reach, likes, comments, best post, plus review summary.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { days: { type: "integer", description: "Days to look back (1-90)." } },
      required: ["days"],
      additionalProperties: false,
    },
  },
];

export interface ToolRun {
  content: string;
  isError?: boolean;
  /** Pending actions this call created; the caller sends their previews to the owner. */
  created?: ActionRow[];
}

function ensureProfile(biz: Business): string {
  if (!biz.zernio_profile_id) throw new Error("No social accounts connected yet.");
  return biz.zernio_profile_id;
}

export async function runTool(biz: Business, name: string, input: Record<string, unknown>): Promise<ToolRun> {
  switch (name) {
    case "propose_post": {
      const accounts = await listAccounts(biz.id);
      const byId = new Map(accounts.map((a) => [a.zernio_account_id, a]));
      const targetsIn = (input.targets as { account_id: string; text: string }[]) ?? [];
      const unknown = targetsIn.filter((tg) => !byId.has(tg.account_id));
      if (unknown.length) return { content: `Unknown account_id: ${unknown.map((u) => u.account_id).join(", ")}. Use ids from <connected_accounts>.`, isError: true };
      if (!targetsIn.length) return { content: "No targets. Pick at least one connected account.", isError: true };
      const mediaUrls = ((input.media_urls as string[]) ?? []).filter((u) => /^https:\/\//.test(u));
      const scheduleAt = (input.schedule_at as string | null) ?? null;
      if (scheduleAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduleAt)) return { content: "schedule_at must be 'YYYY-MM-DDTHH:MM' or null.", isError: true };
      const payload: PublishPayload = {
        targets: targetsIn.map((tg) => ({ platform: byId.get(tg.account_id)!.platform, accountId: tg.account_id, text: tg.text })),
        caption: String(input.caption ?? ""),
        mediaUrls,
        scheduleAt,
        timezone: biz.timezone,
      };
      const preview = renderPublishPreview(biz, payload);
      const action = await createAction(biz, {
        kind: "publish",
        title: String(input.summary ?? "Post"),
        preview,
        payload,
        context: mediaUrls.length ? { mediaUrls } : null,
        source: "whatsapp",
        supersede: (p) => p.kind === "publish",
      });
      return { content: `Proposal ${action.id} created; ${whoApproves(biz)} Reply with one short line only.`, created: [action] };
    }
    case "propose_review_reply": {
      const profileId = ensureProfile(biz);
      const { reviews } = await zernio.listReviews(profileId, { limit: 50 });
      const review = reviews.find((r) => r.id === input.review_id);
      if (!review) return { content: "Review not found. Call list_reviews first and use its id.", isError: true };
      const payload: ReplyReviewPayload = { reviewId: review.id, accountId: review.accountId, platform: review.platform, message: String(input.reply) };
      const action = await createAction(biz, {
        kind: "reply_review",
        title: `${biz.language === "en" ? "Reply to review by" : "Respuesta a la reseña de"} ${review.reviewer?.name ?? "?"}`,
        preview: payload.message,
        payload,
        context: { platform: review.platform, author: review.reviewer?.name, rating: review.rating ?? null, text: review.text ?? "", url: review.reviewUrl ?? null },
        source: "whatsapp",
        supersede: (p) => p.kind === "reply_review" && (p.payload as { reviewId?: string }).reviewId === review.id,
      });
      return { content: `Proposal ${action.id} created; ${whoApproves(biz)}`, created: [action] };
    }
    case "revise_reply": {
      const old = await getAction(String(input.action_id));
      if (!old || old.business_id !== biz.id || old.status !== "pending" || !["reply_review", "reply_comment", "reply_dm"].includes(old.kind)) {
        return { content: "That reply is not waiting for approval. Check <waiting_for_owner_approval>.", isError: true };
      }
      const payload = { ...(old.payload as Record<string, unknown>), message: String(input.reply) } as ReplyReviewPayload | ReplyCommentPayload;
      const action = await createAction(biz, {
        kind: old.kind,
        title: old.title,
        preview: String(input.reply),
        payload,
        context: old.context,
        source: "whatsapp",
        supersede: (p) => p.id === old.id,
      });
      return { content: `Revised proposal ${action.id} created; ${whoApproves(biz)}`, created: [action] };
    }
    case "propose_cancel_post": {
      const postId = String(input.post_id);
      const action = await createAction(biz, {
        kind: "cancel_post",
        title: `${biz.language === "en" ? "Cancel" : "Cancelar"}: ${String(input.summary)}`,
        preview: String(input.summary),
        payload: { postId },
        source: "whatsapp",
        supersede: (p) => p.kind === "cancel_post" && (p.payload as { postId?: string }).postId === postId,
      });
      return { content: `Proposal ${action.id} created.`, created: [action] };
    }
    case "remember": {
      const fact = String(input.fact).trim().slice(0, 300);
      const notes = [biz.notes?.trim(), `- ${fact}`].filter(Boolean).join("\n").slice(-4000);
      await updateBusiness(biz.id, { notes });
      biz.notes = notes;
      return { content: "Saved." };
    }
    case "list_posts": {
      const profileId = ensureProfile(biz);
      const posts = await zernio.listPosts(profileId, 15);
      if (!posts.length) return { content: "No posts yet." };
      return {
        content: posts
          .map((p) => {
            const pls = (p.platforms ?? []).map((pl) => `${platformName(pl.platform)}:${pl.status ?? p.status}${pl.platformPostUrl ? ` ${pl.platformPostUrl}` : ""}`).join(", ");
            return `- id ${p._id} · ${p.status} · ${p.publishedAt ?? p.scheduledFor ?? p.createdAt ?? ""} · [${pls}] · "${(p.content ?? "").slice(0, 120)}"`;
          })
          .join("\n"),
      };
    }
    case "list_reviews": {
      const profileId = ensureProfile(biz);
      const { reviews, averageRating, total } = await zernio.listReviews(profileId, { hasReply: input.only_unanswered ? false : undefined, limit: 15 });
      if (!reviews.length) return { content: "No reviews found (reviews come from Google Business and Facebook pages)." };
      const lines = reviews.map(
        (r) =>
          `- review_id ${r.id} · account_id ${r.accountId} · ${platformName(r.platform)} · ${stars(r.rating, r.recommendationType)} · ${r.reviewer?.name ?? "?"} · ${r.created ?? ""} · ${r.hasReply ? "answered" : "NOT answered"}\n  <untrusted_review_text>${(r.text ?? "").slice(0, 400)}</untrusted_review_text>`,
      );
      return { content: `Average rating: ${averageRating ?? "n/a"} · total: ${total ?? "n/a"}\n${lines.join("\n")}` };
    }
    case "get_stats": {
      const profileId = ensureProfile(biz);
      const days = Math.max(1, Math.min(90, Number(input.days) || 7));
      const to = new Date();
      const from = new Date(to.getTime() - days * 86400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const [an, rv] = await Promise.allSettled([zernio.analytics(profileId, iso(from), iso(to)), zernio.listReviews(profileId, { limit: 50 })]);
      const out: string[] = [`Period: last ${days} days`];
      if (an.status === "fulfilled") {
        const posts = an.value.posts ?? [];
        const sum = (k: "impressions" | "reach" | "likes" | "comments" | "shares" | "views") => posts.reduce((n, p) => n + (p.analytics?.[k] ?? 0), 0);
        out.push(`Posts published: ${posts.length}`);
        out.push(`Impressions ${sum("impressions")}, reach ${sum("reach")}, views ${sum("views")}, likes ${sum("likes")}, comments ${sum("comments")}, shares ${sum("shares")}`);
        const best = [...posts].sort((a, b) => (b.analytics?.reach ?? 0) + (b.analytics?.likes ?? 0) - ((a.analytics?.reach ?? 0) + (a.analytics?.likes ?? 0)))[0];
        if (best) out.push(`Best post: "${(best.content ?? "").slice(0, 80)}" on ${platformName(best.platform ?? "")} (reach ${best.analytics?.reach ?? 0}, likes ${best.analytics?.likes ?? 0})`);
        out.push("Note: metrics of very recent posts can take a few hours to sync.");
      } else out.push(`Post analytics unavailable: ${String(an.reason).slice(0, 120)}`);
      if (rv.status === "fulfilled") {
        const unanswered = rv.value.reviews.filter((r) => !r.hasReply).length;
        out.push(`Reviews: average ${rv.value.averageRating ?? "n/a"}, total ${rv.value.total ?? rv.value.reviews.length}, unanswered ${unanswered}`);
      }
      return { content: out.join("\n") };
    }
    default:
      return { content: `Unknown tool ${name}`, isError: true };
  }
}

export function renderPublishPreview(biz: Business, p: PublishPayload): string {
  const en = biz.language === "en";
  const groups = new Map<string, string[]>();
  for (const tg of p.targets) {
    const list = groups.get(tg.text) ?? [];
    list.push(platformName(tg.platform));
    groups.set(tg.text, list);
  }
  const parts: string[] = [];
  for (const [text, names] of groups) parts.push(`*${names.join(" + ")}*\n${text}`);
  const when = p.scheduleAt ? `🗓️ ${p.scheduleAt.replace("T", " ")}` : en ? "⚡ Right after your OK" : "⚡ Nada más digas que sí";
  const media = p.mediaUrls.length ? (en ? `📷 ${p.mediaUrls.length} photo/video` : `📷 ${p.mediaUrls.length} foto/vídeo`) : "";
  return [`📝 ${en ? "Post proposal" : "Propuesta de post"}`, ...parts, [when, media].filter(Boolean).join(" · ")].join("\n\n");
}
