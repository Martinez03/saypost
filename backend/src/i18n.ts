// Fixed WhatsApp strings (everything else is written by Claude in the owner's language).
import type { Lang } from "./db.js";

const es = {
  welcome: (name: string) =>
    `¡Hola! Soy *Saypost* 👋, tu ayudante de redes para *${name}*.\n\nMándame un audio, un texto o una foto con lo que quieras publicar y te preparo los posts. También te aviso de reseñas y comentarios nuevos.\n\nPrueba: _"Publica que hoy tenemos menú del día a 12 €"_ o _"¿Cómo vamos esta semana?"_`,
  yes: "Sí ✅",
  no: "No ❌",
  askConfirmPublish: "¿Lo publico?",
  askConfirmReply: "¿Respondo esto?",
  askConfirmCancel: "¿Lo cancelo?",
  done: "✅ Hecho.",
  published: "✅ Publicado",
  scheduled: (when: string) => `🗓️ Programado para el ${when}`,
  replied: "✅ Respuesta publicada.",
  cancelled: "🗑️ Post cancelado.",
  rejected: "Vale, lo descarto. 👍",
  failed: (why: string) => `⚠️ No he podido hacerlo: ${why}`,
  alreadyDecided: "Esa propuesta ya estaba decidida.",
  nothingPending: "No tengo nada pendiente de confirmar. Cuéntame qué quieres publicar 🙂",
  transcribeFailed: "No he podido entender el audio 😅 ¿Me lo escribes?",
  error: "Uy, algo ha fallado por mi lado. Inténtalo otra vez en un momento.",
  newReview: (who: string, stars: string, platform: string, text: string) =>
    `⭐ *Nueva reseña* de ${who} ${stars} en ${platform}:\n«${text || "(sin texto)"}»`,
  newComment: (who: string, platform: string, text: string) => `💬 *Nuevo comentario* de ${who} en ${platform}:\n«${text}»`,
  newDm: (who: string, platform: string, text: string) => `📩 *Mensaje nuevo* de ${who} en ${platform}:\n«${text}»`,
  proposedReply: (reply: string) => `Te propongo responder:\n«${reply}»`,
  accountConnected: (platform: string, user: string) => `🔗 Conectada tu cuenta de ${platform}${user ? ` (${user})` : ""}.`,
  postFailed: (platforms: string) => `⚠️ Un post no se pudo publicar en ${platforms}. Míralo en el panel.`,
  otherPending: (n: number) => `(Tienes ${n} propuesta${n === 1 ? "" : "s"} más pendiente${n === 1 ? "" : "s"}: dime "sí" o mírala${n === 1 ? "" : "s"} en el panel.)`,
  evSendFailed: "No se pudo entregar un mensaje de WhatsApp",
  evAgentError: "Saypost no pudo responder",
  evWhatsappOn: "WhatsApp activado",
  evRejected: (title: string) => `Descartado: ${title}`,
  evInviteConnected: (platform: string, user: string) => `Tu cliente conectó ${platform}${user ? ` (${user})` : ""} desde la invitación`,
  agencyReviews: "Recibido 👍 Tu agencia lo revisa y te aviso cuando esté publicado.",
  agencyDecides: "Eso lo aprueba tu agencia desde su panel. Te aviso en cuanto esté publicado 👍",
};

const en: typeof es = {
  welcome: (name: string) =>
    `Hi! I'm *Saypost* 👋, your social media helper for *${name}*.\n\nSend me a voice note, a text or a photo with what you want to post and I'll prepare the posts. I'll also tell you about new reviews and comments.\n\nTry: _"Post that today's lunch menu is €12"_ or _"How are we doing this week?"_`,
  yes: "Yes ✅",
  no: "No ❌",
  askConfirmPublish: "Shall I post it?",
  askConfirmReply: "Shall I reply this?",
  askConfirmCancel: "Shall I cancel it?",
  done: "✅ Done.",
  published: "✅ Posted",
  scheduled: (when: string) => `🗓️ Scheduled for ${when}`,
  replied: "✅ Reply posted.",
  cancelled: "🗑️ Post cancelled.",
  rejected: "OK, I'll drop it. 👍",
  failed: (why: string) => `⚠️ I couldn't do it: ${why}`,
  alreadyDecided: "That proposal was already decided.",
  nothingPending: "Nothing waiting for your OK. Tell me what you want to post 🙂",
  transcribeFailed: "I couldn't understand the audio 😅 Can you type it?",
  error: "Oops, something failed on my side. Try again in a moment.",
  newReview: (who: string, stars: string, platform: string, text: string) =>
    `⭐ *New review* from ${who} ${stars} on ${platform}:\n«${text || "(no text)"}»`,
  newComment: (who: string, platform: string, text: string) => `💬 *New comment* from ${who} on ${platform}:\n«${text}»`,
  newDm: (who: string, platform: string, text: string) => `📩 *New message* from ${who} on ${platform}:\n«${text}»`,
  proposedReply: (reply: string) => `Suggested reply:\n«${reply}»`,
  accountConnected: (platform: string, user: string) => `🔗 Your ${platform} account is connected${user ? ` (${user})` : ""}.`,
  postFailed: (platforms: string) => `⚠️ A post could not be published on ${platforms}. Check the dashboard.`,
  otherPending: (n: number) => `(You have ${n} more proposal${n === 1 ? "" : "s"} waiting: say "yes" or check the dashboard.)`,
  evSendFailed: "A WhatsApp message could not be delivered",
  evAgentError: "Saypost could not answer",
  evWhatsappOn: "WhatsApp activated",
  evRejected: (title: string) => `Dropped: ${title}`,
  evInviteConnected: (platform: string, user: string) => `Your client connected ${platform}${user ? ` (${user})` : ""} from the invite link`,
  agencyReviews: "Got it 👍 Your agency will review it and I'll let you know once it's posted.",
  agencyDecides: "Your agency approves that from their dashboard. I'll let you know once it's posted 👍",
};

export function t(lang: Lang) {
  return lang === "en" ? en : es;
}

export const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  googlebusiness: "Google",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  twitter: "X",
  threads: "Threads",
  bluesky: "Bluesky",
  youtube: "YouTube",
  pinterest: "Pinterest",
  whatsapp: "WhatsApp",
};

export function platformName(p: string): string {
  return PLATFORM_NAMES[p] ?? p;
}

export function stars(rating: number | undefined | null, recommendation?: string | null): string {
  if (rating && rating > 0) return "★".repeat(Math.min(5, rating)) + "☆".repeat(Math.max(0, 5 - rating));
  if (recommendation === "positive") return "👍";
  if (recommendation === "negative") return "👎";
  return "";
}
