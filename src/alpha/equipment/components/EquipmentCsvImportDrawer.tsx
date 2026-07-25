import { useMemo, useState } from 'react'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import type { EquipmentCsvReviewRow } from '../utils/equipmentCsv'

type ImportResult = {
    succeeded: string[]
    failures: Array<{ equipmentId: string; message: string }>
}

type Props = {
    filename: string
    rows: EquipmentCsvReviewRow[]
    busy: boolean
    onApply: (rows: EquipmentCsvReviewRow[]) => Promise<ImportResult>
    onClose: () => void
}

export default function EquipmentCsvImportDrawer({ filename, rows, busy, onApply, onClose }: Props) {
    const [confirming, setConfirming] = useState(false)
    const [result, setResult] = useState<ImportResult | null>(null)
    const [error, setError] = useState('')
    const changedRows = useMemo(() => rows.filter((row) => row.status === 'changed'), [rows])
    const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>(() =>
        rows.filter((row) => row.status === 'changed').map((row) => row.equipmentId),
    )
    const invalidRows = rows.filter((row) => ['invalid', 'not-found', 'duplicate'].includes(row.status))
    const selectedIdSet = useMemo(() => new Set(selectedEquipmentIds), [selectedEquipmentIds])
    const selectedRows = changedRows.filter((row) => selectedIdSet.has(row.equipmentId))
    const selectedChanges = selectedRows.reduce((total, row) => total + row.changes.length, 0)

    const apply = async () => {
        setError('')
        try {
            const nextResult = await onApply(selectedRows)
            setResult(nextResult)
            setConfirming(false)
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Equipment changes could not be applied.')
        }
    }

    return <>
        <EditDrawerShell
            eyebrow="Equipment data tools"
            title={result ? 'Import results' : 'Review Equipment CSV'}
            busy={busy}
            onClose={onClose}
            footer={result ? <>
                <span>{result.succeeded.length} updated · {result.failures.length} failed</span>
                <button type="button" className="primary" onClick={onClose}>Done</button>
            </> : <>
                <span>{selectedRows.length} selected · {selectedChanges} field changes</span>
                <div className="equipment-footer-actions">
                    <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="primary" disabled={busy || selectedRows.length === 0} onClick={() => setConfirming(true)}>Apply selected</button>
                </div>
            </>}
        >
            <div className="equipment-csv-summary">
                <strong>{filename}</strong>
                <dl>
                    <div><dt>Rows uploaded</dt><dd>{rows.length}</dd></div>
                    <div><dt>Rows with changes</dt><dd>{changedRows.length}</dd></div>
                    <div><dt>Selected for update</dt><dd>{selectedRows.length}</dd></div>
                    <div><dt>Unchanged</dt><dd>{rows.filter((row) => row.status === 'unchanged').length}</dd></div>
                    <div><dt>Invalid or skipped</dt><dd>{invalidRows.length}</dd></div>
                </dl>
            </div>
            {error && <p className="equipment-csv-error" role="alert">{error}</p>}
            {result ? <section className="equipment-csv-results">
                {result.succeeded.length > 0 && <div role="status"><strong>{result.succeeded.length} Equipment records updated successfully.</strong></div>}
                {result.failures.length > 0 && <div role="alert">
                    <strong>{result.failures.length} updates failed</strong>
                    <ul>{result.failures.map((failure) => <li key={failure.equipmentId}><b>{failure.equipmentId}</b><span>{failure.message}</span></li>)}</ul>
                </div>}
            </section> : <>
                {changedRows.length > 0 && <section className="equipment-csv-review">
                    <div className="equipment-csv-review-heading">
                        <div><h3>Review and approve changes</h3><p>Only selected Equipment records will be updated.</p></div>
                        <div>
                            <button type="button" onClick={() => setSelectedEquipmentIds(changedRows.map((row) => row.equipmentId))} disabled={busy || selectedRows.length === changedRows.length}>Select all</button>
                            <button type="button" onClick={() => setSelectedEquipmentIds([])} disabled={busy || selectedRows.length === 0}>Clear all</button>
                        </div>
                    </div>
                    {changedRows.map((row) => <article key={`${row.rowNumber}-${row.equipmentId}`}>
                        <header>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedIdSet.has(row.equipmentId)}
                                    disabled={busy}
                                    onChange={(event) => setSelectedEquipmentIds((current) =>
                                        event.target.checked
                                            ? [...new Set([...current, row.equipmentId])]
                                            : current.filter((equipmentId) => equipmentId !== row.equipmentId),
                                    )}
                                />
                                <span><strong>{row.equipment?.gr_fleet || row.equipment?.gr_serial || 'Unnamed Equipment'}</strong><small>{[row.equipment?.gr_make, row.equipment?.gr_model].filter(Boolean).join(' · ') || 'Make and model not recorded'}</small></span>
                            </label>
                            <span><b>{row.equipment?.gr_Site?.gr_Customer?.gr_name || 'No Customer'}</b><small>{row.equipment?.gr_Site?.gr_name || 'No Site'} · CSV row {row.rowNumber}</small></span>
                        </header>
                        <table><thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead>
                            <tbody>{row.changes.map((change) => <tr key={change.field}><td>{change.label}</td><td>{change.currentValue || '—'}</td><td className="equipment-csv-proposed">{change.proposedValue || 'Clear value'}</td></tr>)}</tbody>
                        </table>
                    </article>)}
                </section>}
                {invalidRows.length > 0 && <section className="equipment-csv-invalid">
                    <h3>Invalid or skipped rows</h3>
                    <ul>{invalidRows.map((row) => <li key={`${row.rowNumber}-${row.equipmentId}`}><strong>Row {row.rowNumber}{row.equipmentId ? ` · ${row.equipmentId}` : ''}</strong><span>{row.errors.join(' ')}</span></li>)}</ul>
                </section>}
            </>}
        </EditDrawerShell>
        {confirming && <EditDrawerConfirmation
            eyebrow="Confirm Equipment import"
            title={`Apply updates to ${selectedRows.length} Equipment records?`}
            message={`${rows.length} rows were uploaded. The selected records will receive ${selectedChanges} field changes; ${changedRows.length - selectedRows.length} changed records and ${invalidRows.length} invalid rows will remain unchanged.`}
            error={error}
            isBusy={busy}
            confirmLabel={busy ? 'Applying…' : 'Apply changes'}
            onCancel={() => { if (!busy) setConfirming(false) }}
            onConfirm={() => void apply()}
        />}
    </>
}
