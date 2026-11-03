import {render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {DataPanel} from './DataPanel'
import {SyncPanel} from './SyncPanel'
import {makeFake, Providers} from '../../test/fakeBackend'

const vaultSt = {exists: true, unlocked: true, keychain_enabled: false, auto_lock_minutes: 15}

const tab = (n: string) => userEvent.click(screen.getByRole('tab', {name: n}))

describe('DataPanel', () => {
  it('imports an ssh config and shows the report with warnings', async () => {
    const be = makeFake()
    const changed = vi.fn()
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={changed} /></Providers>)
    expect(screen.getByRole('button', {name: 'Import'})).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Config path'), '/home/me/.ssh/config')
    await userEvent.selectOptions(screen.getByLabelText('Conflict policy'), 'overwrite')
    await userEvent.click(screen.getByRole('button', {name: 'Import'}))
    const rep = await screen.findByTestId('import-report')
    expect(rep).toHaveTextContent('Added 2 hosts, 1 groups')
    expect(rep).toHaveTextContent('ProxyCommand ignored')
    expect(rep).toHaveTextContent('Skipped: dup')
    expect(be.state.calls).toContainEqual(['data.import', '/home/me/.ssh/config', 'overwrite'])
    expect(changed).toHaveBeenCalled()
  })

  it('warns before exporting private keys', async () => {
    const be = makeFake()
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await tab('Export')
    expect(screen.queryByText(/written to disk unencrypted/)).toBeNull()
    await userEvent.click(screen.getByLabelText('Also export private keys'))
    expect(screen.getByText(/written to disk unencrypted/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', {name: 'Export…'}))
    await waitFor(() => expect(be.state.calls).toContainEqual(['data.exportSSH', '/tmp/dir', true]))
  })

  it('requires an 8+ character backup password', async () => {
    const be = makeFake()
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await tab('Backup')
    const exp = screen.getByRole('button', {name: 'Export backup…'})
    expect(exp).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Backup password'), 'short')
    expect(exp).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Backup password'), 'er-pass')
    expect(exp).toBeEnabled()
    await userEvent.click(exp)
    await waitFor(() => expect(be.state.calls).toContainEqual(['data.exportBackup', '/tmp/vutty.vubak', 'shorter-pass']))
    await userEvent.click(screen.getByRole('button', {name: 'Restore backup…'}))
    await waitFor(() => expect(be.state.calls.some(c => c[0] === 'data.importBackup')).toBe(true))
  })

  it('opens on Import, and tells what is missing instead of only greying the buttons out', async () => {
    const be = makeFake()
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    expect(screen.getByRole('tab', {name: 'Import', selected: true})).toBeInTheDocument()
    expect(screen.getByText('Choose a file to import.')).toBeInTheDocument()
    await tab('Backup')
    expect(screen.getByText(/Type the backup password first/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Backup password'), 'abc')
    expect(screen.getByText(/5 more characters needed/)).toBeInTheDocument()
    expect(screen.getByText(/not your master password/)).toBeInTheDocument()
    await tab('Import')
    await userEvent.type(screen.getByLabelText('Config path'), '/x')
    expect(screen.queryByText('Choose a file to import.')).toBeNull()
  })

  it('a message or an error belongs to the tab it came from', async () => {
    const be = makeFake()
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await tab('Export')
    await userEvent.click(screen.getByRole('button', {name: /Export host list/}))
    expect(await screen.findByRole('status')).toHaveTextContent('Host list (no secrets) exported.')
    await tab('Backup')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('exports metadata-only JSON', async () => {
    const be = makeFake()
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await tab('Export')
    await userEvent.click(screen.getByRole('button', {name: /Export host list/}))
    await waitFor(() => expect(be.state.calls).toContainEqual(['data.exportJSON', '/tmp/vutty-hosts.json']))
  })

  it('surfaces backend errors', async () => {
    const be = makeFake()
    be.data.importBackup = async () => { throw 'Incorrect master password. Please check it and try again.' }
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await tab('Backup')
    await userEvent.type(screen.getByLabelText('Backup password'), 'whatever1')
    await userEvent.click(screen.getByRole('button', {name: 'Restore backup…'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect master password. Please check it and try again.')
  })
})

describe('SyncPanel', () => {
  it('saves the repo and syncs', async () => {
    const be = makeFake()
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    expect(await screen.findByLabelText('Repository URL')).toHaveValue('git@example.com:me/sync.git')
    await userEvent.click(screen.getByRole('button', {name: 'Sync now'}))
    await waitFor(() => expect(be.state.calls.some(c => c[0] === 'sync.syncNow')).toBe(true))
    expect(screen.getByTestId('sync-status')).toHaveTextContent('Never synced')
  })

  it('syncs through a cloud folder', async () => {
    const be = makeFake()
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.click(await screen.findByRole('button', {name: 'Cloud folder'}))
    await userEvent.click(screen.getByRole('button', {name: 'Browse…'}))
    await waitFor(() => expect(screen.getByLabelText('Sync folder')).toHaveValue('/tmp/dir'))
    await userEvent.click(screen.getByRole('button', {name: 'Use this folder'}))
    await waitFor(() => expect(be.state.calls).toContainEqual(['sync.configureFolder', '/tmp/dir']))
  })

  it('disables sync while the vault is locked and join once a vault exists', async () => {
    const be = makeFake()
    render(<Providers be={be}><SyncPanel vault={{...vaultSt, unlocked: false}} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    expect(await screen.findByRole('button', {name: 'Sync now'})).toBeDisabled()
    expect(screen.getByRole('button', {name: 'Restore from repository'})).toBeDisabled()
  })

  it('restores on a new machine', async () => {
    const be = makeFake()
    render(<Providers be={be}><SyncPanel vault={{exists: false, unlocked: false, keychain_enabled: false, auto_lock_minutes: 15}} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.type(await screen.findByLabelText('Synced master password'), 'pw')
    await userEvent.click(screen.getByRole('button', {name: 'Restore from repository'}))
    await waitFor(() => expect(be.state.calls).toContainEqual(['sync.join', 'pw']))
  })

  it('shows sync errors', async () => {
    const be = makeFake()
    be.sync.syncNow = async () => { throw 'remote bundle was encrypted with a different vault key' }
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.click(await screen.findByRole('button', {name: 'Sync now'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('different vault key')
  })
})

describe('null slices from Go (regression)', () => {
  it('offers to join the vault of the repository when the keys differ, and syncs after it', async () => {
    const be = makeFake()
    be.sync.syncNow = async () => { throw 'remote bundle was encrypted with a different vault key' }
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.click(await screen.findByRole('button', {name: 'Sync now'}))
    const box = await screen.findByRole('group', {name: 'Join the synced vault'})
    const join = within(box).getByRole('button', {name: 'Join this vault and sync'})
    expect(join).toBeDisabled()
    await userEvent.type(within(box).getByLabelText("Master password of the repository's vault"), 'remote password')
    await userEvent.click(join)
    await waitFor(() => expect(be.state.calls).toContainEqual(['sync.joinRemoteVault', 'remote password']))
  })

  it('replaces an unreadable repository only after REPLACE is typed', async () => {
    const be = makeFake()
    be.sync.syncNow = async () => { throw 'remote bundle was encrypted with a different vault key' }
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.click(await screen.findByRole('button', {name: 'Sync now'}))
    const box = await screen.findByRole('group', {name: 'Join the synced vault'})
    const replace = within(box).getByRole('button', {name: /Replace the repository with this Mac/})
    expect(replace).toBeDisabled()
    await userEvent.type(within(box).getByLabelText('Type REPLACE to confirm'), 'replace')
    expect(replace).toBeDisabled() // it has to be the word in capitals
    await userEvent.clear(within(box).getByLabelText('Type REPLACE to confirm'))
    await userEvent.type(within(box).getByLabelText('Type REPLACE to confirm'), 'REPLACE')
    await userEvent.click(replace)
    await waitFor(() => expect(be.state.calls.some(c => c[0] === 'sync.replaceRemote')).toBe(true))
  })

  it('keeps the join / replace box after a failed join, so Replace stays reachable', async () => {
    const be = makeFake()
    be.sync.syncNow = async () => { throw 'remote bundle was encrypted with a different vault key' }
    be.sync.joinRemoteVault = async () => { throw 'the password is right, but this repository bundle was not locked with that vault key, so nobody can open it: use Replace below' }
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.click(await screen.findByRole('button', {name: 'Sync now'}))
    const box = await screen.findByRole('group', {name: 'Join the synced vault'})
    await userEvent.type(within(box).getByLabelText("Master password of the repository's vault"), 'whatever it is')
    await userEvent.click(within(box).getByRole('button', {name: 'Join this vault and sync'}))
    expect(await screen.findByText(/was not locked with that vault key/)).toBeInTheDocument()
    expect(screen.getByRole('group', {name: 'Join the synced vault'})).toBeInTheDocument() // still there
    expect(screen.getByRole('button', {name: /Replace the repository with this Mac/})).toBeInTheDocument()
    expect(screen.getByText('The password does not work, or nobody can open that repository any more').closest('details')).toHaveAttribute('open') // opened for the user
  })

  it('does not offer to join on other errors', async () => {
    const be = makeFake()
    be.sync.syncNow = async () => { throw 'could not reach the repository' }
    render(<Providers be={be}><SyncPanel vault={vaultSt} onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.click(await screen.findByRole('button', {name: 'Sync now'}))
    await screen.findByRole('alert')
    expect(screen.queryByRole('group', {name: 'Join the synced vault'})).toBeNull()
  })

  it('DataPanel renders an import report whose arrays are null', async () => {
    const be = makeFake()
    be.data.importSSHConfig = async () => ({hosts_added: 1, groups_added: 0, forwards_added: 0, keys_imported: 0, skipped: null as never, warnings: null as never})
    render(<Providers be={be}><DataPanel onClose={vi.fn()} onChanged={vi.fn()} /></Providers>)
    await userEvent.type(screen.getByLabelText('Config path'), '/x')
    await userEvent.click(screen.getByRole('button', {name: 'Import'}))
    expect(await screen.findByTestId('import-report')).toHaveTextContent('Added 1 hosts')
  })

  it('the Wails adapter normalises null report arrays', async () => {
    const {normalizeImport, normalizeExport} = await import('../backend')
    expect(normalizeImport({skipped: null, warnings: null} as never)).toMatchObject({skipped: [], warnings: []})
    expect(normalizeExport({files: null, key_files: null, warnings: null} as never)).toMatchObject({files: [], key_files: [], warnings: []})
  })
})
