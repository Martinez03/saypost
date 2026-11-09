import { en } from "./en";
import { es, type Dict } from "./es";

// Two languages, Spanish by default. The choice lives in the `lang` cookie (read on the server,
// set by the language toggle).

export type Lang = "es" | "en";
export type { Dict };

export const LANGS: Lang[] = ["es", "en"];
export const DEFAULT_LANG: Lang = "es";
export const LANG_COOKIE = "lang";

/** Shown in the toggle in their own language. */
export const LANG_NAMES: Record<Lang, string> = { es: "Español", en: "English" };

const DICTS: Record<Lang, Dict> = { es, en };

export function parseLang(value: string | null | undefined): Lang {
  return value === "en" || value === "es" ? value : DEFAULT_LANG;
}

export function getDict(lang: Lang): Dict {
  return DICTS[lang];
}

/** BCP 47 locale for Intl formatting. */
export function locale(lang: Lang): string {
  return lang === "es" ? "es-ES" : "en-GB";
}
