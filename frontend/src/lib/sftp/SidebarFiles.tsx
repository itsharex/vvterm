import {MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useBackend} from '../backend'
import {useT} from '../i18n'
import {useConfirm} from '../ui/Confirm'
import {useToast} from '../ui/Toast'
import {IconArrowUp, IconDownload, IconFile, IconFolder, IconRefresh} from '../ui/Icons'
import {errMsg} from '../util'
import {formatBytes, parentOf} from './format'
import {QueuePanel} from './QueuePanel'
import {queueTransfer, summarize, useQueues, verbOf} from './transfer'
import {authenticity} from './RemotePane'
import {AuthPrompt} from '../ui/AuthPrompt'
import type {AuthChallenge, Host, HostKeyPrompt, QueueJob, RemoteEntry} from '../types'

let seq = 0

/**
 * The Files section of the terminal sidebar: the server of the focused terminal as a compact list, with
 * upload, download and the transfer queue. It has an SFTP connection of its own, opened when the section is
 * shown and closed when it is hidden or the terminal goes away.
 */
export function FilesTab({host}: {host: Host | null}) {
  const t = useT()
  if (!host) return <div className="side-empty">{t('Files are shown for terminals connected to a saved SSH host. Focus one to browse its files.')}</div>
  return <HostFiles key={host.id} host={host} />
}

