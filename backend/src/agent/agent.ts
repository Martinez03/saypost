// The agent: builds the conversation from the stored messages (WhatsApp and web chat, one thread per
// business), runs Claude with the tools and returns its reply and the proposals it created. It sends
// nothing: the caller decides where the answer goes (deliverAgentOutput, by the channel it answers).
import type Anthropic from "@anthropic-ai/sdk";
import { deliverProposals } from "../actions.js";
import { addMessage, listAccounts, pendingActions, recentMessages, type ActionRow, type Business, type Channel, type MessageRow } from "../db.js";
import { t } from "../i18n.js";
import { claude, textOf } from "../llm.js";
import { sendToOwner } from "../whatsapp.js";
import { businessContext, SYSTEM_PROMPT } from "./prompt.js";
import { runTool, TOOLS } from "./tools.js";

export interface AgentOutput {
  /** The agent's text answer ("" when it has nothing to add). */
  reply: string;
  /** Pending actions created in this turn and still live (not replaced later in the same turn), oldest first. */
  proposals: ActionRow[];
}

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;

const MAX_STEPS = 8;
const MAX_IMAGES = 3;

/** Turns the stored WhatsApp thread into alternating user/assistant turns. */
export function buildMessages(rows: MessageRow[]): Msg[] {
  const imageIdx = new Set(
    rows
      .map((r, i) => (r.direction === "in" && r.kind === "image" && r.media_url ? i : -1))
      .filter((i) => i >= 0)
      .slice(-MAX_IMAGES),
  );
  const out: Msg[] = [];
  rows.forEach((r, i) => {
    const role = r.direction === "in" ? "user" : "assistant";
    const blocks: Block[] = [];
    if (r.direction === "in") {
      if (r.kind === "audio") blocks.push({ type: "text", text: `[voice note transcript] ${r.body}` });
      else if ((r.kind === "image" || r.kind === "video") && r.media_url) {
        if (imageIdx.has(i) && r.kind === "image") blocks.push({ type: "image", source: { type: "url", url: r.media_url } });
        blocks.push({ type: "text", text: `[${r.kind === "image" ? "photo" : "video"}: ${r.media_url}]${r.body ? " " + r.body : ""}` });
      } else if (r.body) blocks.push({ type: "text", text: r.body });
    } else if (r.body) {
      blocks.push({ type: "text", text: r.body });
    }
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) (last.content as Block[]).push(...blocks);
    else out.push({ role, content: blocks });
  });
  while (out.length && out[0]!.role !== "user") out.shift();
  // Assistant turns can't carry images; and the API needs the last turn to be the user's.
  while (out.length && out[out.length - 1]!.role !== "user") out.pop();
  return out;
}

/** Answers the latest message of the business's thread, which came in on `channel`. Sends nothing. */
export async function runAgent(biz: Business, channel: Channel): Promise<AgentOutput> {
  const s = t(biz.language);
  const [rows, accounts, pending] = await Promise.all([recentMessages(biz.id, 20), listAccounts(biz.id), pendingActions(biz.id)]);
  const messages = buildMessages(rows);
  if (!messages.length) return { reply: "", proposals: [] };

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: businessContext(biz, accounts, pending, new Date(), channel) },
  ];
  const created: ActionRow[] = [];
  let reply = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await claude(
      { max_tokens: 8000, system, tools: TOOLS, messages, output_config: { effort: "medium" } },
      { businessId: biz.id, purpose: "agent" },
    );
    if (res.stop_reason === "refusal") {
      reply = s.error;
      break;
    }
    const text = textOf(res);
    if (text) reply = text;
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      break;
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      try {
        const r = await runTool(biz, u.name, (u.input ?? {}) as Record<string, unknown>, channel);
        if (r.created) created.push(...r.created);
        results.push({ type: "tool_result", tool_use_id: u.id, content: r.content, is_error: r.isError });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }

  // Proposals replaced later in the same turn are already "superseded": only the live ones count.
  const proposals = (await pendingActions(biz.id)).filter((p) => created.some((c) => c.id === p.id)).reverse();
  return { reply, proposals };
}

export interface SinkDeps {
  sendToOwner(biz: Business, text: string): Promise<boolean>;
  deliverProposals(biz: Business, actions: ActionRow[]): Promise<void>;
  addMessage: typeof addMessage;
}

export const defaultSinkDeps: SinkDeps = { sendToOwner: (biz, text) => sendToOwner(biz, text), deliverProposals: (biz, a) => deliverProposals(biz, a), addMessage };

/**
 * Sends the agent's answer back on the channel the owner wrote on.
 * - whatsapp: the reply, then each proposal as the business's approval mode says (approval.ts).
 * - web: the reply is stored in the thread (channel "web") and nothing at all goes to WhatsApp; the
 *   dashboard shows the proposals as cards and decides them through /api/actions/:id/approve | reject.
 */
export async function deliverAgentOutput(biz: Business, channel: Channel, out: AgentOutput, deps: SinkDeps = defaultSinkDeps): Promise<void> {
  if (channel === "web") {
    if (out.reply) await deps.addMessage({ business_id: biz.id, direction: "out", kind: "text", body: out.reply, channel: "web" });
    return;
  }
  if (out.reply) await deps.sendToOwner(biz, out.reply);
  await deps.deliverProposals(biz, out.proposals);
}
