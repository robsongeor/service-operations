import { useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import PageHeader from '../shared/page-header/PageHeader'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import DrawerTabs from '../shared/drawer/DrawerTabs'
import TablePanel from '../shared/table/TablePanel'
import TableToolbar from '../shared/table/TableToolbar'
import TableSortButton from '../shared/table/TableSortButton'
import FilterPills from '../shared/table/FilterPills'
import JobTypeBadge from '../jobs/components/JobTypeBadge'
import { JOB_TYPE_OPTIONS, JOB_TYPES, type JobType } from '../jobs/types/jobType.types'
import type { JobCardOfficeStatus, JobCardReviewQueueView, JobCardQueueItem } from './jobCardReview.types'
import { DEFAULT_REVIEW_QUEUE_VIEW, REVIEW_STAGE_TABS, OFFICE_STATUS_LABELS, filterAndSortReviews, formatReviewDate, formatReviewTime, readReviewQueueView, reviewAdministratorOptions, reviewFilterOptions, reviewQueueParams, queueItemDate, queueItemId, type ReviewAttention, type ReviewQueueView, type ReviewSortColumn } from './jobCardReviewQueueModel'
import './JobCardReviewQueue.css'
import { JOB_CARD_CURSOR_QUEUE_ENABLED } from './jobCardReviewApi'

type Props = { items: JobCardQueueItem[]; busy: boolean; error: string; truncated: boolean; canLoadMore?: boolean; refresh: () => void; loadMore?: () => void; queueView?: JobCardReviewQueueView }
const types = JOB_TYPE_OPTIONS.filter((option) => option.value !== JOB_TYPES.SITE_CHECK).map((option) => ({ value: String(option.value), label: option.label }))
const attentionOptions: { value: ReviewAttention; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'required', label: 'Needs attention' },
    { value: 'safety', label: 'Safety issues' }, { value: 'further', label: 'Further work' }, { value: 'none', label: 'No flags' },
]
const stageCopy = {
    open: { title: 'Open jobs', description: 'Numbered jobs sent to technicians and awaiting submission. Unsent and unnumbered jobs remain in staging.', empty: 'No jobs awaiting submission in the loaded dispatches.' },
    submitted: { title: 'Submitted Job Cards', description: 'Technician submissions ready for office entry into GreenTree.', empty: 'No new technician submissions are waiting for GreenTree entry.' },
    review: { title: 'Job Cards needing follow-up', description: 'Cards awaiting information or resolution before GreenTree entry can be completed. Includes entry already started. Follow-up records status and notes only; no message is sent.', empty: 'No Job Cards need follow-up in the loaded records.' },
    completed: { title: 'Completed Job Cards', description: 'GreenTree data entry complete. Historical outcomes retain their original labels.', empty: 'No completed review history is loaded.' },
}

