// A business's Zernio profile and its connected accounts. Shared by the dashboard (/api) and the
// client invite page (/public/invites).
import { db, updateBusiness, upsertAccount, type Business, type SocialAccount } from "./db.js";
import * as zernio from "./zernio.js";

/** Networks the web offers to connect (docs/API.md), in display order. */
export const PLATFORMS = ["instagram", "facebook", "googlebusiness", "linkedin", "tiktok", "twitter", "threads", "bluesky", "youtube", "pinterest"] as const;
const PLATFORM_SET = new Set<string>(PLATFORMS);

export function isPlatform(v: unknown): v is (typeof PLATFORMS)[number] {
  return typeof v === "string" && PLATFORM_SET.has(v);
}

/** The business's Zernio profile id, creating the profile (externalId = business id) if it is missing. */
export async function ensureProfile(biz: Business): Promise<string> {
  if (biz.zernio_profile_id) return biz.zernio_profile_id;
  const existing = await zernio.findProfileByExternalId(biz.id).catch(() => null);
  const profile = existing ?? (await zernio.createProfile(`${biz.name} · ${biz.id.slice(0, 6)}`, biz.id, biz.timezone));
  await updateBusiness(biz.id, { zernio_profile_id: profile._id });
  biz.zernio_profile_id = profile._id;
  return profile._id;
}

/** Pulls the profile's accounts from Zernio into social_accounts and returns every row of the business. */
export async function syncAccounts(biz: Business): Promise<SocialAccount[]> {
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
  return (data ?? []) as SocialAccount[];
}
