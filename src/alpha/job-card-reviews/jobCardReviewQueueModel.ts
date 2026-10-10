import { JOB_TYPE_OPTIONS, JOB_TYPES, getJobTypeLabel, type JobType } from '../jobs/types/jobType.types.ts'
import type { JobCardOfficeStatus, JobCardQueueItem, JobCardReviewQueueView } from './jobCardReview.types.ts'

export const REVIEW_STAGE_TABS: { id: JobCardReviewQueueView; label: string }[] = [
    { id: 'open', label: 'Open jobs' }, { id: 'submitted', label: 'Submitted' },
    { id: 'review', label: 'Needs follow-up' }, { id: 'completed', label: 'Completed' },
]
export function readReviewStage(params: URLSearchParams): JobCardReviewQueueView {
    const value = params.get('view')
    if (value === 'history') return 'completed'
    return value === 'open' || value === 'review' || value === 'completed' ? value : 'submitted'
}
export const queueItemId = (item: JobCardQueueItem) => 'dispatchId' in item ? item.dispatchId : item.reviewId
export const queueItemDate = (item: JobCardQueueItem) => 'sentOn' in item ? item.sentOn : item.submittedOn

export type ReviewAttention = 'all' | 'required' | 'safety' | 'further' | 'none'
export type ReviewSortColumn = 'job' | 'submitted' | 'customer' | 'technician' | 'photos'
export type ReviewQueueView = {
    search: string
    jobType: JobType | 'all'
    attention: ReviewAttention
    customer: string
    technician: string
    officeStatus: JobCardOfficeStatus | 'all'
    administrator: string
    sort: { column: ReviewSortColumn; direction: 'ascending' | 'descending' }
}
export const DEFAULT_REVIEW_QUEUE_VIEW: ReviewQueueView = { search: '', jobType: 'all', attention: 'all', customer: '', technician: '', officeStatus: 'all', administrator: '', sort: { column: 'submitted', direction: 'descending' } }
export const OFFICE_STATUS_LABELS: Record<JobCardOfficeStatus, string> = {
    pending: 'Ready for entry', inReview: 'GreenTree entry', needsClarification: 'Needs follow-up', onHold: 'On hold',
    processedInGreenTree: 'Processed in GreenTree', noInvoiceRequired: 'No invoice required (retired outcome)', legacyReviewed: 'Reviewed (legacy outcome not recorded)',
}
const collator = new Intl.Collator('en-NZ', { numeric: true, sensitivity: 'base' })
const date = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', day: '2-digit', month: '2-digit', year: 'numeric' })
const time = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' })

export function formatReviewDate(value: string) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? 'Not recorded' : date.format(parsed)
}

export function formatReviewTime(value: string) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? '' : time.format(parsed)
}

export function readReviewQueueView(params: URLSearchParams): ReviewQueueView {
    const type = Number(params.get('type'))
    const attention = params.get('attention') as ReviewAttention
    const column = params.get('sort') as ReviewSortColumn
    return {
        search: (params.get('q') || '').slice(0, 500),
        jobType: type !== JOB_TYPES.SITE_CHECK && JOB_TYPE_OPTIONS.some((option) => option.value === type) ? type as JobType : 'all',
        attention: ['all', 'required', 'safety', 'further', 'none'].includes(attention) ? attention : 'all',
        customer: (params.get('customer') || '').slice(0, 500), technician: (params.get('technician') || '').slice(0, 500),
        officeStatus: ['pending', 'inReview', 'needsClarification', 'onHold', 'processedInGreenTree', 'noInvoiceRequired', 'legacyReviewed'].includes(params.get('officeStatus') || '') ? params.get('officeStatus') as JobCardOfficeStatus : 'all',
        administrator: (params.get('administrator') || '').slice(0, 500),
        sort: { column: ['job', 'submitted', 'customer', 'technician', 'photos'].includes(column) ? column : 'submitted', direction: params.get('direction') === 'ascending' ? 'ascending' : 'descending' },
    }
}

