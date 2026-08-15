import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { isServiceOperationsAdministrator } from '../../auth/adminAuthorization'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { fetchEquipment } from '../jobs/services/equipmentApi'
import type { Equipment } from '../jobs/types/equipment.types'
import { fetchGreentreeEquipmentTable } from './greentreeEquipmentApi'
import {
    GREENTREE_IMPORT_BATCH_LIMIT,
    greentreeImportBatches,
    greentreeImportIssues,
    importGreentreeEquipmentBatch,
    type GreentreeImportResult,
} from './greentreeEquipmentImport'
import {
    mapGreentreeEquipmentRecords,
    profileGreentreeEquipment,
    reconcileGreentreeEquipment,
    reconciliationReviewCount,
    type GreentreeSourceProfile,
    type ReconciliationResult,
    type ReconciliationRow,
    type ReconciliationStatus,
} from './greentreeReconciliation'
import '../equipment/EquipmentScreen.css'
import './GreentreeEquipmentTestScreen.css'

const environmentUrl = import.meta.env.VITE_GREENTREE_DATAVERSE_URL ?? ''
const REVIEW_PAGE_SIZE = 50
type ReviewTab = 'all' | ReconciliationStatus | 'app-only'
type ReviewRequirement = 'all' | 'none' | 'has'
type ReviewCountFilter = 'all' | '0' | '1' | '2' | '3' | '4+'
type ImportScope = 'selected' | 'filtered' | null
type ImportProgress = { total: number; processed: number; currentBatch: number; totalBatches: number }
type Workspace = { reconciliation: ReconciliationResult; sourceCount: number; appCount: number; logicalName: string; profile: GreentreeSourceProfile }

const tabLabels: Record<ReviewTab, string> = { all: 'All Greentree', exact: 'Exact', probable: 'Probable', new: 'New', conflict: 'Conflicts', 'app-only': 'App only' }
const statusLabels: Record<ReconciliationStatus, string> = { exact: 'Exact match', probable: 'Review match', new: 'New candidate', conflict: 'Conflict' }
const valueOrDash = (value?: string | null) => value?.trim() || '—'
const searchable = (values: Array<string | null | undefined>, query: string) => values.some((value) => value?.toLocaleLowerCase().includes(query))

function SourceIdentity({ row }: { row: ReconciliationRow }) {
    return <><strong>{valueOrDash(row.source.fleet)}</strong><small>S/N {valueOrDash(row.source.serial)}</small></>
}

function AppIdentity({ equipment, candidates }: { equipment: Equipment | null; candidates: Equipment[] }) {
    if (equipment) return <><strong>{valueOrDash(equipment.gr_fleet)}</strong><small>S/N {valueOrDash(equipment.gr_serial)}</small></>
    if (candidates.length) return <><strong>{candidates.length} possible records</strong><small>{candidates.map((item) => valueOrDash(item.gr_fleet)).join(', ')}</small></>
    return <span>Not matched</span>
}

function ReviewDetails({ row }: { row: ReconciliationRow }) {
    const notes = [...row.reasons, ...row.qualityIssues]
    const reviewCount = reconciliationReviewCount(row)
    if (!reviewCount) return <span className="greentree-no-differences">No review needed</span>
    return <details className="greentree-review-details">
        <summary>{reviewCount} review item{reviewCount === 1 ? '' : 's'}</summary>
        {notes.length > 0 && <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>}
        {row.differences.length > 0 && <dl>{row.differences.map((difference) => <div key={difference.field}><dt>{difference.field}</dt><dd><span>App: {valueOrDash(difference.appValue)}</span><span>Greentree: {valueOrDash(difference.greentreeValue)}</span></dd></div>)}</dl>}
    </details>
}

