import cors from "@fastify/cors";
import Fastify from "fastify";
import { config, isAllowedOrigin } from "./config.js";
import { apiRoutes } from "./routes/api.js";
import { publicRoutes } from "./routes/public.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { pollReviews } from "./social.js";

const app = Fastify({ logger: { level: "info" }, bodyLimit: 2 * 1024 * 1024, trustProxy: true });

// Keep the raw body: the Zernio webhook signature is computed over the exact bytes.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as unknown as { rawBody: string }).rawBody = body as string;
  try {
    done(null, body ? JSON.parse(body as string) : {});
  } catch (e) {
    (e as { statusCode?: number }).statusCode = 400;
    done(e as Error, undefined);
  }
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, isAllowedOrigin(origin));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Business-Id"],
});

app.get("/health", async () => ({ ok: true, zernio: !!config.zernioKey, claude: !!config.anthropicKey, transcribe: !!config.openaiKey }));
await app.register(webhookRoutes);
await app.register(async (scoped) => apiRoutes(scoped));
await app.register(async (scoped) => publicRoutes(scoped));

if (config.reviewPollSeconds > 0) {
  let running = false;
  setInterval(() => {
    if (running || !config.zernioKey) return;
    running = true;
    pollReviews()
      .catch((e) => console.error("[poll]", e))
      .finally(() => (running = false));
  }, config.reviewPollSeconds * 1000);
}

await app.listen({ port: config.port, host: "0.0.0.0" });
