import type {ReactNode} from 'react'
import {useT, useTn} from '../i18n'
import {rich} from './rich'
import type {AiPreview} from '../types'

interface Props {
  preview: AiPreview
  provider: string
  /** buttons under the text (the confirmation in the chat), or a way to close it (the plain preview) */
  actions?: ReactNode
  title?: string
}

/** Exactly what the assistant would receive, after redaction, shown in the chat. Secrets show as *******. */
export function PreviewPanel({preview: p, provider, actions, title: given}: Props) {
  const t = useT()
  const tn = useTn()
  const title = given ?? t('What will be sent')
  return (
    <section className="ai-preview-panel" aria-label={title}>
      <b>{title}</b>
      <p className="muted ai-preview-note">
        {rich(t('This text goes to {provider} with your question. Secrets are replaced by {mask} before it leaves Vutty. Redaction is best-effort: read it first.'), {provider: <b>{provider || t('the AI provider')}</b>, mask: <code>*******</code>})}
      </p>
      <div className="ai-findings" aria-label={t('Redaction summary')}>
        {p.redacted === 0 ? <span className="badge">{t('Nothing redacted')}</span> : (
          <>
            <span className="badge ai-badge-warn">{tn(p.redacted, '{n} item redacted', '{n} items redacted')}</span>
            {p.findings.map(f => <span key={f.kind} className="badge">{f.kind} × {f.count}</span>)}
          </>
        )}
        {p.images > 0 && <span className="badge ai-badge-warn">{tn(p.images, '{n} picture sent as it is', '{n} pictures sent as they are')}</span>}
      </div>
      {p.vault_locked && <div className="ai-warn" role="status">{t('The vault is locked, so your saved passwords cannot be matched exactly. Only patterns are used.')}</div>}
      {p.alt_screen && <div className="ai-warn" role="status">{t('A full-screen program (vim, htop…) is open: its screen is not a readable log.')}</div>}
      {p.empty ? <div className="muted">{t('The terminal has no output yet.')}</div>
        : <pre className="ai-preview" aria-label={t('Text that will be sent')} tabIndex={0}>{p.text}</pre>}
      {actions && <div className="ai-cmd-actions">{actions}</div>}
    </section>
  )
}
