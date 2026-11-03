import {useMemo, useState} from 'react'
import {Snippet} from '../types'
import {IconBraces, IconCopy, IconEdit, IconPlay, IconPlus, IconServer, IconTrash} from '../ui/Icons'
import {byName, ListToolbar, usePref, VIEWS, type SortOption} from '../ui/ListTools'
import {useT, type TFn} from '../i18n'

interface Props {
  snippets: Snippet[]
  /** a terminal tab is open, so Run/Paste have somewhere to go */
  canRun: boolean
  onNew(): void
  onRun(s: Snippet, execute: boolean): void
  /** run a snippet (or a command typed there) on several hosts at once */
  onRunOnHosts?(s?: Snippet): void
  onEdit(s: Snippet): void
  onDelete(s: Snippet): void
}

type Sort = 'name' | 'name-desc' | 'recent'
const SORT_VALUES: Sort[] = ['name', 'name-desc', 'recent']
const sortOptions = (t: TFn): SortOption<Sort>[] => [{value: 'name', label: t('Name A–Z')}, {value: 'name-desc', label: t('Name Z–A')}, {value: 'recent', label: t('Recently changed')}]

const firstLine = (s: string) => s.split(/\r?\n/).find(l => l.trim()) ?? ''

/** Reusable scripts. Run types the script into the focused terminal pane and presses Enter. */
export function SnippetsPage(p: Props) {
  const t = useT()
  const [q, setQ] = useState('')
  const [sort, setSort] = usePref<Sort>('vutty.snippets.sort', SORT_VALUES, 'name')
  const [view, setView] = usePref('vutty.snippets.view', VIEWS, 'grid')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = p.snippets.filter(s => !needle || (s.label + '\n' + (s.description ?? '') + '\n' + s.script).toLowerCase().includes(needle))
    const when = (s: Snippet) => (s.updated_at ? Date.parse(s.updated_at) || 0 : 0)
    return [...list].sort((a, b) => (sort === 'name' ? byName(a.label, b.label) : sort === 'name-desc' ? byName(b.label, a.label) : when(b) - when(a) || byName(a.label, b.label)))
  }, [p.snippets, q, sort])
  return (
    <div className="hosts-page">
      <div className="page-head">
        <h2>{t('Snippets')}</h2>
        <div style={{display: 'flex', gap: 8}}>
          {p.onRunOnHosts && <button className="ghost-btn" aria-label={t('Run on hosts')} title={t('Run one command on several hosts at once')} onClick={() => p.onRunOnHosts!()}><IconServer size={14} /> {t('Run on hosts…')}</button>}
          <button className="split-btn" aria-label={t('New snippet')} onClick={p.onNew}><IconPlus size={14} /> {t('New snippet')}</button>
        </div>
      </div>
      {!p.canRun && p.snippets.length > 0 && (
        <div className="notice">{t('Open a terminal to run a snippet: it is typed into the focused pane.')}</div>
      )}
      {p.snippets.length > 0 && <ListToolbar what={t('snippets')} query={q} onQuery={setQ} sort={sort} sortOptions={sortOptions(t)} onSort={setSort} view={view} onView={setView} />}
      <div className={'cards' + (view === 'list' ? ' as-list' : '')} role="list" aria-label={t('Snippets')} data-view={view}>
        {shown.map(s => (
          <div key={s.id} className="card snippet" role="listitem" onDoubleClick={() => p.onEdit(s)}>
            <span className="tile"><IconBraces size={20} /></span>
            <div className="meta">
              <div className="label">{s.label}</div>
              <div className="addr mono">{s.description || firstLine(s.script)}</div>
            </div>
            <div className="actions always">
              <button className="icon ghost" aria-label={t('Run {name}', {name: s.label})} title={t('Run in the focused terminal')} onClick={() => p.onRun(s, true)}><IconPlay size={14} /></button>
              {p.onRunOnHosts && <button className="icon ghost" aria-label={t('Run {name} on hosts', {name: s.label})} title={t('Run on several hosts')} onClick={() => p.onRunOnHosts!(s)}><IconServer size={14} /></button>}
              <button className="icon ghost" aria-label={t('Paste {name}', {name: s.label})} title={t('Type without pressing Enter')} onClick={() => p.onRun(s, false)}><IconCopy size={14} /></button>
              <button className="icon ghost" aria-label={t('Edit {name}', {name: s.label})} onClick={() => p.onEdit(s)}><IconEdit size={14} /></button>
              <button className="icon ghost danger" aria-label={t('Delete {name}', {name: s.label})} onClick={() => p.onDelete(s)}><IconTrash size={14} /></button>
            </div>
          </div>
        ))}
      </div>
      {p.snippets.length > 0 && shown.length === 0 && <div className="empty-hint">{t('No snippet matches “{query}”.', {query: q.trim()})}</div>}
      {p.snippets.length === 0 && (
        <div className="empty-hint">{t('No snippets yet. Save commands you run often, then run them in any terminal with one click.')}</div>
      )}
    </div>
  )
}
