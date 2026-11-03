import {useState} from 'react'
import {TERMINAL_THEMES, type TermTheme} from './themes'
import {useT} from '../i18n'

/** A tiny terminal in a theme's colours, with its six ANSI colours as a strip along the bottom. */
export function ThemeCard({theme, large}: {theme: TermTheme['theme']; large?: boolean}) {
  const strip = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan]
  return (
    <span className={'theme-thumb' + (large ? ' large' : '')} style={{background: theme.background}} aria-hidden="true">
      <i style={{background: theme.foreground, width: '82%'}} />
      <i style={{background: theme.green, width: '96%'}} />
      <i style={{background: theme.blue, width: '46%'}} />
      <span className="theme-strip">{strip.map((c, k) => <b key={k} style={{background: c}} />)}</span>
    </span>
  )
}

interface Props {
  /** theme id, or "" for "use the app setting" */
  value: string
  onChange(id: string): void
  /** the theme that "use the app setting" resolves to, drawn on the card */
  inherited: TermTheme
}

/**
 * A card showing the chosen theme as a picture and its name; opening it lists every theme as a picture too.
 */
export function ThemePicker({value, onChange, inherited}: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const chosen = value ? TERMINAL_THEMES.find(x => x.id === value) ?? inherited : inherited
  const name = value ? chosen.name : t('Use the app setting')
  const pick = (id: string) => { onChange(id); setOpen(false) }
  return (
    <div className="theme-picker">
      <button type="button" className="theme-current" aria-label={t('Terminal theme, {name}', {name})} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen(o => !o)}>
        <ThemeCard theme={chosen.theme} large />
        <span className="theme-name">{name}</span>
      </button>
      {open && (
        <div className="theme-list" role="listbox" aria-label={t('Terminal themes')}>
          <button type="button" role="option" aria-selected={value === ''} className={value === '' ? 'on' : ''} onClick={() => pick('')}>
            <ThemeCard theme={inherited.theme} /><span className="theme-name">{t('Use the app setting')}<small>{t('Settings → Terminal')}</small></span>
          </button>
          {TERMINAL_THEMES.map(x => (
            <button type="button" key={x.id} role="option" aria-selected={value === x.id} className={value === x.id ? 'on' : ''} onClick={() => pick(x.id)}>
              <ThemeCard theme={x.theme} /><span className="theme-name">{x.name}<small>{x.dark ? t('dark') : t('light')}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
