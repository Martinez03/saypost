import type { BusinessLanguage, Tone } from "@/lib/database.types";

// Values stored in businesses.category / tone / language / timezone. Labels live in the dictionaries.

export const CATEGORIES = ["bar_restaurant", "cafe", "beauty", "shop", "gym", "clinic", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const TONES: Tone[] = ["friendly", "professional", "fun", "elegant"];
export const LANGUAGES: BusinessLanguage[] = ["es", "en"];

export const DEFAULT_TIMEZONE = "Europe/Madrid";

/** Time zones for Spain, Latin America and a few more; the business's own is added if it's not here. */
export const TIMEZONES = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Caracas",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Guatemala",
  "America/Panama",
  "America/Santo_Domingo",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

export function isCategory(v: string | null | undefined): v is Category {
  return !!v && (CATEGORIES as readonly string[]).includes(v);
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
