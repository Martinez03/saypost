// Voice note → text with OpenAI's transcription API (Claude does not take audio input).
import { config } from "./config.js";
import { logUsage } from "./db.js";

const EXT: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/amr": "amr",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export async function transcribe(buf: Buffer, contentType: string, businessId: string): Promise<string> {
  if (!config.openaiKey) throw new Error("OPENAI_API_KEY is not set");
  const ct = contentType.split(";")[0]!.trim().toLowerCase();
  const ext = EXT[ct] ?? "ogg";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: ct || "audio/ogg" }), `voice.${ext}`);
  form.append("model", config.transcribeModel);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.openaiKey}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`transcription ${res.status}: ${json.error?.message ?? "unknown"}`);
  // Rough cost: Opus voice notes are ~2 KB/s; gpt-4o-mini-transcribe is $0.003 per minute.
  const seconds = Math.round(buf.length / 2000);
  await logUsage({ business_id: businessId, provider: "openai", model: config.transcribeModel, seconds, cost_usd: (seconds / 60) * 0.003, purpose: "transcribe" });
  return (json.text ?? "").trim();
}
