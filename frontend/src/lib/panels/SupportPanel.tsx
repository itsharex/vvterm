import {Modal} from '../ui/Modal'
import {useBackend} from '../backend'
import {useToast} from '../ui/Toast'
import {errMsg} from '../util'
import {DONATE_NETWORKS, KOFI, SHOW_CRYPTO_DONATE} from '../donate'
import {useT} from '../i18n'

export {DONATE_NETWORKS}

/** Support Vutty: Ko-fi, the suggested amounts, and (when SHOW_CRYPTO_DONATE is on) the USDT addresses as QR codes with a Copy button. */
export function SupportPanel({onClose}: {onClose(): void}) {
  const be = useBackend()
  const t = useT()
  const toast = useToast()
  const copy = (address: string, name: string) =>
    void be.system.writeClipboard(address).then(() => toast.info(t('{name} address copied', {name}))).catch(e => toast.error(errMsg(e)))

  return (
    <Modal title={t('Support Vutty')} wide onClose={onClose} footer={<button onClick={onClose}>{t('Close')}</button>}>
      <div style={{display: 'grid', gap: 16, justifyItems: 'center', textAlign: 'center'}}>
        <div className="muted">{t('Vutty is free and open source, built and maintained in spare time. If it saves you time, you can help keep it going.')}</div>
        <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center'}}>
          {[['☕', '$3', t('a cup of coffee')], ['🍜', '$10', t('a lunch')], ['🚀', '$25', t('fuel new features')]].map(([icon, amount, what]) => (
            <div key={amount} style={{minWidth: 140, padding: '12px 16px', borderRadius: 12, border: '1px solid var(--line, #2c3244)'}}>
              <div style={{fontSize: 26}} aria-hidden="true">{icon}</div>
              <b>{amount}</b>
              <div className="muted">{what}</div>
            </div>
          ))}
        </div>
        <button className="primary" onClick={() => void be.system.openUrl(KOFI)}>{t('Support on Ko-fi')}</button>
        {SHOW_CRYPTO_DONATE && <>
        <div className="muted">{t('Prefer crypto? Scan a code or copy an address, and check the network before you send.')}</div>
        <div style={{display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center'}}>
          {DONATE_NETWORKS.map(n => (
            <div key={n.id} style={{display: 'grid', gap: 8, justifyItems: 'center', maxWidth: 320}}>
              <b>{n.name} <span className="muted">({n.chain})</span></b>
              <img src={n.qr} width={170} height={170} alt={t('QR code of the {name} address', {name: n.name})} style={{borderRadius: 10, background: '#fff'}} />
              <code style={{wordBreak: 'break-all', fontSize: 11, userSelect: 'text'}}>{n.address}</code>
              <button aria-label={t('Copy {name} address', {name: n.name})} onClick={() => copy(n.address, n.name)}>{t('Copy address')}</button>
            </div>
          ))}
        </div>
        </>}
      </div>
    </Modal>
  )
}
