import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { zhCN, type TranslationKey } from './zh-CN';
import { en } from './en';

export type Locale = 'zh-CN' | 'en';

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  'zh-CN': zhCN,
  en,
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
};

const STORAGE_KEY = 'avalon.locale';

export type TranslateParams = Record<string, string | number>;

export type Translate = (key: TranslationKey | string, params?: TranslateParams) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === 'en' || stored === 'zh-CN' ? stored : 'zh-CN';
  });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 隐私模式下忽略 */
    }
  }, []);

  const t = useCallback<Translate>(
    (key, params) => {
      const dict = DICTIONARIES[locale];
      const fallback = zhCN as Record<string, string>;
      const template = (dict as Record<string, string>)[key] ?? fallback[key] ?? key;
      return interpolate(template, params);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

export function useT(): Translate {
  return useI18n().t;
}