function SourceProfile({ profile }: { profile: GreentreeSourceProfile }) {
    return <section className="greentree-source-profile" aria-labelledby="greentree-source-profile-heading">
        <div className="greentree-profile-heading"><div><p>Import readiness</p><h2 id="greentree-source-profile-heading">Greentree source profile</h2></div><span>{profile.totalRows} rows analysed</span></div>
        <div className="greentree-profile-grid">
            <article><h3>Fleet Number Code</h3><dl><div><dt>Unique values</dt><dd>{profile.fleet.uniqueValues}</dd></div><div><dt>Missing rows</dt><dd>{profile.fleet.missing}</dd></div><div><dt>Duplicated values</dt><dd>{profile.fleet.duplicateValues}</dd></div><div><dt>Rows in duplicates</dt><dd>{profile.fleet.duplicateRows}</dd></div></dl></article>
            <article><h3>Serial</h3><dl><div><dt>Unique values</dt><dd>{profile.serial.uniqueValues}</dd></div><div><dt>Missing rows</dt><dd>{profile.serial.missing}</dd></div><div><dt>Duplicated values</dt><dd>{profile.serial.duplicateValues}</dd></div><div><dt>Rows in duplicates</dt><dd>{profile.serial.duplicateRows}</dd></div></dl></article>
            <article><h3>Missing source details</h3><dl><div><dt>Make</dt><dd>{profile.missingMake}</dd></div><div><dt>Model</dt><dd>{profile.missingModel}</dd></div><div><dt>Site Name</dt><dd>{profile.missingSiteName}</dd></div><div><dt>Site Address</dt><dd>{profile.missingSiteAddress}</dd></div></dl></article>
            <article><h3>Site coverage</h3><dl><div><dt>Distinct names</dt><dd>{profile.distinctSiteNames}</dd></div><div><dt>Distinct addresses</dt><dd>{profile.distinctSiteAddresses}</dd></div><div><dt>Legacy app fleet labels</dt><dd>{profile.legacyAppFleetLabels}</dd></div></dl></article>
        </div>
        <div className="greentree-profile-breakdown"><div><h3>Code Active distribution</h3><div className="greentree-profile-chips">{profile.codeActiveValues.map((item) => <span key={item.value}>{item.value} <strong>{item.count}</strong></span>)}</div></div><div><h3>Conflict causes</h3>{profile.conflictReasons.length ? <ul>{profile.conflictReasons.map((item) => <li key={item.value}><span>{item.value}</span><strong>{item.count}</strong></li>)}</ul> : <p>No conflicts detected.</p>}</div></div>
    </section>
}

