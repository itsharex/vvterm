import {useCallback, useEffect, useState} from 'react'
import {useBackend} from '../backend'
import {useToast} from '../ui/Toast'
import {Switch} from '../ui/Switch'
import {Select} from '../ui/Select'
import {Modal} from '../ui/Modal'
import {errMsg, joinArgs, splitArgs} from '../util'
import {useT, useTn, type TFn} from '../i18n'
import type {AiProvider, Host, McpImportItem, McpMode, McpServer, McpServerInput, McpTool} from '../types'

interface Row {name: string; value: string; saved: boolean}

const modes = (t: TFn): {value: McpMode; label: string}[] => [{value: 'allow', label: t('Allow')}, {value: 'ask', label: t('Ask each time')}, {value: 'off', label: t('Off')}]

/**
 * Settings → AI assistant → MCP servers. The assistant never connects to these servers itself: it talks to a
 * Vutty gateway, which starts the servers, checks every call's arguments for secrets, redacts every result and
 * asks you first for anything that is not a plain read. New tools of a server stay off until you review them.
 */
export function McpServersPanel({providers, hosts}: {providers: AiProvider[]; hosts: Host[]}) {
  const t = useT()
  const be = useBackend()
  const toast = useToast()
  const [servers, setServers] = useState<McpServer[] | null>(null)
  const [editing, setEditing] = useState<McpServer | 'new' | null>(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    try { setServers(await be.assistant.mcp.list()) } catch (e) { toast.error(errMsg(e)) }
  }, [be, toast])
  useEffect(() => { void load() }, [load])

  const remove = async (s: McpServer) => {
    try { await be.assistant.mcp.remove(s.id); await load() } catch (e) { toast.error(errMsg(e)) }
  }
  const setEnabled = async (s: McpServer, enabled: boolean) => {
    try {
      await be.assistant.mcp.save({id: s.id, name: s.name, type: s.type, command: s.command, args: s.args, url: s.url, enabled, trusted: s.trusted, host_ids: s.host_ids, providers: s.providers})
      await load()
    } catch (e) { toast.error(errMsg(e)) }
  }

  return (
    <section className="card-section" aria-label={t('MCP servers')}>
      <h4>{t('MCP servers')}</h4>
      <div className="muted">{t('Give the assistant extra tools (documentation search, an issue tracker…). Every call goes through Vutty: arguments that contain a secret are blocked, results are redacted, and a tool that changes something asks you first.')}</div>
      {servers && servers.length === 0 && <div className="muted">{t('No MCP servers yet.')}</div>}
      {(servers ?? []).map(s => (
        <div key={s.id} className="ai-mcp-row" data-testid={'mcp-' + s.name}>
          <div className="setting-row">
            <div>
              <b>{s.name}</b> <span className="badge">{s.type}</span> {s.trusted && <span className="badge">{t('trusted')}</span>}
              <div className="muted">{s.type === 'stdio' ? [s.command, ...s.args].join(' ') : s.url}</div>
              {s.status && <div className={'muted ' + (s.status.startsWith('Connected') ? 'ok' : '')}>{s.status}</div>}
            </div>
            <Switch label={t('Enable {name}', {name: s.name})} checked={s.enabled} onChange={v => void setEnabled(s, v)} />
          </div>
          <div className="ai-row-actions">
            <button onClick={() => setEditing(s)}>{t('Edit')}</button>
            <button className="danger" onClick={() => void remove(s)}>{t('Delete')}</button>
          </div>
        </div>
      ))}
      <div className="ai-row-actions">
        <button className="primary" onClick={() => setEditing('new')}>{t('Add server')}</button>
        <button onClick={() => setImporting(true)}>{t('Import from other tools…')}</button>
      </div>
      {editing && <McpEditor server={editing === 'new' ? null : editing} hosts={hosts} providers={providers} onClose={() => { setEditing(null); void load() }} />}
      {importing && <McpImport onClose={() => { setImporting(false); void load() }} />}
    </section>
  )
}

