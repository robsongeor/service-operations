import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../shared/page-header/PageHeader'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import TablePanel from '../shared/table/TablePanel'
import TableToolbar from '../shared/table/TableToolbar'
import TableSortButton from '../shared/table/TableSortButton'
import FilterPills from '../shared/table/FilterPills'
import JobTypeTabs from '../jobs/components/JobTypeTabs'
import JobTypeBadge from '../jobs/components/JobTypeBadge'
import { JOB_TYPE_OPTIONS, JOB_TYPES } from '../jobs/types/jobType.types'
import type { JobCardReviewSummary } from './jobCardReview.types'
import { DEFAULT_REVIEW_QUEUE_VIEW, filterAndSortReviews, formatReviewDate, formatReviewTime, readReviewQueueView, reviewFilterOptions, reviewQueueParams, type ReviewAttention, type ReviewQueueView, type ReviewSortColumn } from './jobCardReviewQueueModel'
import './JobCardReviewQueue.css'

type Props = { items: JobCardReviewSummary[]; busy: boolean; error: string; truncated: boolean; refresh: () => void }
const types = JOB_TYPE_OPTIONS.filter((option) => option.value !== JOB_TYPES.SITE_CHECK)
const attentionOptions: { value: ReviewAttention; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'required', label: 'Needs attention' },
    { value: 'safety', label: 'Safety issues' }, { value: 'further', label: 'Further work' }, { value: 'none', label: 'No flags' },
]

