import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The signed-in user and their business, shared by the dashboard layout and pages within one request.

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

/** The user's business (one per user), or null before onboarding. */
export const getBusiness = cache(async () => {
  const { supabase } = await getSession();
  const { data, error } = await supabase.from("businesses").select("*").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});

/** The business, or a redirect to onboarding when there isn't one yet. */
export async function requireBusiness() {
  const business = await getBusiness();
  if (!business) redirect("/app/onboarding");
  return business;
}
