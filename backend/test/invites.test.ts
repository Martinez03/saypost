// Client invite links: token hashing and lookup, expiry and revocation, what the public endpoints
// return (and never return), and the per-IP rate limit. No network, no database: deps are faked.
import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

process.env.SUPABASE_URL ??= "http://localhost:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";

const inv = await import("../src/invites.js");
const { publicRoutes, justConnected } = await import("../src/routes/public.js");
type PublicDeps = import("../src/routes/public.js").PublicDeps;
type Business = import("../src/db.js").Business;
type SocialAccount = import("../src/db.js").SocialAccount;
type InviteRow = import("../src/invites.js").InviteRow;

const DAY = 86_400_000;
const SECRETS = {
  owner_phone: "34600000001",
  zernio_profile_id: "zprof_secret_123",
  whatsapp_conversation_id: "conv_secret_456",
  whatsapp_account_id: "wacc_secret_789",
  notes: "secret notes about the owner",
  description: "internal description",
};

const biz: Business = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
  approval_mode: "agency_dashboard",
  name: "Clínica Sonrisa",
  category: "clinic",
  city: "Madrid",
  tone: "friendly",
  language: "es",
  timezone: "Europe/Madrid",
  whatsapp_status: "active",
  whatsapp_last_inbound_at: null,
  notify_comments: true,
  notify_reviews: true,
  notify_dms: true,
  ...SECRETS,
};

const accounts: SocialAccount[] = [
  { id: "a1", business_id: biz.id, zernio_account_id: "zacc_secret_ig", platform: "instagram", username: "@sonrisa", display_name: "Sonrisa", profile_picture: "https://cdn/x.jpg", status: "connected" },
  { id: "a2", business_id: biz.id, zernio_account_id: "zacc_secret_fb", platform: "facebook", username: null, display_name: "Sonrisa FB", profile_picture: null, status: "disconnected" },
];

function invite(token: string, patch: Partial<InviteRow> = {}): InviteRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    business_id: biz.id,
    token_hash: inv.hashInviteToken(token),
    created_by: biz.owner_id,
    expires_at: new Date(Date.now() + 14 * DAY).toISOString(),
    revoked_at: null,
    created_at: new Date().toISOString(),
    last_used_at: null,
    ...patch,
  };
}

function fakeDeps(rows: InviteRow[], over: Partial<PublicDeps> = {}) {
  const calls = { connect: [] as { platform: string; redirectUrl: string; brand: unknown }[], touched: 0, events: [] as string[], lookups: [] as string[] };
  const deps: PublicDeps = {
    webUrl: "https://app.example.com",
    async findInviteByHash(hash) {
      calls.lookups.push(hash);
      return rows.find((r) => r.token_hash === hash) ?? null;
    },
    async getBusiness(id) {
      return id === biz.id ? { ...biz } : null;
    },
    async getBrand() {
      return { brand_name: "Agencia Norte", logo_url: "https://cdn.example.com/logo.png" };
    },
    async listAccounts() {
      return accounts;
    },
    async touchInvite() {
      calls.touched++;
    },
    async connectUrl(_b, platform, redirectUrl, brand) {
      calls.connect.push({ platform, redirectUrl, brand });
      return `https://zernio.example/connect/${platform}`;
    },
    async syncAccounts() {
      return accounts;
    },
    async inviteConnected(_b, _a, platform) {
      calls.events.push(platform);
    },
    limiter: inv.createRateLimiter({ limit: 1000, windowMs: 60_000 }),
    ...over,
  };
  return { deps, calls };
}

async function server(deps: PublicDeps) {
  const app = Fastify();
  await app.register(async (s) => publicRoutes(s, deps));
  await app.ready();
  return app;
}

test("invite tokens: 32 random bytes in base64url, stored only as a SHA-256 hex hash", () => {
  const a = inv.newInviteToken();
  const b = inv.newInviteToken();
  assert.notEqual(a, b);
  assert.equal(a.length, 43);
  assert.ok(inv.isInviteTokenShaped(a));
  assert.equal(Buffer.from(a, "base64url").length, 32);
  const h = inv.hashInviteToken(a);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(inv.hashInviteToken(a), h, "same token, same hash");
  assert.notEqual(inv.hashInviteToken(b), h);
  assert.ok(!h.includes(a));
  for (const bad of ["", "short", `${a}x`, `${a.slice(0, 42)}!`, "../../etc/passwd", null, 42]) assert.ok(!inv.isInviteTokenShaped(bad), String(bad));
});

