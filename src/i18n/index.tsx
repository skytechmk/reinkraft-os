import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLang, interpolate, setActiveLang, unitName, type Lang, type Params } from './core';
import * as common from './messages/common';
import * as shell from './messages/shell';
import * as workspace from './messages/workspace';
import * as inventory from './messages/inventory';
import * as buys from './messages/buys';
import * as calendar from './messages/calendar';
import * as exportsMsgs from './messages/exports';
import * as settings from './messages/settings';
import * as invoices from './messages/invoices';
import * as docs from './messages/docs';
import * as workbench from './messages/workbench';

type Messages = typeof common.en & typeof shell.en & typeof workspace.en & typeof inventory.en & typeof buys.en &
  typeof calendar.en & typeof exportsMsgs.en & typeof settings.en & typeof invoices.en & typeof docs.en & typeof workbench.en;
export type MessageKey = keyof Messages;

const DICT: Record<Lang, Record<string, string>> = {
  en: { ...common.en, ...shell.en, ...workspace.en, ...inventory.en, ...buys.en, ...calendar.en, ...exportsMsgs.en, ...settings.en, ...invoices.en, ...docs.en, ...workbench.en },
  mk: { ...common.mk, ...shell.mk, ...workspace.mk, ...inventory.mk, ...buys.mk, ...calendar.mk, ...exportsMsgs.mk, ...settings.mk, ...invoices.mk, ...docs.mk, ...workbench.mk },
};

/** Translate without React (documents, CSV headers). Falls back to English, then to the key. */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  return interpolate(DICT[lang][key] ?? DICT.en[key] ?? key, params);
}

export type { Lang } from './core';
export { getLang, unitName } from './core';

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey, params?: Params) => string;
  unit: (u: string) => string;
}

const fallback: Ctx = { lang: 'en', setLang: () => undefined, t: (k, p) => translate('en', k, p), unit: (u) => unitName(u, 'en') };
const I18nContext = createContext<Ctx>(fallback);

const STORAGE_KEY = 'reinkraft.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'mk') return saved;
  } catch { /* storage can be blocked; fall through */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('mk') ? 'mk' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  setActiveLang(lang);                       // before children render, so formatters see it

  useEffect(() => {
    document.documentElement.lang = lang;    // lets the browser pick Macedonian letter forms
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (k, p) => translate(lang, k, p), unit: (u) => unitName(u, lang) }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = (): Ctx => useContext(I18nContext);
export { getLang as currentLang };