export function reviewQueueParams(view: ReviewQueueView) {
    const params = new URLSearchParams()
    if (view.search) params.set('q', view.search)
    if (view.jobType !== 'all') params.set('type', String(view.jobType))
    if (view.attention !== 'all') params.set('attention', view.attention)
    if (view.customer) params.set('customer', view.customer)
    if (view.technician) params.set('technician', view.technician)
    if (view.officeStatus !== 'all') params.set('officeStatus', view.officeStatus)
    if (view.administrator) params.set('administrator', view.administrator)
    if (view.sort.column !== 'submitted') params.set('sort', view.sort.column)
    if (view.sort.direction !== 'descending') params.set('direction', view.sort.direction)
    return params
}

export function reviewMatchesAttention(item: JobCardQueueItem, attention: ReviewAttention) {
    if (attention === 'required') return item.safetyIssueIdentified || item.furtherWorkRequired
    if (attention === 'safety') return item.safetyIssueIdentified
    if (attention === 'further') return item.furtherWorkRequired
    if (attention === 'none') return !item.safetyIssueIdentified && !item.furtherWorkRequired
    return true
}

export function filterAndSortReviews(items: JobCardQueueItem[], view: ReviewQueueView) {
    const query = view.search.trim().toLocaleLowerCase('en-NZ')
    const rows = items.filter((item) => (view.jobType === 'all' || item.jobType === view.jobType)
        && (!view.customer || item.customerName === view.customer)
        && (!view.technician || item.technicianName === view.technician)
        && (view.officeStatus === 'all' || item.officeStatus === view.officeStatus)
        && (!view.administrator || (item.outcomeBy || item.officeActionBy)?.displayName === view.administrator)
        && reviewMatchesAttention(item, view.attention)
        && (!query || [item.jobNumber, item.workRequired, item.customerName, item.siteName, item.technicianName,
            item.equipmentDisplayName, item.equipmentSerial, item.fleetNumber, getJobTypeLabel(item.jobType), item.officeStatus ? OFFICE_STATUS_LABELS[item.officeStatus] : 'Awaiting submission',
            item.officeActionBy?.displayName, item.outcomeBy?.displayName, item.greentreeReference, formatReviewDate(queueItemDate(item))]
            .filter(Boolean).join(' ').toLocaleLowerCase('en-NZ').includes(query)))
    const direction = view.sort.direction === 'ascending' ? 1 : -1
    const textValue = (item: JobCardQueueItem) => view.sort.column === 'job' ? item.jobNumber : view.sort.column === 'customer' ? item.customerName : item.technicianName
    return rows.sort((left, right) => {
        let difference: number
        if (view.sort.column === 'submitted') difference = (Date.parse(queueItemDate(left)) || 0) - (Date.parse(queueItemDate(right)) || 0)
        else if (view.sort.column === 'photos') difference = left.photoCount - right.photoCount
        else {
            const first = textValue(left)?.trim() || ''
            const second = textValue(right)?.trim() || ''
            if (!first !== !second) return !first ? 1 : -1
            difference = collator.compare(first, second)
        }
        return difference * direction || collator.compare(queueItemId(left), queueItemId(right))
    })
}

export function reviewFilterOptions(items: JobCardQueueItem[], field: 'customerName' | 'technicianName', selected: string) {
    return [...new Set([...items.map((item) => item[field]).filter((value): value is string => Boolean(value)), ...(selected ? [selected] : [])])]
        .sort(collator.compare).map((value) => ({ value, label: value }))
}

export function reviewAdministratorOptions(items: JobCardQueueItem[], selected: string) {
    return [...new Set([...items.map((item) => (item.outcomeBy || item.officeActionBy)?.displayName).filter((value): value is string => Boolean(value)), ...(selected ? [selected] : [])])]
        .sort(collator.compare).map((value) => ({ value, label: value }))
}
