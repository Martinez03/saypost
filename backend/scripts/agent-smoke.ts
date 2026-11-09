// One real Claude call with the agent's tools and a fake business, to check that the tool schemas
// are accepted and the model proposes a post. No database writes except the usage ledger, no WhatsApp.
// Usage: npx tsx --env-file=.env.local scripts/agent-smoke.ts "Publica que hoy hay cocido a 12 €"
import type Anthropic from "@anthropic-ai/sdk";
import { businessContext, SYSTEM_PROMPT } from "../src/agent/prompt.js";
import { TOOLS } from "../src/agent/tools.js";
import type { Business, SocialAccount } from "../src/db.js";
import { claude, textOf } from "../src/llm.js";

const biz = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Bar La Prueba",
  category: "bar",
  city: "Madrid",
  description: "Bar de barrio con menú del día de lunes a viernes. Abrimos de 8 a 17h.",
  tone: "friendly",
  language: "es",
  timezone: "Europe/Madrid",
  notes: "",
} as Business;
const accounts = [
  { platform: "instagram", username: "barlaprueba", zernio_account_id: "acc_ig" },
  { platform: "facebook", username: "Bar La Prueba", zernio_account_id: "acc_fb" },
  { platform: "googlebusiness", username: "Bar La Prueba", zernio_account_id: "acc_gb" },
] as SocialAccount[];

const userText = process.argv[2] ?? "Publica que hoy tenemos cocido madrileño a 12 euros hasta las 4";
const res = await claude(
  {
    max_tokens: 8000,
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: businessContext(biz, accounts, [], new Date()) },
    ],
    tools: TOOLS,
    messages: [{ role: "user", content: [{ type: "text", text: `[voice note transcript] ${userText}` }] }],
    output_config: { effort: "medium" },
  },
  { businessId: null, purpose: "smoke" },
);
console.log("stop_reason:", res.stop_reason, "model:", res.model);
console.log("text:", textOf(res));
for (const b of res.content) if (b.type === "tool_use") console.log("tool:", b.name, JSON.stringify(b.input, null, 2));
void (null as unknown as Anthropic);
