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
  const previews = originPattern("https://*--my-dilo.netlify.app");
  assert.ok(previews.test("https://6740abc--my-dilo.netlify.app"));
  assert.ok(!previews.test("https://evil.com/--my-dilo.netlify.app"));
  assert.ok(!previews.test("https://x--my-dilo.netlify.app.evil.com"));
  assert.ok(!previews.test("https://a.b--my-dilo.netlify.app"));
  assert.ok(!originPattern("https://dilo.example.com").test("https://diloXexample.com"));
});

test("the webhook setup script subscribes to exactly the events dispatch() handles", async () => {
  const { WEBHOOK_EVENTS } = await import("../src/social.js");
  const script = new URL("../../scripts/setup-zernio-webhook.mjs", import.meta.url).href;
  const { EVENTS } = (await import(script)) as { EVENTS: string[] };
  assert.deepEqual([...EVENTS].sort(), [...WEBHOOK_EVENTS].sort());
});
