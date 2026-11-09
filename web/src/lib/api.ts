import { createClient } from "@/lib/supabase/client";

// Calls the Dilo backend (NEXT_PUBLIC_API_URL) as the signed-in user. Browser only.
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

type Method = "GET" | "POST" | "DELETE";

export async function api<T>(path: string, options: { method?: Method; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { body, timeoutMs = 30_000 } = options;
  const method = options.method ?? (body === undefined ? "GET" : "POST");
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

// ---------------------------------------------------------------------------
// Response types (docs/API.md)
// ---------------------------------------------------------------------------

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
