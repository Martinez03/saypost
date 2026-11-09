"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BIZ_COOKIE, getBusinesses } from "@/lib/session";

/** Switches the dashboard to another business of the user's workspaces, then opens `next`. */
export async function selectBusiness(id: string, next = "/app") {
  const all = await getBusinesses();
  if (!all.some((b) => b.id === id)) throw new Error("not_found");
  const jar = await cookies();
  // Not httpOnly: it is only an id (access is enforced by RLS and the backend), and the browser
  // sends it to the backend as X-Business-Id.
  jar.set(BIZ_COOKIE, id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect(next.startsWith("/app") ? next : "/app");
}