function HostFiles({host}: {host: Host}) {
  const be = useBackend()
  const t = useT()
  const toast = useToast()
  const confirm = useConfirm()
  const alive = useRef(true)
  const cwdRef = useRef('')
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<'connecting' | 'ready' | 'closed'>('connecting')
  const [reason, setReason] = useState('')
  const [prompt, setPrompt] = useState<{key: string; p: HostKeyPrompt} | null>(null)
  const [auth, setAuth] = useState<{key: string; c: AuthChallenge} | null>(null)
  const [sid, setSid] = useState('')
  const [home, setHome] = useState('')
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<RemoteEntry[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (s: string, dir: string) => {
    setLoading(true)
    setError('')
    try {
      const list = await be.sftp.list(s, dir)
      if (!alive.current) return
      setEntries(list ?? [])
      setCwd(dir)
      cwdRef.current = dir
      setSelected([])
      setAnchor('')
    } catch (e) {
      if (alive.current) setError(errMsg(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [be])

  useEffect(() => {
    alive.current = true
    let opened = ''
    const key = `sftp-side-${Date.now().toString(36)}-${++seq}`
    const offs: Array<() => void> = [be.on(`term:hostkey:${key}`, (p: HostKeyPrompt) => setPrompt({key, p})), be.on(`term:auth:${key}`, (c: AuthChallenge) => setAuth({key, c}))]
    setPhase('connecting')
    setReason('')
    setSid('')
    ;(async () => {
      try {
        const info = await be.sftp.open(host.id, key)
        if (!alive.current) { void be.sftp.close(info.sid).catch(() => {}); return }
        opened = info.sid
        offs.push(be.on(`sftp:closed:${info.sid}`, () => { setPhase('closed'); setReason(t('The connection was lost.')); setSid(''); opened = '' }))
        setPrompt(null)
        setAuth(null)
        setSid(info.sid)
        setHome(info.home || '/')
        setPhase('ready')
        await load(info.sid, info.home || '/')
      } catch (e) {
        if (alive.current) { setPrompt(null); setAuth(null); setPhase('closed'); setReason(errMsg(e)) }
      }
    })()
    return () => {
      alive.current = false
      offs.forEach(o => o())
      if (opened) void be.sftp.close(opened).catch(() => {})
    }
  }, [be, host.id, attempt, load])

  const finished = useCallback((_sid: string, j: QueueJob) => {
    if (j.state === 'done') toast.info(summarize(verbOf(j.direction), j))
    else if (j.state === 'failed') toast.error(`${j.name}: ${j.error || t('the transfer failed')}`)
    if ((j.direction === 'upload' || j.direction === 'sync-up') && cwdRef.current && sidRef.current) void load(sidRef.current, cwdRef.current)
  }, [toast, load, t])
  const sidRef = useRef(sid)
  sidRef.current = sid
  const jobs = useQueues(sid ? [sid] : [], finished)[sid] ?? []
  const actions = {
    pause: (id: string) => void be.sftp.pause(sid, id).catch(e => setError(errMsg(e))),
    resume: (id: string) => void be.sftp.resume(sid, id).catch(e => setError(errMsg(e))),
    cancel: (id: string) => void be.sftp.cancel(sid, id).catch(e => setError(errMsg(e))),
    retry: (id: string) => void be.sftp.retry(sid, id).catch(e => setError(errMsg(e))),
    clearFinished: () => void be.sftp.clearFinished(sid).then(() => be.sftp.queue(sid)).catch(e => setError(errMsg(e))),
  }

  const answer = (trust: boolean) => {
    if (!prompt) return
    void be.session.trustHostKey(prompt.key, trust ? prompt.p.fingerprint : '').catch(e => setReason(errMsg(e)))
    setPrompt(null)
  }

  const shown = useMemo(() => entries.filter(e => !e.name.startsWith('.')), [entries])
  const chosen = useMemo(() => entries.filter(e => selected.includes(e.path)), [entries, selected])
  const ready = phase === 'ready' && !!sid && !!cwd

  const pick = (e: RemoteEntry, ev: ReactMouseEvent) => {
    if (ev.metaKey || ev.ctrlKey) {
      setSelected(s => (s.includes(e.path) ? s.filter(x => x !== e.path) : [...s, e.path]))
      setAnchor(e.path)
    } else if (ev.shiftKey && anchor) {
      const a = shown.findIndex(x => x.path === anchor), b = shown.findIndex(x => x.path === e.path)
      if (a >= 0 && b >= 0) setSelected(shown.slice(Math.min(a, b), Math.max(a, b) + 1).map(x => x.path))
    } else {
      setSelected([e.path])
      setAnchor(e.path)
    }
  }

  const guard = async (fn: () => Promise<unknown>) => {
    setError('')
    try { await fn() } catch (e) { setError(errMsg(e)) }
  }
  const upload = (folder: boolean) => guard(async () => {
    const p = await (folder ? be.system.pickDirectory(t('Upload folder')) : be.system.pickFile(t('Upload file')))
    if (p) await queueTransfer(be, confirm, sid, 'upload', [p], cwd)
  })
  const download = () => guard(async () => {
    const dir = await be.system.pickDirectory(t('Save to folder'))
    if (dir) await queueTransfer(be, confirm, sid, 'download', chosen.map(e => e.path), dir)
  })

  return (
    <div className="side-files" aria-label={t('Server files')}>
      <div className="side-files-bar">
        <button className="icon ghost" aria-label={t('Up one folder')} disabled={!ready || cwd === '/'} onClick={() => void load(sid, parentOf(cwd))}><IconArrowUp size={15} /></button>
        <button className="icon ghost" aria-label={t('Refresh files')} disabled={!ready} onClick={() => void load(sid, cwd)}><IconRefresh size={15} /></button>
        <code className="side-files-path" title={cwd} aria-label={t('Current folder')}>{cwd || (phase === 'connecting' ? t('Connecting…') : '')}</code>
      </div>
      <div className="side-files-bar">
        <button disabled={!ready} onClick={() => void upload(false)}>{t('Upload file…')}</button>
        <button disabled={!ready} onClick={() => void upload(true)}>{t('Upload folder…')}</button>
        <button disabled={!ready || chosen.length === 0} onClick={() => void download()} aria-label={t('Download selected files')}>
          <IconDownload size={14} /> {chosen.length > 1 ? t('Download {n}', {n: chosen.length}) : t('Download')}
        </button>
      </div>
      {phase === 'connecting' && !prompt && !auth && <div className="side-empty">{t('Connecting to {name}…', {name: host.label})}</div>}
      <AuthPrompt inline challenge={auth?.c ?? null} promptKey={auth?.key ?? ''} onDone={() => setAuth(null)} onError={setReason} />
      {phase === 'closed' && (
        <div className="side-empty" role="alert">
          <div>{reason || t('Disconnected.')}</div>
          <button onClick={() => setAttempt(a => a + 1)}>{t('Reconnect')}</button>
        </div>
      )}
      {prompt && (
        <div className="side-empty" role="alertdialog" aria-label={t('Host key confirmation')}>
          <div>{authenticity(t("The authenticity of {host} can't be established.", {host: '\u0001'}), prompt.p.host)}</div>
          <div className="fp" data-testid="fingerprint">{prompt.p.fingerprint}</div>
          <div className="row"><button className="primary" onClick={() => answer(true)}>{t('Trust and connect')}</button><button onClick={() => answer(false)}>{t('Cancel')}</button></div>
        </div>
      )}
      {ready && (
        <div className="side-list side-files-list" role="listbox" aria-multiselectable="true" aria-label={t('Files')} aria-busy={loading}>
          {shown.map(e => (
            <div key={e.path} role="option" tabIndex={0} aria-selected={selected.includes(e.path)} className={'side-item side-file' + (selected.includes(e.path) ? ' on' : '')}
              onClick={ev => pick(e, ev)} onDoubleClick={() => e.is_dir && void load(sid, e.path)} onKeyDown={ev => ev.key === 'Enter' && e.is_dir && void load(sid, e.path)}>
              {e.is_dir ? <IconFolder size={15} /> : <IconFile size={15} />}
              <span className="side-main"><b>{e.name}</b></span>
              <small className="muted">{e.is_dir ? '' : formatBytes(e.size)}</small>
            </div>
          ))}
          {!loading && shown.length === 0 && !error && <div className="side-empty">{t('This folder is empty.')}</div>}
        </div>
      )}
      {error && <div className="error side-files-error" role="alert">{error}</div>}
      <QueuePanel jobs={jobs} actions={actions} open compact />
    </div>
  )
}
