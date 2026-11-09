import { locale, type Lang } from "@/i18n";

// Dates and times in the visitor's language. Relative times don't depend on the time zone; absolute ones
// use the business's time zone when it's known, so the server and the browser print the same thing.

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function relativeTime(iso: string | null | undefined, lang: Lang, now: number = Date.now()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diff) >= seconds) return rtf.format(Math.round(diff / seconds), unit);
  }
  return rtf.format(0, "minute");
}

export function dateTime(iso: string | null | undefined, lang: Lang, timeZone?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short" }).format(d);
  }
}

export function timeOnly(iso: string, lang: Lang, timeZone?: string): string {
  const d = new Date(iso);
  try {
    return new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale(lang), { hour: "2-digit", minute: "2-digit" }).format(d);
  }
}

export function formatNumber(n: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

/** "+34600000000" from any spelling of an international number (the backend stores digits only). */
export function prettyPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : value;
}

/** wa.me link for a number in any spelling. */
export function waLink(value: string | null | undefined, text?: string): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
