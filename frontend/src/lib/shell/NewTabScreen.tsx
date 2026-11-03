import {useEffect, useMemo, useRef, useState} from 'react'
import {OsIcon} from '../ui/OsIcon'
import {IconServer, IconSearch, IconTerminal} from '../ui/Icons'
import {formatCombo} from '../shortcuts/shortcuts'
import {getRecent} from '../hosts/recent'
import type {Tab} from '../layout'
import type {Group, Host} from '../types'
import {useT} from '../i18n'

interface Props {
  hosts: Host[]
  groups: Group[]
  /** the open tabs, searchable too */
  tabs: Tab[]
  /** a host was picked: this tab becomes a connection to it */
  onOpen(h: Host): void
  /** an open tab was picked */
  onSelectTab(id: string): void
  /** a terminal on this computer */
  onLocal?(): void
}

type Row = {key: string; label: string; os?: string; where: string; pick(): void; tab?: boolean; local?: boolean}

/**
 * What a new tab shows: a search box for hosts and open tabs, and the connections used
 * most recently. Enter opens the highlighted row.
 */
export function NewTabScreen({hosts, groups, tabs, onOpen, onSelectTab, onLocal}: Props) {
  const t = useT()
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  // Cmd/Ctrl+K jumps to the search box
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus() } }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const path = (h: Host) => {
    const names: string[] = []
    for (let id = h.group_id, n = 0; id && n < 16; n++) {
      const g = groups.find(x => x.id === id)
      if (!g) break
      names.unshift(g.name)
      id = g.parent_id ?? ''
    }
    return names.length ? names.join(' / ') : t('No group')
  }

  const rows: Row[] = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hostRow = (h: Host): Row => ({key: 'h' + h.id, label: h.label, os: h.os, where: path(h), pick: () => onOpen(h)})
    const local: Row[] = onLocal ? [{key: 'local', label: t('Local Terminal'), where: t('This computer'), local: true, pick: onLocal}] : []
    if (!needle) {
      const recent = getRecent().map(id => hosts.find(h => h.id === id)).filter((h): h is Host => !!h)
      const list = recent.length ? recent : hosts
      return [...local, ...list.slice(0, 8).map(hostRow)]
    }
    const hs = hosts.filter(h => `${h.label} ${h.hostname} ${h.username}`.toLowerCase().includes(needle)).map(hostRow)
    const ts: Row[] = tabs.filter(tb => tb.kind !== 'new' && tb.title.toLowerCase().includes(needle))
      .map(tb => ({key: 't' + tb.id, label: tb.title, where: t('Open tab'), tab: true, pick: () => onSelectTab(tb.id)}))
    const wantsLocal = 'local terminal this computer shell'.includes(needle) || needle === 'terminal'
    return [...(wantsLocal ? local : []), ...hs, ...ts]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hosts, groups, tabs, onLocal, t])

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(rows.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') rows[Math.min(at, rows.length - 1)]?.pick()
  }

  const renderRow = (r: Row, i: number) => (
    <button key={r.key} role="option" aria-selected={i === at} className={'newtab-row' + (i === at ? ' on' : '')} onClick={r.pick} onMouseEnter={() => setAt(i)}>
      {r.tab || r.local ? <span className="newtab-os"><IconTerminal size={13} /></span> : r.os ? <OsIcon os={r.os} size={20} /> : <span className="newtab-os"><IconServer size={13} /></span>}
      <span className="newtab-name">{r.label}</span>
      <span className="newtab-where">{r.where}</span>
    </button>
  )

  return (
    <div className="newtab" data-testid="new-tab">
      <label className="newtab-search">
        <IconSearch size={16} />
        <input ref={input} aria-label={t('Search hosts or tabs')} placeholder={t('Search hosts or tabs')} value={q}
          onChange={e => { setQ(e.target.value); setAt(0) }} onKeyDown={key} />
        <kbd>{formatCombo('Mod+K')}</kbd>
      </label>
      {rows.some(r => r.local) && (
        <div className="newtab-card quick" role="listbox" aria-label={t('Start')}>
          {rows.map((r, i) => r.local && renderRow(r, i))}
        </div>
      )}
      <div className="newtab-card">
        <div className="newtab-head"><b>{q.trim() ? t('Results') : t('Recent connections')}</b></div>
        <div className="newtab-list" role="listbox" aria-label={q.trim() ? t('Results') : t('Recent connections')}>
          {rows.map((r, i) => !r.local && renderRow(r, i))}
          {rows.every(r => r.local) && <div className="newtab-empty">{hosts.length ? t('Nothing matches.') : t('No hosts yet. Add one on the Vaults page.')}</div>}
        </div>
      </div>
    </div>
  )
}
