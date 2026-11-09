import "server-only";
import { cookies } from "next/headers";
import { getDict, LANG_COOKIE, parseLang, type Lang } from "./index";

export async function getLang(): Promise<Lang> {
  const jar = await cookies();
  return parseLang(jar.get(LANG_COOKIE)?.value);
}

/** The dictionary for the visitor's language, for server components. */
export async function getI18n() {
  const lang = await getLang();
  return { lang, t: getDict(lang) };
}
