import { useEffect, useRef, useState } from 'react'
import PageHeader from '../shared/page-header/PageHeader.tsx'
import MetricStrip from '../shared/metric-strip/MetricStrip.tsx'
import { CHARGEABLE_INVOICE_MATCH_STATUSES } from './types/chargeableInvoice.types.ts'
import { useChargeableInvoiceIntake } from './hooks/useChargeableInvoiceIntake.ts'
import ChargeableInvoiceQueue from './components/ChargeableInvoiceQueue.tsx'
import JobCreateDrawer from '../jobs/components/JobCreateDrawer.tsx'
import JobDrawerShell from '../jobs/components/JobDrawerShell.tsx'
import { useJobs } from '../jobs/hooks/useJobs.ts'
import type { JobSaveInput } from '../jobs/types/jobSave.types.ts'
import type { ChargeableInvoiceIntakeItem } from './hooks/useChargeableInvoiceIntake.ts'
import { greenTreeJobDescription, greenTreeJobOrderNumber } from './domain/greenTreeInvoiceExtraction.ts'
import { JOB_STATUSES } from '../jobs/types/jobStatus.types.ts'
import './ChargeableInvoiceReviewScreen.css'
import { parseAlternateFleetNumbers } from '../equipment/identifiers/alternateFleetNumbers.ts'

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })

function matchLabel(status: number | undefined) {
    if (status === CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_EXACTLY) return 'Exact Job match'
    if (status === CHARGEABLE_INVOICE_MATCH_STATUSES.MATCHED_MANUALLY) return 'Manual Job match'
    if (status === CHARGEABLE_INVOICE_MATCH_STATUSES.AMBIGUOUS) return 'Ambiguous'
    if (status === CHARGEABLE_INVOICE_MATCH_STATUSES.UNMATCHED) return 'Unmatched'
    return 'Not checked'
}

const normalizeEquipmentIdentifier = (value?: string | null) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? ''

function uniqueExactEquipmentMatch<T extends { gr_fleet?: string | null; gr_alternatefleetnumbers?: string | null; gr_serial?: string | null }>(
    equipment: T[],
    proposed: { fleet?: string | null; serial?: string | null },
) {
    const fleet = normalizeEquipmentIdentifier(proposed.fleet)
    const serial = normalizeEquipmentIdentifier(proposed.serial)
    if (!fleet && !serial) return null
    const matches = equipment.filter((item) => {
        const itemFleetIdentifiers = [item.gr_fleet, ...parseAlternateFleetNumbers(item.gr_alternatefleetnumbers)]
            .map(normalizeEquipmentIdentifier)
            .filter(Boolean)
        const itemSerial = normalizeEquipmentIdentifier(item.gr_serial)
        const exactIdentifier = Boolean((fleet && itemFleetIdentifiers.includes(fleet)) || (serial && itemSerial === serial))
        const fleetCompatible = !fleet || itemFleetIdentifiers.length === 0 || itemFleetIdentifiers.includes(fleet)
        const serialCompatible = !serial || !itemSerial || itemSerial === serial
        return exactIdentifier && fleetCompatible && serialCompatible
    })
    return matches.length === 1 ? matches[0] : null
}

type InvoiceJobCreateProps = {
    item: ChargeableInvoiceIntakeItem
    onClose: () => void
    onCreated: (jobId: string, job: JobSaveInput) => Promise<void>
}

