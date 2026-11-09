import { LANG_COOKIE, type Lang } from "./index";

/** Stores the chosen language for a year; the server components read it on the next render. */
export function storeLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = lang;
}
