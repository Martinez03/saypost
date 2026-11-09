// Dashboard endpoints. Every /api/* call carries the user's Supabase access token.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { approveAction, rejectAction } from "../actions.js";
import { config } from "../config.js";
import { db, getAction, getBusinessByOwner, updateBusiness, upsertAccount, type Business } from "../db.js";
import * as zernio from "../zernio.js";

const PLATFORMS = new Set(["instagram", "facebook", "googlebusiness", "linkedin", "tiktok", "twitter", "threads", "bluesky", "youtube", "pinterest"]);

declare module "fastify" {
  interface FastifyRequest {
    biz?: Business;
  }
}

function fail(reply: FastifyReply, status: number, error: string, message?: string) {
  return reply.code(status).send({ error, message: message ?? error });
}

async function auth(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return fail(reply, 401, "unauthorized");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return fail(reply, 401, "unauthorized");
  const biz = await getBusinessByOwner(data.user.id);
  if (!biz) return fail(reply, 404, "no_business", "Create your business first");
  req.biz = biz;
}

async function ensureProfile(biz: Business): Promise<string> {
  if (biz.zernio_profile_id) return biz.zernio_profile_id;
  const existing = await zernio.findProfileByExternalId(biz.id).catch(() => null);
  const profile = existing ?? (await zernio.createProfile(`${biz.name} · ${biz.id.slice(0, 6)}`, biz.id, biz.timezone));
  await updateBusiness(biz.id, { zernio_profile_id: profile._id });
  biz.zernio_profile_id = profile._id;
  return profile._id;
}

async function syncAccounts(biz: Business) {
  const profileId = await ensureProfile(biz);
  const remote = await zernio.listAccounts(profileId);
  const seen = new Set<string>();
  for (const a of remote) {
    seen.add(a._id);
    await upsertAccount({
      business_id: biz.id,
      zernio_account_id: a._id,
      platform: a.platform,
      username: a.username ?? null,
      display_name: a.displayName ?? null,
      profile_picture: a.profilePicture ?? null,
      status: a.isActive === false ? "disconnected" : "connected",
    });
  }
  const { data: local } = await db.from("social_accounts").select("id, zernio_account_id").eq("business_id", biz.id).eq("status", "connected");
  const gone = (local ?? []).filter((l: { zernio_account_id: string }) => !seen.has(l.zernio_account_id)).map((l: { id: string }) => l.id);
  if (gone.length) await db.from("social_accounts").update({ status: "disconnected" }).in("id", gone);
  const { data } = await db.from("social_accounts").select("*").eq("business_id", biz.id).order("created_at");
  return data ?? [];
}

function zernioFail(reply: FastifyReply, e: unknown) {
  if (e instanceof zernio.ZernioError) return fail(reply, e.status >= 500 ? 502 : e.status === 401 ? 502 : 400, "zernio_error", e.message);
  throw e;
}

