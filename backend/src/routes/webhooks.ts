// Zernio webhooks: verify the HMAC signature, dedupe by event id, answer 200 fast and process async.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config, isProd } from "../config.js";
import { db } from "../db.js";
import { dispatch } from "../social.js";

export function verifySignature(raw: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const given = header.replace(/^sha256=/i, "").trim().toLowerCase();
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post("/webhooks/zernio", async (req, reply) => {
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? "";
    if (config.zernioWebhookSecret) {
      const sig = (req.headers["x-zernio-signature"] ?? req.headers["x-late-signature"]) as string | undefined;
      if (!verifySignature(raw, sig, config.zernioWebhookSecret)) {
        req.log.warn("zernio webhook: bad signature");
        return reply.code(401).send({ error: "bad_signature" });
      }
    } else if (isProd) {
      return reply.code(503).send({ error: "webhook_secret_not_configured" });
    }

    const ev = req.body as { id?: string; event?: string } & Record<string, unknown>;
    if (!ev?.id || !ev.event) return reply.code(400).send({ error: "bad_payload" });

    const { error } = await db.from("webhook_events").insert({ id: ev.id, event: ev.event });
    if (error) {
      if (error.code === "23505") return { ok: true, duplicate: true };
      req.log.error({ err: error.message }, "webhook_events insert failed");
      return reply.code(500).send({ error: "db" });
    }
    req.log.info({ event: ev.event, id: ev.id }, "zernio webhook");
    setImmediate(() => {
      dispatch(ev as never).catch((e) => console.error(`[webhook] ${ev.event} ${ev.id} failed:`, e));
    });
    return { ok: true };
  });
}
