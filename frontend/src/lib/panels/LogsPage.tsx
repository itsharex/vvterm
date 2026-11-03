import {useCallback, useEffect, useMemo, useState} from 'react'
import {useBackend} from '../backend'
import {useToast} from '../ui/Toast'
import {useConfirm} from '../ui/Confirm'
import {errMsg} from '../util'
import {IconSearch, IconTrash} from '../ui/Icons'
import {SortMenu, usePref, type SortOption} from '../ui/ListTools'
import type {ActivityEntry} from '../types'
import {useT, type TFn} from '../i18n'

/** The groups of the filter chips and the kinds each one shows. */
export const LOG_GROUPS: {id: string; label: string; kinds: string[]}[] = [
  {id: 'all', label: 'All', kinds: []},
  {id: 'connections', label: 'Connections', kinds: ['connect', 'disconnect']},
  {id: 'files', label: 'Files', kinds: ['sftp', 'transfer']},
  {id: 'forwards', label: 'Forwards', kinds: ['forward']},
  {id: 'security', label: 'Security', kinds: ['hostkey', 'vault']},
  {id: 'sync', label: 'Sync', kinds: ['sync']},
  {id: 'assistant', label: 'Assistant', kinds: ['assistant']},
]

/** "28 Oct 14:32:10" in the user's locale, with the year only when it is not this one. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? {day: 'numeric', month: 'short'} : {day: 'numeric', month: 'short', year: 'numeric'})
  return date + ' ' + d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false})
}

type Sort = 'newest' | 'oldest' | 'host' | 'problems'
const SORT_VALUES: Sort[] = ['newest', 'oldest', 'host', 'problems']
const sortOptions = (t: TFn): SortOption<Sort>[] => [{value: 'newest', label: t('Newest first')}, {value: 'oldest', label: t('Oldest first')}, {value: 'host', label: t('Host')}, {value: 'problems', label: t('Problems first')}]

/**
 * Logs: what happened in Vutty: connections and how they ended, trusted host keys, forwards, SFTP
 * transfers, unlocks. Newest first, live. Secrets are never written to it.
 */
export function LogsPage() {
  const be = useBackend()
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState<ActivityEntry[] | null>(null)
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [sort, setSort] = usePref<Sort>('vutty.logs.sort', SORT_VALUES, 'newest')

  const reload = useCallback(async () => {
    try {
      const kinds = LOG_GROUPS.find(g => g.id === group)?.kinds ?? []
      setItems((await be.logs.list({kinds, query: q, limit: 500})) ?? [])
      setError('')
    } catch (e) {
      setItems([])
      setError(errMsg(e))
    }
  }, [be, group, q])
  useEffect(() => {
    void reload()
    return be.on('log:added', () => void reload())
  }, [be, reload])

  const shown = useMemo(() => {
    const when = (e: ActivityEntry) => Date.parse(e.at) || 0
    const newest = (a: ActivityEntry, b: ActivityEntry) => when(b) - when(a) || b.id - a.id
    return [...(items ?? [])].sort((a, b) => {
      switch (sort) {
        case 'oldest': return -newest(a, b)
        case 'host': return (a.host_label ?? '').localeCompare(b.host_label ?? '', undefined, {sensitivity: 'base', numeric: true}) || newest(a, b)
        case 'problems': return Number(a.ok) - Number(b.ok) || newest(a, b)
        default: return newest(a, b)
      }
    })
  }, [items, sort])

  const clear = async () => {
    if (!(await confirm(t('Clear the whole log? This cannot be undone.'), {confirmLabel: t('Clear'), danger: true}))) return
    try {
      await be.logs.clear()
      toast.info(t('Log cleared'))
      await reload()
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  const groupLabel: Record<string, string> = {all: t('All'), connections: t('Connections'), files: t('Files'), forwards: t('Forwards'), security: t('Security'), sync: t('Sync'), assistant: t('Assistant')}

  return (
    <div className="hosts-page" aria-label={t('Logs')}>
      <div className="toolbar list-toolbar">
        <div className="search-box small grow"><IconSearch size={14} /><input aria-label={t('Search logs')} placeholder={t('Search logs')} value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="chips" role="group" aria-label={t('Show')}>
          {LOG_GROUPS.map(g => (
            <button key={g.id} className={'chip' + (group === g.id ? ' on' : '')} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{groupLabel[g.id] ?? g.label}</button>
          ))}
        </div>
        <SortMenu value={sort} options={sortOptions(t)} onChange={setSort} />
        <button className="ghost-btn danger" aria-label={t('Clear logs')} onClick={clear} disabled={!items?.length && !q && group === 'all'}><IconTrash size={14} /> {t('Clear')}</button>
      </div>

      <h3 className="sec-title">{t('Logs')}</h3>
      <div className="log-table" role="table" aria-label={t('Activity')}>
        {shown.map(e => (
          <div key={e.id} role="row" className={'log-row' + (e.ok ? '' : ' bad')}>
            <span role="cell" className="log-when muted">{formatWhen(e.at)}</span>
            <span role="cell" className="log-dot" aria-label={e.ok ? t('ok') : t('failed')} />
            <span role="cell" className="log-host">{e.host_label ?? ''}</span>
            <span role="cell" className="log-msg">{e.message}</span>
          </div>
        ))}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {items && items.length === 0 && !error && <div className="empty-hint">{q || group !== 'all' ? t('Nothing matches.') : t('Nothing has happened yet. Connections, transfers and forwards show up here.')}</div>}
    </div>
  )
}
