// Messages from Dilo to the business owner on WhatsApp (through Zernio's inbox API).
import { addEvent, addMessage, type Business } from "./db.js";
import { t } from "./i18n.js";
import * as zernio from "./zernio.js";

export interface Button {
  title: string;
  payload: string;
}

/** WhatsApp caps the body of a message with reply buttons at 1024 characters. */
const BUTTON_BODY_MAX = 1000;

export async function sendToOwner(biz: Business, text: string, buttons?: Button[]): Promise<boolean> {
  if (!biz.whatsapp_conversation_id || !biz.whatsapp_account_id) {
    console.warn(`[wa] business ${biz.id} has no WhatsApp conversation yet; not sent`);
    return false;
  }
  try {
    if (buttons?.length && text.length > BUTTON_BODY_MAX) {
      // Long preview first, then a short question carrying the buttons.
      await send(biz, text);
      const lastLine = text.trim().split("\n").pop() ?? "";
      const question = lastLine.length > 0 && lastLine.length < 120 && lastLine.endsWith("?") ? lastLine : "👆";
      await send(biz, question, buttons);
    } else {
      await send(biz, text, buttons);
    }
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[wa] send failed for ${biz.id}: ${msg}`);
    await addEvent(biz.id, "whatsapp.send_failed", t(biz.language).evSendFailed, { error: msg.slice(0, 500) });
    return false;
  }
}

async function send(biz: Business, text: string, buttons?: Button[]) {
  const r = await zernio.sendMessage(biz.whatsapp_conversation_id!, biz.whatsapp_account_id!, { message: text, buttons });
  await addMessage({ business_id: biz.id, direction: "out", kind: "text", body: text, zernio_message_id: r.messageId ?? null });
}
