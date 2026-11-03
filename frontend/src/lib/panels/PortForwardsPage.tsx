import {useCallback, useEffect, useMemo, useState} from 'react'
import {useBackend} from '../backend'
import {useToast} from '../ui/Toast'
import {useConfirm} from '../ui/Confirm'
import {errMsg} from '../util'
import {IconEdit, IconPlus, IconTrash} from '../ui/Icons'
import {typeLabel} from './ForwardPanel'
import {t, useT, type TFn} from '../i18n'
import {byName, FilterChip, ListToolbar, usePref, VIEWS, type SortOption} from '../ui/ListTools'
import {AuthPrompt} from '../ui/AuthPrompt'
import type {AuthChallenge, ForwardStatus, ForwardType, Host, HostKeyPrompt, PortForward} from '../types'

export function describeForward(f: PortForward): string {
  const bind = `${f.bind_addr}:${f.bind_port || 'auto'}`
  if (f.type === 'dynamic') return `SOCKS5 ${bind}`
  return `${bind} → ${f.dest_host}:${f.dest_port}`
}

/** The name on a card: the label, or "Local Rule" style when there is none. */
export const forwardTitle = (f: PortForward) => f.label || t('{type} Rule', {type: typeLabel(f.type)})

type Sort = 'name' | 'host' | 'type' | 'status' | 'port'
const SORT_VALUES: Sort[] = ['name', 'host', 'type', 'status', 'port']
const sortOptions = (t: TFn): SortOption<Sort>[] => [{value: 'name', label: t('Name')}, {value: 'host', label: t('Host')}, {value: 'type', label: t('Type')}, {value: 'status', label: t('Status (running first)')}, {value: 'port', label: t('Port')}]
const STATE_ORDER: Record<string, number> = {running: 0, error: 1, stopped: 2}

interface Props {
  hosts: Host[]
  /** the New Port Forwarding panel is open: a highlighted draft card shows what is being typed */
  draft?: {label: string; type: ForwardType}
  /** bump to re-read the list after the panel saved something */
  reloadKey?: number
  onNew(): void
  onEdit(f: PortForward): void
}