export default function GreentreeEquipmentTestScreen() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(account)
    const importAllowed = isServiceOperationsAdministrator(signedInUser)
    const [workspace, setWorkspace] = useState<Workspace | null>(null)
    const [tab, setTab] = useState<ReviewTab>('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [reviewRequirement, setReviewRequirement] = useState<ReviewRequirement>('all')
    const [reviewCountFilter, setReviewCountFilter] = useState<ReviewCountFilter>('all')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())
    const [confirmImport, setConfirmImport] = useState<ImportScope>(null)
    const [importing, setImporting] = useState(false)
    const [importResult, setImportResult] = useState<GreentreeImportResult | null>(null)
    const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
    const [importStopped, setImportStopped] = useState(false)
    const stopImport = useRef(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const [greentree, appToken] = await Promise.all([fetchGreentreeEquipmentTable(instance, account, environmentUrl), acquireDataverseAccessToken(instance, account)])
            const appEquipment = await fetchEquipment(appToken)
            const source = mapGreentreeEquipmentRecords(greentree.records, greentree.primaryIdAttribute)
            const reconciliation = reconcileGreentreeEquipment(source, appEquipment)
            setWorkspace({ reconciliation, sourceCount: source.length, appCount: appEquipment.length, logicalName: greentree.logicalName, profile: profileGreentreeEquipment(source, reconciliation, appEquipment) })
            setPage(1)
        } catch (caught) {
            setWorkspace(null)
            setError(caught instanceof Error ? caught.message : 'The equipment reconciliation could not be loaded.')
        } finally { setLoading(false) }
    }, [account, instance])

    useEffect(() => { const timer = window.setTimeout(() => { void load() }, 0); return () => window.clearTimeout(timer) }, [load])

    const counts = useMemo(() => {
        const rows = workspace?.reconciliation.rows ?? []
        return { all: rows.length, exact: rows.filter((row) => row.status === 'exact').length, probable: rows.filter((row) => row.status === 'probable').length, new: rows.filter((row) => row.status === 'new').length, conflict: rows.filter((row) => row.status === 'conflict').length, 'app-only': workspace?.reconciliation.appOnly.length ?? 0 }
    }, [workspace])
    const query = search.trim().toLocaleLowerCase()
    const visibleRows = useMemo(() => (workspace?.reconciliation.rows ?? []).filter((row) => {
        if (!(tab === 'all' || tab === 'app-only' || row.status === tab)) return false
        const reviewCount = reconciliationReviewCount(row)
        if (reviewRequirement === 'none' && reviewCount !== 0) return false
        if (reviewRequirement === 'has' && reviewCount === 0) return false
        if (reviewCountFilter !== 'all') {
            if (reviewCountFilter === '4+' ? reviewCount < 4 : reviewCount !== Number(reviewCountFilter)) return false
        }
        return !query || searchable([row.source.fleet, row.source.serial, row.source.make, row.source.model, row.source.siteName, row.source.siteAddress1, row.source.siteAddress3, row.appEquipment?.gr_fleet, row.appEquipment?.gr_serial], query)
    }), [query, reviewCountFilter, reviewRequirement, tab, workspace])
    const visibleAppOnly = useMemo(() => (workspace?.reconciliation.appOnly ?? []).filter((item) => !query || searchable([item.gr_fleet, item.gr_serial, item.gr_make, item.gr_model, item.gr_Site?.gr_name, item.gr_Site?.gr_address], query)), [query, workspace])
    const resultCount = tab === 'app-only' ? visibleAppOnly.length : visibleRows.length
    const totalPages = Math.max(1, Math.ceil(resultCount / REVIEW_PAGE_SIZE))
    const currentPage = Math.min(page, totalPages)
    const pageStart = (currentPage - 1) * REVIEW_PAGE_SIZE
    const pageRows = useMemo(() => visibleRows.slice(pageStart, pageStart + REVIEW_PAGE_SIZE), [pageStart, visibleRows])
    const pageAppOnly = useMemo(() => visibleAppOnly.slice(pageStart, pageStart + REVIEW_PAGE_SIZE), [pageStart, visibleAppOnly])
    const safePageRows = useMemo(() => pageRows.filter((row) => row.status === 'new' && greentreeImportIssues(row).length === 0), [pageRows])
    const safeFilteredRows = useMemo(() => visibleRows.filter((row) => row.status === 'new' && greentreeImportIssues(row).length === 0), [visibleRows])
    const selectedRows = useMemo(() => (workspace?.reconciliation.rows ?? []).filter((row) => selectedSourceIds.has(row.source.sourceId)), [selectedSourceIds, workspace])
    const confirmRows = confirmImport === 'filtered' ? safeFilteredRows : selectedRows

    const toggleSelection = (sourceId: string) => setSelectedSourceIds((current) => {
        const next = new Set(current)
        if (next.has(sourceId)) next.delete(sourceId)
        else if (next.size < GREENTREE_IMPORT_BATCH_LIMIT) next.add(sourceId)
        return next
    })
    const runImport = async () => {
        if (!importAllowed || confirmRows.length === 0) return
        const batches = greentreeImportBatches(confirmRows)
        const aggregate: GreentreeImportResult = { succeeded: [], failed: [] }
        stopImport.current = false
        setImportStopped(false)
        setImporting(true)
        setImportResult(null)
        setImportProgress({ total: confirmRows.length, processed: 0, currentBatch: 0, totalBatches: batches.length })
        setError('')
        try {
            let processed = 0
            for (let index = 0; index < batches.length; index += 1) {
                if (stopImport.current) break
                setImportProgress({ total: confirmRows.length, processed, currentBatch: index + 1, totalBatches: batches.length })
                const token = await acquireDataverseAccessToken(instance, account)
                const result = await importGreentreeEquipmentBatch(signedInUser, token, batches[index], fetchEquipment)
                aggregate.succeeded.push(...result.succeeded)
                aggregate.failed.push(...result.failed)
                processed += batches[index].length
                setImportResult({ succeeded: [...aggregate.succeeded], failed: [...aggregate.failed] })
                setImportProgress({ total: confirmRows.length, processed, currentBatch: index + 1, totalBatches: batches.length })
            }
            setImportStopped(stopImport.current)
            setSelectedSourceIds(new Set())
            setConfirmImport(null)
            await load()
            setTab('new')
            setPage(1)
        } catch (caught) {
            setImportResult({ succeeded: [...aggregate.succeeded], failed: [...aggregate.failed] })
            setError(caught instanceof Error ? caught.message : 'The selected Equipment could not be imported.')
            setConfirmImport(null)
        } finally {
            stopImport.current = false
            setImporting(false)
            setImportProgress(null)
        }
    }

    const selectable = tab === 'new' && importAllowed
    return <main className="equipment-page greentree-test-page">
        <header className="equipment-page-header"><div><p>Controlled reconciliation</p><h1>Greentree Equipment Review</h1></div><div className="equipment-page-header-actions"><span>{workspace?.sourceCount ?? 0} Greentree / {workspace?.appCount ?? 0} app</span><span className="greentree-readonly-badge">{importAllowed ? 'Creation only' : 'Review only'}</span></div></header>
        <aside className="greentree-test-notice" role="note"><strong>Equipment only</strong><span>This workspace can create reviewed New Equipment using fleet, serial, make and model only. It never creates Customers or Sites and cannot update, link or delete existing records.</span></aside>
        {loading ? <div className="equipment-data-state">Comparing Greentree with current Equipment…</div> : error ? <div className="equipment-data-state error"><div><strong>Reconciliation could not be loaded.</strong><p>{error}</p></div><button type="button" onClick={() => void load()}>Try again</button></div> : <section className="equipment-list-card">
            {importResult && <div className={`greentree-import-result ${importResult.failed.length || importStopped ? 'warning' : 'success'}`} role="status"><strong>{importResult.succeeded.length} Equipment created.</strong><span>{importStopped ? 'Import stopped after the current batch. Run Import all filtered again to resume safely.' : importResult.failed.length ? `${importResult.failed.length} skipped or failed.` : 'All processed records were created successfully.'}</span>{importResult.failed.length > 0 && <details><summary>View failures</summary><ul>{importResult.failed.map((item) => <li key={item.sourceId}><strong>{item.fleet || item.sourceId}</strong> — {item.message}</li>)}</ul></details>}</div>}
            {workspace && <SourceProfile profile={workspace.profile} />}
            <div className="greentree-summary" aria-label="Reconciliation summary">{(Object.keys(tabLabels) as ReviewTab[]).filter((item) => item !== 'all').map((item) => <div key={item} data-status={item}><span>{tabLabels[item]}</span><strong>{counts[item]}</strong></div>)}</div>
            <div className="greentree-review-tabs" role="tablist" aria-label="Reconciliation categories">{(Object.keys(tabLabels) as ReviewTab[]).map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setPage(1) }}>{tabLabels[item]} <span>{counts[item]}</span></button>)}</div>
            <div className="equipment-toolbar greentree-test-toolbar"><label className="equipment-search"><span>Search review</span><input type="search" placeholder="Search fleet, serial, make, model or site" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></label><label>Review requirement<select value={reviewRequirement} disabled={tab === 'app-only'} onChange={(event) => { setReviewRequirement(event.target.value as ReviewRequirement); setPage(1) }}><option value="all">All records</option><option value="none">No review needed</option><option value="has">Needs review</option></select></label><label>Review item count<select value={reviewCountFilter} disabled={tab === 'app-only'} onChange={(event) => { setReviewCountFilter(event.target.value as ReviewCountFilter); setPage(1) }}><option value="all">All counts</option><option value="0">0 items</option><option value="1">1 item</option><option value="2">2 items</option><option value="3">3 items</option><option value="4+">4+ items</option></select></label><div><span>Source table</span><strong>{workspace?.logicalName}</strong></div></div>
            {selectable && <div className="greentree-import-toolbar"><div><strong>{selectedRows.length} selected</strong><span>Complete New records only · {GREENTREE_IMPORT_BATCH_LIMIT} per guarded batch · no Site or Customer</span></div><div><button type="button" onClick={() => setSelectedSourceIds(new Set(safePageRows.map((row) => row.source.sourceId)))} disabled={!safePageRows.length || importing}>Select safe on page</button><button type="button" onClick={() => setSelectedSourceIds(new Set())} disabled={!selectedRows.length || importing}>Clear</button><button type="button" onClick={() => setConfirmImport('selected')} disabled={!selectedRows.length || importing}>Import selected</button>{reviewRequirement === 'none' && <button type="button" className="primary" onClick={() => setConfirmImport('filtered')} disabled={!safeFilteredRows.length || importing}>Import all filtered ({safeFilteredRows.length})</button>}</div></div>}
            <div className="equipment-results-count">Showing {resultCount ? pageStart + 1 : 0}–{Math.min(pageStart + REVIEW_PAGE_SIZE, resultCount)} of {resultCount}{query && resultCount !== counts[tab] ? ` filtered (${counts[tab]} total)` : ''}</div>
            <div className="equipment-table-scroll">
                {tab === 'app-only' ? <table className="equipment-table greentree-review-table app-only"><thead><tr><th>App fleet</th><th>Serial</th><th>Make / Model</th><th>Current Site</th><th>Assessment</th></tr></thead><tbody>{pageAppOnly.length ? pageAppOnly.map((item) => <tr key={item.gr_equipmentid}><td><strong>{valueOrDash(item.gr_fleet)}</strong></td><td>{valueOrDash(item.gr_serial)}</td><td>{[item.gr_make, item.gr_model].filter(Boolean).join(' ') || '—'}</td><td><strong>{valueOrDash(item.gr_Site?.gr_name)}</strong><small>{valueOrDash(item.gr_Site?.gr_address)}</small></td><td><span className="greentree-status app-only">App only / possible pending</span></td></tr>) : <tr><td className="equipment-empty" colSpan={5}>No app-only records match the current search.</td></tr>}</tbody></table> :
                    <table className={`equipment-table greentree-review-table ${selectable ? 'selectable' : ''}`}><thead><tr>{selectable && <th className="greentree-select-column"><span className="equipment-visually-hidden">Select</span></th>}<th>Greentree identity</th><th>Make / Model</th><th>Greentree Site</th><th>App match</th><th>Assessment</th><th>Review</th></tr></thead><tbody>{pageRows.length ? pageRows.map((row) => { const issues = greentreeImportIssues(row); return <tr key={row.source.sourceId}>{selectable && <td className="greentree-select-column"><input type="checkbox" aria-label={`Select ${row.source.fleet || 'Equipment'} for import`} checked={selectedSourceIds.has(row.source.sourceId)} disabled={issues.length > 0 || importing} title={issues.join(' ')} onChange={() => toggleSelection(row.source.sourceId)} /></td>}<td><SourceIdentity row={row} /></td><td><strong>{valueOrDash(row.source.make)}</strong><small>{valueOrDash(row.source.model)}</small></td><td><strong>{valueOrDash(row.source.siteName)}</strong><small>{[row.source.siteAddress1, row.source.siteAddress3].filter(Boolean).join(', ') || '—'}</small></td><td><AppIdentity equipment={row.appEquipment} candidates={row.candidateEquipment} /></td><td><span className={`greentree-status ${row.status}`}>{statusLabels[row.status]}</span></td><td><ReviewDetails row={row} /></td></tr> }) : <tr><td className="equipment-empty" colSpan={selectable ? 7 : 6}>No reconciliation records match the current search.</td></tr>}</tbody></table>}
            </div>
            {resultCount > REVIEW_PAGE_SIZE && <nav className="greentree-pagination" aria-label="Review pages"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1}>Previous</button><span>Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong></span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages}>Next</button></nav>}
        </section>}
        {confirmImport && <div className="greentree-confirm-backdrop"><section className="greentree-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="greentree-confirm-title"><div><p>Creation-only import</p><h2 id="greentree-confirm-title">Create {confirmRows.length} Equipment record{confirmRows.length === 1 ? '' : 's'}?</h2></div><p>Only Fleet Number Code, Serial, Make and Model will be copied. No Customer or Site will be created or assigned. Existing Equipment will not be changed.</p><div className="greentree-confirm-summary"><span>Records <strong>{confirmRows.length}</strong></span><span>Guarded batches <strong>{Math.ceil(confirmRows.length / GREENTREE_IMPORT_BATCH_LIMIT)}</strong></span></div>{importProgress && <div className="greentree-import-progress"><div><span>Batch {importProgress.currentBatch} of {importProgress.totalBatches}</span><strong>{importProgress.processed} / {importProgress.total}</strong></div><progress max={importProgress.total} value={importProgress.processed} /></div>}<div className="greentree-confirm-actions">{importing ? <button type="button" onClick={() => { stopImport.current = true }}>Stop after current batch</button> : <button type="button" onClick={() => setConfirmImport(null)}>Cancel</button>}<button type="button" className="primary" onClick={() => void runImport()} disabled={importing}>{importing ? 'Importing…' : 'Create Equipment'}</button></div></section></div>}
    </main>
}
