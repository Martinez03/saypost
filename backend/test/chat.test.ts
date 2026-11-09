// The dashboard's web chat: where the agent's answer goes (web never reaches WhatsApp), that approvals
// still need the existing endpoints, the per-business queue, input validation and the rate limit.
// No network, no database: deps are faked.
import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";

process.env.SUPABASE_URL ??= "http://localhost:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test";

const { chatRoutes, parseChatBody, MAX_FILE_BYTES } = await import("../src/chat.js");
const { deliverAgentOutput } = await import("../src/agent/agent.js");
const { TOOLS } = await import("../src/agent/tools.js");
const { businessContext } = await import("../src/agent/prompt.js");
const approval = await import("../src/approval.js");
const { enqueue } = await import("../src/queue.js");
const { createRateLimiter } = await import("../src/invites.js");
type Business = import("../src/db.js").Business;
type ActionRow = import("../src/db.js").ActionRow;
type ChatDeps = import("../src/chat.js").ChatDeps;
type AgentOutput = import("../src/agent/agent.js").AgentOutput;

const biz: Business = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
  approval_mode: "owner_whatsapp",
  name: "Bar La Prueba",
  category: "bar_restaurant",
  city: "Madrid",
  description: null,
  tone: "friendly",
  language: "es",
  timezone: "Europe/Madrid",
  notes: "",
  owner_phone: "34600000001",
  whatsapp_status: "active",
  whatsapp_conversation_id: "conv_1",
  whatsapp_account_id: "wacc_1",
  whatsapp_last_inbound_at: null,
  zernio_profile_id: "zprof_1",
  notify_comments: true,
  notify_reviews: true,
  notify_dms: true,
};

function proposal(source: ActionRow["source"] = "dashboard"): ActionRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    business_id: biz.id,
    kind: "publish",
    status: "pending",
    title: "Menú del día (IG, FB)",
    preview: "📝 Propuesta de post\n\n*Instagram + Facebook*\nHoy menú a 12 €",
    payload: { targets: [{ platform: "instagram", accountId: "a", text: "Hoy menú a 12 €" }] },
    context: null,
    source,
    result: null,
    error: null,
    decided_via: null,
    created_at: new Date().toISOString(),
    decided_at: null,
    executed_at: null,
  };
}

// 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function fakeDeps(out: AgentOutput | (() => Promise<AgentOutput>), over: Partial<ChatDeps> = {}) {
  const calls = {
    whatsapp: [] as string[],
    delivered: [] as ActionRow[][],
    messages: [] as Record<string, unknown>[],
    agent: [] as string[],
    uploads: 0,
    transcribed: 0,
    events: [] as string[],
  };
  const deps: ChatDeps = {
    enqueue,
    async getBusiness() {
      return { ...biz };
    },
    async addMessage(m) {
      calls.messages.push(m as Record<string, unknown>);
    },
    async addEvent(_id, type) {
      calls.events.push(type);
    },
    async uploadMedia() {
      calls.uploads++;
      return "https://media.example.com/p.png";
    },
    async transcribe() {
      calls.transcribed++;
      return "publica que hoy hay paella";
    },
    async runAgent(_b, channel) {
      calls.agent.push(channel);
      return typeof out === "function" ? out() : out;
    },
    sink: {
      async sendToOwner(_b, text) {
        calls.whatsapp.push(text);
        return true;
      },
      async deliverProposals(_b, actions) {
        calls.delivered.push(actions);
      },
      async addMessage(m) {
        calls.messages.push(m as Record<string, unknown>);
      },
    },
    limiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
    timeoutMs: 5_000,
    ...over,
  };
  return { deps, calls };
}

async function appWith(deps: ChatDeps, userId = "user-1") {
  const app = Fastify();
  app.addHook("preHandler", async (req) => {
    req.biz = { ...biz };
    req.userId = userId;
  });
  await chatRoutes(app, deps);
  return app;
}

test("web chat: the reply and the proposals stay on the web, nothing is sent to WhatsApp", async () => {
  const p = proposal();
  const { deps, calls } = fakeDeps({ reply: "Aquí lo tienes 👇", proposals: [p] });
  const app = await appWith(deps);
  const res = await app.inject({ method: "POST", url: "/api/chat", payload: { text: "Publica que hoy tenemos menú a 12 €" } });
  assert.equal(res.statusCode, 200);
  const json = res.json();
  assert.equal(json.reply, "Aquí lo tienes 👇");
  assert.deepEqual(json.proposals.map((a: ActionRow) => a.id), [p.id]);
  assert.deepEqual(calls.agent, ["web"]);
  assert.deepEqual(calls.whatsapp, [], "no WhatsApp message");
  assert.deepEqual(calls.delivered, [], "no WhatsApp proposal delivery");
  assert.deepEqual(
    calls.messages.map((m) => [m.direction, m.channel, m.body]),
    [
      ["in", "web", "Publica que hoy tenemos menú a 12 €"],
      ["out", "web", "Aquí lo tienes 👇"],
    ],
  );
});

