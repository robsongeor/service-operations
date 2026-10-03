import type { JobEmailDeliveryState } from '../services/jobEmail'
import './JobQuickActions.css'

type Props = {
    onCopy: () => void
    copyBlockedReason?: string
    onEmail?: () => void
    emailBlockedReason?: string
    emailDelivery?: JobEmailDeliveryState
    emailBusy?: boolean
    labels?: boolean
}

/** Shared table actions; the owning hook supplies permissions, data and workflows. */
export default function JobQuickActions({ onCopy, copyBlockedReason = '', onEmail, emailBlockedReason = '', emailDelivery, emailBusy = false, labels = false }: Props) {
    return <>
        <button type="button" className={`job-quick-action${labels ? ' with-label' : ''}`} title={copyBlockedReason || 'Copy for order number book'} aria-label="Copy for order number book" disabled={Boolean(copyBlockedReason)} onClick={onCopy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" /></svg>
            {labels && <span>Copy for order book</span>}
        </button>
        {onEmail && <button type="button" className={`job-quick-action${labels ? ' with-label' : ''} ${emailDelivery?.status || ''}`} title={emailBlockedReason || emailDelivery?.message || 'Email to technician'} aria-label="Email to technician" disabled={Boolean(emailBlockedReason) || emailBusy || emailDelivery?.status === 'sending'} onClick={onEmail}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h18v11H3z" /><path d="m4 7 8 6 8-6" /></svg>
            {labels && <span>{emailDelivery?.status === 'sending' ? 'Sending…' : emailDelivery?.status === 'sent' ? 'Email sent' : emailDelivery?.status === 'failed' ? 'Check email delivery' : 'Email to technician'}</span>}
        </button>}
    </>
}
