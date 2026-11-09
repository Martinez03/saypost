// Dashboard endpoints. Every /api/* call carries the user's Supabase access token.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureProfile, isPlatform, syncAccounts } from "../accounts.js";
import { approveAction, rejectAction } from "../actions.js";
import { isApprovalMode } from "../approval.js";
import { config } from "../config.js";
import { businessesInWorkspaces, db, getAction, getWorkspace, updateBusiness, userMemberships, userWorkspaceIds, type Business } from "../db.js";
import { hashInviteToken, inviteUrl, isHttpsUrl, newInviteToken } from "../invites.js";
import { canActOn, pickBusiness } from "../scope.js";
import * as zernio from "../zernio.js";

declare module "fastify" {
  interface FastifyRequest {
    /** The business this request acts on (X-Business-Id, or the user's first one). */
    biz?: Business;
    userId?: string;
    workspaceIds?: string[];
    /** Every business in the user's workspaces, oldest first. */
    businesses?: Business[];
  }
}

/** Routes that work before the user has a business. */
const NO_BUSINESS_NEEDED = new Set(["/api/businesses", "/api/workspace"]);
const TONES = new Set(["friendly", "professional", "fun", "elegant"]);

function fail(reply: FastifyReply, status: number, error: string, message?: string) {
  return reply.code(status).send({ error, message: message ?? error });
}

async function auth(req: FastifyRequest, reply: FastifyReply) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return fail(reply, 401, "unauthorized");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return fail(reply, 401, "unauthorized");
  req.userId = data.user.id;
  req.workspaceIds = await userWorkspaceIds(data.user.id);
  req.businesses = await businessesInWorkspaces(req.workspaceIds);
  const scope = pickBusiness(req.businesses, req.headers["x-business-id"]);
  if (scope.ok) req.biz = scope.biz;
  else if (!NO_BUSINESS_NEEDED.has(req.routeOptions.url ?? ""))
    return fail(reply, scope.status, scope.error, scope.status === 404 ? "Create your business first" : "That business is not in your workspace");
}