test("sink routing: web only stores the reply; WhatsApp sends the reply and the proposals", async () => {
  for (const mode of ["owner_whatsapp", "agency_dashboard"] as const) {
    const { deps, calls } = fakeDeps({ reply: "", proposals: [] });
    await deliverAgentOutput({ ...biz, approval_mode: mode }, "web", { reply: "Hecho", proposals: [proposal()] }, deps.sink);
    assert.deepEqual(calls.whatsapp, [], mode);
    assert.deepEqual(calls.delivered, [], mode);
    assert.equal(calls.messages.length, 1);
    assert.equal(calls.messages[0]!.channel, "web");
  }
  const { deps, calls } = fakeDeps({ reply: "", proposals: [] });
  await deliverAgentOutput(biz, "whatsapp", { reply: "Aquí lo tienes 👇", proposals: [proposal("whatsapp")] }, deps.sink);
  assert.deepEqual(calls.whatsapp, ["Aquí lo tienes 👇"]);
  assert.equal(calls.delivered.length, 1);
  assert.equal(calls.messages.length, 0, "WhatsApp sends store their own rows (whatsapp.ts)");
});

test("web chat proposals: source dashboard, never delivered to or decided on WhatsApp, result back on the web", () => {
  assert.equal(approval.proposalSource("web"), "dashboard");
  assert.equal(approval.proposalSource("whatsapp"), "whatsapp");
  for (const mode of ["owner_whatsapp", "agency_dashboard", null]) {
    assert.equal(approval.proposalDelivery(mode, "dashboard"), "none", String(mode));
    assert.equal(approval.ownerGetsResult(mode, "dashboard"), false, String(mode));
  }
  // A "yes" or an old button on WhatsApp can't approve what was proposed in the web chat.
  assert.equal(approval.decidableOnWhatsapp({ source: "dashboard" }), false);
  assert.equal(approval.decidableOnWhatsapp({ source: "whatsapp" }), true);
  assert.equal(approval.decidableOnWhatsapp({ source: "webhook" }), true);
});

