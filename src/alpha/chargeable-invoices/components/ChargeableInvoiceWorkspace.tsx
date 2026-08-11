import { useMemo, useState } from 'react'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection.tsx'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell.tsx'
import DrawerTabs from '../../shared/drawer/DrawerTabs.tsx'
import { getReadyToProcessBlockers } from '../domain/chargeableInvoiceState.ts'
import {
    CHARGEABLE_INVOICE_LINE_TYPES,
    CHARGEABLE_INVOICE_WAITING_ON,
    type ChargeableInvoiceDocument,
    type ChargeableInvoiceWaitingOn,
    type ChargeableInvoiceWorkspace as Workspace,
} from '../types/chargeableInvoice.types.ts'

type Tab = 'summary' | 'invoice' | 'history'

type Props = {
    workspace: Workspace | null
    loading: boolean
    saving: boolean
    error: string
    onStart: () => Promise<void>
    onSaveWaiting: (waitingOn: ChargeableInvoiceWaitingOn | null, note: string) => Promise<void>
    onDownload: (document: ChargeableInvoiceDocument) => Promise<void>
    onClose: () => void
}

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const dateTime = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })

const waitingOptions = [
    ['Technician', CHARGEABLE_INVOICE_WAITING_ON.TECHNICIAN],
    ['Customer', CHARGEABLE_INVOICE_WAITING_ON.CUSTOMER],
    ['Nargiza / Accounts', CHARGEABLE_INVOICE_WAITING_ON.ACCOUNTS],
    ['Sales', CHARGEABLE_INVOICE_WAITING_ON.SALES],
    ['Management', CHARGEABLE_INVOICE_WAITING_ON.MANAGEMENT],
    ['Other', CHARGEABLE_INVOICE_WAITING_ON.OTHER],
] as const

function formatDateTime(value?: string | null) {
    if (!value) return '—'
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '—' : dateTime.format(parsed)
}

function eventLabel(value: number) {
    return [
        'Invoice uploaded', 'Job matched', 'Review started', 'Correction added', 'Correction changed',
        'Waiting changed', 'Technician selected', 'Photo request prepared', 'Photos received',
        'Revised invoice uploaded', 'Revision compared', 'PO requirement changed',
        'Approval PDF generated', 'PO request prepared', 'PO received', 'Ready to process',
        'Do not process', 'Manual note',
    ][value - 122830000] ?? 'Review activity'
}

