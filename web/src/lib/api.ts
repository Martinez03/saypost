import { createClient } from "@/lib/supabase/client";

// Calls the Saypost backend (NEXT_PUBLIC_API_URL) as the signed-in user. Browser only.
// Errors come back as { error, message } (docs/API.md); network failures use error "network".

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    message?: string,
  ) {
    super(message ?? error);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

// The business the dashboard is showing. The app shell sets it on render, so every call acts on
// the same business as the page (the backend checks it belongs to the user's workspaces).
let currentBusinessId: string | null = null;

export function setApiBusiness(id: string | null) {
  currentBusinessId = id;
}

type Options = { method?: Method; body?: unknown; timeoutMs?: number; /** Acts on this business instead of the page's. */ businessId?: string };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  const businessId = options.businessId ?? currentBusinessId;
  return request<T>(path, options, {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(businessId ? { "X-Business-Id": businessId } : {}),
  });
}

/** The public, token-gated endpoints of the client invite page: no session, no business header. */
export function publicApi<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { body }, {});
}

async function request<T>(path: string, options: Options, auth: Record<string, string>): Promise<T> {
  const { body, timeoutMs = 30_000 } = options;
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...auth,
        // No Content-Type without a body: Fastify rejects an empty JSON body.
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new ApiError(0, "network", e instanceof Error ? e.message : "Network error");
  }

  const json = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? "request_failed", json.message);
  return json as T;
}

export const apiGet = <T>(path: string, businessId?: string) => api<T>(path, { businessId });
export const apiPost = <T>(path: string, body?: unknown, businessId?: string) => api<T>(path, { method: "POST", body, businessId });
export const apiPatch = <T>(path: string, body: unknown) => api<T>(path, { method: "PATCH", body });
export const apiDelete = <T>(path: string, businessId?: string) => api<T>(path, { method: "DELETE", businessId });

// ---------------------------------------------------------------------------
// Response types (docs/API.md)
// ---------------------------------------------------------------------------

export type BusinessSummary = {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  language: "es" | "en";
  workspaceId: string;
  approvalMode: "owner_whatsapp" | "agency_dashboard";
  whatsappStatus: "inactive" | "pending" | "active";
  connectedAccounts: number;
  pendingActions: number;
};

export type WhatsappStatusResponse = {
  status: "inactive" | "pending" | "active";
  sandboxNumber: string | null;
  phone: string | null;
};

export type Stats = {
  accounts: number | null;
  postsLast7d: number | null;
  pendingActions: number | null;
  reviews: { total: number | null; unanswered: number | null; averageRating: number | null } | null;
};

export type PostPlatform = { platform: string; status: string | null; url: string | null };

export type Post = {
  id: string;
  content: string | null;
  status: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  platforms: PostPlatform[] | null;
  mediaUrl: string | null;
};

export type InviteCreated = { id: string; url: string; expiresAt: string };
export type InviteSummary = { id: string; createdAt: string; expiresAt: string; lastUsedAt: string | null };

export type WorkspaceResponse = { workspace: { id: string; name: string; kind: "business" | "agency"; brandName: string | null; logoUrl: string | null } };

/** GET /public/invites/:token (docs/API.md). */
export type PublicInvite = {
  businessName: string;
  brandName: string | null;
  logoUrl: string | null;
  language: "es" | "en";
  platforms: { platform: string; connected: boolean; username: string | null }[];
};
