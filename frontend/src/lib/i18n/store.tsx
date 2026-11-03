import {useContext, useEffect, useSyncExternalStore, type ReactNode} from 'react'
import {BackendContext} from '../backend'
import {I18nProvider, resolveLang} from './index'

/**
 * The language setting, kept where every window of the app can read it before the saved settings have arrived (the lock
 * screen is drawn first): the last value is cached in localStorage. The settings page and the app tell the store when they have
 * the real value.
 */
const KEY = 'vutty.language'
const listeners = new Set<() => void>()

function read(): string {
  try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' }
}
let setting = read()

export function setLanguageSetting(s: string | undefined) {
  const next = s || 'auto'
  if (next === setting) return
  setting = next
  try { localStorage.setItem(KEY, next) } catch { /* private window: it is only a cache */ }
  listeners.forEach(f => f())
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
export const useLanguageSetting = () => useSyncExternalStore(subscribe, () => setting)

/** Wraps the app: the language of the setting (or of the system, for auto) for everything inside. */
export function LanguageRoot({children}: {children: ReactNode}) {
  const lang = resolveLang(useLanguageSetting())
  if (typeof document !== 'undefined') document.documentElement.lang = lang
  const backend = useContext(BackendContext) // absent in a bare render: then there is no menu to tell
  // the native menu bar is made in Go: it is told the language the page shows
  useEffect(() => { backend?.system.setLanguage(lang)?.catch(() => {}) }, [backend, lang])
  return <I18nProvider lang={lang}>{children}</I18nProvider>
}