function InvoiceJobCreateDrawer({ item, onClose, onCreated }: InvoiceJobCreateProps) {
    const jobs = useJobs()
    const { prepareJobReferenceData, referenceDataStatus, referenceDataError } = jobs
    const revision = item.extraction?.revision

    useEffect(() => {
        void prepareJobReferenceData().catch(() => undefined)
    }, [prepareJobReferenceData])

    const matchedEquipment = uniqueExactEquipmentMatch(jobs.equipmentList, {
        fleet: revision?.gr_fleet,
        serial: revision?.gr_serial,
    })

    if (referenceDataStatus === 'idle' || referenceDataStatus === 'loading') return <JobDrawerShell eyebrow="Create job" title={revision?.gr_greentreereference || 'New job'} busy onClose={onClose} footer={<button type="button" onClick={onClose}>Cancel</button>}>
        <p className="chargeable-job-create-status">Loading Customer, Site and Equipment choices…</p>
    </JobDrawerShell>

    if (referenceDataStatus === 'error') return <JobDrawerShell eyebrow="Create job" title={revision?.gr_greentreereference || 'New job'} onClose={onClose} footer={<button type="button" onClick={onClose}>Close</button>}>
        <div className="chargeable-job-create-status" role="alert">
            <p>{referenceDataError}</p>
            <button type="button" className="chargeable-secondary" onClick={() => { void prepareJobReferenceData().catch(() => undefined) }}>Try again</button>
        </div>
    </JobDrawerShell>

    return <JobCreateDrawer
        mechanics={jobs.mechanics}
        equipmentList={jobs.equipmentList}
        sites={jobs.sites}
        customers={jobs.customers}
        siteContacts={jobs.siteContacts}
        servicePlans={jobs.servicePlans}
        onCreateCustomer={jobs.createCustomer}
        onCreateSite={jobs.createSite}
        onCreateContact={jobs.createContactForSite}
        onCreateEquipment={jobs.createEquipment}
        onCreateJob={jobs.createJob}
        onCreateScheduleOption={jobs.createScheduleOption}
        initialValues={{
            jobNumber: item.jobLookupValue.trim() || revision?.gr_greentreereference || '',
            orderNumber: greenTreeJobOrderNumber(revision?.gr_rawordernumber),
            status: JOB_STATUSES.COMPLETE,
            equipmentId: matchedEquipment?.gr_equipmentid,
            customerId: matchedEquipment?.gr_Site?.gr_Customer?.gr_customerid,
            siteId: matchedEquipment?.gr_Site?.gr_siteid,
            description: greenTreeJobDescription(revision?.gr_headline)
                || revision?.gr_repairdescription
                || revision?.gr_workcompleted
                || '',
            equipmentDraft: {
                fleet: revision?.gr_fleet || '',
                serial: revision?.gr_serial || '',
                make: revision?.gr_make || '',
                model: revision?.gr_model || '',
            },
        }}
        requireJobNumber
        onCreated={onCreated}
        onClose={onClose}
    />
}