export async function apiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", auth);

  app.post<{ Body: { platform?: string } }>("/api/connect", async (req, reply) => {
    const platform = String(req.body?.platform ?? "");
    if (!PLATFORMS.has(platform)) return fail(reply, 400, "bad_platform");
    try {
      const profileId = await ensureProfile(req.biz!);
      const authUrl = await zernio.connectUrl(platform, profileId, `${config.webUrl}/app/accounts?connected=${platform}`);
      return { authUrl };
    } catch (e) {
      return zernioFail(reply, e);
    }
  });

  app.post("/api/accounts/sync", async (req, reply) => {
    try {
      return { accounts: await syncAccounts(req.biz!) };
    } catch (e) {
      return zernioFail(reply, e);
    }
  });

  app.delete<{ Params: { id: string } }>("/api/accounts/:id", async (req, reply) => {
    const { data: acc } = await db.from("social_accounts").select("*").eq("id", req.params.id).eq("business_id", req.biz!.id).maybeSingle();
    if (!acc) return fail(reply, 404, "not_found");
    try {
      await zernio.deleteAccount(acc.zernio_account_id);
    } catch (e) {
      if (!(e instanceof zernio.ZernioError && e.status === 404)) return zernioFail(reply, e);
    }
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", acc.id);
    return { ok: true };
  });

  app.post<{ Body: { phone?: string } }>("/api/whatsapp/activate", async (req, reply) => {
    const phone = String(req.body?.phone ?? "").replace(/\D/g, "");
    if (phone.length < 8 || phone.length > 15) return fail(reply, 400, "bad_phone", "Use international format, e.g. +34 600 000 000");
    const biz = req.biz!;
    const { data: other } = await db.from("businesses").select("id").eq("owner_phone", phone).neq("id", biz.id).maybeSingle();
    if (other) return fail(reply, 409, "phone_in_use", "That number is already linked to another business");
    try {
      const r = await zernio.sandboxStart(phone);
      const changed = biz.owner_phone !== phone;
      await updateBusiness(biz.id, {
        owner_phone: phone,
        whatsapp_status: changed || biz.whatsapp_status === "inactive" ? "pending" : biz.whatsapp_status,
        ...(changed ? { whatsapp_conversation_id: null, whatsapp_account_id: null } : {}),
      });
      return { status: changed || biz.whatsapp_status === "inactive" ? "pending" : biz.whatsapp_status, sandboxNumber: r.sandboxNumber, phone };
    } catch (e) {
      return zernioFail(reply, e);
    }
  });

  app.get("/api/whatsapp/status", async (req) => {
    const biz = req.biz!;
    let sandboxNumber: string | null = null;
    let sessionActive = false;
    try {
      const r = await zernio.sandboxSessions();
      sandboxNumber = r.sandboxNumber;
      sessionActive = !!r.sessions.find((s) => s.phoneE164 === biz.owner_phone && s.status === "active");
    } catch (e) {
      console.error("[api] sandbox sessions:", e instanceof Error ? e.message : e);
    }
    return { status: biz.whatsapp_status, sandboxNumber, phone: biz.owner_phone, sessionActive };
  });

  app.get("/api/posts", async (req, reply) => {
    const biz = req.biz!;
    if (!biz.zernio_profile_id) return { posts: [] };
    try {
      const posts = await zernio.listPosts(biz.zernio_profile_id, 30);
      return {
        posts: posts.map((p) => ({
          id: p._id,
          content: p.content ?? "",
          status: p.status,
          scheduledFor: p.scheduledFor ?? null,
          publishedAt: p.publishedAt ?? p.platforms?.find((x) => x.publishedAt)?.publishedAt ?? null,
          createdAt: p.createdAt ?? null,
          platforms: (p.platforms ?? []).map((x) => ({ platform: x.platform, status: x.status ?? p.status, url: x.platformPostUrl ?? null, error: x.errorMessage ?? null })),
          mediaUrl: p.mediaItems?.[0]?.thumbnail ?? p.mediaItems?.[0]?.url ?? null,
        })),
      };
    } catch (e) {
      return zernioFail(reply, e);
    }
  });

  app.get("/api/stats", async (req) => {
    const biz = req.biz!;
    const [{ count: accounts }, { count: pendingActions }] = await Promise.all([
      db.from("social_accounts").select("id", { count: "exact", head: true }).eq("business_id", biz.id).eq("status", "connected"),
      db.from("actions").select("id", { count: "exact", head: true }).eq("business_id", biz.id).eq("status", "pending"),
    ]);
    let postsLast7d: number | null = null;
    let reviews: { total: number | null; unanswered: number | null; averageRating: number | null } | null = null;
    if (biz.zernio_profile_id) {
      const since = Date.now() - 7 * 86400_000;
      const [posts, rv] = await Promise.allSettled([zernio.listPosts(biz.zernio_profile_id, 50), zernio.listReviews(biz.zernio_profile_id, { limit: 50 })]);
      if (posts.status === "fulfilled")
        postsLast7d = posts.value.filter((p) => p.status === "published" && new Date(p.publishedAt ?? p.createdAt ?? 0).getTime() >= since).length;
      if (rv.status === "fulfilled")
        reviews = { total: rv.value.total ?? rv.value.reviews.length, unanswered: rv.value.reviews.filter((r) => !r.hasReply).length, averageRating: rv.value.averageRating };
    }
    return { accounts: accounts ?? 0, postsLast7d, pendingActions: pendingActions ?? 0, reviews };
  });

  app.post<{ Params: { id: string } }>("/api/actions/:id/approve", async (req, reply) => {
    const action = await getAction(req.params.id);
    if (!action || action.business_id !== req.biz!.id) return fail(reply, 404, "not_found");
    if (action.status !== "pending") return fail(reply, 409, "already_decided");
    const { row } = await approveAction(action.id, "dashboard");
    return { action: row };
  });

  app.post<{ Params: { id: string } }>("/api/actions/:id/reject", async (req, reply) => {
    const action = await getAction(req.params.id);
    if (!action || action.business_id !== req.biz!.id) return fail(reply, 404, "not_found");
    const row = await rejectAction(action.id, "dashboard");
    if (!row) return fail(reply, 409, "already_decided");
    return { action: row };
  });
}
