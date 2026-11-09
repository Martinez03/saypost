// Client invite links: an agency sends a client a link and the client connects their own networks
// from their phone, without an account and without sharing passwords.
// The token is 32 random bytes (base64url); only its SHA-256 is stored, so a database leak does not
// leak working links. The pure helpers below are unit tested.
import { createHash, randomBytes } from "node:crypto";
import { PLATFORMS } from "./accounts.js";
import type { Business, Lang, SocialAccount } from "./db.js";

export const INVITE_TTL_DAYS = 14;

export interface InviteRow {
  id: string;
  business_id: string;
  token_hash: string;
  created_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface WorkspaceBrand {
  brand_name: string | null;
  logo_url: string | null;
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Cheap check before touching the database: anything not shaped like our tokens is just "not found". */
export function isInviteTokenShaped(token: unknown): token is string {
  return typeof token === "string" && TOKEN_SHAPE.test(token);
}

export type InviteState = "active" | "expired" | "revoked";

export function inviteState(row: Pick<InviteRow, "expires_at" | "revoked_at">, now = Date.now()): InviteState {
  if (row.revoked_at) return "revoked";
  return new Date(row.expires_at).getTime() > now ? "active" : "expired";
}

export function inviteUrl(webUrl: string, token: string): string {
  return `${webUrl.replace(/\/+$/, "")}/invite/${token}`;
}

/** Where Zernio sends the client back. Zernio appends connected=, profileId=, accountId=, username= (or error=). */
export function inviteReturnUrl(webUrl: string, token: string, platform: string): string {
  return `${inviteUrl(webUrl, token)}?connected=${encodeURIComponent(platform)}`;
}

export interface PublicPlatform {
  platform: string;
  connected: boolean;
  username: string | null;
}

export interface PublicInvite {
  businessName: string;
  brandName: string | null;
  logoUrl: string | null;
  language: Lang;
  platforms: PublicPlatform[];
}

export function publicPlatforms(accounts: Pick<SocialAccount, "platform" | "username" | "status">[]): PublicPlatform[] {
  return PLATFORMS.map((platform) => {
    const live = accounts.filter((a) => a.platform === platform && a.status === "connected");
    const username = live.find((a) => a.username)?.username ?? null;
    return { platform, connected: live.length > 0, username: username ? username.replace(/^@/, "") : null };
  });
}

/**
 * Everything the public invite page may see, and nothing else: the business name and language, the
 * agency's branding, and which networks are connected. Built field by field on purpose, so a new
 * column on businesses or workspaces never reaches an anonymous visitor.
 */
export function publicInviteView(
  biz: Pick<Business, "name" | "language">,
  brand: WorkspaceBrand | null,
  accounts: Pick<SocialAccount, "platform" | "username" | "status">[],
): PublicInvite {
  return {
    businessName: biz.name,
    brandName: brand?.brand_name?.trim() || null,
    logoUrl: brand?.logo_url && isHttpsUrl(brand.logo_url) ? brand.logo_url : null,
    language: biz.language === "en" ? "en" : "es",
    platforms: publicPlatforms(accounts),
  };
}

export function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname && v.length <= 2048;
  } catch {
    return false;
  }
}

/** Saypost's green, for the button on Zernio's welcome screen. */
export const BRAND_COLOR = "#1FBF6A";

/**
 * Query parameters for Zernio's branded welcome screen (GET /v1/connect/{platform}): `welcome=true`,
 * `brandName` (1 to 60 characters), `logoUrl` (https, square) and `primaryColor` (#RRGGBB).
 * Without an agency brand the screen says Saypost.
 */
export function welcomeParams(brand: WorkspaceBrand | null): Record<string, string> {
  const name = (brand?.brand_name?.trim() || "Saypost").slice(0, 60);
  const params: Record<string, string> = { welcome: "true", brandName: name, primaryColor: BRAND_COLOR };
  if (brand?.logo_url && isHttpsUrl(brand.logo_url)) params.logoUrl = brand.logo_url;
  return params;
}

// ---------------------------------------------------------------------------- rate limit

/**
 * Fixed-window counter per key (the client IP) for the public invite endpoints. In memory: Saypost
 * runs as one process. Returns how many seconds to wait when the key is over the limit.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 10_000;
  return {
    hit(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (!entry && hits.size >= maxKeys) {
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
          // Still full of live keys: forget the oldest one rather than grow without bound.
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
        }
        entry = { count: 0, resetAt: now + opts.windowMs };
        hits.set(key, entry);
      }
      entry.count++;
      if (entry.count > opts.limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
      return { ok: true };
    },
    size: () => hits.size,
  };
}
