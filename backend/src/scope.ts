// Which business an /api/* request acts on. Pure, so it can be unit tested.
import type { Business } from "./db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Scope = { ok: true; biz: Business } | { ok: false; status: 403 | 404; error: "forbidden_business" | "no_business" };

/**
 * `businesses` are the ones in the user's workspaces, oldest first. With an `X-Business-Id` header the
 * business must be one of them (else 403); without it, the oldest one (else 404, onboarding first).
 */
export function pickBusiness(businesses: Pick<Business, "id">[], header: string | string[] | undefined): Scope {
  const wanted = (Array.isArray(header) ? header[0] : header)?.trim();
  if (wanted) {
    const biz = UUID.test(wanted) ? businesses.find((b) => b.id === wanted.toLowerCase()) : undefined;
    return biz ? { ok: true, biz: biz as Business } : { ok: false, status: 403, error: "forbidden_business" };
  }
  const first = businesses[0];
  return first ? { ok: true, biz: first as Business } : { ok: false, status: 404, error: "no_business" };
}

/** Whether the business that owns an action is one of the user's (any workspace, not just the selected one). */
export function canActOn(businesses: Pick<Business, "id">[], businessId: string): boolean {
  return businesses.some((b) => b.id === businessId);
}
