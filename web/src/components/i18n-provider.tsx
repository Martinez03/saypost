"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LANG, getDict, type Dict, type Lang } from "@/i18n";

// The root layout reads the `lang` cookie and passes it here; client components read the dictionary
// with useI18n(). Both dictionaries are small, so they ship together.

const I18nContext = createContext<{ lang: Lang; t: Dict }>({ lang: DEFAULT_LANG, t: getDict(DEFAULT_LANG) });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <I18nContext.Provider value={{ lang, t: getDict(lang) }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
