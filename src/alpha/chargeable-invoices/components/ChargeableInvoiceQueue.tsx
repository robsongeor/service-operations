import { useMemo, useRef, useState } from 'react'
import { deriveChargeableInvoicePrimaryQueue, type ChargeableInvoicePrimaryQueue } from '../domain/chargeableInvoiceState.ts'
import { useChargeableInvoiceReviews } from '../hooks/useChargeableInvoiceReviews.ts'
import ChargeableInvoiceWorkspace from './ChargeableInvoiceWorkspace.tsx'

const queues: Array<{ id: ChargeableInvoicePrimaryQueue | 'all'; label: string }> = [
    { id: 'all', label: 'All active' }, { id: 'new', label: 'New' },
    { id: 'in-progress', label: 'In progress' }, { id: 'waiting', label: 'Waiting' },
    { id: 'ready-to-process', label: 'Ready' }, { id: 'history', label: 'History' },
]

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

function queueLabel(id: ChargeableInvoicePrimaryQueue) {
    return queues.find((queue) => queue.id === id)?.label ?? id
}

export default function ChargeableInvoiceQueue() {
    const reviews = useChargeableInvoiceReviews()
    const [queue, setQueue] = useState<ChargeableInvoicePrimaryQueue | 'all'>('all')
    const [search, setSearch] = useState('')
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const filtered = useMemo(() => reviews.reviews.filter((review) => {
        if (queue !== 'all' && deriveChargeableInvoicePrimaryQueue(review) !== queue) return false
        const term = search.trim().toLowerCase()
        return !term || [review.gr_invoicenumber, review.gr_greentreereference, review.gr_Job?.gr_jobnumber,
            review.gr_Customer?.gr_name, review.gr_Site?.gr_name, review.gr_Equipment?.gr_fleet]
            .some((value) => value?.toLowerCase().includes(term))
    }), [queue, reviews.reviews, search])

    const closeWorkspace = () => {
        reviews.closeReview()
        window.setTimeout(() => triggerRef.current?.focus(), 0)
    }

    return <>
        <section className="chargeable-queue-controls" aria-label="Review queue filters">
            <div className="chargeable-queue-tabs">{queues.map((item) => <button key={item.id} type="button" className={queue === item.id ? 'active' : ''} aria-pressed={queue === item.id} onClick={() => setQueue(item.id)}>{item.label}{item.id !== 'all' && <span>{reviews.counts[item.id]}</span>}</button>)}</div>
            <label className="chargeable-search"><span className="sr-only">Search invoice reviews</span><input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Search invoice, Job, customer or fleet" /></label>
            <button type="button" className="chargeable-secondary" disabled={reviews.isLoading} onClick={() => void reviews.refresh()}>Refresh</button>
        </section>
        {reviews.loadError && <div className="chargeable-banner error" role="alert">{reviews.loadError}</div>}
        <section className="chargeable-preview-shell" aria-label="Chargeable Invoice Review queue">
            <div className="chargeable-preview-intro"><div><h2>{queue === 'all' ? 'Active reviews' : queueLabel(queue)}</h2><p>Staging and failed imports are excluded from this manager queue.</p></div><strong>{filtered.length} review{filtered.length === 1 ? '' : 's'}</strong></div>
            <div className="chargeable-table-wrap"><table className="chargeable-table chargeable-queue-table"><thead><tr><th>Invoice</th><th>Job</th><th>Customer / Site</th><th>Equipment</th><th>Total</th><th>Queue</th><th>Updated</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>
                {filtered.map((review) => { const state = deriveChargeableInvoicePrimaryQueue(review); return <tr key={review.gr_chargeableinvoicereviewid}><td><strong>{review.gr_invoicenumber}</strong><small>{review.gr_invoicedate}</small></td><td><strong>{review.gr_Job?.gr_jobnumber || review.gr_greentreereference}</strong><small>{review.gr_Job?.gr_description || ''}</small></td><td><strong>{review.gr_Customer?.gr_name || '—'}</strong><small>{review.gr_Site?.gr_name || ''}</small></td><td><strong>{review.gr_Equipment?.gr_fleet || '—'}</strong><small>{review.gr_Equipment?.gr_serial || ''}</small></td><td className="money">{review.gr_CurrentRevision?.gr_total == null ? '—' : money.format(review.gr_CurrentRevision.gr_total)}</td><td><span className={`chargeable-queue-state state-${state}`}>{queueLabel(state)}</span>{review.gr_waitingnote && <small>{review.gr_waitingnote}</small>}</td><td>{review.modifiedon ? new Date(review.modifiedon).toLocaleDateString('en-NZ') : '—'}</td><td><button ref={reviews.selectedId === review.gr_chargeableinvoicereviewid ? triggerRef : undefined} type="button" className="chargeable-secondary" onClick={(event) => { triggerRef.current = event.currentTarget; void reviews.openReview(review.gr_chargeableinvoicereviewid) }}>Open</button></td></tr> })}
                {!reviews.isLoading && filtered.length === 0 && <tr><td colSpan={8} className="chargeable-no-results">No reviews match this queue and search.</td></tr>}
            </tbody></table></div>
        </section>
        {reviews.selectedId && <ChargeableInvoiceWorkspace workspace={reviews.workspace} loading={reviews.isLoadingWorkspace} saving={reviews.isSaving} error={reviews.workspaceError} onStart={reviews.startReview} onSaveWaiting={reviews.saveWaiting} onSaveRequirements={reviews.saveRequirements} onSavePhotoTechnician={reviews.savePhotoTechnician} onPreparePhotoRequest={reviews.preparePhotoRequest} onPreparePoRequest={reviews.preparePoRequest} onUploadPhotos={reviews.uploadPhotos} onGenerateApprovalPdf={reviews.generateApprovalPdf} onMarkReady={reviews.markReady} onMarkDoNotProcess={reviews.markDoNotProcess} onAddCorrection={reviews.addCorrection} onLoadDocument={reviews.loadDocument} onDownload={reviews.downloadDocument} onClose={closeWorkspace} />}
    </>
}