test("approvals still need the endpoints: a typed 'sí' is just a message, and the agent has no tool that executes", async () => {
  const { deps, calls } = fakeDeps({ reply: "Pulsa «Aprobar» en la tarjeta 👇", proposals: [] });
  const app = await appWith(deps);
  const res = await app.inject({ method: "POST", url: "/api/chat", payload: { text: "sí" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().proposals, []);
  assert.deepEqual(calls.agent, ["web"], "it goes to the agent like any message");
  assert.deepEqual(calls.whatsapp, []);
  // The agent can only propose: there is no tool to approve, publish or send.
  for (const tool of TOOLS) assert.ok(!/approve|confirm|execute|publish_now|send/.test(tool.name), tool.name);
  // And the prompt tells it so for the web.
  const ctx = businessContext(biz, [], [proposal()], new Date(), "web");
  assert.ok(ctx.includes("approves nothing"));
  assert.ok(!ctx.includes("<approval_by_agency>"));
  assert.ok(businessContext({ ...biz, approval_mode: "agency_dashboard" }, [], [], new Date(), "whatsapp").includes("<approval_by_agency>"));
});

test("web chat: photos are uploaded and stored with the message; voice notes are transcribed", async () => {
  const { deps, calls } = fakeDeps({ reply: "Qué buena pinta", proposals: [] });
  const app = await appWith(deps);
  let res = await app.inject({ method: "POST", url: "/api/chat", payload: { text: "Para Instagram", image: { data: PNG.toString("base64"), type: "image/png" } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().message, { kind: "image", body: "Para Instagram", mediaUrl: "https://media.example.com/p.png" });
  assert.equal(calls.uploads, 1);
  assert.equal(calls.messages[0]!.media_url, "https://media.example.com/p.png");

  res = await app.inject({ method: "POST", url: "/api/chat", payload: { audio: { data: Buffer.from("fake-opus").toString("base64"), type: "audio/webm;codecs=opus" } } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().message, { kind: "audio", body: "publica que hoy hay paella", mediaUrl: null });
  assert.equal(calls.transcribed, 1);
  assert.deepEqual(calls.whatsapp, []);
});

test("web chat input validation", () => {
  assert.equal(parseChatBody({}).ok, false);
  assert.equal(parseChatBody({ text: "   " }).ok, false);
  assert.deepEqual(parseChatBody({ text: "x".repeat(4001) }), { ok: false, status: 400, error: "text_too_long", message: "At most 4000 characters" });
  // Not an image (wrong magic bytes, or a type we don't take).
  const fake = { data: Buffer.from("<svg onload=alert(1)>").toString("base64"), type: "image/png" };
  assert.equal((parseChatBody({ image: fake }) as { error?: string }).error, "bad_image");
  assert.equal((parseChatBody({ image: { data: PNG.toString("base64"), type: "image/svg+xml" } }) as { error?: string }).error, "bad_image");
  assert.equal((parseChatBody({ audio: { data: "AAAA", type: "video/mp4" } }) as { error?: string }).error, "bad_audio");
  // Too big: refused before decoding.
  const big = { data: "A".repeat(Math.ceil(((MAX_FILE_BYTES + 10) * 4) / 3)), type: "image/png" };
  assert.deepEqual((parseChatBody({ image: big }) as { status?: number }).status, 413);
  // A data: URL prefix is fine.
  const ok = parseChatBody({ text: "hola", image: { data: `data:image/png;base64,${PNG.toString("base64")}`, type: "image/png" } });
  assert.ok(ok.ok && ok.image?.buf.length === PNG.length);
  assert.equal(parseChatBody({ image: { data: PNG.toString("base64"), type: "image/png" }, audio: { data: "AAAA", type: "audio/webm" } }).ok, false);
});

test("web chat: a per-user rate limit, and errors don't leak to WhatsApp", async () => {
  const { deps, calls } = fakeDeps({ reply: "ok", proposals: [] }, { limiter: createRateLimiter({ limit: 2, windowMs: 60_000 }) });
  const app = await appWith(deps);
  for (let i = 0; i < 2; i++) assert.equal((await app.inject({ method: "POST", url: "/api/chat", payload: { text: `hola ${i}` } })).statusCode, 200);
  const limited = await app.inject({ method: "POST", url: "/api/chat", payload: { text: "otra" } });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers["retry-after"]) > 0);
  assert.equal(calls.agent.length, 2);

  const failing = fakeDeps(async () => {
    throw new Error("claude down");
  });
  const app2 = await appWith(failing.deps);
  const res = await app2.inject({ method: "POST", url: "/api/chat", payload: { text: "hola" } });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error, "agent_failed");
  assert.deepEqual(failing.calls.events, ["agent.error"]);
  assert.deepEqual(failing.calls.whatsapp, [], "the WhatsApp error message is not sent for a web turn");
});

test("web chat: answers 202 when the agent is slow, and the reply still lands in the thread", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { deps, calls } = fakeDeps(
    async () => {
      await gate;
      return { reply: "Ya está", proposals: [] };
    },
    { timeoutMs: 30 },
  );
  const app = await appWith(deps);
  const res = await app.inject({ method: "POST", url: "/api/chat", payload: { text: "hola" } });
  assert.equal(res.statusCode, 202);
  assert.equal(res.json().pending, true);
  release();
  await enqueue(biz.id, async () => undefined); // wait for the turn to finish
  assert.deepEqual(
    calls.messages.map((m) => [m.direction, m.channel]),
    [
      ["in", "web"],
      ["out", "web"],
    ],
  );
});

test("one turn at a time per business, whatever the channel", async () => {
  const log: string[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const a = enqueue("biz-q", async () => {
    log.push("whatsapp:start");
    await sleep(30);
    log.push("whatsapp:end");
  });
  const b = enqueue("biz-q", async () => {
    log.push("web:start");
    return "web";
  });
  const other = enqueue("biz-other", async () => {
    log.push("other");
  });
  const failed = enqueue("biz-q", async () => {
    throw new Error("boom");
  });
  const after = enqueue("biz-q", async () => "after");
  await Promise.all([a, b, other]);
  await assert.rejects(failed, /boom/);
  assert.equal(await after, "after", "a failed job doesn't block the queue");
  assert.ok(log.indexOf("whatsapp:end") < log.indexOf("web:start"), log.join(","));
  assert.ok(log.indexOf("other") < log.indexOf("whatsapp:end"), "other businesses don't wait");
});
