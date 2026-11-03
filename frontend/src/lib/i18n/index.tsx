import {createContext, useContext, useMemo, type ReactNode} from 'react'

/**
 * Languages of the interface. The English text of the app is the key: `t('Delete group')` gives the English text when a
 * language has no entry for it, so a missing translation shows English, never a blank or a key name. A catalogue is a plain
 * object of English text -> translation, kept in locales/<language>/<area>.ts (one file per part of the app); all the files
 * of a language are merged here. scripts/check-i18n.mjs makes sure that every text used in the code is in every catalogue.
 *
 * Variables are written `{name}` and given as the second argument: `t('Delete "{name}"?', {name})`. For a count use
 * `tn(n, 'one host', '{n} hosts')`: English picks by the number, and the other languages have an entry for each of the two texts.
 */
export type Lang = 'en' | 'vi' | 'ja' | 'zh'
export type LangSetting = 'auto' | Lang

/** Names are written in their own language, so a person can find theirs whatever language the interface is in now. */
export const LANGUAGES: ReadonlyArray<{code: Lang; name: string}> = [
  {code: 'en', name: 'English'},
  {code: 'vi', name: 'Tiếng Việt'},
  {code: 'ja', name: '日本語'},
  {code: 'zh', name: '中文'},
]

export type Params = Record<string, string | number>
export type TFn = (text: string, params?: Params) => string
export type TnFn = (n: number, one: string, other: string, params?: Params) => string

const files = import.meta.glob<{default: Record<string, string>}>('./locales/*/*.ts', {eager: true})
const catalogues: Record<Lang, Record<string, string>> = {en: {}, vi: {}, ja: {}, zh: {}}
for (const [path, mod] of Object.entries(files)) {
  const lang = path.split('/')[2] as Lang
  if (lang in catalogues) Object.assign(catalogues[lang], mod.default)
}

/** The language for a setting: "auto" follows the language of the system (navigator.language). */
export function resolveLang(setting: string | undefined, system: string | undefined = typeof navigator === 'undefined' ? 'en' : navigator.language): Lang {
  const pick = (s: string): Lang | undefined => {
    const base = s.toLowerCase().split(/[-_]/)[0]
    return base === 'vi' || base === 'ja' || base === 'zh' || base === 'en' ? base : undefined
  }
  if (setting && setting !== 'auto') return pick(setting) ?? 'en'
  return pick(system ?? '') ?? 'en'
}

export function format(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}

export function translate(lang: Lang, text: string, params?: Params): string {
  return format(catalogues[lang][text] ?? text, params)
}

export function translateCount(lang: Lang, n: number, one: string, other: string, params?: Params): string {
  const key = n === 1 ? one : other
  return format(catalogues[lang][key] ?? key, {n, ...params})
}

/** What the language of the running interface is; module level code (not inside a component) uses `t` with it. */
let current: Lang = 'en'
export function setCurrentLang(l: Lang) { current = l }
export function currentLang(): Lang { return current }
/** For code that is not a component (an event handler, a table built at start-up): reads the language when it is called. */
export const t: TFn = (text, params) => translate(current, text, params)
export const tn: TnFn = (n, one, other, params) => translateCount(current, n, one, other, params)

/** Every catalogue key of a language, for the checks. */
export function catalogueKeys(lang: Lang): string[] { return Object.keys(catalogues[lang]) }

interface Ctx { lang: Lang; t: TFn; tn: TnFn }
const I18nContext = createContext<Ctx>({lang: 'en', t: (s, p) => format(s, p), tn: (n, o, x, p) => translateCount('en', n, o, x, p)})

export function I18nProvider({lang, children}: {lang: Lang; children: ReactNode}) {
  setCurrentLang(lang) // before the children render, so that `t` outside a component agrees with `useT`
  const value = useMemo<Ctx>(() => ({lang, t: (s, p) => translate(lang, s, p), tn: (n, o, x, p) => translateCount(lang, n, o, x, p)}), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** Translate inside a component: it renders again when the language changes. */
export function useT(): TFn { return useContext(I18nContext).t }
export function useTn(): TnFn { return useContext(I18nContext).tn }
export function useLang(): Lang { return useContext(I18nContext).lang }