function McpEditor({server, hosts, providers, onClose}: {server: McpServer | null; hosts: Host[]; providers: AiProvider[]; onClose(): void}) {
  const t = useT()
  const tn = useTn()
  const be = useBackend()
  const toast = useToast()
  const [id, setId] = useState(server?.id ?? '')
  const [name, setName] = useState(server?.name ?? '')
  const [type, setType] = useState<'stdio' | 'http'>(server?.type ?? 'stdio')
  const [command, setCommand] = useState(server?.command ?? '')
  const [args, setArgs] = useState(joinArgs(server?.args ?? []))
  const [url, setUrl] = useState(server?.url ?? '')
  const [env, setEnv] = useState<Row[]>((server?.env ?? []).map(n => ({name: n, value: '', saved: true})))
  const [headers, setHeaders] = useState<Row[]>((server?.headers ?? []).map(n => ({name: n, value: '', saved: true})))
  const [removedEnv, setRemovedEnv] = useState<string[]>([])
  const [removedHdr, setRemovedHdr] = useState<string[]>([])
  const [enabled, setEnabled] = useState(server?.enabled ?? false)
  const [trusted, setTrusted] = useState(server?.trusted ?? false)
  const [hostIds, setHostIds] = useState<string[]>(server?.host_ids ?? [])
  const [provIds, setProvIds] = useState<string[]>(server?.providers ?? [])
  const [tools, setTools] = useState<McpTool[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [err, setErr] = useState('')

  const toMap = (rows: Row[]) => Object.fromEntries(rows.filter(r => r.name.trim() && r.value !== '').map(r => [r.name.trim(), r.value]))
  const input = (): McpServerInput => ({id: id || undefined, name: name.trim(), type, command: command.trim(), args: splitArgs(args), url: url.trim(),
    env: toMap(env), headers: toMap(headers), remove_env: removedEnv, remove_headers: removedHdr, enabled, trusted, host_ids: hostIds, providers: provIds})

  const save = async (): Promise<McpServer | null> => {
    setErr('')
    try {
      const s = await be.assistant.mcp.save(input())
      setId(s.id); setRemovedEnv([]); setRemovedHdr([])
      setEnv(rs => rs.map(r => (r.name.trim() ? {...r, value: '', saved: true} : r)))
      setHeaders(rs => rs.map(r => (r.name.trim() ? {...r, value: '', saved: true} : r)))
      return s
    } catch (e) { setErr(errMsg(e)); return null }
  }
  const saveAndClose = async () => { if (await save()) onClose() }
  const test = async () => {
    const s = await save()
    if (!s) return
    setTesting(true); setTools(null)
    try { setTools(await be.assistant.mcp.test(s.id)) } catch (e) { setErr(errMsg(e)) } finally { setTesting(false) }
  }
  const setMode = async (tool: McpTool, mode: McpMode) => {
    try { await be.assistant.mcp.setTool(id, tool.name, mode); setTools(ts => (ts ?? []).map(x => (x.name === tool.name ? {...x, mode, new: false} : x))) } catch (e) { toast.error(errMsg(e)) }
  }
  const approveNew = async () => {
    try { await be.assistant.mcp.approveNew(id); setTools(await be.assistant.mcp.test(id)) } catch (e) { toast.error(errMsg(e)) }
  }
  const toggle = (list: string[], v: string, set: (l: string[]) => void) => set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])
  const rowsEditor = (label: string, rows: Row[], set: (r: Row[]) => void, removed: string[], setRemoved: (r: string[]) => void) => (
    <div className="field">
      <span>{label}</span>
      {rows.map((r, i) => (
        <div key={i} className="ai-kv">
          <input aria-label={t('{label} name', {label})} value={r.name} disabled={r.saved} placeholder="NAME" onChange={e => set(rows.map((x, k) => (k === i ? {...x, name: e.target.value} : x)))} />
          <input aria-label={t('{label} value', {label})} type="password" autoComplete="off" value={r.value} placeholder={r.saved ? t('******* (saved: type to replace)') : t('value')}
            onChange={e => set(rows.map((x, k) => (k === i ? {...x, value: e.target.value} : x)))} />
          <button aria-label={t('Remove {name}', {name: r.name || t('row')})} onClick={() => { if (r.saved) setRemoved([...removed, r.name]); set(rows.filter((_, k) => k !== i)) }}>×</button>
        </div>
      ))}
      <div><button onClick={() => set([...rows, {name: '', value: '', saved: false}])}>{t('Add')}</button></div>
    </div>
  )

  return (
    <Modal title={server ? t('Edit MCP server') : t('Add MCP server')} onClose={onClose} wide
      footer={<><button onClick={onClose}>{t('Close')}</button><button className="primary" onClick={() => void saveAndClose()} disabled={!name.trim()}>{t('Save')}</button></>}>
      <label className="field"><span>{t('Name')}</span><input aria-label={t('Server name')} value={name} onChange={e => setName(e.target.value)} placeholder="Docs" /></label>
      <label className="field"><span>{t('Type')}</span>
        <Select label={t('Server type')} value={type} onChange={v => setType(v as 'stdio' | 'http')} options={[{value: 'stdio', label: t('Command (stdio)')}, {value: 'http', label: 'HTTP'}]} />
      </label>
      {type === 'stdio' ? (
        <>
          <label className="field"><span>{t('Command')}</span><input aria-label={t('Server command')} value={command} onChange={e => setCommand(e.target.value)} placeholder="npx" /></label>
          <label className="field"><span>{t('Arguments')}</span><input aria-label={t('Server arguments')} value={args} onChange={e => setArgs(e.target.value)} placeholder="-y @acme/docs-mcp" /></label>
          {rowsEditor(t('Environment'), env, setEnv, removedEnv, setRemovedEnv)}
        </>
      ) : (
        <>
          <label className="field"><span>{t('URL')}</span><input aria-label={t('Server URL')} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" /></label>
          {rowsEditor(t('Headers'), headers, setHeaders, removedHdr, setRemovedHdr)}
        </>
      )}
      <div className="muted">{t('Values are kept in the vault and are never shown again.')}</div>
      <div className="setting-row"><div><b>{t('Enabled')}</b><div className="muted">{t('Off servers are never offered to the assistant.')}</div></div><Switch label={t('Enabled')} checked={enabled} onChange={setEnabled} /></div>
      <div className="setting-row"><div><b>{t('Trusted')}</b><div className="muted">{t('A trusted server may run tools you set to Allow without asking, even if they change things. Leave off unless you wrote or audited it.')}</div></div><Switch label={t('Trusted')} checked={trusted} onChange={setTrusted} /></div>
      <div className="field">
        <span>{t('Available on')}</span>
        <div className="ai-scope" role="group" aria-label={t('Hosts')}>
          <label><input type="checkbox" checked={hostIds.length === 0} onChange={() => setHostIds([])} /> {t('All hosts')}</label>
          {hosts.map(h => <label key={h.id}><input type="checkbox" checked={hostIds.includes(h.id)} onChange={() => toggle(hostIds, h.id, setHostIds)} /> {h.label}</label>)}
        </div>
        <div className="ai-scope" role="group" aria-label={t('Providers')}>
          <label><input type="checkbox" checked={provIds.length === 0} onChange={() => setProvIds([])} /> {t('Every provider')}</label>
          {providers.map(p => <label key={p.id} title={p.supports_mcp ? '' : t('This provider cannot be limited to the gateway, so MCP is not offered to it')}><input type="checkbox" checked={provIds.includes(p.id)} onChange={() => toggle(provIds, p.id, setProvIds)} /> {p.name}{p.supports_mcp ? '' : ' ' + t('(no MCP)')}</label>)}
        </div>
      </div>
      <div className="ai-row-actions"><button onClick={() => void test()} disabled={!name.trim() || testing}>{testing ? t('Connecting…') : t('Save and test connection')}</button></div>
      {err && <div className="error" role="alert">{err}</div>}
      {tools && (
        <div className="ai-tools" aria-label={t('Tools')}>
          <div className="muted">{tn(tools.length, '{n} tool. New tools stay off until you choose a mode.', '{n} tools. New tools stay off until you choose a mode.')}</div>
          {tools.some(tool => tool.new) && <div><button onClick={() => void approveNew()}>{t('Approve new tools with the suggested modes')}</button></div>}
          {tools.map(tool => (
            <div key={tool.name} className="setting-row ai-tool">
              <div><b>{tool.name}</b> {tool.read_only && <span className="badge">{t('read-only')}</span>} {tool.new && <span className="badge ai-badge-warn">{t('new')}</span>}<div className="muted">{tool.description}</div></div>
              <Select className="inline" label={t('Mode of {name}', {name: tool.name})} value={tool.new ? '' : tool.mode} placeholder={t('Off until reviewed')} onChange={v => void setMode(tool, v as McpMode)} options={modes(t)} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function McpImport({onClose}: {onClose(): void}) {
  const t = useT()
  const be = useBackend()
  const toast = useToast()
  const [items, setItems] = useState<McpImportItem[] | null>(null)
  const [done, setDone] = useState<string[]>([])
  useEffect(() => { void be.assistant.mcp.importable().then(setItems).catch(e => toast.error(errMsg(e))) }, [be, toast])
  const run = async (it: McpImportItem) => {
    try { await be.assistant.mcp.import(it.ref); setDone(d => [...d, it.ref]) } catch (e) { toast.error(errMsg(e)) }
  }
  return (
    <Modal title={t('Import MCP servers')} onClose={onClose} footer={<button onClick={onClose}>{t('Close')}</button>}>
      <div className="muted">{t('Servers found in the configuration of Claude Code and Gemini CLI. A server is copied only when you press Import; its secret values move to the vault and it starts off and untrusted.')}</div>
      {items === null && <div className="muted">{t('Reading…')}</div>}
      {items?.length === 0 && <div className="muted">{t('Nothing to import.')}</div>}
      {items?.map(it => (
        <div key={it.ref} className="setting-row">
          <div><b>{it.name}</b> <span className="badge">{it.source}</span> <span className="badge">{it.type}</span>
            <div className="muted">{it.type === 'stdio' ? [it.command, ...it.args].join(' ') : it.url}</div>
            {(it.env.length > 0 || it.headers.length > 0) && <div className="muted">{t('Secrets to move: {list}', {list: [...it.env, ...it.headers].join(', ')})}</div>}
          </div>
          {done.includes(it.ref) ? <span className="badge">{t('Imported')}</span> : <button onClick={() => void run(it)}>{t('Import')}</button>}
        </div>
      ))}
    </Modal>
  )
}
