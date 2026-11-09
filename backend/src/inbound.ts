// Messages from the business owner to Saypost on WhatsApp.
import { approveAction, rejectAction } from "./actions.js";
import { decidableOnWhatsapp, ownerCanDecideOnWhatsapp } from "./approval.js";
import { deliverAgentOutput, runAgent } from "./agent/agent.js";
import { addEvent, addMessage, getAction, getBusiness, getBusinessByPhone, pendingActions, updateBusiness, type Business } from "./db.js";
import { t } from "./i18n.js";
import { enqueue } from "./queue.js";
import { transcribe } from "./transcribe.js";
import { sendToOwner } from "./whatsapp.js";
import * as zernio from "./zernio.js";

export interface InboxMessageEvent {
  message: {
    id: string;
    conversationId: string;
    platform: string;
    direction: "incoming" | "outgoing";
    text: string | null;
    attachments: { type: string; url: string; mimeType?: string; payload?: { voice?: boolean } }[];
    sender: { id: string; name?: string; username?: string; phoneNumber?: string | null };
    sentAt: string;
  };
  conversation: { id: string; participantId?: string; participantName?: string; participantUsername?: string };
  account: { id: string; accountId?: string; profileId?: string; platform: string; username: string };
  metadata?: { interactiveType?: string; interactiveId?: string; buttonPayload?: string } | null;
}

