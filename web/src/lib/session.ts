import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The signed-in user and their businesses, shared by the dashboard layout and pages within one request.
// A user sees every business in their workspaces (RLS); the selected one lives in the `biz` cookie.

export const BIZ_COOKIE = "biz";

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
});

/** Every business in the user's workspaces, oldest first (the backend defaults to the same first one). */
export const getBusinesses = cache(async () => {
  const { supabase } = await getSession();
  const { data, error } = await supabase.from("businesses").select("*").order("created_at").order("id");
  if (error) throw new Error(error.message);
  return data ?? [];
});

/** The selected business (cookie), else the first one; null before onboarding. */
export const getBusiness = cache(async () => {
  const [all, jar] = await Promise.all([getBusinesses(), cookies()]);
  const wanted = jar.get(BIZ_COOKIE)?.value;
  return all.find((b) => b.id === wanted) ?? all[0] ?? null;
});

/** The business, or a redirect to onboarding when there isn't one yet. */
export async function requireBusiness() {
  const business = await getBusiness();
  if (!business) redirect("/app/onboarding");
  return business;
}

/** The user's workspaces with their role in each (RLS: only theirs). */
export const getWorkspaces = cache(async () => {
  const { supabase, userId } = await getSession();
  const [ws, members] = await Promise.all([
    supabase.from("workspaces").select("*").order("created_at"),
    supabase.from("workspace_members").select("workspace_id, role").eq("user_id", userId),
  ]);
  if (ws.error) throw new Error(ws.error.message);
  const roles = new Map((members.data ?? []).map((m) => [m.workspace_id, m.role]));
  return (ws.data ?? []).map((w) => ({ ...w, role: roles.get(w.id) ?? "member" }));
});

/**
 * The workspace of the selected business (or the user's first one before they have a business), and
 * whether the dashboard should look like an agency's: an agency workspace, or more than one business.
 */
export const getWorkspaceContext = cache(async () => {
  const [business, businesses, workspaces] = await Promise.all([getBusiness(), getBusinesses(), getWorkspaces()]);
  const workspace = (business && workspaces.find((w) => w.id === business.workspace_id)) ?? workspaces[0] ?? null;
  // The name clients see: the agency's brand, else an agency workspace's own name.
  const agencyName = workspace?.brand_name ?? (workspace?.kind === "agency" ? workspace.name : null);
  return { workspace, agencyMode: workspace?.kind === "agency" || businesses.length > 1, agencyName, isOwner: workspace?.role === "owner" };
});
