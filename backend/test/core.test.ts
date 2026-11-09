// Unit tests for the pure, safety-relevant pieces (no network, no database calls).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

process.env.SUPABASE_URL ??= "http://localhost:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";

const { verifySignature } = await import("../src/routes/webhooks.js");
const { YES, NO } = await import("../src/inbound.js");
const { buildMessages } = await import("../src/agent/agent.js");
const { renderPublishPreview } = await import("../src/agent/tools.js");

test("webhook signature: valid, prefixed, tampered, missing", () => {
  const raw = JSON.stringify({ id: "e1", event: "review.new" });
  const sig = createHmac("sha256", "s3cret").update(raw).digest("hex");
  assert.equal(verifySignature(raw, sig, "s3cret"), true);
  assert.equal(verifySignature(raw, `sha256=${sig}`, "s3cret"), true);
  assert.equal(verifySignature(raw + " ", sig, "s3cret"), false);
  assert.equal(verifySignature(raw, sig, "other"), false);
  assert.equal(verifySignature(raw, undefined, "s3cret"), false);
});

test("yes/no detection only matches short confirmations", () => {
  for (const s of ["sí", "Si", "si!", "vale", "ok", "Dale 👍", "publícalo", "yes", "go ahead"]) assert.ok(YES.test(s), s);
  for (const s of ["no", "No.", "cancela", "mejor no", "nope"]) assert.ok(NO.test(s), s);
  for (const s of ["sí, pero cambia el precio a 14 €", "no pongas emojis", "publica que hoy hay paella", "okey dokey lets change it"])
    assert.ok(!YES.test(s) && !NO.test(s), s);
});

test("buildMessages merges turns, starts and ends with the user, keeps photo URLs", () => {
  const base = { business_id: "b", created_at: "", media_url: null };
  const msgs = buildMessages([
    { ...base, id: 1, direction: "out", kind: "text", body: "welcome" },
    { ...base, id: 2, direction: "in", kind: "image", body: "", media_url: "https://cdn.example/p.jpg" },
    { ...base, id: 3, direction: "in", kind: "audio", body: "publica esto" },
    { ...base, id: 4, direction: "out", kind: "text", body: "¿Lo publico?" },
    { ...base, id: 5, direction: "in", kind: "text", body: "mejor mañana a las 9" },
  ]);
  assert.equal(msgs[0]!.role, "user");
  assert.equal(msgs.at(-1)!.role, "user");
  assert.equal(msgs.length, 3);
  const first = JSON.stringify(msgs[0]!.content);
  assert.ok(first.includes("[photo: https://cdn.example/p.jpg]"));
  assert.ok(first.includes("[voice note transcript] publica esto"));
  assert.ok(first.includes('"type":"image"'));
});

test("publish preview groups identical texts and shows timing", () => {
  const biz = { language: "es" } as never;
  const out = renderPublishPreview(biz, {
    targets: [
      { platform: "instagram", accountId: "a", text: "Hola 🍲 #cocido" },
      { platform: "facebook", accountId: "b", text: "Hoy cocido" },
      { platform: "googlebusiness", accountId: "c", text: "Hoy cocido" },
    ],
    caption: "Hoy cocido",
    mediaUrls: ["https://x/y.jpg"],
    scheduleAt: null,
    timezone: "Europe/Madrid",
  });
  assert.ok(out.includes("*Facebook + Google*\nHoy cocido"));
  assert.ok(out.includes("*Instagram*\nHola 🍲 #cocido"));
  assert.ok(out.includes("Nada más digas que sí"));
  assert.ok(out.includes("1 foto/vídeo"));
});

test("CORS origin patterns: `*` stays inside one host label", async () => {
  const { originPattern } = await import("../src/config.js");
  const previews = originPattern("https://*--my-saypost.netlify.app");
  assert.ok(previews.test("https://6740abc--my-saypost.netlify.app"));
  assert.ok(!previews.test("https://evil.com/--my-saypost.netlify.app"));
  assert.ok(!previews.test("https://x--my-saypost.netlify.app.evil.com"));
  assert.ok(!previews.test("https://a.b--my-saypost.netlify.app"));
  assert.ok(!originPattern("https://saypost.example.com").test("https://saypostXexample.com"));
});

test("the webhook setup script subscribes to exactly the events dispatch() handles", async () => {
  const { WEBHOOK_EVENTS } = await import("../src/social.js");
  const script = new URL("../../scripts/setup-zernio-webhook.mjs", import.meta.url).href;
  const { EVENTS } = (await import(script)) as { EVENTS: string[] };
  assert.deepEqual([...EVENTS].sort(), [...WEBHOOK_EVENTS].sort());
});

test("approval mode routing: owner_whatsapp keeps buttons; agency_dashboard never lets WhatsApp decide", async () => {
  const { proposalDelivery, ownerCanDecideOnWhatsapp, ownerGetsResult } = await import("../src/approval.js");
  for (const source of ["whatsapp", "webhook", "dashboard"] as const) {
    assert.equal(proposalDelivery("owner_whatsapp", source), "buttons", source);
    assert.equal(ownerGetsResult("owner_whatsapp", source), true, source);
  }
  // Unknown or missing values fall back to today's behaviour.
  assert.equal(proposalDelivery(null, "webhook"), "buttons");
  assert.equal(proposalDelivery("weird", "whatsapp"), "buttons");
  assert.equal(ownerCanDecideOnWhatsapp(undefined), true);

  assert.equal(proposalDelivery("agency_dashboard", "whatsapp"), "agency_note");
  assert.equal(proposalDelivery("agency_dashboard", "webhook"), "none");
  assert.equal(proposalDelivery("agency_dashboard", "dashboard"), "none");
  assert.equal(ownerCanDecideOnWhatsapp("agency_dashboard"), false);
  assert.equal(ownerCanDecideOnWhatsapp("owner_whatsapp"), true);
  // The owner hears "✅ Posted" for what they asked for, nothing about replies they never saw.
  assert.equal(ownerGetsResult("agency_dashboard", "whatsapp"), true);
  assert.equal(ownerGetsResult("agency_dashboard", "webhook"), false);
});

test("business scope: X-Business-Id must be in the user's workspaces", async () => {
  const { pickBusiness, canActOn } = await import("../src/scope.js");
  const a = "aaaaaaaa-0000-4000-8000-000000000001";
  const b = "bbbbbbbb-0000-4000-8000-000000000002";
  const other = "cccccccc-0000-4000-8000-000000000003";
  const mine = [{ id: a }, { id: b }];
  assert.deepEqual(pickBusiness(mine, undefined), { ok: true, biz: { id: a } });
  assert.deepEqual(pickBusiness(mine, b), { ok: true, biz: { id: b } });
  assert.deepEqual(pickBusiness(mine, b.toUpperCase()), { ok: true, biz: { id: b } });
  assert.deepEqual(pickBusiness(mine, [b, a]), { ok: true, biz: { id: b } });
  assert.deepEqual(pickBusiness(mine, other), { ok: false, status: 403, error: "forbidden_business" });
  assert.deepEqual(pickBusiness(mine, "' or 1=1 --"), { ok: false, status: 403, error: "forbidden_business" });
  assert.deepEqual(pickBusiness([], undefined), { ok: false, status: 404, error: "no_business" });
  assert.deepEqual(pickBusiness([], a), { ok: false, status: 403, error: "forbidden_business" });
  assert.equal(canActOn(mine, b), true);
  assert.equal(canActOn(mine, other), false);
});