export const YES = /^\s*(s[ií]+|sip|vale|ok(ay)?|dale|venga|adelante|publ[ií]ca(lo)?|perfecto|genial|correcto|yes|yep|sure|go( ahead)?|post it|do it)\s*[.!👍✅🙌]*\s*$/i;
export const NO = /^\s*(no|nop|nope|cancela(lo)?|desc[aá]rtalo|mejor no|no gracias|cancel|don'?t)\s*[.!❌👎]*\s*$/i;

// Per-business serialisation (queue.ts, shared with the web chat) + a short debounce so "photo + audio"
// sent back to back become one turn.
const timers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 3500;

function scheduleAgent(businessId: string) {
  const old = timers.get(businessId);
  if (old) clearTimeout(old);
  timers.set(
    businessId,
    setTimeout(() => {
      timers.delete(businessId);
      void enqueue(businessId, async () => {
        const biz = await getBusiness(businessId);
        if (!biz) return;
        if (biz.whatsapp_conversation_id && biz.whatsapp_account_id) void zernio.typing(biz.whatsapp_conversation_id, biz.whatsapp_account_id);
        try {
          await deliverAgentOutput(biz, "whatsapp", await runAgent(biz, "whatsapp"));
        } catch (e) {
          console.error("[agent] failed:", e);
          await addEvent(biz.id, "agent.error", t(biz.language).evAgentError, { error: String(e).slice(0, 300) });
          await sendToOwner(biz, t(biz.language).error);
        }
      });
    }, DEBOUNCE_MS),
  );
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export async function handleOwnerMessage(ev: InboxMessageEvent): Promise<void> {
  if (ev.message.direction !== "incoming") return;
  const phone = digits(ev.message.sender.phoneNumber) || digits(ev.message.sender.id);
  const biz = phone ? await getBusinessByPhone(phone) : null;
  if (!biz) {
    console.warn(`[inbound] WhatsApp message from an unknown number (…${phone.slice(-4)}); ignored`);
    return;
  }
  const firstContact = !biz.whatsapp_conversation_id;
  const patch: Partial<Business> = {
    whatsapp_status: "active",
    whatsapp_conversation_id: ev.conversation.id,
    whatsapp_account_id: ev.account.id,
    whatsapp_last_inbound_at: new Date().toISOString(),
  };
  await updateBusiness(biz.id, patch);
  Object.assign(biz, patch);
  void zernio.markRead(ev.conversation.id, ev.account.id);

  void enqueue(biz.id, () => processOwnerMessage(biz, ev, firstContact));
}

async function processOwnerMessage(biz: Business, ev: InboxMessageEvent, firstContact: boolean): Promise<void> {
  const s = t(biz.language);

  // 1. Button taps on a proposal: decided in code, never by the model.
  const tap = ev.metadata?.interactiveId ?? ev.metadata?.buttonPayload ?? "";
  const m = tap.match(/^(approve|reject):([0-9a-f-]{36})$/);
  if (m) {
    await addMessage({ business_id: biz.id, direction: "in", kind: "text", body: ev.message.text ?? (m[1] === "approve" ? s.yes : s.no), zernio_message_id: ev.message.id });
    // Agency mode: an old button (sent before the mode changed) decides nothing.
    if (!ownerCanDecideOnWhatsapp(biz.approval_mode)) await sendToOwner(biz, s.agencyDecides);
    else await decide(biz, m[2]!, m[1] === "approve");
    return;
  }

  // 2. Store the message (transcribe audio, upload photos/videos to Zernio).
  let kind: "text" | "audio" | "image" | "video" = "text";
  let body = (ev.message.text ?? "").trim();
  let mediaUrl: string | null = null;
  const att = ev.message.attachments?.[0];
  if (att) {
    try {
      const file = await zernio.downloadAttachment(att.url);
      if (att.type === "audio") {
        kind = "audio";
        body = await transcribe(file.buf, file.contentType, biz.id);
        if (!body) throw new Error("empty transcript");
      } else if (att.type === "image" || att.type === "video") {
        kind = att.type;
        const ext = att.type === "image" ? (file.contentType.includes("png") ? "png" : "jpg") : "mp4";
        mediaUrl = await zernio.uploadMedia(file.buf, file.contentType, `saypost-${Date.now()}.${ext}`);
      }
    } catch (e) {
      console.error("[inbound] attachment failed:", e);
      if (att.type === "audio") {
        await sendToOwner(biz, s.transcribeFailed);
        return;
      }
    }
  }
  await addMessage({ business_id: biz.id, direction: "in", kind, body, media_url: mediaUrl, zernio_message_id: ev.message.id });

  if (firstContact) {
    await sendToOwner(biz, s.welcome(biz.name));
    await addEvent(biz.id, "whatsapp.connected", s.evWhatsappOn);
    if (!body && !mediaUrl) return;
    if (/^\s*(hola|hello|hi|hey|buenas)\b/i.test(body) && body.length < 25) return;
  }

  // 3. A plain "yes"/"no" answers the latest proposal the owner got on WhatsApp (never a web chat one).
  if (kind === "text" && (YES.test(body) || NO.test(body))) {
    const pending = (await pendingActions(biz.id)).filter(decidableOnWhatsapp);
    if (pending.length && !ownerCanDecideOnWhatsapp(biz.approval_mode)) {
      await sendToOwner(biz, s.agencyDecides);
      return;
    }
    if (pending.length) {
      await decide(biz, pending[0]!.id, YES.test(body));
      if (pending.length > 1) await sendToOwner(biz, s.otherPending(pending.length - 1));
      return;
    }
  }

  // 4. Everything else goes to the agent.
  scheduleAgent(biz.id);
}

async function decide(biz: Business, actionId: string, approve: boolean) {
  const s = t(biz.language);
  if (!ownerCanDecideOnWhatsapp(biz.approval_mode)) {
    await sendToOwner(biz, s.agencyDecides);
    return;
  }
  const action = await getAction(actionId);
  if (!action || action.business_id !== biz.id || !decidableOnWhatsapp(action)) {
    await sendToOwner(biz, s.alreadyDecided);
    return;
  }
  if (approve) {
    const { message } = await approveAction(actionId, "whatsapp");
    if (message === "already_decided") await sendToOwner(biz, s.alreadyDecided);
  } else {
    const row = await rejectAction(actionId, "whatsapp");
    await sendToOwner(biz, row ? s.rejected : s.alreadyDecided);
  }
}