export default function ChargeableInvoiceReviewScreen() {
    const inputRef = useRef<HTMLInputElement>(null)
    const intake = useChargeableInvoiceIntake()
    const [mode, setMode] = useState<'queue' | 'intake'>('queue')
    const [creatingJobForItemId, setCreatingJobForItemId] = useState<string | null>(null)
    const creatingJobForItem = intake.items.find((item) => item.id === creatingJobForItemId) ?? null

    return <main className="chargeable-invoices-screen">
        <PageHeader
            eyebrow="Manager workflow"
            title="Chargeable Invoice Review"
            subtitle={mode === 'queue'
                ? 'Work through active chargeable invoices without changing operational Job status.'
                : 'Choose GreenTree PDFs to check their details and Job matches automatically, then import only the selected valid invoices.'}
            actions={<>
                {mode === 'queue'
                    ? <button type="button" className="chargeable-primary" onClick={() => setMode('intake')}>Import PDFs</button>
                    : <button type="button" className="chargeable-secondary" onClick={() => setMode('queue')}>Back</button>}
                {mode === 'intake' && intake.summary.total > 0 && <button type="button" className="chargeable-secondary" onClick={() => inputRef.current?.click()} disabled={intake.isPreviewing}>
                    Add PDFs
                </button>}
            </>}
        />

        {mode === 'queue' ? <ChargeableInvoiceQueue /> : <>
        <input
            ref={inputRef}
            className="chargeable-file-input"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => {
                intake.addFiles(Array.from(event.currentTarget.files ?? []))
                event.currentTarget.value = ''
            }}
        />

        <MetricStrip ariaLabel="Invoice preview summary" items={[
            { label: 'Files', value: intake.summary.total },
            { label: 'Pending preview', value: intake.summary.pending },
            { label: 'Ready', value: intake.summary.ready },
            { label: 'Needs attention', value: intake.summary.blocked, tone: intake.summary.blocked ? 'warning' : undefined },
            { label: 'Selected', value: intake.summary.selected },
            { label: 'Imported', value: intake.summary.imported },
        ]} />

        {intake.batchError && <div className="chargeable-banner error" role="alert">{intake.batchError}</div>}

        {intake.items.length === 0 ? <section className="chargeable-empty">
            <h2>Add GreenTree invoice PDFs</h2>
            <p>Select up to 20 text-based PDFs. Each file is checked automatically and independently, so one invalid invoice will not block the rest of the batch.</p>
            <button type="button" className="chargeable-primary" onClick={() => inputRef.current?.click()}>Choose PDFs</button>
        </section> : <section className="chargeable-preview-shell" aria-label="Invoice preview batch">
            <div className="chargeable-preview-intro">
                <div><h2>Import preview</h2><p>Only exact Job matches without extraction errors can be selected.</p></div>
                <button type="button" className="chargeable-primary" disabled={intake.isImporting || intake.summary.selected === 0} onClick={() => void intake.importSelected().then((allImported) => { if (allImported) setMode('queue') })}>
                    {intake.isImporting ? 'Importing…' : `Import selected (${intake.summary.selected})`}
                </button>
            </div>
            <div className="chargeable-table-wrap">
                <table className="chargeable-table">
                    <thead><tr><th scope="col">Select</th><th scope="col">PDF</th><th scope="col">Invoice / decision</th><th scope="col">Our Ref / Job</th><th scope="col">Customer / Equipment</th><th scope="col">Lines</th><th scope="col" className="money">Total</th><th scope="col">Result</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>{intake.items.map((item) => {
                        const revision = item.extraction?.revision
                        const job = item.preview?.match.job
                        return <tr key={item.id} className={`state-${item.state}`}>
                            <td><input type="checkbox" checked={item.selected} disabled={item.state !== 'ready'} aria-label={`Select ${item.file.name} for import`} onChange={(event) => intake.setSelected(item.id, event.currentTarget.checked)} /></td>
                            <td><strong>{item.file.name}</strong><small>{(item.file.size / 1024).toFixed(0)} KiB</small></td>
                            <td><strong>{revision?.gr_invoicenumber || '—'}</strong><small>{revision?.gr_invoicedate || ''}</small>{item.preview?.duplicate.kind === 'revision' && <select aria-label={`Import decision for ${item.file.name}`} value={item.importDecision ?? ''} onChange={(event) => intake.setImportDecision(item.id, event.currentTarget.value as 'revision' | 'skip')}><option value="">Choose…</option><option value="revision">Import as revision {item.preview.duplicate.proposedRevisionNumber}</option><option value="skip">Skip</option></select>}{item.preview?.duplicate.kind === 'retry' && <small>Retry incomplete import as revision {item.preview.duplicate.proposedRevisionNumber}</small>}</td>
                            <td><strong>{revision?.gr_greentreereference || '—'}</strong><small>{job?.gr_jobnumber || matchLabel(item.preview?.match.status)}</small>{item.preview && !job && <div className="chargeable-job-lookup"><input value={item.jobLookupValue} onChange={(event) => intake.setJobLookupValue(item.id, event.currentTarget.value)} aria-label={`Job Number for ${item.file.name}`} placeholder="Job Number" /><button type="button" className="chargeable-secondary" disabled={item.isLookingUpJob || !item.jobLookupValue.trim()} onClick={() => void intake.lookupJob(item.id)}>{item.isLookingUpJob ? 'Checking…' : 'Set Job'}</button><button type="button" className="chargeable-secondary" disabled={item.isLookingUpJob} onClick={() => setCreatingJobForItemId(item.id)}>Create Job</button></div>}</td>
                            <td><strong>{job?.gr_Site?.gr_Customer?.gr_name || '—'}</strong><small>{job?.gr_Equipment?.gr_fleet || job?.gr_Equipment?.gr_serial || ''}</small></td>
                            <td>{item.extraction?.lines.length ?? '—'}</td>
                            <td className="money">{revision?.gr_total == null ? '—' : money.format(revision.gr_total)}</td>
                            <td><span className={`chargeable-result ${item.state}`}>{item.state === 'previewing' ? 'Previewing' : item.state === 'importing' ? 'Importing' : item.state === 'imported' ? 'Imported' : item.state === 'ready' ? 'Ready' : item.state === 'pending' ? 'Pending' : 'Needs attention'}</span>{item.error && <small className="chargeable-row-error">{item.error}</small>}</td>
                            <td><button type="button" className="chargeable-remove" onClick={() => intake.removeItem(item.id)} disabled={item.state === 'previewing'} aria-label={`Remove ${item.file.name}`}>Remove</button></td>
                        </tr>
                    })}</tbody>
                </table>
            </div>
        </section>}
        </>}
        {creatingJobForItem && <InvoiceJobCreateDrawer
            item={creatingJobForItem}
            onClose={() => setCreatingJobForItemId(null)}
            onCreated={(jobId, job) => intake.matchCreatedJob(creatingJobForItem.id, job.jobNumber, jobId)}
        />}
    </main>
}