/** Port Forwarding: one card per rule (L / R / D), a New forwarding button, and a docked panel to add or edit. */
export function PortForwardsPage({hosts, draft, reloadKey = 0, onNew, onEdit}: Props) {
  const be = useBackend()
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const [items, setItems] = useState<ForwardStatus[]>([])
  const [prompt, setPrompt] = useState<{id: string; p: HostKeyPrompt} | null>(null)
  const [auth, setAuth] = useState<{id: string; c: AuthChallenge} | null>(null)
  const [q, setQ] = useState('')
  const [states, setStates] = useState<string[]>([])
  const [types, setTypes] = useState<ForwardType[]>([])
  const [sort, setSort] = usePref<Sort>('vutty.forwards.sort', SORT_VALUES, 'name')
  const [view, setView] = usePref('vutty.forwards.view', VIEWS, 'grid')

  const reload = useCallback(async () => setItems((await be.forwards.list()) ?? []), [be])
  useEffect(() => {
    void reload()
    return be.on('forward:state', () => void reload())
  }, [be, reload, reloadKey])

  const hostOf = (id: string) => hosts.find(h => h.id === id)

  const start = async (id: string) => {
    const off = be.on('term:hostkey:fwd-' + id, (p: HostKeyPrompt) => setPrompt({id, p}))
    const offAuth = be.on('term:auth:fwd-' + id, (c: AuthChallenge) => setAuth({id, c}))
    try {
      await be.forwards.start(id)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      off()
      offAuth()
      setPrompt(null)
      setAuth(null)
      void reload()
    }
  }
  const stop = (id: string) => be.forwards.stop(id).then(reload).catch(e => toast.error(errMsg(e)))
  const remove = async (s: ForwardStatus) => {
    if (!(await confirm(t('Delete "{name}"? It stops if it is running.', {name: forwardTitle(s.forward)}), {confirmLabel: t('Delete'), danger: true}))) return
    try { await be.forwards.remove(s.forward.id); await reload() } catch (e) { toast.error(errMsg(e)) }
  }

  const stateText = (s: string) => (s === 'running' ? t('running') : s === 'error' ? t('error') : s === 'stopped' ? t('stopped') : s)
  const stateTitle = (s: string) => (s === 'running' ? t('Running') : s === 'error' ? t('Error') : s === 'stopped' ? t('Stopped') : s)
  const presentStates = Array.from(new Set(items.map(s => s.state))).sort((a, b) => STATE_ORDER[a] - STATE_ORDER[b])
  const presentTypes = Array.from(new Set(items.map(s => s.forward.type)))
  const activeStates = states.filter(s => presentStates.includes(s as ForwardStatus['state']))
  const activeTypes = types.filter(ty => presentTypes.includes(ty))
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hostLabel = (s: ForwardStatus) => hosts.find(h => h.id === s.forward.host_id)?.label ?? ''
    const list = items.filter(s => (activeStates.length === 0 || activeStates.includes(s.state)) && (activeTypes.length === 0 || activeTypes.includes(s.forward.type)) &&
      (!needle || [forwardTitle(s.forward), hostLabel(s), describeForward(s.forward), typeLabel(s.forward.type), s.state, stateText(s.state)].join(' ').toLowerCase().includes(needle)))
    const by = (a: ForwardStatus, b: ForwardStatus) => {
      switch (sort) {
        case 'host': return byName(hostLabel(a), hostLabel(b))
        case 'type': return byName(typeLabel(a.forward.type), typeLabel(b.forward.type))
        case 'status': return STATE_ORDER[a.state] - STATE_ORDER[b.state]
        case 'port': return (a.forward.bind_port || 1e9) - (b.forward.bind_port || 1e9)
        default: return 0
      }
    }
    return [...list].sort((a, b) => by(a, b) || byName(forwardTitle(a.forward), forwardTitle(b.forward)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, hosts, q, sort, activeStates.join(','), activeTypes.join(','), t])

  const tileClass = (s: ForwardStatus) => (s.state === 'running' ? 'env-dev' : s.state === 'error' ? 'env-prod' : 'env-none')

  return (
    <div className="hosts-page" aria-label={t('Port forwarding')}>
      <div className="toolbar">
        <button className="split-btn" aria-label={t('New forwarding')} onClick={onNew}><IconPlus size={14} /> {t('New forwarding')}</button>
      </div>
      {items.length > 0 && (
        <ListToolbar what={t('port forwards')} query={q} onQuery={setQ} sort={sort} sortOptions={sortOptions(t)} onSort={setSort} view={view} onView={setView}>
          <div className="chips">
            {presentStates.length > 1 && presentStates.map(s => <FilterChip key={s} label={stateTitle(s)} dot={s === 'running' ? 'env-dev' : s === 'error' ? 'env-prod' : 'env-none'} on={activeStates.includes(s)} onToggle={() => setStates(activeStates.includes(s) ? activeStates.filter(x => x !== s) : [...activeStates, s])} />)}
            {presentTypes.length > 1 && presentTypes.map(ty => <FilterChip key={ty} label={typeLabel(ty)} on={activeTypes.includes(ty)} onToggle={() => setTypes(activeTypes.includes(ty) ? activeTypes.filter(x => x !== ty) : [...activeTypes, ty])} />)}
          </div>
        </ListToolbar>
      )}

      <h3 className="sec-title">{t('Port Forwarding')}</h3>
      <div className={'cards' + (view === 'list' ? ' as-list' : '')} role="list" aria-label={t('Port forwards')} data-view={view}>
        {draft && (
          <div className="card draft" aria-label={t('New forwarding draft')} data-testid="draft-card">
            <span className="tile env-none fw-tile">{typeLabel(draft.type)[0]}</span>
            <div className="meta"><div className="label">{draft.label || t('{type} Rule', {type: typeLabel(draft.type)})}</div><div className="addr">{t('{type} forwarding', {type: typeLabel(draft.type)})}</div></div>
          </div>
        )}
        {shown.map(s => {
          const f = s.forward
          const h = hostOf(f.host_id)
          return (
            <div key={f.id} className="card forward" role="listitem">
              <span className={'tile fw-tile ' + tileClass(s)} title={t('{type} forwarding', {type: typeLabel(f.type)}) + ' · ' + stateText(s.state)}>{typeLabel(f.type)[0]}</span>
              <div className="meta">
                <div className="label">{forwardTitle(f)}</div>
                <div className="addr">{h?.label ?? t('unknown host')} · {describeForward(f)} · {stateText(s.state)}{s.error ? ` · ${s.error}` : ''}</div>
                {s.state === 'running' && s.addr && <div className="addr ok">{t('listening on {addr}', {addr: s.addr})}</div>}
              </div>
              <div className="actions always">
                {s.state === 'running'
                  ? <button aria-label={t('Stop {name}', {name: forwardTitle(f)})} onClick={() => stop(f.id)}>{t('Stop')}</button>
                  : <button className="primary" aria-label={t('Start {name}', {name: forwardTitle(f)})} onClick={() => start(f.id)}>{t('Start')}</button>}
                <button className="icon ghost" aria-label={t('Edit {name}', {name: forwardTitle(f)})} onClick={() => onEdit(f)}><IconEdit size={14} /></button>
                <button className="icon ghost danger" aria-label={t('Delete {name}', {name: forwardTitle(f)})} onClick={() => remove(s)}><IconTrash size={14} /></button>
              </div>
            </div>
          )
        })}
      </div>
      {items.length > 0 && shown.length === 0 && <div className="empty-hint">{t('No port forward matches.')}</div>}
      {items.length === 0 && !draft && <div className="empty-hint">{t('No port forwards yet. Choose “New forwarding” to add one.')}</div>}

      {auth && (
        <div className="modal-back" role="presentation">
          <div className="modal confirm">
            <div className="modal-body"><AuthPrompt inline challenge={auth.c} promptKey={'fwd-' + auth.id} onDone={() => setAuth(null)} onError={m => toast.error(m)} /></div>
          </div>
        </div>
      )}
      {prompt && (
        <div className="modal-back" role="presentation">
          <div className="modal confirm" role="alertdialog" aria-label={t('Host key confirmation')}>
            <div className="modal-body">
              <b>{t('Unknown host key for {host}', {host: prompt.p.host})}</b>
              <div className="muted">{t('{type} fingerprint', {type: prompt.p.key_type})}</div>
              <div className="fp">{prompt.p.fingerprint}</div>
            </div>
            <div className="modal-foot">
              <button onClick={() => be.session.trustHostKey('fwd-' + prompt.id, '')}>{t('Reject')}</button>
              <button className="primary" onClick={() => be.session.trustHostKey('fwd-' + prompt.id, prompt.p.fingerprint)}>{t('Trust and connect')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