test("invite state: active until expiry, revoked wins", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  assert.equal(inv.inviteState({ expires_at: "2026-11-10T12:00:00Z", revoked_at: null }, now), "active");
  assert.equal(inv.inviteState({ expires_at: "2026-11-09T12:00:00Z", revoked_at: null }, now), "expired");
  assert.equal(inv.inviteState({ expires_at: "2026-11-01T00:00:00Z", revoked_at: null }, now), "expired");
  assert.equal(inv.inviteState({ expires_at: "2026-11-20T00:00:00Z", revoked_at: "2026-11-09T11:00:00Z" }, now), "revoked");
});

test("invite URLs and Zernio's branded welcome parameters", () => {
  const token = inv.newInviteToken();
  assert.equal(inv.inviteUrl("https://app.example.com/", token), `https://app.example.com/invite/${token}`);
  const back = inv.inviteReturnUrl("https://app.example.com", token, "twitter");
  assert.equal(back, `https://app.example.com/invite/${token}?connected=twitter`);
  // X caps the URL-encoded redirect at 258 characters for API callers.
  assert.ok(encodeURIComponent(back).length < 200);

  assert.deepEqual(inv.welcomeParams(null), { welcome: "true", brandName: "Saypost", primaryColor: "#1FBF6A" });
  const branded = inv.welcomeParams({ brand_name: "  Agencia Norte  ", logo_url: "https://cdn.example.com/l.png" });
  assert.equal(branded.brandName, "Agencia Norte");
  assert.equal(branded.logoUrl, "https://cdn.example.com/l.png");
  assert.equal(inv.welcomeParams({ brand_name: "x".repeat(80), logo_url: null }).brandName!.length, 60);
  assert.equal(inv.welcomeParams({ brand_name: "A", logo_url: "http://insecure.example.com/l.png" }).logoUrl, undefined);
  assert.equal(inv.welcomeParams({ brand_name: "A", logo_url: "javascript:alert(1)" }).logoUrl, undefined);
  assert.match(inv.BRAND_COLOR, /^#[0-9A-Fa-f]{6}$/);
});

test("public view: business name, language, branding and network status, nothing else", () => {
  const view = inv.publicInviteView(biz, { brand_name: "Agencia Norte", logo_url: "http://not-https.example.com/l.png" }, accounts);
  assert.deepEqual(Object.keys(view).sort(), ["brandName", "businessName", "language", "logoUrl", "platforms"]);
  assert.equal(view.logoUrl, null, "only https logos");
  const ig = view.platforms.find((p) => p.platform === "instagram")!;
  assert.deepEqual(ig, { platform: "instagram", connected: true, username: "sonrisa" });
  assert.deepEqual(view.platforms.find((p) => p.platform === "facebook"), { platform: "facebook", connected: false, username: null });
  for (const p of view.platforms) assert.deepEqual(Object.keys(p).sort(), ["connected", "platform", "username"]);
  const json = JSON.stringify(view);
  for (const v of [...Object.values(SECRETS), biz.id, biz.workspace_id, biz.owner_id, "zacc_secret_ig", "cdn/x.jpg"]) assert.ok(!json.includes(v), `leaks ${v}`);
});

test("public endpoints: a valid token sees only its own business's public view", async () => {
  const token = inv.newInviteToken();
  const { deps, calls } = fakeDeps([invite(token)]);
  const app = await server(deps);

  const res = await app.inject({ method: "GET", url: `/public/invites/${token}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.equal(res.headers["referrer-policy"], "no-referrer");
  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ["brandName", "businessName", "language", "logoUrl", "platforms"]);
  assert.equal(body.businessName, "Clínica Sonrisa");
  assert.equal(body.brandName, "Agencia Norte");
  for (const v of [...Object.values(SECRETS), biz.id, biz.workspace_id, "zacc_secret", token]) assert.ok(!res.body.includes(v), `leaks ${v}`);
  // The lookup is by hash, never by the raw token.
  assert.deepEqual(calls.lookups, [inv.hashInviteToken(token)]);
  assert.equal(calls.touched, 1);

  const sync = await app.inject({ method: "POST", url: `/public/invites/${token}/sync`, payload: { platform: "instagram", accountId: "zacc_secret_ig" } });
  assert.equal(sync.statusCode, 200);
  assert.deepEqual(Object.keys(sync.json()), ["platforms"]);
  assert.ok(!sync.body.includes("zacc_secret"));
  assert.deepEqual(calls.events, ["instagram"]);
  await app.close();
});

test("public connect: Zernio URL for that business with the branded screen and the invite as return URL", async () => {
  const token = inv.newInviteToken();
  const { deps, calls } = fakeDeps([invite(token)]);
  const app = await server(deps);
  const res = await app.inject({ method: "POST", url: `/public/invites/${token}/connect`, payload: { platform: "instagram" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { authUrl: "https://zernio.example/connect/instagram" });
  assert.equal(calls.connect[0]!.redirectUrl, `https://app.example.com/invite/${token}?connected=instagram`);
  assert.deepEqual(calls.connect[0]!.brand, { brand_name: "Agencia Norte", logo_url: "https://cdn.example.com/logo.png" });

  for (const platform of ["whatsapp", "evil", "", null, { a: 1 }]) {
    const bad = await app.inject({ method: "POST", url: `/public/invites/${token}/connect`, payload: { platform } });
    assert.equal(bad.statusCode, 400, String(platform));
  }
  assert.equal(calls.connect.length, 1);

  const failing = fakeDeps([invite(token)], {
    async connectUrl() {
      throw new Error("Zernio GET /connect → 500: internal detail zprof_secret_123");
    },
  });
  const app2 = await server(failing.deps);
  const err = await app2.inject({ method: "POST", url: `/public/invites/${token}/connect`, payload: { platform: "facebook" } });
  assert.equal(err.statusCode, 502);
  assert.deepEqual(err.json(), { error: "connect_failed" });
  await app.close();
  await app2.close();
});

test("public endpoints: unknown, malformed, expired and revoked tokens all get the same bare 404", async () => {
  const good = inv.newInviteToken();
  const expired = inv.newInviteToken();
  const revoked = inv.newInviteToken();
  const orphan = inv.newInviteToken();
  const { deps, calls } = fakeDeps([
    invite(good),
    invite(expired, { expires_at: new Date(Date.now() - 1000).toISOString() }),
    invite(revoked, { revoked_at: new Date().toISOString() }),
    invite(orphan, { business_id: "55555555-5555-4555-8555-555555555555" }),
  ]);
  const app = await server(deps);
  const tokens = [inv.newInviteToken(), "short", `${good}x`, encodeURIComponent("../../x"), expired, revoked, orphan, inv.hashInviteToken(good)];
  for (const t of tokens) {
    for (const [method, path, payload] of [
      ["GET", "", undefined],
      ["POST", "/connect", { platform: "instagram" }],
      ["POST", "/sync", { platform: "instagram" }],
    ] as const) {
      const res = await app.inject({ method, url: `/public/invites/${t}${path}`, payload });
      assert.equal(res.statusCode, 404, `${method} ${t}${path}`);
      assert.deepEqual(res.json(), { error: "not_found" });
    }
  }
  assert.equal(calls.connect.length, 0);
  assert.equal(calls.events.length, 0);
  assert.equal(calls.touched, 0);
  // Malformed tokens never reach the database.
  assert.ok(!calls.lookups.includes(inv.hashInviteToken("short")));
  await app.close();
});

test("public endpoints: per-IP rate limit answers 429 with Retry-After", async () => {
  const token = inv.newInviteToken();
  const { deps } = fakeDeps([invite(token)], { limiter: inv.createRateLimiter({ limit: 3, windowMs: 60_000 }) });
  const app = await server(deps);
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await app.inject({ method: "GET", url: `/public/invites/${inv.newInviteToken()}`, remoteAddress: "203.0.113.7" })).statusCode);
  assert.deepEqual(codes, [404, 404, 404, 429, 429]);
  const limited = await app.inject({ method: "GET", url: `/public/invites/${token}`, remoteAddress: "203.0.113.7" });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers["retry-after"]) >= 1);
  // Another IP is not affected.
  assert.equal((await app.inject({ method: "GET", url: `/public/invites/${token}`, remoteAddress: "198.51.100.2" })).statusCode, 200);
  await app.close();
});

