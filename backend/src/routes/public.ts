// Public, token-gated endpoints for the client invite page (/invite/<token> on the web). No session:
// the token is the only key. Invalid, expired and revoked tokens all get the same bare 404.
// Dependencies are injected so the tests can check what an anonymous visitor can and cannot see.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureProfile, isPlatform, syncAccounts } from "../accounts.js";
import { config } from "../config.js";
import { addEvent, db, getBusiness, getWorkspace, markSeen, type Business, type SocialAccount } from "../db.js";
import { platformName, t } from "../i18n.js";
import {
  createRateLimiter,
  hashInviteToken,
  inviteReturnUrl,
  inviteState,
  isInviteTokenShaped,
  publicInviteView,
  publicPlatforms,
  welcomeParams,
  type InviteRow,
  type WorkspaceBrand,
} from "../invites.js";
import * as zernio from "../zernio.js";

export interface PublicDeps {
  webUrl: string;
  findInviteByHash(hash: string): Promise<InviteRow | null>;
  getBusiness(id: string): Promise<Business | null>;
  getBrand(workspaceId: string): Promise<WorkspaceBrand | null>;
  /** Every social_accounts row of the business (connected or not). */
  listAccounts(businessId: string): Promise<SocialAccount[]>;
  touchInvite(id: string): Promise<void>;
  connectUrl(biz: Business, platform: string, redirectUrl: string, brand: WorkspaceBrand | null): Promise<string>;
  syncAccounts(biz: Business): Promise<SocialAccount[]>;
  /** Adds "your client connected X from the invite" to the activity feed, once per account. */
  inviteConnected(biz: Business, accounts: SocialAccount[], platform: string, accountId: string | null): Promise<void>;
  limiter: ReturnType<typeof createRateLimiter>;
}

/** An account counts as "just connected from the invite" if Zernio named it on the way back, or it is new. */
export function justConnected(accounts: SocialAccount[], platform: string, accountId: string | null, now = Date.now()): SocialAccount[] {
  const live = accounts.filter((a) => a.platform === platform && a.status === "connected");
  if (accountId) return live.filter((a) => a.zernio_account_id === accountId);
  return live.filter((a) => a.created_at && now - new Date(a.created_at).getTime() < 60 * 60_000);
}

export function defaultPublicDeps(): PublicDeps {
  return {
    webUrl: config.webUrl,
    async findInviteByHash(hash) {
      const { data, error } = await db.from("invites").select("*").eq("token_hash", hash).maybeSingle();
      if (error) throw new Error(`findInvite: ${error.message}`);
      return data as InviteRow | null;
    },
    getBusiness,
    async getBrand(workspaceId) {
      const ws = await getWorkspace(workspaceId);
      return ws ? { brand_name: ws.brand_name, logo_url: ws.logo_url } : null;
    },
    async listAccounts(businessId) {
      const { data, error } = await db.from("social_accounts").select("*").eq("business_id", businessId).order("created_at");
      if (error) throw new Error(`listAccounts: ${error.message}`);
      return (data ?? []) as SocialAccount[];
    },
    async touchInvite(id) {
      const { error } = await db.from("invites").update({ last_used_at: new Date().toISOString() }).eq("id", id);
      if (error) console.error("[invite] touch:", error.message);
    },
    async connectUrl(biz, platform, redirectUrl, brand) {
      const profileId = await ensureProfile(biz);
      try {
        return await zernio.connectUrl(platform, profileId, redirectUrl, welcomeParams(brand));
      } catch (e) {
        // The welcome screen is a nicety: if Zernio refuses its parameters (say, the logo), connect without it.
        if (e instanceof zernio.ZernioError && e.status === 400) return zernio.connectUrl(platform, profileId, redirectUrl);
        throw e;
      }
    },
    syncAccounts,
    async inviteConnected(biz, accounts, platform, accountId) {
      for (const a of justConnected(accounts, platform, accountId)) {
        if (!(await markSeen(`invite-connected:${a.zernio_account_id}`, biz.id))) continue;
        const user = a.username ? `@${a.username.replace(/^@/, "")}` : "";
        await addEvent(biz.id, "invite.connected", t(biz.language).evInviteConnected(platformName(a.platform), user), { platform: a.platform, username: a.username });
      }
    },
    // 40 requests a minute per IP is plenty for a person on the page and slows down token guessing.
    limiter: createRateLimiter({ limit: 40, windowMs: 60_000 }),
  };
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "not_found" });
}

export async function publicRoutes(app: FastifyInstance, deps: PublicDeps = defaultPublicDeps()) {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // The token travels in the path: never cache these responses and never leak the URL onwards.
    reply.header("Cache-Control", "no-store");
    reply.header("Referrer-Policy", "no-referrer");
    const r = deps.limiter.hit(req.ip);
    if (!r.ok) {
      reply.header("Retry-After", String(r.retryAfter));
      return reply.code(429).send({ error: "rate_limited" });
    }
  });

  const touch = (id: string) => void deps.touchInvite(id).catch(() => undefined);

  async function resolve(token: string): Promise<{ invite: InviteRow; biz: Business } | null> {
    if (!isInviteTokenShaped(token)) return null;
    const invite = await deps.findInviteByHash(hashInviteToken(token));
    if (!invite || inviteState(invite) !== "active") return null;
    const biz = await deps.getBusiness(invite.business_id);
    return biz ? { invite, biz } : null;
  }

  app.get<{ Params: { token: string } }>("/public/invites/:token", async (req, reply) => {
    const found = await resolve(req.params.token);
    if (!found) return notFound(reply);
    const [brand, accounts] = await Promise.all([deps.getBrand(found.biz.workspace_id), deps.listAccounts(found.biz.id)]);
    touch(found.invite.id);
    return publicInviteView(found.biz, brand, accounts);
  });

  app.post<{ Params: { token: string }; Body: { platform?: unknown } }>("/public/invites/:token/connect", async (req, reply) => {
    const found = await resolve(req.params.token);
    if (!found) return notFound(reply);
    const platform = req.body?.platform;
    if (!isPlatform(platform)) return reply.code(400).send({ error: "bad_platform" });
    try {
      const brand = await deps.getBrand(found.biz.workspace_id);
      const authUrl = await deps.connectUrl(found.biz, platform, inviteReturnUrl(deps.webUrl, req.params.token, platform), brand);
      touch(found.invite.id);
      return { authUrl };
    } catch (e) {
      req.log.error({ err: e instanceof Error ? e.message : String(e) }, "invite connect failed");
      return reply.code(502).send({ error: "connect_failed" });
    }
  });

  app.post<{ Params: { token: string }; Body: { platform?: unknown; accountId?: unknown } }>("/public/invites/:token/sync", async (req, reply) => {
    const found = await resolve(req.params.token);
    if (!found) return notFound(reply);
    let accounts: SocialAccount[];
    try {
      accounts = await deps.syncAccounts(found.biz);
    } catch (e) {
      // Zernio unreachable: the account.connected webhook may already have saved it.
      req.log.warn({ err: e instanceof Error ? e.message : String(e) }, "invite sync failed, using local accounts");
      accounts = await deps.listAccounts(found.biz.id);
    }
    const platform = req.body?.platform;
    if (isPlatform(platform)) {
      const accountId = typeof req.body?.accountId === "string" ? req.body.accountId.slice(0, 64) : null;
      await deps.inviteConnected(found.biz, accounts, platform, accountId).catch((e) => req.log.error({ err: String(e) }, "invite event failed"));
    }
    touch(found.invite.id);
    return { platforms: publicPlatforms(accounts) };
  });
}
