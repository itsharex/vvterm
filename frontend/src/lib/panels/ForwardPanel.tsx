import {useMemo, useState} from 'react'
import {Section, SidePanel} from '../ui/Modal'
import {Select} from '../ui/Select'
import {OsIcon} from '../ui/OsIcon'
import {IconSearch} from '../ui/Icons'
import {useBackend} from '../backend'
import {useToast} from '../ui/Toast'
import {errMsg} from '../util'
import {t, useT} from '../i18n'
import {ForwardDiagram} from './ForwardDiagram'
import type {ForwardType, Group, Host, PortForward} from '../types'

/** The name of a forwarding type in the language of the interface (read when called, so call it while rendering). */
export const typeLabel = (type: ForwardType): string => (type === 'local' ? t('Local') : type === 'remote' ? t('Remote') : t('Dynamic'))
const TYPES: ForwardType[] = ['local', 'remote', 'dynamic']
const description = (type: ForwardType): string => (type === 'local'
  ? t("Local forwarding lets you access a remote server's listening port as though it were local.")
  : type === 'remote'
    ? t('Remote forwarding opens a port on the SSH host and brings its traffic back to a service on your side.')
    : t('Dynamic forwarding turns the SSH host into a SOCKS5 proxy: point an app at the local port and its traffic leaves from the server.'))

type Step = 'type' | 'port' | 'host' | 'dest' | 'label' | 'form'

interface Props {
  hosts: Host[]
  groups?: Group[]
  /** editing an existing rule skips the wizard */
  forward?: PortForward
  /** the host to start with (the Forwards button of a host card): the wizard does not ask for it again */
  hostId?: string
  onClose(): void
  onChanged(): void
  /** label and type as they are chosen, for the draft card */
  onDraft(d: {label: string; type: ForwardType}): void
}

/** Segmented Local / Remote / Dynamic control. */
function TypeSwitch({value, onChange}: {value: ForwardType; onChange(t: ForwardType): void}) {
  const t = useT()
  return (
    <div className="seg" role="radiogroup" aria-label={t('Forward type')}>
      {TYPES.map(ty => (
        <button key={ty} role="radio" aria-checked={value === ty} className={'seg-btn' + (value === ty ? ' on' : '')} onClick={() => onChange(ty)}>{typeLabel(ty)}</button>
      ))}
    </div>
  )
}

const validPort = (s: string) => /^\d+$/.test(s.trim()) && Number(s) >= 1 && Number(s) <= 65535

/**
 * The docked "New Port Forwarding" panel, a wizard: type → port and bind address → host →
 * destination → label. "Skip wizard" (and editing a rule) shows everything on one page instead.
 */
