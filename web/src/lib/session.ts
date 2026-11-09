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