function WaitingEditor({ workspace, saving, onSave }: {
    workspace: Workspace
    saving: boolean
    onSave: (waitingOn: ChargeableInvoiceWaitingOn | null, note: string) => Promise<void>
}) {
    const [waitingOn, setWaitingOn] = useState<ChargeableInvoiceWaitingOn | null>(workspace.review.gr_waitingon ?? null)
    const [waitingNote, setWaitingNote] = useState(workspace.review.gr_waitingnote ?? '')
    return <>
        <label className="chargeable-field">Waiting on<select value={waitingOn ?? ''} disabled={saving || !workspace.review.gr_reviewstartedon || workspace.review.gr_disposition != null} onChange={(event) => setWaitingOn(event.currentTarget.value ? Number(event.currentTarget.value) as ChargeableInvoiceWaitingOn : null)}><option value="">Not waiting</option>{waitingOptions.map(([label, value]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="chargeable-field">Waiting note<textarea rows={4} value={waitingNote} disabled={saving || !workspace.review.gr_reviewstartedon || waitingOn == null || workspace.review.gr_disposition != null} onChange={(event) => setWaitingNote(event.currentTarget.value)} /></label>
        <button type="button" className="chargeable-secondary" disabled={saving || !workspace.review.gr_reviewstartedon || waitingOn != null && !waitingNote.trim()} onClick={() => void onSave(waitingOn, waitingNote)}>Save Waiting state</button>
    </>
}

export default function ChargeableInvoiceWorkspace({
    workspace, loading, saving, error, onStart, onSaveWaiting, onDownload, onClose,
}: Props) {
    const [tab, setTab] = useState<Tab>('summary')
    const review = workspace?.review

    const currentRevision = useMemo(() => workspace?.revisions.find((revision) =>
        revision.gr_chargeableinvoicerevisionid === review?._gr_currentrevision_value)
        ?? workspace?.revisions[0], [review?._gr_currentrevision_value, workspace?.revisions])
    const currentLines = useMemo(() => workspace?.lines.filter((line) =>
        line._gr_revision_value === currentRevision?.gr_chargeableinvoicerevisionid) ?? [],
    [currentRevision?.gr_chargeableinvoicerevisionid, workspace?.lines])
    const blockers = review ? getReadyToProcessBlockers(review) : []

    return <EditDrawerShell
        eyebrow="Chargeable invoice"
        title={review?.gr_invoicenumber || 'Loading review…'}
        busy={saving}
        onClose={onClose}
        footer={<>
            {review && !review.gr_reviewstartedon && <button type="button" className="primary" disabled={saving} onClick={() => void onStart()}>{saving ? 'Starting…' : 'Start review'}</button>}
            <button type="button" disabled={saving} onClick={onClose}>Close</button>
        </>}
    >
        <DrawerTabs
            tabs={[{ id: 'summary', label: 'Summary' }, { id: 'invoice', label: 'Invoice' }, { id: 'history', label: 'History' }]}
            activeTab={tab}
            onChange={setTab}
            ariaLabel="Chargeable Invoice Review details"
        />
        {error && <div className="chargeable-banner error" role="alert">{error}</div>}
        {loading && <p>Loading invoice review…</p>}

        <div role="tabpanel" id="drawer-tab-panel-summary" aria-labelledby="drawer-tab-summary" hidden={tab !== 'summary'}>
            {review && <>
                <EditDrawerSection title="Review context">
                    <dl className="chargeable-detail-grid">
                        <div><dt>Job</dt><dd>{review.gr_Job?.gr_jobnumber || review.gr_greentreereference}</dd></div>
                        <div><dt>Customer</dt><dd>{review.gr_Customer?.gr_name || '—'}</dd></div>
                        <div><dt>Site</dt><dd>{review.gr_Site?.gr_name || '—'}</dd></div>
                        <div><dt>Equipment</dt><dd>{review.gr_Equipment?.gr_fleet || review.gr_Equipment?.gr_serial || '—'}</dd></div>
                        <div><dt>Invoice date</dt><dd>{review.gr_invoicedate}</dd></div>
                        <div><dt>Review started</dt><dd>{formatDateTime(review.gr_reviewstartedon)}</dd></div>
                    </dl>
                </EditDrawerSection>
                <EditDrawerSection title="Waiting">
                    <WaitingEditor key={`${review.gr_chargeableinvoicereviewid}-${review['@odata.etag']}`} workspace={workspace} saving={saving} onSave={onSaveWaiting} />
                </EditDrawerSection>
                <EditDrawerSection title="Ready-to-process checks">
                    {blockers.length ? <ul className="chargeable-blockers">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="chargeable-ready-message">All recorded prerequisites are satisfied. The terminal Ready action will be added in its confirmation slice.</p>}
                </EditDrawerSection>
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-invoice" aria-labelledby="drawer-tab-invoice" hidden={tab !== 'invoice'}>
            {currentRevision && <>
                <EditDrawerSection title={`Revision ${currentRevision.gr_revisionnumber}`}>
                    <dl className="chargeable-detail-grid">
                        <div><dt>Headline</dt><dd>{currentRevision.gr_headline || '—'}</dd></div>
                        <div><dt>Order No evidence</dt><dd>{currentRevision.gr_rawordernumber || '—'}</dd></div>
                        <div><dt>Date of Job</dt><dd>{currentRevision.gr_dateofjob || '—'}</dd></div>
                        <div><dt>Total</dt><dd>{currentRevision.gr_total == null ? '—' : money.format(currentRevision.gr_total)}</dd></div>
                    </dl>
                    {currentRevision.gr_repairdescription && <><h4>Description of repair work</h4><p>{currentRevision.gr_repairdescription}</p></>}
                    {currentRevision.gr_workcompleted && <><h4>Work completed</h4><p>{currentRevision.gr_workcompleted}</p></>}
                </EditDrawerSection>
                <EditDrawerSection title="Invoice lines">
                    <div className="chargeable-workspace-table-wrap"><table className="chargeable-workspace-table"><thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>{currentLines.map((line) => <tr key={line.gr_chargeableinvoicelineid}><td>{line.gr_linetype === CHARGEABLE_INVOICE_LINE_TYPES.LABOUR ? 'Labour' : line.gr_linetype === CHARGEABLE_INVOICE_LINE_TYPES.PARTS ? 'Parts' : 'Other'}</td><td>{line.gr_description}</td><td>{line.gr_quantity ?? '—'}</td><td>{line.gr_unitprice == null ? '—' : money.format(line.gr_unitprice)}</td><td>{line.gr_extendedprice == null ? '—' : money.format(line.gr_extendedprice)}</td></tr>)}</tbody></table></div>
                </EditDrawerSection>
                <EditDrawerSection title="Documents">
                    <ul className="chargeable-document-list">{workspace?.documents.map((document) => <li key={document.gr_chargeableinvoicedocumentid}><span><strong>{document.gr_filename || document.gr_name}</strong><small>{(document.gr_bytecount / 1024).toFixed(0)} KiB</small></span><button type="button" className="chargeable-secondary" onClick={() => void onDownload(document)}>Download</button></li>)}</ul>
                </EditDrawerSection>
            </>}
        </div>

        <div role="tabpanel" id="drawer-tab-panel-history" aria-labelledby="drawer-tab-history" hidden={tab !== 'history'}>
            <EditDrawerSection title="Activity">
                {workspace?.activities.length ? <ol className="chargeable-activity-list">{workspace.activities.map((activity) => <li key={activity.gr_chargeableinvoiceactivityid}><strong>{eventLabel(activity.gr_event)}</strong><span>{formatDateTime(activity.gr_occurredon)} · {activity['_createdby_value@OData.Community.Display.V1.FormattedValue'] || 'Manager'}</span>{activity.gr_detail && <p>{activity.gr_detail}</p>}</li>)}</ol> : <p>No activity is available.</p>}
            </EditDrawerSection>
        </div>
    </EditDrawerShell>
}
