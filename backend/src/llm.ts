// Claude client: Opus 5.5 with adaptive thinking (always on), server-side refusal fallbacks and cost logging.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { logUsage } from "./db.js";

export const anthropic = new Anthropic({ apiKey: config.anthropicKey || undefined });

// $ per million tokens (input, output) for cost logging. Unknown models log at Opus rates.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

type CreateParams = Omit<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "betas" | "fallbacks">;

export async function claude(params: CreateParams, ctx: { businessId: string | null; purpose: string }): Promise<Anthropic.Beta.BetaMessage> {
  const res = await anthropic.beta.messages.create({
    model: config.model,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    ...params,
  });
  const [pin, pout] = PRICES[res.model] ?? PRICES[config.model] ?? [4, 20];
  const u = res.usage;
  const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1;
  await logUsage({
    business_id: ctx.businessId,
    provider: "anthropic",
    model: res.model,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cost_usd: (input * pin + (u.output_tokens ?? 0) * pout) / 1e6,
    purpose: ctx.purpose,
  });
  return res;
}

export function textOf(res: Anthropic.Beta.BetaMessage): string {
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