export default function JobCardReviewQueue({ items, busy, error, truncated, canLoadMore = truncated, refresh, loadMore = refresh, queueView = 'submitted' }: Props) {
    const [params, setParams] = useSearchParams()
    const location = useLocation()
    const focusStage = (location.state as { reviewStageFocus?: string } | null)?.reviewStageFocus
    useEffect(() => {
        if (focusStage === queueView) document.getElementById(`drawer-tab-${queueView}`)?.focus()
    }, [focusStage, queueView])
    const open = queueView === 'open'
    const completed = queueView === 'completed'
    const requestedView = readReviewQueueView(params)
    const view: ReviewQueueView = { ...requestedView,
        officeStatus: open || queueView === 'submitted' ? 'all' : requestedView.officeStatus,
        administrator: open ? '' : requestedView.administrator, attention: open ? 'all' : requestedView.attention,
        sort: open && requestedView.sort.column === 'photos' ? DEFAULT_REVIEW_QUEUE_VIEW.sort : requestedView.sort,
    }
    const copy = stageCopy[queueView]
    const paramsFor = (next: ReviewQueueView, target = queueView) => {
        const result = reviewQueueParams(next)
        result.set('view', target)
        if (params.get('jobNumber')) result.set('jobNumber', params.get('jobNumber')!)
        return result
    }
    const update = (patch: Partial<ReviewQueueView>) => setParams(paramsFor({ ...view, ...patch }), { replace: true })
    const reset = () => setParams({ view: queueView }, { replace: true })
    const rows = filterAndSortReviews(items, view)
    const filtered = reviewQueueParams({ ...view, sort: DEFAULT_REVIEW_QUEUE_VIEW.sort }).size > 0
    const count = error ? 'Refresh needed' : busy && !items.length ? 'Loading…' : `${rows.length} of ${items.length}${truncated ? '+' : ''} shown`
    const returnTo = `/job-card-reviews${params.size ? `?${params.toString()}` : ''}`
    const reviewTo = (reviewId: string) => `${returnTo}${returnTo.includes('?') ? '&' : '?'}review=${encodeURIComponent(reviewId)}`
    const statuses: JobCardOfficeStatus[] = completed ? ['processedInGreenTree', 'noInvoiceRequired', 'legacyReviewed'] : ['inReview', 'needsClarification', 'onHold']
    const setQueueView = (target: JobCardReviewQueueView) => {
        setParams(paramsFor({ ...view, officeStatus: 'all', administrator: '', attention: 'all' }, target), { replace: true, state: { reviewStageFocus: target } })
    }
    const changeSort = (column: ReviewSortColumn) => update({ sort: { column, direction: view.sort.column === column ? view.sort.direction === 'ascending' ? 'descending' : 'ascending' : column === 'submitted' || column === 'photos' ? 'descending' : 'ascending' } })
    const sortHeading = (column: ReviewSortColumn, label: string) => <th scope="col" aria-sort={view.sort.column === column ? view.sort.direction : 'none'}><TableSortButton label={`Sort by ${label.toLowerCase()}`} active={view.sort.column === column} direction={view.sort.direction} onClick={() => changeSort(column)}>{label}</TableSortButton></th>

    return <main className="review-queue-page">
        <PageHeader title="Job Card reviews" subtitle="Track sent jobs, technician submissions and office processing" actions={<button className="review-queue-refresh" type="button" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>} />
        <TablePanel className="review-queue-panel">
            <div className="review-queue-stage-tabs"><DrawerTabs tabs={REVIEW_STAGE_TABS} activeTab={queueView} onChange={setQueueView} ariaLabel="Job Card workflow" /></div>
            {JOB_CARD_CURSOR_QUEUE_ENABLED && !open && <form className="review-exact-job-search" onSubmit={(event) => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('jobNumber') || '').trim().toUpperCase(); const next = paramsFor({ ...view, search: '' }); next.delete('review'); if (value) next.set('jobNumber', value); else next.delete('jobNumber'); setParams(next, { replace: true }) }}><label>Find exact Job in this queue (all saved records)<input key={params.get('jobNumber') || ''} name="jobNumber" defaultValue={params.get('jobNumber') || ''} placeholder="e.g. 147247" pattern="([A-Za-z]{1,2})?[0-9]{1,20}" /></label><button type="submit" disabled={busy}>Find Job</button></form>}
            <section role="tabpanel" id={`drawer-tab-panel-${queueView}`} aria-labelledby={`drawer-tab-${queueView}`}>
                <TableToolbar eyebrow="Office workflow" title={copy.title} searchLabel="Search Job Card reviews" placeholder="Search Job, equipment or description…" search={view.search} onSearch={(search) => update({ search })} count={count} />
                <p className="review-queue-stage-description">{copy.description}</p>
                <div className="review-queue-filter-bar">
                    <SearchableSelect id="review-type-filter" label="Job type" value={view.jobType === 'all' ? '' : String(view.jobType)} options={types} onChange={(jobType) => update({ jobType: jobType ? Number(jobType) as JobType : 'all' })} placeholder="All job types" />
                    <SearchableSelect id="review-customer-filter" label="Customer" value={view.customer} options={reviewFilterOptions(items, 'customerName', view.customer)} onChange={(customer) => update({ customer })} placeholder="All customers" />
                    <SearchableSelect id="review-technician-filter" label="Technician" value={view.technician} options={reviewFilterOptions(items, 'technicianName', view.technician)} onChange={(technician) => update({ technician })} placeholder="All technicians" />
                    {(queueView === 'review' || completed) && <SearchableSelect id="review-office-status-filter" label="Office state" value={view.officeStatus === 'all' ? '' : view.officeStatus} options={statuses.map((value) => ({ value, label: OFFICE_STATUS_LABELS[value] }))} onChange={(officeStatus) => update({ officeStatus: officeStatus ? officeStatus as JobCardOfficeStatus : 'all' })} placeholder="All office states" />}
                    {!open && <SearchableSelect id="review-administrator-filter" label="Administrator" value={view.administrator} options={reviewAdministratorOptions(items, view.administrator)} onChange={(administrator) => update({ administrator })} placeholder="All administrators" />}
                    {!open && <div className="review-queue-attention"><span>Reported attention</span><FilterPills label="Filter reviews by reported attention" value={view.attention} options={attentionOptions} onChange={(attention) => update({ attention })} /></div>}
                    <button type="button" className="review-queue-reset" disabled={!filtered} onClick={reset}>Reset to Default</button>
                </div>
                {error && <div className="review-queue-message error" role="alert"><strong>Reviews could not be refreshed.</strong> {error} {items.length ? 'Previously loaded rows remain below and may be out of date.' : 'This does not mean the queue is empty.'} <button type="button" disabled={busy} onClick={refresh}>Try again</button></div>}
                {truncated && <div className="review-queue-message" role="status">{canLoadMore ? 'More records are available to check for this stage.' : 'The safe scan limit has been reached; this is not the complete history.'} Search, filters and sorting apply to the loaded rows. {canLoadMore && <button type="button" disabled={busy} onClick={loadMore}>{busy ? 'Loading…' : 'Load more'}</button>}</div>}
                <div className="review-queue-scroll" role="region" aria-label={`${copy.title} table`} tabIndex={0} aria-busy={busy}>
                    <table className={`operations-table review-queue-table${open ? ' review-queue-open-table' : ''}`}>
                        <caption className="operations-visually-hidden">{copy.description}</caption>
                        <thead><tr>{sortHeading('job', 'Job')}{sortHeading('submitted', open ? 'Sent' : 'Submitted')}<th scope="col">Type</th><th scope="col">{open ? 'Progress' : 'Office state'}</th><th scope="col">Equipment</th>{sortHeading('customer', 'Customer / site')}<th scope="col">Work required</th>{sortHeading('technician', 'Technician')}{!open && <><th scope="col">{completed ? 'Outcome / administrator' : 'Last handled by'}</th><th scope="col">{completed ? 'GreenTree reference' : 'Reported attention'}</th>{sortHeading('photos', 'Photos')}<th scope="col"><span className="operations-visually-hidden">Open review</span></th></>}</tr></thead>
                        <tbody>
                            {rows.map((item) => <tr key={queueItemId(item)} data-attention={item.safetyIssueIdentified ? 'safety' : item.furtherWorkRequired ? 'further' : 'none'}>
                                <td>{item.reviewId ? <Link className="review-queue-job-link" to={reviewTo(item.reviewId)} state={{ reviewQueueReturnTo: returnTo }}>{item.jobNumber}</Link> : <strong>{item.jobNumber}</strong>}</td>
                                <td><time dateTime={queueItemDate(item)}>{formatReviewDate(queueItemDate(item))}</time><small>{formatReviewTime(queueItemDate(item))}</small></td>
                                <td><JobTypeBadge jobType={item.jobType} /></td><td><span className={`review-office-status ${item.officeStatus || 'awaitingSubmission'}`}>{item.officeStatus ? OFFICE_STATUS_LABELS[item.officeStatus] : 'linkExpired' in item && item.linkExpired ? 'Expired link — resend needed' : 'Awaiting submission'}</span></td>
                                <td><strong>{item.fleetNumber || item.equipmentSerial || 'Not recorded'}</strong><small>{item.equipmentDisplayName || 'Equipment not recorded'}</small></td>
                                <td><strong>{item.customerName || 'Customer not recorded'}</strong><small>{item.siteName || 'Site not recorded'}</small></td><td><p className="review-queue-description" title={item.workRequired}>{item.workRequired || 'No description recorded'}</p></td><td>{item.technicianName || 'Not recorded'}</td>
                                {!open && <><td><strong>{(completed ? item.outcomeBy : item.officeActionBy)?.displayName || 'Unassigned'}</strong>{completed && item.outcomeOn && <small>{formatReviewDate(item.outcomeOn)} {formatReviewTime(item.outcomeOn)}</small>}</td>
                                    <td>{completed ? item.greentreeReference || '—' : <div className="review-queue-flags">{item.safetyIssueIdentified && <span className="safety">Safety issue</span>}{item.furtherWorkRequired && <span className="further">Further work</span>}{!item.safetyIssueIdentified && !item.furtherWorkRequired && <span className="none">No flags</span>}</div>}</td><td>{item.photoCount}</td>
                                    <td>{item.reviewId && <Link className="review-queue-open" to={reviewTo(item.reviewId)} state={{ reviewQueueReturnTo: returnTo }} aria-label={`Open Job ${item.jobNumber} submitted by ${item.technicianName || 'unknown technician'}`}>Open <span aria-hidden="true">→</span></Link>}</td></>}
                            </tr>)}
                            {!rows.length && <tr><td className="review-queue-empty" colSpan={open ? 8 : 12}>{busy && !items.length ? <span role="status">Loading {copy.title.toLowerCase()}…</span> : error && !items.length ? 'The review queue is unavailable. Try again above.' : filtered ? <>No records match these filters. <button type="button" onClick={reset}>Clear filters</button></> : truncated ? 'No matching records in the pages checked so far. See the loading notice above.' : copy.empty}</td></tr>}
                        </tbody>
                    </table>
                </div>
                <footer className="review-queue-footer"><span>{open ? 'Successful sends · one row per Job and technician assignment' : 'Saved submission details · newest first by default'}</span><span>{open ? 'Staged jobs are not included.' : 'Office workflow does not change operational Job status.'}</span></footer>
            </section>
        </TablePanel>
    </main>
}