function text(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agency branding from a request body: `undefined` = not sent, `null` = clear it. */
function brandFields(b: Record<string, unknown>): { ok: true; brand_name?: string | null; logo_url?: string | null } | { ok: false; error: string; message: string } {
  const out: { ok: true; brand_name?: string | null; logo_url?: string | null } = { ok: true };
  if (b.brand_name !== undefined) out.brand_name = text(b.brand_name, 60);
  if (b.logo_url !== undefined) {
    const url = text(b.logo_url, 2048);
    if (url && !isHttpsUrl(url)) return { ok: false, error: "bad_logo_url", message: "The logo must be an https:// link" };
    out.logo_url = url;
  }
  return out;
}

function workspaceJson(ws: { id: string; name: string; kind: string; brand_name: string | null; logo_url: string | null }) {
  return { id: ws.id, name: ws.name, kind: ws.kind, brandName: ws.brand_name, logoUrl: ws.logo_url };
}

function zernioFail(reply: FastifyReply, e: unknown) {
  if (e instanceof zernio.ZernioError) return fail(reply, e.status >= 500 ? 502 : e.status === 401 ? 502 : 400, "zernio_error", e.message);
  throw e;
}

export async function apiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", auth);

  // Businesses in the user's workspaces with a short summary (agency view and switcher).
  app.get("/api/businesses", async (req) => {
    const list = req.businesses!;
    const ids = list.map((b) => b.id);
    const [accounts, pending] = ids.length
      ? await Promise.all([
          db.from("social_accounts").select("business_id").in("business_id", ids).eq("status", "connected"),
          db.from("actions").select("business_id").in("business_id", ids).eq("status", "pending"),
        ])
      : [{ data: [] }, { data: [] }];
    const count = (rows: { business_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.business_id === id).length;
    return {
      businesses: list.map((b) => ({
        id: b.id,
        name: b.name,
        category: b.category,
        city: b.city,
        language: b.language,
        workspaceId: b.workspace_id,
        approvalMode: b.approval_mode,
        whatsappStatus: b.whatsapp_status,
        connectedAccounts: count(accounts.data as { business_id: string }[] | null, b.id),
        pendingActions: count(pending.data as { business_id: string }[] | null, b.id),
      })),
    };
  });

  // A new (client) business in one of the user's workspaces; creates the workspace if they have none.
  app.post<{ Body: Record<string, unknown> }>("/api/businesses", async (req, reply) => {
    const b = req.body ?? {};
    const name = text(b.name, 120);
    if (!name) return fail(reply, 400, "bad_name", "The business needs a name");
    const tone = TONES.has(String(b.tone)) ? String(b.tone) : "friendly";
    const language = b.language === "en" ? "en" : "es";
    const approvalMode = b.approval_mode === undefined ? "owner_whatsapp" : b.approval_mode;
    if (!isApprovalMode(approvalMode)) return fail(reply, 400, "bad_approval_mode");
    let workspaceId = text(b.workspace_id, 64);
    if (workspaceId && !req.workspaceIds!.includes(workspaceId)) return fail(reply, 403, "forbidden_workspace", "That workspace is not yours");
    workspaceId ??= req.workspaceIds![0] ?? null;
    if (!workspaceId) {
      const { data: ws, error } = await db.from("workspaces").insert({ name, created_by: req.userId }).select("id").single();
      if (error) throw new Error(`create workspace: ${error.message}`);
      const { error: e2 } = await db.from("workspace_members").insert({ workspace_id: ws.id, user_id: req.userId, role: "owner" });
      if (e2) throw new Error(`add member: ${e2.message}`);
      workspaceId = ws.id as string;
    }
    const { data, error } = await db
      .from("businesses")
      .insert({
        owner_id: req.userId,
        workspace_id: workspaceId,
        name,
        category: text(b.category, 60),
        city: text(b.city, 120),
        description: text(b.description, 4000),
        tone,
        language,
        timezone: text(b.timezone, 64) ?? "Europe/Madrid",
        approval_mode: approvalMode,
      })
      .select("*")
      .single();
    if (error) return fail(reply, 400, "create_failed", error.message);
    return reply.code(201).send({ business: data });
  });

  // Onboarding: "for your business or are you an agency?". Sets the kind and branding of the user's own
  // workspace (the first one they own), creating it if they have none yet. No business needed.
  app.post<{ Body: Record<string, unknown> }>("/api/workspace", async (req, reply) => {
    const b = req.body ?? {};
    const kind = b.kind;
    if (kind !== "business" && kind !== "agency") return fail(reply, 400, "bad_kind");
    const brand = brandFields({ ...b, brand_name: b.brand_name ?? b.name });
    if (!brand.ok) return fail(reply, 400, brand.error, brand.message);
    if (kind === "agency" && !brand.brand_name) return fail(reply, 400, "bad_name", "The agency needs a name");
    const owned = (await userMemberships(req.userId!)).find((m) => m.role === "owner");
    const patch = { kind, ...(kind === "agency" ? { name: brand.brand_name!, brand_name: brand.brand_name, logo_url: brand.logo_url ?? null } : {}) };
    if (owned) {
      const { data, error } = await db.from("workspaces").update(patch).eq("id", owned.workspace_id).select("*").single();
      if (error) return fail(reply, 400, "update_failed", error.message);
      return { workspace: workspaceJson(data) };
    }
    const { data: ws, error } = await db
      .from("workspaces")
      .insert({ name: brand.brand_name ?? "Saypost", created_by: req.userId, ...patch })
      .select("*")
      .single();
    if (error) return fail(reply, 400, "create_failed", error.message);
    const { error: e2 } = await db.from("workspace_members").insert({ workspace_id: ws.id, user_id: req.userId, role: "owner" });
    if (e2) throw new Error(`add member: ${e2.message}`);
    return reply.code(201).send({ workspace: workspaceJson(ws) });
  });

  // Settings: agency branding (and kind) of the selected business's workspace. Owners only.
  app.patch<{ Body: Record<string, unknown> }>("/api/workspace", async (req, reply) => {
    const biz = req.biz;
    if (!biz) return fail(reply, 404, "no_business");
    const role = (await userMemberships(req.userId!)).find((m) => m.workspace_id === biz.workspace_id)?.role;
    if (role !== "owner") return fail(reply, 403, "forbidden_workspace", "Only the workspace owner can change this");
    const b = req.body ?? {};
    const brand = brandFields(b);
    if (!brand.ok) return fail(reply, 400, brand.error, brand.message);
    const patch: Record<string, unknown> = {};
    if (brand.brand_name !== undefined) patch.brand_name = brand.brand_name;
    if (brand.logo_url !== undefined) patch.logo_url = brand.logo_url;
    if (b.kind !== undefined) {
      if (b.kind !== "business" && b.kind !== "agency") return fail(reply, 400, "bad_kind");
      patch.kind = b.kind;
    }
    if (!Object.keys(patch).length) {
      const ws = await getWorkspace(biz.workspace_id);
      return { workspace: ws ? workspaceJson(ws) : null };
    }
    const { data, error } = await db.from("workspaces").update(patch).eq("id", biz.workspace_id).select("*").single();
    if (error) return fail(reply, 400, "update_failed", error.message);
    return { workspace: workspaceJson(data) };
  });

  // Client invite links for the selected business. The token is returned once, here; only its hash is kept.
  app.post("/api/invites", async (req, reply) => {
    const token = newInviteToken();
    const { data, error } = await db
      .from("invites")
      .insert({ business_id: req.biz!.id, token_hash: hashInviteToken(token), created_by: req.userId })
      .select("id, expires_at")
      .single();
    if (error) throw new Error(`create invite: ${error.message}`);
    return reply.code(201).send({ id: data.id, url: inviteUrl(config.webUrl, token), expiresAt: data.expires_at });
  });

  app.get("/api/invites", async (req) => {
    const { data, error } = await db
      .from("invites")
      .select("id, created_at, expires_at, last_used_at")
      .eq("business_id", req.biz!.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new Error(`list invites: ${error.message}`);
    return {
      invites: (data ?? []).map((r: { id: string; created_at: string; expires_at: string; last_used_at: string | null }) => ({
        id: r.id,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        lastUsedAt: r.last_used_at,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>("/api/invites/:id", async (req, reply) => {
    if (!UUID.test(req.params.id)) return fail(reply, 404, "not_found");
    const { data, error } = await db
      .from("invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("business_id", req.biz!.id)
      .is("revoked_at", null)
      .select("id");
    if (error) throw new Error(`revoke invite: ${error.message}`);
    if (!data?.length) return fail(reply, 404, "not_found");
    return { ok: true };
  });

  app.post<{ Body: { platform?: string } }>("/api/connect", async (req, reply) => {
    const platform = String(req.body?.platform ?? "");
    if (!isPlatform(platform)) return fail(reply, 400, "bad_platform");
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
    // Any business in the user's workspaces, not just the selected one (unified approvals).
    const action = await getAction(req.params.id);
    if (!action || !canActOn(req.businesses!, action.business_id)) return fail(reply, 404, "not_found");
    if (action.status !== "pending") return fail(reply, 409, "already_decided");
    const { row } = await approveAction(action.id, "dashboard");
    return { action: row };
  });

  app.post<{ Params: { id: string } }>("/api/actions/:id/reject", async (req, reply) => {
    const action = await getAction(req.params.id);
    if (!action || !canActOn(req.businesses!, action.business_id)) return fail(reply, 404, "not_found");
    const row = await rejectAction(action.id, "dashboard");
    if (!row) return fail(reply, 409, "already_decided");
    return { action: row };
  });
}
