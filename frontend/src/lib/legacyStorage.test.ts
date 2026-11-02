import {describe, expect, it} from 'vitest'
import {migrateLegacyStorage} from './legacyStorage'

describe('migrateLegacyStorage', () => {
  it('moves vvterm keys to vuterm and keeps a value that is already there', () => {
    localStorage.clear()
    localStorage.setItem('vvterm.sidebar', 'closed')
    localStorage.setItem('vvterm:ai-next-model', 'x')
    localStorage.setItem('vvterm.recent', 'old')
    localStorage.setItem('vuterm.recent', 'new')
    localStorage.setItem('other', 'keep')
    migrateLegacyStorage()
    expect(localStorage.getItem('vuterm.sidebar')).toBe('closed')
    expect(localStorage.getItem('vuterm:ai-next-model')).toBe('x')
    expect(localStorage.getItem('vuterm.recent')).toBe('new')
    expect(localStorage.getItem('vvterm.sidebar')).toBeNull()
    expect(localStorage.getItem('other')).toBe('keep')
  })
})