test("rate limiter: fixed window per key, resets, bounded memory", () => {
  const rl = inv.createRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 3 });
  assert.ok(rl.hit("a", 0).ok);
  assert.ok(rl.hit("a", 10).ok);
  const third = rl.hit("a", 20);
  assert.equal(third.ok, false);
  assert.ok(!third.ok && third.retryAfter === 1);
  assert.ok(rl.hit("a", 1000).ok, "new window");
  for (const k of ["b", "c", "d", "e"]) rl.hit(k, 1000);
  assert.ok(rl.size() <= 3);
});

test("invite feed event: only the account Zernio named, or new ones of that platform", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const rows: SocialAccount[] = [
    { ...accounts[0]!, zernio_account_id: "old", created_at: "2026-10-01T00:00:00Z" },
    { ...accounts[0]!, id: "a3", zernio_account_id: "new", created_at: "2026-11-09T11:50:00Z" },
    { ...accounts[1]!, zernio_account_id: "fb", created_at: "2026-11-09T11:59:00Z" },
  ];
  assert.deepEqual(justConnected(rows, "instagram", "old", now).map((a) => a.zernio_account_id), ["old"]);
  assert.deepEqual(justConnected(rows, "instagram", null, now).map((a) => a.zernio_account_id), ["new"]);
  assert.deepEqual(justConnected(rows, "facebook", null, now), [], "disconnected accounts do not count");
  assert.deepEqual(justConnected(rows, "instagram", "someone-else", now), []);
});
