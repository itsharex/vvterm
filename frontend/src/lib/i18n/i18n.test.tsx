import {act, render, screen} from '@testing-library/react'
import {catalogueKeys, format, I18nProvider, resolveLang, t, tn, translate, translateCount, useT, useTn} from './index'
import {LanguageRoot, setLanguageSetting} from './store'

describe('resolveLang', () => {
  it('follows the system for auto, and takes an explicit language as it is', () => {
    expect(resolveLang('auto', 'vi-VN')).toBe('vi')
    expect(resolveLang(undefined, 'ja')).toBe('ja')
    expect(resolveLang('auto', 'zh-Hans-CN')).toBe('zh')
    expect(resolveLang('auto', 'fr-FR')).toBe('en') // a language the app does not have
    expect(resolveLang('zh', 'vi')).toBe('zh')
    expect(resolveLang('xx', 'vi')).toBe('en')
  })
})

describe('translate', () => {
  it('fills variables and falls back to the English text', () => {
    expect(format('Delete "{name}"?', {name: 'web-1'})).toBe('Delete "web-1"?')
    expect(format('{a} and {b}', {a: 1})).toBe('1 and {b}') // an unknown variable stays visible
    expect(translate('en', 'Something with no entry anywhere')).toBe('Something with no entry anywhere')
    expect(translate('vi', 'Something with no entry anywhere')).toBe('Something with no entry anywhere')
    expect(translate('vi', 'Cancel')).not.toBe('Cancel')
    expect(translate('ja', 'Cancel')).not.toBe('Cancel')
    expect(translate('zh', 'Cancel')).not.toBe('Cancel')
  })
  it('picks the singular for one and the plural otherwise, with the number', () => {
    expect(translateCount('en', 1, '{n} host', '{n} hosts')).toBe('1 host')
    expect(translateCount('en', 3, '{n} host', '{n} hosts')).toBe('3 hosts')
    expect(translateCount('en', 0, '{n} host', '{n} hosts')).toBe('0 hosts')
  })
  it('has the same texts in every language', () => {
    const vi = catalogueKeys('vi').sort()
    expect(vi.length).toBeGreaterThan(500)
    expect(catalogueKeys('ja').sort()).toEqual(vi)
    expect(catalogueKeys('zh').sort()).toEqual(vi)
  })
})

function Demo() {
  const t = useT()
  const tn = useTn()
  return <p>{t('Cancel')} · {tn(2, '{n} host', '{n} hosts')} · {t('Delete "{name}"?', {name: 'x'})}</p>
}

describe('the language of the interface', () => {
  afterEach(() => { act(() => setLanguageSetting('auto')) })
  it('English by default, and what the setting says once it changes', () => {
    render(<LanguageRoot><Demo /></LanguageRoot>)
    act(() => setLanguageSetting('en'))
    expect(screen.getByText(/^Cancel · 2 hosts · Delete "x"\?$/)).toBeInTheDocument()
    act(() => setLanguageSetting('vi'))
    expect(screen.queryByText(/^Cancel/)).toBeNull()
    expect(document.documentElement.lang).toBe('vi')
    expect(screen.getByText(translate('vi', 'Cancel'), {exact: false})).toBeInTheDocument()
    act(() => setLanguageSetting('ja'))
    expect(document.documentElement.lang).toBe('ja')
    expect(t('Cancel')).toBe(translate('ja', 'Cancel')) // the module level t follows too
    expect(tn(1, '{n} host', '{n} hosts')).toBe(translateCount('ja', 1, '{n} host', '{n} hosts'))
  })
  it('a provider with a language is enough', () => {
    render(<I18nProvider lang="zh"><Demo /></I18nProvider>)
    expect(screen.getByText(translate('zh', 'Cancel'), {exact: false})).toBeInTheDocument()
  })
})
