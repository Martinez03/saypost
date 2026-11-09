// Environment configuration. Fails fast on missing required values in production.

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  env: opt("NODE_ENV", "development"),
  port: Number(opt("PORT", "4100")),
  webUrl: opt("WEB_URL", "http://localhost:3100").replace(/\/$/, ""),
  /**
   * Extra allowed CORS origins, comma-separated. A `*` matches letters, digits and dashes, e.g.
   * `https://*--my-dilo.netlify.app` for Netlify deploy previews.
   */
  extraOrigins: opt("WEB_ORIGINS")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean),
  supabaseUrl: req("SUPABASE_URL"),
  supabaseServiceKey: req("SUPABASE_SERVICE_ROLE_KEY"),
  anthropicKey: opt("ANTHROPIC_API_KEY"),
  openaiKey: opt("OPENAI_API_KEY"),
  zernioKey: opt("ZERNIO_API_KEY"),
  zernioBase: opt("ZERNIO_API_BASE", "https://zernio.com/api/v1").replace(/\/$/, ""),
  zernioWebhookSecret: opt("ZERNIO_WEBHOOK_SECRET"),
  /** Claude model for the agent and drafts. */
  model: opt("CLAUDE_MODEL", "claude-opus-5-5"),
  transcribeModel: opt("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe"),
  /** Poll Facebook reviews (no webhook for them) every N seconds; 0 disables. */
  reviewPollSeconds: Number(opt("REVIEW_POLL_SECONDS", "120")),
};

export const isProd = config.env === "production";

export function allowedOrigins(): string[] {
  return [config.webUrl, ...config.extraOrigins];
}

/** Turns an origin pattern with `*` wildcards into an anchored regex; `*` never matches `.`, `/` or `:`. */
export function originPattern(pattern: string): RegExp {
  const body = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[a-z0-9-]*");
  return new RegExp(`^${body}$`);
}

const originMatchers = allowedOrigins().map((o) => (o.includes("*") ? originPattern(o) : o));

/** CORS check for the dashboard: WEB_URL plus WEB_ORIGINS (exact or with `*`). */
export function isAllowedOrigin(origin: string): boolean {
  return originMatchers.some((m) => (typeof m === "string" ? m === origin : m.test(origin)));
}
