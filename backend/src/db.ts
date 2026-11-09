// Supabase (service role) and small typed helpers over the Saypost tables.
import { createClient } from "@supabase/supabase-js";
import type { ApprovalMode } from "./approval.js";
import { config } from "./config.js";

export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Tone = "friendly" | "professional" | "fun" | "elegant";
export type Lang = "es" | "en";

export interface Business {
  id: string;
  /** Who created it. Access goes through workspace membership (workspace_members). */
  owner_id: string;
  workspace_id: string;
  approval_mode: ApprovalMode;
  name: string;
  category: string | null;
  city: string | null;
  description: string | null;
  tone: Tone;
  language: Lang;
  timezone: string;
  notes: string;
  owner_phone: string | null;
  whatsapp_status: "inactive" | "pending" | "active";
  whatsapp_conversation_id: string | null;
  whatsapp_account_id: string | null;
  whatsapp_last_inbound_at: string | null;
  zernio_profile_id: string | null;
  notify_comments: boolean;
  notify_reviews: boolean;
  notify_dms: boolean;
}

export interface SocialAccount {
  id: string;
  business_id: string;
  zernio_account_id: string;
  platform: string;
  username: string | null;
  display_name: string | null;
  profile_picture: string | null;
  status: "connected" | "disconnected";
}

export type ActionKind = "publish" | "reply_review" | "reply_comment" | "reply_dm" | "cancel_post" | "boost";
export type ActionStatus = "pending" | "approved" | "rejected" | "done" | "failed" | "superseded";

export interface ActionRow {
  id: string;
  business_id: string;
  kind: ActionKind;
  status: ActionStatus;
  title: string;
  preview: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown> | null;
  source: "whatsapp" | "webhook" | "dashboard";
  result: Record<string, unknown> | null;
  error: string | null;
  decided_via: "whatsapp" | "dashboard" | null;
  created_at: string;
  decided_at: string | null;
  executed_at: string | null;
}

export interface MessageRow {
  id: number;
  business_id: string;
  direction: "in" | "out";
  kind: "text" | "audio" | "image" | "video" | "system";
  body: string;
  media_url: string | null;
  created_at: string;
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

export async function getBusiness(id: string): Promise<Business | null> {
  return check(await db.from("businesses").select("*").eq("id", id).maybeSingle(), "getBusiness") as Business | null;
}

/** Ids of the workspaces the user belongs to (oldest first). */
export async function userWorkspaceIds(userId: string): Promise<string[]> {
  const rows = check(
    await db.from("workspace_members").select("workspace_id, created_at").eq("user_id", userId).order("created_at"),
    "userWorkspaceIds",
  ) as { workspace_id: string }[];
  return rows.map((r) => r.workspace_id);
}

/** Businesses in these workspaces, oldest first (the web lists them in the same order). */
export async function businessesInWorkspaces(workspaceIds: string[]): Promise<Business[]> {
  if (!workspaceIds.length) return [];
  return check(
    await db.from("businesses").select("*").in("workspace_id", workspaceIds).order("created_at").order("id"),
    "businessesInWorkspaces",
  ) as Business[];
}

export async function getBusinessByPhone(phone: string): Promise<Business | null> {
  return check(await db.from("businesses").select("*").eq("owner_phone", phone).maybeSingle(), "getBusinessByPhone") as Business | null;
}

export async function getBusinessByProfile(profileId: string): Promise<Business | null> {
  return check(
    await db.from("businesses").select("*").eq("zernio_profile_id", profileId).maybeSingle(),
    "getBusinessByProfile",
  ) as Business | null;
}

export async function updateBusiness(id: string, patch: Partial<Business>): Promise<void> {
  check(await db.from("businesses").update(patch).eq("id", id), "updateBusiness");
}

export async function listAccounts(businessId: string): Promise<SocialAccount[]> {
  return check(
    await db.from("social_accounts").select("*").eq("business_id", businessId).eq("status", "connected").order("created_at"),
    "listAccounts",
  ) as SocialAccount[];
}

export async function upsertAccount(row: Omit<SocialAccount, "id">): Promise<void> {
  check(await db.from("social_accounts").upsert(row, { onConflict: "zernio_account_id" }), "upsertAccount");
}

export async function addMessage(m: Omit<MessageRow, "id" | "created_at" | "media_url"> & { media_url?: string | null; zernio_message_id?: string | null }): Promise<void> {
  check(await db.from("messages").insert(m), "addMessage");
}

export async function recentMessages(businessId: string, limit = 16): Promise<MessageRow[]> {
  const rows = check(
    await db.from("messages").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(limit),
    "recentMessages",
  ) as MessageRow[];
  return rows.reverse();
}

export async function addEvent(businessId: string, type: string, title: string, data?: unknown): Promise<void> {
  const { error } = await db.from("events").insert({ business_id: businessId, type, title, data: data ?? null });
  if (error) console.error("addEvent", error.message);
}

export async function getAction(id: string): Promise<ActionRow | null> {
  return check(await db.from("actions").select("*").eq("id", id).maybeSingle(), "getAction") as ActionRow | null;
}

export async function pendingActions(businessId: string): Promise<ActionRow[]> {
  return check(
    await db.from("actions").select("*").eq("business_id", businessId).eq("status", "pending").order("created_at", { ascending: false }),
    "pendingActions",
  ) as ActionRow[];
}

/** Marks a key as seen. Returns true the first time, false if it was already there. */
export async function markSeen(key: string, businessId: string | null): Promise<boolean> {
  const { error } = await db.from("seen_items").insert({ key, business_id: businessId });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`markSeen: ${error.message}`);
}

export async function logUsage(row: {
  business_id: string | null;
  provider: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  seconds?: number;
  cost_usd: number;
  purpose: string;
}): Promise<void> {
  const { error } = await db.from("usage_ledger").insert(row);
  if (error) console.error("logUsage", error.message);
}
