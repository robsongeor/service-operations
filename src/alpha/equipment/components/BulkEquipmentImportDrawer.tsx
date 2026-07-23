import { useMemo, useState } from 'react'
import type { SignedInUserInfo } from '../../../auth/signedInUser'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Site } from '../../jobs/types/site.types'
import type { EquipmentUpdateInput } from '../types/equipmentManager.types'
import {
    bulkEquipmentRowInput,
    canUseBulkEquipmentImport,
    createBulkEquipmentReviewDecision,
    parseBulkEquipmentRows,
    reviewBulkEquipmentRow,
    type BulkEquipmentReviewDecision,
    type BulkEquipmentReviewedRow,
    type BulkEquipmentRow,
} from '../utils/bulkEquipmentImport'
import './BulkEquipmentImportDrawer.css'

type Props = {
    user: SignedInUserInfo | null
    customerId: string
    customerName: string
    siteId: string
    siteName: string
    sites: Site[]
    equipment: Equipment[]
    onCreate: (input: EquipmentUpdateInput) => Promise<Equipment>
    onComplete: (createdCount: number) => void
    onClose: () => void
}

export default function BulkEquipmentImportDrawer({ user, customerId, customerName, siteId, siteName, sites, equipment, onCreate, onComplete, onClose }: Props) {
    const [source, setSource] = useState('')
    const [reviewing, setReviewing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [completedRows, setCompletedRows] = useState<Set<number>>(new Set())
    const [runtimeErrors, setRuntimeErrors] = useState<Record<number, string>>({})
    const [decisions, setDecisions] = useState<Record<number, BulkEquipmentReviewDecision>>({})
    const [progress, setProgress] = useState('')
    const [accessError, setAccessError] = useState('')

    const rows = useMemo(() => parseBulkEquipmentRows(source, equipment), [equipment, source])
    const reviewedRows = useMemo(() => rows.map((row) =>
        reviewBulkEquipmentRow(row, decisions[row.rowNumber] ?? createBulkEquipmentReviewDecision()),
    ), [decisions, rows])
    const validCount = reviewedRows.filter((reviewed) => reviewed.valid).length
    const selectedRows = reviewedRows.filter((reviewed) =>
        reviewed.decision.selectedForImport
        && reviewed.valid
        && !completedRows.has(reviewed.row.rowNumber),
    )
    const contextIsValid = Boolean(customerId.trim() && siteId.trim() && sites.some((site) =>
        site.gr_siteid.toLowerCase() === siteId.toLowerCase()
        && site.gr_Customer?.gr_customerid.toLowerCase() === customerId.toLowerCase(),
    ))

    const validateAccessAndContext = () => {
        if (!canUseBulkEquipmentImport(user)) {
            setAccessError('You are not authorised to use bulk Equipment import.')
            return false
        }
        if (!contextIsValid) {
            setAccessError('The selected Customer and Site could not be confirmed. Close this drawer and select the Site again.')
            return false
        }
        return true
    }

    const review = () => {
        setAccessError('')
        if (!validateAccessAndContext()) return
        if (rows.length === 0) {
            setAccessError('Paste at least one Equipment row.')
            return
        }
        setDecisions(Object.fromEntries(rows.map((row) => [row.rowNumber, createBulkEquipmentReviewDecision()])))
        setReviewing(true)
    }

    const updateDecision = (
        row: BulkEquipmentRow,
        update: (current: BulkEquipmentReviewDecision) => BulkEquipmentReviewDecision,
    ) => {
        setDecisions((current) => {
            const nextDecision = update(current[row.rowNumber] ?? createBulkEquipmentReviewDecision())
            const reviewed = reviewBulkEquipmentRow(row, nextDecision)
            return {
                ...current,
                [row.rowNumber]: reviewed.valid
                    ? nextDecision
                    : { ...nextDecision, selectedForImport: false },
            }
        })
        setRuntimeErrors((current) => {
            if (!current[row.rowNumber]) return current
            const next = { ...current }
            delete next[row.rowNumber]
            return next
        })
        setAccessError('')
    }

    const importRows = async () => {
        setAccessError('')
        if (!validateAccessAndContext()) return

        const freshRows = parseBulkEquipmentRows(source, equipment)
        const selectedRowNumbers = new Set(Object.entries(decisions)
            .filter(([rowNumber, decision]) => decision.selectedForImport && !completedRows.has(Number(rowNumber)))
            .map(([rowNumber]) => Number(rowNumber)))
        const freshSelectedRows = freshRows
            .filter((row) => selectedRowNumbers.has(row.rowNumber))
            .map((row) => reviewBulkEquipmentRow(row, decisions[row.rowNumber] ?? createBulkEquipmentReviewDecision()))
        const newlyInvalid = freshSelectedRows.filter((reviewed) => !reviewed.valid)

        if (newlyInvalid.length > 0) {
            setDecisions((current) => Object.fromEntries(Object.entries(current).map(([rowNumber, decision]) => [
                rowNumber,
                newlyInvalid.some((reviewed) => reviewed.row.rowNumber === Number(rowNumber))
                    ? { ...decision, selectedForImport: false }
                    : decision,
            ])))
            setAccessError('One or more selected rows changed and are no longer valid. Review the highlighted rows and select them again.')
            return
        }
        if (freshSelectedRows.length === 0) {
            setAccessError('Select at least one valid row to import.')
            return
        }

        setIsImporting(true)
        const nextCompleted = new Set(completedRows)
        const nextErrors = { ...runtimeErrors }
        try {
            for (let index = 0; index < freshSelectedRows.length; index += 1) {
                const reviewed = freshSelectedRows[index]
                const row = reviewed.row
                setProgress(`Creating ${index + 1} of ${freshSelectedRows.length}…`)
                try {
                    await onCreate(bulkEquipmentRowInput(row, siteId, reviewed.decision))
                    nextCompleted.add(row.rowNumber)
                    delete nextErrors[row.rowNumber]
                } catch (error) {
                    nextErrors[row.rowNumber] = error instanceof Error ? error.message : 'Equipment could not be created.'
                }
                setCompletedRows(new Set(nextCompleted))
                setRuntimeErrors({ ...nextErrors })
            }
            const failed = Object.keys(nextErrors).filter((rowNumber) => !nextCompleted.has(Number(rowNumber))).length
            setProgress(`${nextCompleted.size} Equipment record${nextCompleted.size === 1 ? '' : 's'} created.${failed ? ` ${failed} row${failed === 1 ? '' : 's'} failed.` : ' Import completed.'}`)
            if (failed === 0 && nextCompleted.size === rows.length) onComplete(nextCompleted.size)
        } finally {
            setIsImporting(false)
        }
    }

    const statusFor = (reviewed: BulkEquipmentReviewedRow) => {
        const row = reviewed.row
        if (completedRows.has(row.rowNumber)) return <span className="bulk-equipment-status success">Created</span>
        if (runtimeErrors[row.rowNumber]) return <span className="bulk-equipment-status error">{runtimeErrors[row.rowNumber]}</span>
        if (reviewed.errors.length) return <span className="bulk-equipment-status error">{reviewed.errors.join(' ')}</span>
        return <span className="bulk-equipment-status valid">{reviewed.decision.selectedForImport ? 'Valid and selected' : 'Valid'}</span>
    }

    return <EditDrawerShell
        eyebrow="Administrator import"
        title="Bulk Add Equipment"
        busy={isImporting}
        onClose={() => { if (!isImporting) onClose() }}
        footer={<>
            <div className="bulk-equipment-footer-status" role="status">{accessError || progress || (reviewing ? `${selectedRows.length} of ${validCount} valid rows selected for import` : 'No records are created until the reviewed rows are imported.')}</div>
            <div className="bulk-equipment-footer-actions">
                <button type="button" onClick={onClose} disabled={isImporting}>Cancel</button>
                {reviewing
                    ? <>
                        <button type="button" onClick={() => setReviewing(false)} disabled={isImporting}>Back to paste</button>
                        <button type="button" className="primary" onClick={() => void importRows()} disabled={isImporting || selectedRows.length === 0}>{isImporting ? 'Importing…' : 'Import selected rows'}</button>
                    </>
                    : <button type="button" className="primary" onClick={review} disabled={!source.trim()}>Review data</button>}
            </div>
        </>}
    >
        <section className="bulk-equipment-import">
            <div className="bulk-equipment-destination" aria-label="Import destination">
                <div><span>Customer</span><strong>{customerName}</strong></div>
                <div><span>Site</span><strong>{siteName}</strong></div>
            </div>
            {!reviewing ? <>
                <p>Paste tab-separated Equipment data in this order:</p>
                <strong>Fleet Number, Serial Number, Make, Model, Registration Number, Current WOF Expiry</strong>
                <label htmlFor="bulk-equipment-source">Equipment rows</label>
                <textarea id="bulk-equipment-source" rows={16} value={source} onChange={(event) => {
                    setSource(event.target.value)
                    setCompletedRows(new Set())
                    setRuntimeErrors({})
                    setDecisions({})
                    setProgress('')
                    setAccessError('')
                }} placeholder={'FL001\tSN123\tToyota\t8FG25\tABC123\t2027-03-15'} />
                <small>A header row is optional. Supported dates: YYYY-MM-DD, DD/MM/YYYY, and D/M/YYYY.</small>
            </> : <>
                <div className="bulk-equipment-review-guidance">
                    <strong>Rows are not imported automatically.</strong>
                    <p>Select each row you want to import. If a Fleet Number or Serial Number already exists, you may explicitly ignore that field and import the remaining Equipment details.</p>
                    <p>At least one of Fleet Number or Serial Number must remain.</p>
                </div>
                <div className="bulk-equipment-summary"><strong>{rows.length} total</strong><span>{validCount} valid</span><span>{rows.length - validCount} invalid</span><span>{selectedRows.length} selected</span><span>{completedRows.size} created</span></div>
                <div className="bulk-equipment-review-scroll">
                    <table>
                        <thead><tr><th>Import</th><th>Row</th><th>Fleet Number</th><th>Serial Number</th><th>Make</th><th>Model</th><th>Registration Number</th><th>Current WOF Expiry</th><th>Validation Status</th></tr></thead>
                        <tbody>{reviewedRows.map((reviewed) => {
                            const row = reviewed.row
                            const complete = completedRows.has(row.rowNumber)
                            const statusId = `bulk-equipment-row-${row.rowNumber}-status`
                            return <tr key={row.rowNumber} className={reviewed.valid ? '' : 'bulk-equipment-row-invalid'}>
                                <td><label className="bulk-equipment-check"><input
                                    type="checkbox"
                                    checked={reviewed.decision.selectedForImport && reviewed.valid && !complete}
                                    disabled={!reviewed.valid || complete || isImporting}
                                    aria-describedby={statusId}
                                    aria-label={`Import row ${row.rowNumber}`}
                                    title={!reviewed.valid ? 'Resolve this row’s validation issues before selecting it.' : complete ? 'This row has already been created.' : ''}
                                    onChange={(event) => updateDecision(row, (current) => ({ ...current, selectedForImport: event.target.checked }))}
                                /><span>Import this row</span></label></td>
                                <td>{row.rowNumber}</td>
                                <td>
                                    <span>{row.fleetNumber || '—'}</span>
                                    {row.existingDuplicates.fleetNumber && <div className="bulk-equipment-duplicate-control"><strong>Fleet Number already exists.</strong><label className="bulk-equipment-check"><input type="checkbox" checked={reviewed.decision.ignoreFleetNumber} disabled={complete || isImporting} aria-label={`Ignore duplicate Fleet Number ${row.fleetNumber} on row ${row.rowNumber}`} onChange={(event) => updateDecision(row, (current) => ({ ...current, ignoreFleetNumber: event.target.checked }))} /><span>Ignore duplicate Fleet Number</span></label>{reviewed.decision.ignoreFleetNumber && <small>Fleet Number will not be imported.</small>}</div>}
                                </td>
                                <td>
                                    <span>{row.serialNumber || '—'}</span>
                                    {row.existingDuplicates.serialNumber && <div className="bulk-equipment-duplicate-control"><strong>Serial Number already exists.</strong><label className="bulk-equipment-check"><input type="checkbox" checked={reviewed.decision.ignoreSerialNumber} disabled={complete || isImporting} aria-label={`Ignore duplicate Serial Number ${row.serialNumber} on row ${row.rowNumber}`} onChange={(event) => updateDecision(row, (current) => ({ ...current, ignoreSerialNumber: event.target.checked }))} /><span>Ignore duplicate Serial Number</span></label>{reviewed.decision.ignoreSerialNumber && <small>Serial Number will not be imported.</small>}</div>}
                                </td>
                                <td>{row.make || '—'}</td>
                                <td>{row.model || '—'}</td>
                                <td>{row.registrationNumber || '—'}</td>
                                <td>{row.currentWofExpiry || '—'}</td>
                                <td id={statusId}>{statusFor(reviewed)}</td>
                            </tr>
                        })}</tbody>
                    </table>
                </div>
                {reviewedRows.some((reviewed) => !reviewed.valid && !completedRows.has(reviewed.row.rowNumber)) && <p className="bulk-equipment-blocked" role="alert">Invalid rows cannot be selected. Correct pasted batch conflicts or explicitly ignore each existing Fleet or Serial duplicate where permitted.</p>}
            </>}
        </section>
    </EditDrawerShell>
}