export default function JobCardReviewQueue({ items, busy, error, truncated, refresh }: Props) {
    const [params, setParams] = useSearchParams()
    const view = readReviewQueueView(params)
    const update = (patch: Partial<ReviewQueueView>) => setParams(reviewQueueParams({ ...view, ...patch }), { replace: true })
    const rows = filterAndSortReviews(items, view)
    const filtered = reviewQueueParams({ ...view, sort: DEFAULT_REVIEW_QUEUE_VIEW.sort }).size > 0
    const count = error ? 'Refresh needed' : busy && !items.length ? 'Loading…' : `${rows.length} of ${items.length}${truncated ? '+' : ''} shown`
    const returnTo = `/job-card-reviews${params.size ? `?${params.toString()}` : ''}`
    const changeSort = (column: ReviewSortColumn) => update({ sort: { column, direction: view.sort.column === column ? view.sort.direction === 'ascending' ? 'descending' : 'ascending' : column === 'submitted' || column === 'photos' ? 'descending' : 'ascending' } })
    const sortHeading = (column: ReviewSortColumn, label: string) => <th scope="col" aria-sort={view.sort.column === column ? view.sort.direction : 'none'}><TableSortButton label={`Sort by ${label.toLowerCase()}`} active={view.sort.column === column} direction={view.sort.direction} onClick={() => changeSort(column)}>{label}</TableSortButton></th>

    return <main className="review-queue-page">
        <PageHeader title="Job Card reviews" subtitle="Review technician submissions · operational Jobs stay unchanged" actions={<>
            <span className="review-queue-pending">Pending review</span><button className="review-queue-refresh" type="button" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </>} />
        <TablePanel className="review-queue-panel">
            <TableToolbar eyebrow="Office review" title="Pending Job Cards" searchLabel="Search Job Card reviews" placeholder="Search Job, equipment or description…" search={view.search} onSearch={(search) => update({ search })} count={count} />
            <div className="review-queue-type-bar">
                <JobTypeTabs selectedJobType={view.jobType} includeOperational={false} jobTypeOptions={types} ariaLabel="Filter reviews by Job type" onChange={(jobType) => update({ jobType: typeof jobType === 'number' ? jobType : 'all' })} />
                <button type="button" className="review-queue-reset" disabled={reviewQueueParams(view).size === 0} onClick={() => setParams({}, { replace: true })}>Reset to Default</button>
            </div>
            <div className="review-queue-filter-bar">
                <SearchableSelect id="review-customer-filter" label="Customer" value={view.customer} options={reviewFilterOptions(items, 'customerName', view.customer)} onChange={(customer) => update({ customer })} placeholder="All customers" />
                <SearchableSelect id="review-technician-filter" label="Technician" value={view.technician} options={reviewFilterOptions(items, 'technicianName', view.technician)} onChange={(technician) => update({ technician })} placeholder="All technicians" />
                <div className="review-queue-attention"><span>Reported attention</span><FilterPills label="Filter reviews by reported attention" value={view.attention} options={attentionOptions} onChange={(attention) => update({ attention })} /></div>
            </div>
            {error && <div className="review-queue-message error" role="alert"><strong>Reviews could not be refreshed.</strong> {error} {items.length ? 'Previously loaded rows remain below and may be out of date.' : 'This does not mean the queue is empty.'} <button type="button" disabled={busy} onClick={refresh}>Try again</button></div>}
            {truncated && <div className="review-queue-message" role="status">Only 100 pending submissions are loaded. Search, filters and sorting apply to those rows, not the entire queue. Review items and refresh to see more.</div>}
            <div className="review-queue-scroll" role="region" aria-label="Pending Job Card reviews table" tabIndex={0} aria-busy={busy}>
                <table className="operations-table review-queue-table">
                    <caption className="operations-visually-hidden">Pending technician submissions. Open a review to inspect its saved evidence.</caption>
                    <colgroup>{[95, 120, 100, 165, 185, 250, 130, 145, 80, 100].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
                    <thead><tr>{sortHeading('job', 'Job')}{sortHeading('submitted', 'Submitted')}<th scope="col">Type</th><th scope="col">Equipment</th>{sortHeading('customer', 'Customer / site')}<th scope="col">Work required</th>{sortHeading('technician', 'Technician')}<th scope="col">Reported attention</th>{sortHeading('photos', 'Photos')}<th scope="col"><span className="operations-visually-hidden">Open review</span></th></tr></thead>
                    <tbody>
                        {rows.map((item) => <tr key={item.reviewId} data-attention={item.safetyIssueIdentified ? 'safety' : item.furtherWorkRequired ? 'further' : 'none'}>
                            <td><Link className="review-queue-job-link" to={`/job-card-reviews/${item.reviewId}`} state={{ reviewQueueReturnTo: returnTo }}>{item.jobNumber}</Link></td>
                            <td><time dateTime={item.submittedOn}>{formatReviewDate(item.submittedOn)}</time><small>{formatReviewTime(item.submittedOn)}</small></td>
                            <td><JobTypeBadge jobType={item.jobType} /></td>
                            <td><strong>{item.fleetNumber || item.equipmentSerial || 'Not recorded'}</strong><small>{item.equipmentDisplayName || 'Equipment not recorded'}</small></td>
                            <td><strong>{item.customerName || 'Customer not recorded'}</strong><small>{item.siteName || 'Site not recorded'}</small></td>
                            <td><p className="review-queue-description" title={item.workRequired}>{item.workRequired || 'No description recorded'}</p></td>
                            <td>{item.technicianName || 'Not recorded'}</td>
                            <td><div className="review-queue-flags">{item.safetyIssueIdentified && <span className="safety">Safety issue</span>}{item.furtherWorkRequired && <span className="further">Further work</span>}{!item.safetyIssueIdentified && !item.furtherWorkRequired && <span className="none">No flags</span>}</div></td>
                            <td><span className={`review-queue-photo-count${item.photoCount ? '' : ' empty'}`}>{item.photoCount}</span></td>
                            <td><Link className="review-queue-open" to={`/job-card-reviews/${item.reviewId}`} state={{ reviewQueueReturnTo: returnTo }} aria-label={`Review Job ${item.jobNumber} submitted by ${item.technicianName || 'unknown technician'}`}>Review <span aria-hidden="true">→</span></Link></td>
                        </tr>)}
                        {!rows.length && <tr><td className="review-queue-empty" colSpan={10}>{busy && !items.length ? <span role="status">Loading pending Job Cards…</span> : error && !items.length ? 'The review queue is unavailable. Try again above.' : filtered ? <>No submissions match these filters. <button type="button" onClick={() => setParams({}, { replace: true })}>Clear filters</button></> : 'No technician submissions are waiting for review.'}</td></tr>}
                    </tbody>
                </table>
            </div>
            <footer className="review-queue-footer"><span>Saved submission details · newest first by default</span><span>Attention flags reflect technician reports, not Job office status.</span></footer>
        </TablePanel>
    </main>
}
