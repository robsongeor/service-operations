import { useMemo, useState } from 'react'
import PageHeader from '../shared/page-header/PageHeader'
import EditDrawerFormDialog from '../shared/drawer/EditDrawerFormDialog'
import { JOB_STATUSES } from '../jobs/types/jobStatus.types'
import { JOB_TYPES, type JobType } from '../jobs/types/jobType.types'
import { SERVICE_TYPES } from '../equipment/servicePlans/equipmentServicePlan.types'
import type { JobSaveInput } from '../jobs/types/jobSave.types'
import {
    parseJobSpreadsheetPaste,
    resolveJobSpreadsheetRows,
    type JobSpreadsheetCorrections,
    type JobSpreadsheetRow,
} from './jobSpreadsheetImport'
import { useJobSpreadsheetImport } from './useJobSpreadsheetImport'
import './JobSpreadsheetImportScreen.css'

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NZ')

export default function JobSpreadsheetImportScreen() {
    const data = useJobSpreadsheetImport()
    const [pasteValue, setPasteValue] = useState('')
    const [rows, setRows] = useState<JobSpreadsheetRow[]>([])
    const [corrections, setCorrections] = useState<JobSpreadsheetCorrections>({})
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set())
    const [parseError, setParseError] = useState('')
    const [saveError, setSaveError] = useState('')
    const [result, setResult] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [jobType, setJobType] = useState<JobType>(JOB_TYPES.BREAKDOWN)
    const [showIssuesOnly, setShowIssuesOnly] = useState(false)

    const resolvedRows = useMemo(() => resolveJobSpreadsheetRows(rows, {
        equipment: data.equipment,
        mechanics: data.mechanics,
        jobs: data.jobs,
    }, corrections), [corrections, data.equipment, data.jobs, data.mechanics, rows])
    const readyRows = resolvedRows.filter((row) => row.ready && !importedIds.has(row.id))
    const selectedReadyRows = readyRows.filter((row) => selectedIds.has(row.id))
    const errorCount = resolvedRows.filter((row) => !row.ready && !importedIds.has(row.id)).length
    const warningCount = resolvedRows.filter((row) => row.ready && row.issues.some((issue) => issue.severity === 'warning') && !importedIds.has(row.id)).length
    const issueRows = resolvedRows.filter((row) => row.issues.length > 0 && !importedIds.has(row.id))
    const visibleRows = showIssuesOnly ? issueRows : resolvedRows

    const applyPaste = () => {
        try {
            const parsed = parseJobSpreadsheetPaste(pasteValue)
            setRows(parsed)
            setCorrections({})
            setSelectedIds(new Set(parsed.map((row) => row.id)))
            setImportedIds(new Set())
            setShowIssuesOnly(false)
            setParseError('')
            setSaveError('')
            setResult(`${parsed.length} spreadsheet ${parsed.length === 1 ? 'row' : 'rows'} loaded for review.`)
        } catch (error) {
            setParseError(error instanceof Error ? error.message : 'The pasted spreadsheet could not be read.')
        }
    }

    const updateFleetCorrection = (rowId: string, value: string) => setCorrections((current) => ({
        ...current,
        fleetValues: { ...current.fleetValues, [rowId]: value },
    }))

    const updateMechanicCorrection = (sourceName: string, value: string) => setCorrections((current) => ({
        ...current,
        mechanicNames: { ...current.mechanicNames, [normalizeName(sourceName)]: value },
    }))

    const updateRow = (rowId: string, patch: Partial<JobSpreadsheetRow>) => setRows((current) => current.map((row) => (
        row.id === rowId ? { ...row, ...patch } : row
    )))

    const importSelected = async () => {
        const importRows = resolvedRows.filter((row) => row.ready && selectedIds.has(row.id) && !importedIds.has(row.id))
        if (!importRows.length) return
        const jobs: JobSaveInput[] = importRows.map((row) => ({
            jobNumber: '',
            orderNumber: '',
            description: row.description,
            jobType,
            status: JOB_STATUSES.COMPLETE,
            equipmentId: row.equipment!.gr_equipmentid,
            mechanicId: row.mechanic!.gr_mechanicid,
            siteId: row.equipment!.gr_Site!.gr_siteid,
            completedDate: row.completedDate,
            serviceType: SERVICE_TYPES.NONE,
        }))
        setIsSaving(true)
        setSaveError('')
        try {
            await data.importJobs(jobs)
            setImportedIds((current) => new Set([...current, ...importRows.map((row) => row.id)]))
            setSelectedIds((current) => new Set([...current].filter((id) => !importRows.some((row) => row.id === id))))
            setConfirmOpen(false)
            setResult(`${jobs.length} ${jobs.length === 1 ? 'Job was' : 'Jobs were'} imported atomically.`)
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'The Jobs could not be imported.')
        } finally {
            setIsSaving(false)
        }
    }

    const allReadySelected = readyRows.length > 0 && readyRows.every((row) => selectedIds.has(row.id))

    return <main className="job-import-screen">
        <PageHeader
            eyebrow="Jobs"
            title="Spreadsheet Job Import"
            subtitle="Paste historical Jobs from Excel, match them to existing app records, correct problems, then create the reviewed rows without manually assigning Job numbers."
        />

        <section className="job-import-paste" aria-labelledby="job-import-paste-heading">
            <div>
                <span>Step 1</span>
                <h2 id="job-import-paste-heading">Paste the spreadsheet rows</h2>
                <p>Copy the header and rows from Excel. Required columns: Job Number, Date, Mechanic, Model, Fleet, Customer and Description. Model and Customer are ignored because Equipment is authoritative.</p>
            </div>
            <textarea
                value={pasteValue}
                onChange={(event) => setPasteValue(event.target.value)}
                placeholder={'Job Number\tDate\tMechanic\tModel\tFleet\tCustomer\tDescription\n141793\t17/02/2026\tFotu\tTPL251\tFN2638\tExample Customer\tRepair description'}
                aria-label="Spreadsheet Job rows"
            />
            {parseError && <p className="job-import-error" role="alert">{parseError}</p>}
            <div className="job-import-paste-actions">
                <button type="button" className="primary" disabled={!pasteValue.trim()} onClick={applyPaste}>{rows.length ? 'Replace review rows' : 'Review pasted rows'}</button>
                {rows.length > 0 && <button type="button" onClick={() => setPasteValue('')}>Clear paste box</button>}
            </div>
        </section>

        {result && <div className="job-import-result" role="status">{result}</div>}
        {rows.length > 0 && <>
            <section className="job-import-summary" aria-label="Import review summary">
                <div><span>Pasted rows</span><strong>{rows.length}</strong></div>
                <div><span>Ready</span><strong>{readyRows.length}</strong></div>
                <div className={errorCount ? 'danger' : ''}><span>Problems</span><strong>{errorCount}</strong></div>
                <div className={warningCount ? 'warning' : ''}><span>Warnings</span><strong>{warningCount}</strong></div>
                <div><span>Selected</span><strong>{selectedReadyRows.length}</strong></div>
                <div><span>Imported</span><strong>{importedIds.size}</strong></div>
            </section>

            <section className="job-import-controls" aria-labelledby="job-import-review-heading">
                <div>
                    <span>Step 2</span>
                    <h2 id="job-import-review-heading">Correct and review matches</h2>
                    <p>Imported Jobs are Complete and unnumbered. Spreadsheet Job Number is kept on screen as a source reference only; allocation is handled separately. Spreadsheet Date becomes Completed Date. Customer is always derived from the matched Equipment's Site.</p>
                </div>
                <div className="job-import-global-fields">
                    <label>Job type for all Jobs
                        <select value={jobType} onChange={(event) => setJobType(Number(event.target.value) as JobType)}>
                            <option value={JOB_TYPES.BREAKDOWN}>Breakdown</option>
                            <option value={JOB_TYPES.WORKSHOP}>Workshop</option>
                        </select>
                    </label>
                </div>
                {data.isLoading && <p className="job-import-loading">Loading authoritative Jobs, Equipment and Staff…</p>}
                {data.error && <div className="job-import-error" role="alert"><span>{data.error}</span><button type="button" onClick={() => { void data.reload() }}>Try again</button></div>}
            </section>

            <datalist id="job-import-fleet-options">{data.equipment.flatMap((equipment) => equipment.gr_fleet
                ? [<option key={equipment.gr_equipmentid} value={equipment.gr_fleet}>{[equipment.gr_model, equipment.gr_Site?.gr_Customer?.gr_name].filter(Boolean).join(' · ')}</option>]
                : [])}</datalist>
            <datalist id="job-import-mechanic-options">{data.mechanics.map((mechanic) => <option key={mechanic.gr_mechanicid} value={mechanic.gr_name} />)}</datalist>

            <section className="job-import-review-table" aria-label="Spreadsheet Job review">
                <div className="job-import-table-toolbar">
                    <div>
                        <button type="button" aria-pressed={showIssuesOnly} onClick={() => setShowIssuesOnly((current) => !current)}>{showIssuesOnly ? 'Show all rows' : `Show issues only (${issueRows.length})`}</button>
                        <button type="button" disabled={!readyRows.length} onClick={() => setSelectedIds(allReadySelected ? new Set() : new Set(readyRows.map((row) => row.id)))}>{allReadySelected ? 'Clear ready selection' : 'Select all ready'}</button>
                    </div>
                    <button type="button" className="primary" disabled={!selectedReadyRows.length || isSaving || data.isLoading || Boolean(data.error)} onClick={() => { setSaveError(''); setConfirmOpen(true) }}>Import selected ({selectedReadyRows.length})</button>
                </div>
                <div className="job-import-table-wrap"><table>
                    <thead><tr><th>Select</th><th>Job</th><th>Date</th><th>Customer</th><th>Fleet / Equipment</th><th>Mechanic</th><th>Description</th><th>Review</th></tr></thead>
                    <tbody>{visibleRows.map((row) => {
                        const imported = importedIds.has(row.id)
                        return <tr key={row.id} className={imported ? 'imported' : row.ready ? 'ready' : 'blocked'}>
                            <td><input type="checkbox" checked={!imported && row.ready && selectedIds.has(row.id)} disabled={imported || !row.ready} aria-label={`Select Job ${row.jobNumber || `row ${row.sourceRow}`}`} onChange={(event) => setSelectedIds((current) => {
                                const next = new Set(current)
                                if (event.target.checked) next.add(row.id)
                                else next.delete(row.id)
                                return next
                            })} /></td>
                            <td><strong>{row.jobNumber || '—'}</strong><small>Source reference only · not imported</small></td>
                            <td><input type="date" value={row.completedDate} disabled={imported} aria-label={`Completed Date for Job ${row.jobNumber}`} onChange={(event) => updateRow(row.id, { sourceDate: event.target.value, completedDate: event.target.value })} /><small>{row.completedDate ? 'Completed Date' : `Invalid source: ${row.sourceDate || 'blank'}`}</small></td>
                            <td><strong>{row.customer?.gr_name || 'No Customer on Equipment'}</strong><small>From matched Equipment</small></td>
                            <td><input list="job-import-fleet-options" value={row.effectiveFleet} disabled={imported} aria-label={`Fleet Number for Job ${row.jobNumber}`} onChange={(event) => updateFleetCorrection(row.id, event.target.value)} /><small>{row.equipment ? `${row.equipment.gr_fleet || 'No primary Fleet'} · ${row.equipment.gr_model || 'No model'} · ${row.equipment.gr_Site?.gr_name || 'No Site'}` : 'No unique Equipment match'}</small></td>
                            <td><input list="job-import-mechanic-options" value={row.effectiveMechanicName} disabled={imported} aria-label={`Mechanic for Job ${row.jobNumber}`} onChange={(event) => updateMechanicCorrection(row.mechanicName, event.target.value)} /><small>{row.mechanic ? `Matched: ${row.mechanic.gr_name}` : 'No Staff match'}</small></td>
                            <td><textarea value={row.description} disabled={imported} aria-label={`Description for Job ${row.jobNumber}`} onChange={(event) => updateRow(row.id, { description: event.target.value })} /></td>
                            <td>{imported ? <span className="job-import-state imported">Imported</span> : <><span className={`job-import-state ${row.ready ? 'ready' : 'blocked'}`}>{row.ready ? 'Ready' : 'Needs attention'}</span>{row.issues.map((issue, index) => <small key={`${issue.message}-${index}`} className={issue.severity}>{issue.message}</small>)}</>}</td>
                        </tr>
                    })}{visibleRows.length === 0 && <tr><td colSpan={8} className="job-import-empty">No rows have issues.</td></tr>}</tbody>
                </table></div>
            </section>
        </>}

        {confirmOpen && <EditDrawerFormDialog
            eyebrow="Permanent Dataverse creation"
            title={`Import ${selectedReadyRows.length} ${selectedReadyRows.length === 1 ? 'Job' : 'Jobs'}?`}
            error={saveError}
            isBusy={isSaving}
            submitDisabled={!selectedReadyRows.length}
            submitLabel={isSaving ? 'Importing…' : 'Import Jobs'}
            onCancel={() => { if (!isSaving) setConfirmOpen(false) }}
            onSubmit={() => { void importSelected() }}
        >
            <p>Every selected row will be created as an unnumbered Complete {jobType === JOB_TYPES.WORKSHOP ? 'Workshop' : 'Breakdown'} Job. The spreadsheet Job Number is not written; the regional allocation system is the only number writer. The spreadsheet Date becomes Completed Date.</p>
            <p>The import is atomic: Dataverse must accept every selected Job or none are created. Imported Jobs can only be removed individually through the normal Job workflow.</p>
        </EditDrawerFormDialog>}
    </main>
}
