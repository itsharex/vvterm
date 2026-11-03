import {useState} from 'react'
import {useT, useTn} from '../i18n'
import {useBackend} from '../backend'
import {Modal} from '../ui/Modal'
import {errMsg} from '../util'
import {formatBytes} from './format'
import type {SyncDiff} from '../types'

type Dir = 'sync-up' | 'sync-down'
const SHOWN = 200

/**
 * Compares the folder open on this computer with the one open on the server and copies what is new or
 * different, in the direction chosen. Nothing is ever deleted, on either side.
 */
export function SyncDialog({sid, localDir, remoteDir, onClose, onQueued}: {sid: string; localDir: string; remoteDir: string; onClose(): void; onQueued(): void}) {
  const be = useBackend()
  const t = useT()
  const tn = useTn()
  const [dir, setDir] = useState<Dir>('sync-up')
  const [diff, setDiff] = useState<SyncDiff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const src = dir === 'sync-up' ? localDir : remoteDir
  const dst = dir === 'sync-up' ? remoteDir : localDir

  const choose = (d: Dir) => { setDir(d); setDiff(null); setError('') }
  const compare = async () => {
    setBusy(true)
    setError('')
    try { setDiff(await be.sftp.syncPlan(sid, dir, src, dst)) } catch (e) { setError(errMsg(e)); setDiff(null) } finally { setBusy(false) }
  }
  const start = async () => {
    setBusy(true)
    setError('')
    try {
      await be.sftp.enqueue(sid, {direction: dir, sources: [src], destDir: dst, overwrite: true})
      onQueued()
      onClose()
    } catch (e) { setError(errMsg(e)); setBusy(false) }
  }
  const n = diff?.copy.length ?? 0
  const bytes = diff?.copy.reduce((sum, i) => sum + i.size, 0) ?? 0

  return (
    <Modal title={t('Sync folders')} onClose={onClose} wide
      footer={<>
        <button onClick={onClose}>{t('Close')}</button>
        <button disabled={busy || !src || !dst} onClick={() => void compare()}>{diff ? t('Compare again') : t('Compare')}</button>
        <button className="primary" disabled={busy || n === 0} onClick={() => void start()}>{n === 0 ? t('Sync') : tn(n, 'Sync {n} file', 'Sync {n} files')}</button>
      </>}>
      <div className="sync" role="group" aria-label={t('Sync direction')}>
        <label><input type="radio" name="sync-dir" checked={dir === 'sync-up'} onChange={() => choose('sync-up')} /> {t('Local → Remote')}</label>
        <label><input type="radio" name="sync-dir" checked={dir === 'sync-down'} onChange={() => choose('sync-down')} /> {t('Remote → Local')}</label>
      </div>
      <dl className="sync-paths">
        <dt>{t('From')}</dt><dd><code>{src}</code> <span className="muted">({dir === 'sync-up' ? t('this computer') : t('server')})</span></dd>
        <dt>{t('To')}</dt><dd><code>{dst}</code> <span className="muted">({dir === 'sync-up' ? t('server') : t('this computer')})</span></dd>
      </dl>
      <p className="muted sync-note">{t('New and changed files are copied. Nothing is ever deleted, on either side.')}</p>
      {error && <div className="error" role="alert">{error}</div>}
      {diff && (
        <div className="sync-result" role="region" aria-label={t('Sync preview')}>
          <p role="status">
            {n === 0 ? t('Everything is up to date.') : tn(n, '{n} file to copy ({size}).', '{n} files to copy ({size}).', {size: formatBytes(bytes)})}
            {diff.same > 0 && <> {t('{n} identical.', {n: diff.same})}</>}
          </p>
          {n > 0 && (
            <ul className="sync-list" aria-label={t('Files to copy')}>
              {diff.copy.slice(0, SHOWN).map(i => (
                <li key={i.path}><span className={'sync-tag ' + i.reason}>{i.reason === 'new' ? t('New') : t('Changed')}</span><span className="sync-file" title={i.path}>{i.path}</span><span className="muted">{formatBytes(i.size)}</span></li>
              ))}
              {n > SHOWN && <li className="muted">{t('…and {n} more', {n: n - SHOWN})}</li>}
            </ul>
          )}
          {diff.extra.length > 0 && (
            <p className="muted" aria-label={t('Only on the target')}>{tn(diff.extra.length, '{n} file exists only in the destination and stays untouched.', '{n} files exist only in the destination and stay untouched.')}</p>
          )}
        </div>
      )}
    </Modal>
  )
}
