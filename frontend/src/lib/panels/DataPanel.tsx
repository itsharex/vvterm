import {useState} from 'react'
import {Field, Modal} from '../ui/Modal'
import {Select} from '../ui/Select'
import {IconCheckCircle, IconDownload, IconFile, IconKey, IconUpload, IconWarn} from '../ui/Icons'
import {useBackend} from '../backend'
import {useToast} from '../ui/Toast'
import {errMsg} from '../util'
import type {ImportReport} from '../types'
import {useT, useTn} from '../i18n'
import {rich} from './rich'

type Tab = 'import' | 'export' | 'backup'
const TABS: {id: Tab; label: string}[] = [{id: 'import', label: 'Import'}, {id: 'export', label: 'Export'}, {id: 'backup', label: 'Backup'}]
const MIN_BACKUP_PW = 8

/**
 * Import / export. Nothing is locked in: ssh config, plain metadata JSON and encrypted backups all round-trip.
 * Three tabs, one job each: bring hosts in from an ssh config, take them out (ssh config or a plain list), or make and
 * restore an encrypted backup of everything.
 */
export function DataPanel({onClose, onChanged}: {onClose(): void; onChanged(): void}) {
  const be = useBackend()
  const toast = useToast()
  const t = useT()
  const tn = useTn()
  const tabLabel: Record<Tab, string> = {import: t('Import'), export: t('Export'), backup: t('Backup')}
  const [tab, setTab] = useState<Tab>('import')
  const [source, setSource] = useState<'ssh' | 'inventory'>('ssh')
  const [cfgPath, setCfgPath] = useState('')
  const [invPath, setInvPath] = useState('')
  const [invUser, setInvUser] = useState('')
  const [invAddress, setInvAddress] = useState<'public' | 'private'>('public')
  const [invGroup, setInvGroup] = useState('')
  const [invStopped, setInvStopped] = useState(false)
  const [conflict, setConflict] = useState('skip')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [withKeys, setWithKeys] = useState(false)
  const [bpw, setBpw] = useState('')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const guard = async (fn: () => Promise<void>) => {
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }
  const go = (id: Tab) => { setTab(id); setErr(''); setMsg('') }
  const pickSource = (v: 'ssh' | 'inventory') => { setSource(v); setReport(null); setErr('') }

  const choose = async (title: string, kind: 'file' | 'dir' | 'save', name = '') => {
    const p = kind === 'file' ? await be.system.pickFile(title) : kind === 'dir' ? await be.system.pickDirectory(title) : await be.system.saveFile(title, name)
    return p
  }

  const pwShort = bpw.length > 0 && bpw.length < MIN_BACKUP_PW

  return (
    <Modal title={t('Import & export')} wide onClose={onClose}>
      <div className="dx-tabs" role="tablist" aria-label={t('Import and export')}>
        {TABS.map(tb => (
          <button key={tb.id} role="tab" aria-selected={tab === tb.id} className={tab === tb.id ? 'on' : ''} onClick={() => go(tb.id)}>{tabLabel[tb.id]}</button>
        ))}
      </div>

      {tab === 'import' && (
        <div className="dx-page" role="tabpanel" aria-label={t('Import')}>
          <div className="segmented keep-case" role="group" aria-label={t('What to import from')}>
            <button className={source === 'ssh' ? 'on' : ''} aria-pressed={source === 'ssh'} onClick={() => pickSource('ssh')}>{t('SSH config')}</button>
            <button className={source === 'inventory' ? 'on' : ''} aria-pressed={source === 'inventory'} onClick={() => pickSource('inventory')}>{t('Cloud and inventory')}</button>
          </div>
          {source === 'ssh' ? (
            <p className="dx-lead">{t('Bring the hosts, groups, port forwards and keys of an OpenSSH config file into Vutty.')}</p>
          ) : (
            <p className="dx-lead">{t('Add the servers of a listing you made yourself: Vutty never contacts a cloud and never sees its credentials, so nothing but the file is read.')}</p>
          )}
          <div className="dx-card">
            {source === 'ssh' ? (
              <Field label={t('Config file')}>
                <div className="input-row">
                  <input aria-label={t('Config path')} value={cfgPath} onChange={e => setCfgPath(e.target.value)} placeholder="~/.ssh/config" />
                  <button disabled={busy} onClick={() => guard(async () => { const p = await choose(t('Choose ssh config'), 'file'); if (p) setCfgPath(p) })}>{t('Browse…')}</button>
                </div>
              </Field>
            ) : (
              <>
                <details className="dx-how">
                  <summary>{t('How to make the file')}</summary>
                  <div className="muted">
                    <div><b>AWS</b>: <code>aws ec2 describe-instances --output json &gt; aws.json</code></div>
                    <div><b>Google Cloud</b>: <code>gcloud compute instances list --format=json &gt; gcp.json</code></div>
                    <div><b>Ansible</b> {t('(any inventory, and the cloud plugins):')} <code>ansible-inventory -i inventory --list &gt; inventory.json</code>, {t('or the INI file itself')}</div>
                    <div><b>CSV</b>: {rich(t('a header line with {required} and, if you like, {optional}'), {required: <code>hostname</code>, optional: <code>label, user, port, group, env, tags</code>})}</div>
                  </div>
                </details>
                <Field label={t('Listing file')}>
                  <div className="input-row">
                    <input aria-label={t('Inventory path')} value={invPath} onChange={e => setInvPath(e.target.value)} placeholder={t('aws.json, inventory.ini or hosts.csv')} />
                    <button disabled={busy} onClick={() => guard(async () => { const p = await choose(t('Choose the listing'), 'file'); if (p) setInvPath(p) })}>{t('Browse…')}</button>
                  </div>
                </Field>
                <div className="dx-two">
                  <Field label={t('User name for the hosts')}>
                    <input aria-label={t('User name')} value={invUser} onChange={e => setInvUser(e.target.value)} placeholder={t("ec2-user for AWS; the file's own wins")} autoComplete="off" />
                  </Field>
                  <Field label={t('Group')}>
                    <input aria-label={t('Group name')} value={invGroup} onChange={e => setInvGroup(e.target.value)} placeholder={t('aws, gcp, or the Ansible group')} autoComplete="off" />
                  </Field>
                </div>
                <div className="dx-two">
                  <Field label={t('Address of a cloud instance')}>
                    <Select label={t('Address to use')} value={invAddress} onChange={v => setInvAddress(v as 'public' | 'private')}
                      options={[{value: 'public', label: t('Public, or private if it has none')}, {value: 'private', label: t('Private only'), hint: t('You reach them through a VPN or a jump host')}]} />
                  </Field>
                  <label className="dx-check" style={{alignSelf: 'end', paddingBottom: 10}}><input type="checkbox" checked={invStopped} onChange={e => setInvStopped(e.target.checked)} /> {t('Include stopped instances')}</label>
                </div>
              </>
            )}
            <Field label={t('If a host with the same name already exists')}>
              <Select label={t('Conflict policy')} value={conflict} onChange={setConflict}
                options={[{value: 'skip', label: t('Skip it'), hint: t('Keep the host you have')}, {value: 'overwrite', label: t('Overwrite it'), hint: t('Replace it with the one from the file')}, {value: 'duplicate', label: t('Create a copy'), hint: t('Keep both')}]} />
            </Field>
            <div className="dx-actions">
              {!(source === 'ssh' ? cfgPath : invPath) && <span className="muted">{t('Choose a file to import.')}</span>}
              <button className="primary" disabled={!(source === 'ssh' ? cfgPath : invPath) || busy} onClick={() => guard(async () => {
                const r = source === 'ssh'
                  ? await be.data.importSSHConfig(cfgPath, conflict)
                  : await be.data.importInventory(invPath, conflict, {user: invUser.trim(), address: invAddress, group: invGroup.trim(), include_stopped: invStopped})
                setReport(r)
                onChanged()
              })}>{t('Import')}</button>
            </div>
          </div>
          {report && (
            <div className="dx-result" data-testid="import-report">
              <div className="dx-result-head"><IconCheckCircle size={16} /> {report.format ? t('Import finished (read as {format})', {format: report.format}) : t('Import finished')}</div>
              {t('Added {hosts} hosts, {groups} groups, {forwards} forwards; imported {keys} keys.', {hosts: report.hosts_added, groups: report.groups_added, forwards: report.forwards_added, keys: report.keys_imported})}
              {(report.skipped?.length ?? 0) > 0 && <div>{t('Skipped: {list}', {list: report.skipped.join(', ')})}</div>}
              {(report.warnings ?? []).map((w, i) => <div key={i} className="muted warn-line"><IconWarn size={14} /> {w}</div>)}
            </div>
          )}
        </div>
      )}

      {tab === 'export' && (
        <div className="dx-page" role="tabpanel" aria-label={t('Export')}>
          <p className="dx-lead">{t('Take your hosts out of Vutty in a format other tools can read.')}</p>
          <div className="dx-card">
            <div className="dx-head"><span className="dx-ico"><IconFile size={17} /></span><div><b>{t('SSH config')}</b><div className="muted">{t('Config files for OpenSSH, with your hosts, groups and port forwards. They go into a folder you choose.')}</div></div></div>
            <label className="dx-check indent"><input type="checkbox" checked={withKeys} onChange={e => setWithKeys(e.target.checked)} /> {t('Also export private keys')}</label>
            {withKeys && <div className="dx-warn indent"><IconWarn size={15} /> {t('Private keys will be written to disk unencrypted (mode 0600). Only do this to a location you trust.')}</div>}
            <div className="dx-actions">
              <button className="primary" disabled={busy} onClick={() => guard(async () => {
                const dir = await choose(t('Export folder'), 'dir')
                if (!dir) return
                const r = await be.data.exportSSHConfig(dir, withKeys)
                setMsg(t('Wrote {configs} config file(s) and {keys} key file(s).', {configs: (r.files ?? []).length, keys: (r.key_files ?? []).length}) + (r.warnings?.length ? ' ' + t('Warnings: {list}', {list: r.warnings.join('; ')}) : ''))
              })}>{t('Export…')}</button>
            </div>
          </div>
          <div className="dx-card">
            <div className="dx-head"><span className="dx-ico"><IconDownload size={17} /></span><div><b>{t('Host list')}</b><div className="muted">{t('One JSON file with your hosts and groups. It has no passwords and no keys, so it is safe to share or keep in a repository.')}</div></div></div>
            <div className="dx-actions">
              <button disabled={busy} onClick={() => guard(async () => {
                const p = await choose(t('Save host list'), 'save', 'vutty-hosts.json')
                if (!p) return
                await be.data.exportPlainJSON(p)
                setMsg(t('Host list (no secrets) exported.'))
              })}>{t('Export host list (JSON, no secrets)')}</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div className="dx-page" role="tabpanel" aria-label={t('Backup')}>
          <p className="dx-lead">{t('An encrypted copy of everything, including saved keys and passwords. Use it to keep a safe copy or to move to another computer.')}</p>
          <div className="dx-card">
            <Field label={t('Backup password')}>
              <input aria-label={t('Backup password')} type="password" autoComplete="new-password" value={bpw} onChange={e => setBpw(e.target.value)} placeholder={t('At least 8 characters')} />
            </Field>
            <div className="dx-hint">
              {pwShort && <b className="bad">{tn(MIN_BACKUP_PW - bpw.length, '{n} more character needed.', '{n} more characters needed.')} </b>}
              {t('This is not your master password. It locks the backup file, and you will need it again to restore it, so do not lose it.')}
            </div>
          </div>
          <div className="dx-pair">
            <div className="dx-card">
              <div className="dx-head"><span className="dx-ico"><IconUpload size={17} /></span><div><b>{t('Create a backup')}</b><div className="muted">{rich(t('Saves a {file} file.'), {file: <code>.vubak</code>})}</div></div></div>
              <div className="dx-actions">
                <button className="primary" disabled={bpw.length < MIN_BACKUP_PW || busy} onClick={() => guard(async () => {
                  const p = await choose(t('Save backup'), 'save', 'vutty.vubak')
                  if (!p) return
                  await be.data.exportBackup(p, bpw)
                  setMsg(t('Backup written.'))
                })}>{t('Export backup…')}</button>
              </div>
            </div>
            <div className="dx-card">
              <div className="dx-head"><span className="dx-ico"><IconKey size={17} /></span><div><b>{t('Restore a backup')}</b><div className="muted">{t('Brings back its hosts, keys and passwords.')}</div></div></div>
              <div className="dx-actions">
                <button disabled={!bpw || busy} onClick={() => guard(async () => {
                  const p = await choose(t('Choose backup'), 'file')
                  if (!p) return
                  await be.data.importBackup(p, bpw)
                  onChanged()
                  toast.info(t('Backup restored'))
                })}>{t('Restore backup…')}</button>
              </div>
            </div>
          </div>
          {!bpw && <div className="muted">{t('Type the backup password first: both buttons use it.')}</div>}
        </div>
      )}

      {msg && <div className="dx-ok ok" role="status"><IconCheckCircle size={16} /> {msg}</div>}
      {err && <div className="error" role="alert">{err}</div>}
    </Modal>
  )
}
