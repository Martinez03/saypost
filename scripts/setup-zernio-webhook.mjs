#!/usr/bin/env node
// Registers Dilo's webhook in your Zernio account, or updates it if one already points to the same URL
// (POST / PUT /v1/webhooks/settings with the URL, the signing secret and the events the backend handles).
// Prints only non-secret information: never the API key or the webhook secret.
//
// Usage (Node 22+, from the repo root):
//   node scripts/setup-zernio-webhook.mjs [--env-file .env] [--url https://dilo.example.com/webhooks/zernio]
//                                         [--name Dilo] [--test] [--dry-run]
//
// ZERNIO_API_KEY and ZERNIO_WEBHOOK_SECRET come from the environment or from the env file (default: the
// first of .env, backend/.env.local, backend/.env that exists). Without --url the script uses
// $API_URL/webhooks/zernio. --test asks Zernio to send a signed `webhook.test` event right away.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Keep in sync with WEBHOOK_EVENTS in backend/src/social.ts (a backend test checks it). */
export const EVENTS = [
  "message.received",
  "review.new",
  "comment.received",
  "account.connected",
  "account.disconnected",
  "post.published",
  "post.partial",
  "post.failed",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ENV_FILES = [".env", "backend/.env.local", "backend/.env"];

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { test: false, dryRun: false, help: false };
  const withValue = { "--env-file": "envFile", "--url": "url", "--name": "name" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--test") out.test = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (withValue[a]) {
      const v = argv[++i];
      if (!v) fail(`${a} needs a value`);
      out[withValue[a]] = v;
    } else fail(`unknown argument ${a} (try --help)`);
  }
  return out;
}

/** Minimal dotenv reader: KEY=value lines, optional quotes. Variables already in the environment win. */
function readEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    values[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

function loadEnv(envFile) {
  let file = null;
  if (envFile) {
    file = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(file)) fail(`env file not found: ${envFile}`);
  } else {
    file = DEFAULT_ENV_FILES.map((f) => path.join(root, f)).find((f) => fs.existsSync(f)) ?? null;
  }
  const fromFile = file ? readEnvFile(file) : {};
  const get = (name) => process.env[name] || fromFile[name] || "";
  return { file, get };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 12).join("\n").replace(/^\/\/ ?/gm, ""));
    return;
  }

  const { file, get } = loadEnv(args.envFile);
  const key = get("ZERNIO_API_KEY");
  const secret = get("ZERNIO_WEBHOOK_SECRET");
  const base = (get("ZERNIO_API_BASE") || "https://zernio.com/api/v1").replace(/\/+$/, "");
  const apiUrl = (get("API_URL") || get("PUBLIC_API_URL")).replace(/\/+$/, "");
  const name = args.name ?? "Dilo";

  if (!key) fail("ZERNIO_API_KEY is not set (environment or env file).");
  if (!secret) {
    fail(
      "ZERNIO_WEBHOOK_SECRET is not set. Generate one, put it in the backend's env and run this again:\n" +
        `  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`,
    );
  }
  if (secret.length < 16) console.warn("Warning: ZERNIO_WEBHOOK_SECRET is shorter than 16 characters; use a long random value.");

  const rawUrl = args.url ?? (apiUrl ? `${apiUrl}/webhooks/zernio` : "");
  if (!rawUrl) fail("no webhook URL: pass --url https://<your-backend>/webhooks/zernio or set API_URL.");
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    fail(`not a valid URL: ${rawUrl}`);
  }
  if (!url.pathname.endsWith("/webhooks/zernio")) console.warn(`Warning: the backend listens on /webhooks/zernio; ${url.pathname} looks wrong.`);
  if (url.protocol !== "https:") console.warn("Warning: the URL is not HTTPS. Zernio needs a public HTTPS endpoint.");
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname)) {
    console.warn("Warning: Zernio cannot reach localhost. For local testing expose the backend with a tunnel (cloudflared, ngrok).");
  }

  const redact = (s) => String(s).split(key).join("***").split(secret).join("***");
  async function zernio(method, route, body) {
    const res = await fetch(`${base}${route}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }
    if (!res.ok) {
      const detail = data.error ?? data.message ?? text;
      throw new Error(`${method} ${route} → HTTP ${res.status}: ${redact(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)}`);
    }
    return data;
  }

  const href = url.href;
  console.log(`Env file:  ${file ? path.relative(process.cwd(), file) || file : "(environment only)"}`);
  console.log(`Zernio:    ${base}`);
  console.log(`Webhook:   ${href}`);
  console.log(`Events:    ${EVENTS.join(", ")}`);
  console.log(`Secret:    set (${secret.length} chars, not shown)`);

  const { webhooks = [] } = await zernio("GET", "/webhooks/settings");
  const existing = webhooks.find((w) => w.url?.trim() === href);
  const sameName = webhooks.filter((w) => w !== existing && w.name === name);

  if (args.dryRun) {
    console.log(`\nDry run: would ${existing ? `update webhook ${existing._id}` : "create a new webhook"} named "${name}". Nothing changed.`);
    return;
  }

  const body = { name, url: href, secret, events: EVENTS, isActive: true };
  const result = existing
    ? await zernio("PUT", "/webhooks/settings", { webhookId: existing._id, ...body })
    : await zernio("POST", "/webhooks/settings", body);
  const hook = result.webhook ?? { ...existing, ...body };
  const id = hook._id ?? existing?._id;

  console.log(`\n${existing ? "Updated" : "Created"} webhook ${id ?? "(id not returned)"}: "${hook.name ?? name}", active: ${hook.isActive !== false}`);
  for (const w of sameName) {
    console.log(`Note: another webhook named "${w.name}" (${w._id}) points to ${w.url}. Delete it in Zernio if it is stale.`);
  }

  if (args.test) {
    if (!id) fail("cannot send a test event without the webhook id.");
    const r = await zernio("POST", "/webhooks/test", { webhookId: id });
    console.log(`\nTest event: ${r.message ?? "sent"}.`);
    console.log('Your backend log should show "zernio webhook" with event webhook.test. A 401 "bad signature" there means');
    console.log("ZERNIO_WEBHOOK_SECRET differs between the backend's env and the one this script used.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
}