export function ForwardPanel({hosts, groups = [], forward, hostId, onClose, onChanged, onDraft}: Props) {
  const be = useBackend()
  const toast = useToast()
  const t = useT()
  const [step, setStep] = useState<Step>(forward ? 'form' : 'type')
  const [type, setTypeState] = useState<ForwardType>(forward?.type ?? 'local')
  const [label, setLabelState] = useState(forward?.label ?? '')
  const [host, setHost] = useState(forward?.host_id ?? hostId ?? hosts[0]?.id ?? '')
  const [bindAddr, setBindAddr] = useState(forward?.bind_addr ?? '127.0.0.1')
  const [bindPort, setBindPort] = useState(forward?.bind_port ? String(forward.bind_port) : '')
  const [destHost, setDestHost] = useState(forward?.dest_host ?? '')
  const [destPort, setDestPort] = useState(forward?.dest_port ? String(forward.dest_port) : '')
  const [auto, setAuto] = useState(forward?.auto_start ?? false)
  const [pub, setPub] = useState(forward?.allow_public_bind ?? false)
  const [filter, setFilter] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const setType = (ty: ForwardType) => { setTypeState(ty); onDraft({label, type: ty}) }
  const setLabel = (v: string) => { setLabelState(v); onDraft({label: v, type}) }
  const dynamic = type === 'dynamic'
  const hostObj = hosts.find(h => h.id === host)
  const preselected = !!hostId && !forward

  const save = async () => {
    setErr('')
    if (!host) return setErr(t('Choose a host: add one in Hosts first'))
    setBusy(true)
    try {
      await be.forwards.save({
        ...(forward ?? {}), host_id: host, type, label: label.trim(), bind_addr: bindAddr.trim() || '127.0.0.1', bind_port: Number(bindPort) || 0,
        dest_host: dynamic ? '' : destHost.trim(), dest_port: dynamic ? 0 : Number(destPort) || 0, auto_start: auto, allow_public_bind: pub,
      })
      toast.info(forward ? t('Port forwarding saved') : t('Port forwarding added'))
      onChanged()
      onClose()
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const back = (to: Step) => <button className="back-link" aria-label={t('Back')} onClick={() => { setErr(''); setStep(to) }}>{t('← Back')}</button>
  const errBox = err && <div className="error" role="alert">{err}</div>
  const checks = (
    <>
      <label className="check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> {t('Start automatically with a terminal on this host')}</label>
      <label className="check"><input type="checkbox" checked={pub} onChange={e => setPub(e.target.checked)} /> {t('Allow binding to a non-loopback address')}</label>
    </>
  )
  const ruleName = t('{type} Rule', {type: typeLabel(type)})
  const labelInput = <input aria-label={t('Label')} value={label} onChange={e => setLabel(e.target.value)} placeholder={ruleName} />
  const title = forward ? t('Edit Port Forwarding') : step === 'type' ? t('New Port Forwarding') : t('{type} Port Forwarding', {type: typeLabel(type)})
  // where the first and last machine of the diagram are, so the right one is lit for each step
  const portNode = type === 'remote' ? 1 : 0
  const destNode = type === 'remote' ? 0 : 2

  // ---- wizard ----
  if (step === 'type') {
    return (
      <SidePanel title={title} onClose={onClose}>
        <Section>
          <h4 className="fw-question">{t('Select the port forwarding type:')}</h4>
          <TypeSwitch value={type} onChange={setType} />
          <ForwardDiagram type={type} />
          <p className="fw-desc">{description(type)}</p>
          <button className="primary wide-btn" onClick={() => setStep('port')}>{t('Continue')}</button>
          <button className="wide-btn" onClick={() => setStep('form')}>{t('Skip wizard')}</button>
        </Section>
      </SidePanel>
    )
  }

  if (step === 'port') {
    const remote = type === 'remote'
    return (
      <SidePanel title={title} onClose={onClose}>
        <Section>
          {back('type')}
          <h4 className="fw-question">{remote ? t('Set the remote port and binding address:') : t('Set the local port and binding address:')}</h4>
          <ForwardDiagram type={type} highlight={portNode as 0 | 1} />
          <p className="fw-desc">
            {type === 'remote' ? t('This port will be open on the SSH host and its traffic comes back to your side.')
              : type === 'dynamic' ? t('This port will be open on the local (current) machine as a SOCKS5 proxy.')
              : t('This port will be open on the local (current) machine to forward traffic to the remote host.')}
          </p>
          <input aria-label={remote ? t('Remote port number') : t('Local port number')} value={bindPort} onChange={e => setBindPort(e.target.value)} placeholder={remote ? t('Remote port number *') : t('Local port number *')} inputMode="numeric" autoFocus />
          <input aria-label={t('Bind address')} value={bindAddr} onChange={e => setBindAddr(e.target.value)} placeholder={t('Bind address (127.0.0.1)')} />
          <button className="primary wide-btn" disabled={!validPort(bindPort)} onClick={() => setStep(preselected ? (dynamic ? 'label' : 'dest') : 'host')}>{t('Continue')}</button>
        </Section>
      </SidePanel>
    )
  }

  if (step === 'host') {
    const q = filter.trim().toLowerCase()
    const shown = hosts.filter(h => !q || (h.label + ' ' + h.hostname + ' ' + (h.username ?? '')).toLowerCase().includes(q))
    const known = new Set(groups.map(g => g.id))
    // a host whose group is unknown still shows, with the ungrouped ones: no host may go missing from the list
    const byGroup = (gid: string) => shown.filter(h => (gid ? h.group_id === gid : !h.group_id || !known.has(h.group_id)))
    const sections = [...groups.map(g => ({key: g.id, name: g.name, hosts: byGroup(g.id)})), {key: '', name: groups.length ? t('Hosts') : '', hosts: byGroup('')}].filter(s => s.hosts.length)
    const pick = (h: Host) => { setHost(h.id); setErr(''); setStep(dynamic ? 'label' : 'dest') }
    return (
      <SidePanel title={t('Select Host')} onClose={onClose}>
        <Section>
          {back('port')}
          <ForwardDiagram type={type} highlight={1} />
          <div className="search-box small"><IconSearch size={14} /><input aria-label={t('Search hosts')} placeholder={t('Search')} value={filter} onChange={e => setFilter(e.target.value)} autoFocus /></div>
          {sections.map(s => (
            <div key={s.key || 'ungrouped'} className="fw-hosts">
              {s.name && <h4 className="fw-question">{s.name}</h4>}
              {s.hosts.map(h => (
                <button key={h.id} className="fw-host" aria-label={t('Use host {label}', {label: h.label})} onClick={() => pick(h)}>
                  <span className="tile os-tile small" style={undefined}><OsIcon os={h.os} size={18} /></span>
                  <span className="meta"><span className="label">{h.label}</span><span className="addr">ssh{h.username ? `, ${h.username}` : ''}</span></span>
                </button>
              ))}
            </div>
          ))}
          {shown.length === 0 && <div className="muted">{hosts.length ? t('No host matches.') : t('No saved hosts yet. Add one in Hosts first.')}</div>}
        </Section>
        {errBox}
      </SidePanel>
    )
  }

  if (step === 'dest') {
    return (
      <SidePanel title={title} onClose={onClose}>
        <Section>
          {back(preselected ? 'port' : 'host')}
          <h4 className="fw-question">{t('Set the destination address and port:')}</h4>
          <ForwardDiagram type={type} highlight={destNode as 0 | 2} />
          <p className="fw-desc">
            {type === 'remote' ? t('Where the traffic is delivered on your side once it comes back through the host.')
              : t('Where {host} connects to, as seen from the host (use 127.0.0.1 for a service on the host itself).', {host: hostObj ? hostObj.label : t('the SSH host')})}
          </p>
          <input aria-label={t('Destination host')} value={destHost} onChange={e => setDestHost(e.target.value)} placeholder={t('Destination address *')} autoFocus />
          <input aria-label={t('Destination port')} value={destPort} onChange={e => setDestPort(e.target.value)} placeholder={t('Destination port number *')} inputMode="numeric" />
          <button className="primary wide-btn" disabled={!destHost.trim() || !validPort(destPort)} onClick={() => setStep('label')}>{t('Continue')}</button>
        </Section>
      </SidePanel>
    )
  }

  if (step === 'label') {
    return (
      <SidePanel title={title} onClose={onClose}
        footer={<><button onClick={onClose}>{t('Cancel')}</button><button className="primary" disabled={busy} onClick={save}>{t('Save')}</button></>}>
        <Section>
          {back(dynamic ? (preselected ? 'port' : 'host') : 'dest')}
          <h4 className="fw-question">{t('Name this rule:')}</h4>
          {labelInput}
          <div className="muted fw-summary">{hostObj?.label ?? t('host')} · {dynamic ? `SOCKS5 ${bindAddr || '127.0.0.1'}:${bindPort}` : `${bindAddr || '127.0.0.1'}:${bindPort} → ${destHost}:${destPort}`}</div>
          {checks}
        </Section>
        {errBox}
      </SidePanel>
    )
  }

  // ---- one-page form (Skip wizard, and editing) ----
  return (
    <SidePanel title={title} onClose={onClose}
      footer={<><button onClick={onClose}>{t('Cancel')}</button><button className="primary" disabled={busy} onClick={save}>{t('Save')}</button></>}>
      <Section>
        <TypeSwitch value={type} onChange={setType} />
        <input aria-label={t('Label')} value={label} onChange={e => setLabel(e.target.value)} placeholder={ruleName} autoFocus />
        <Select label={t('Host')} value={host} onChange={setHost} placeholder={t('Choose a host')} options={hosts.map(h => ({value: h.id, label: h.label, hint: h.hostname}))} />
      </Section>
      <Section title={type === 'remote' ? t('Listen on the host') : t('Listen on this computer')}>
        <div className="fw-row">
          <input aria-label={t('Bind address')} value={bindAddr} onChange={e => setBindAddr(e.target.value)} placeholder="127.0.0.1" />
          <input aria-label={t('Bind port')} value={bindPort} onChange={e => setBindPort(e.target.value)} placeholder={t('auto')} inputMode="numeric" />
        </div>
      </Section>
      {!dynamic && (
        <Section title={type === 'remote' ? t('Send to (on your side)') : t('Destination')}>
          <div className="fw-row">
            <input aria-label={t('Destination host')} value={destHost} onChange={e => setDestHost(e.target.value)} placeholder={t('Destination host')} />
            <input aria-label={t('Destination port')} value={destPort} onChange={e => setDestPort(e.target.value)} placeholder={t('Port')} inputMode="numeric" />
          </div>
        </Section>
      )}
      {dynamic && <Section><div className="muted">{t('SOCKS5 proxy: apps choose their own destinations, so there is nothing to enter here.')}</div></Section>}
      <Section>{checks}</Section>
      {errBox}
    </SidePanel>
  )
}
