// The app was called VVTerm before it was renamed: its saved view settings, history and so on were stored under
// "vvterm." / "vvterm:" keys. Copy them to the new names once so nobody starts from scratch.
const OLD = ['vvterm.', 'vvterm:']

export function migrateLegacyStorage(store: Storage = localStorage): void {
  try {
    const keys = Array.from({length: store.length}, (_, i) => store.key(i) ?? '')
    for (const key of keys) {
      const prefix = OLD.find(p => key.startsWith(p))
      if (!prefix) continue
      const next = 'vuterm' + key.slice('vvterm'.length)
      if (store.getItem(next) === null) store.setItem(next, store.getItem(key) ?? '')
      store.removeItem(key)
    }
  } catch { /* storage unavailable: nothing to carry over */ }
}
