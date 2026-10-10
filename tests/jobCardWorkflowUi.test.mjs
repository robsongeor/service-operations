import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer } from 'vite'

let server
let JobCardFields
let HistoryPanel
let ReviewDetail
let ReviewQueue
let JobsTable
let defaultJobsView
let reviewApi
let contactApi
let quotesApi
const originalWindow = globalThis.window
const originalFetch = globalThis.fetch
const reviewScreenSource = readFileSync(new URL('../src/alpha/job-card-reviews/JobCardReviewsScreen.tsx', import.meta.url), 'utf8')

test.before(async () => {
    // Compile/render synthetic fixtures only: never listen, sign in or call a backend.
    globalThis.fetch = async () => { throw new Error('UI fixture must not make network requests.') }
    server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' })
    globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost' } }
    JobCardFields = (await server.ssrLoadModule('/src/alpha/jobs/components/JobCardFields.tsx')).default
    HistoryPanel = (await server.ssrLoadModule('/src/alpha/job-card-reviews/JobCardHistoryPanel.tsx')).default
    ReviewDetail = (await server.ssrLoadModule('/src/alpha/job-card-reviews/JobCardReviewDetail.tsx')).default
    ReviewQueue = (await server.ssrLoadModule('/src/alpha/job-card-reviews/JobCardReviewQueue.tsx')).default
    JobsTable = (await server.ssrLoadModule('/src/alpha/jobs/components/JobsTable.tsx')).default
    defaultJobsView = (await server.ssrLoadModule('/src/alpha/jobs/types/jobsViewState.types.ts')).DEFAULT_JOBS_VIEW_STATE
    reviewApi = await server.ssrLoadModule('/src/alpha/job-card-reviews/jobCardReviewApi.ts')
    contactApi = await server.ssrLoadModule('/src/alpha/job-card-reviews/jobCardOfficeContextApi.ts')
    quotesApi = await server.ssrLoadModule('/src/alpha/quotes/services/quotesApi.ts')
})
test.after(async () => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    globalThis.fetch = originalFetch
    await server?.close()
})

const noAction = async () => { throw new Error('Read-only render must not mutate data.') }
const fixture = (overrides = {}) => ({
    gr_jobid: '00000000-0000-4000-8000-000000000001', gr_jobnumber: 'TEST ONLY',
    gr_jobtype: 122830000, gr_status: 122830003, gr_jobcardstatus: 122830003,
    gr_Mechanic: { gr_mechanicid: 'tech-1', gr_name: 'Fixture technician', gr_email: 'fixture@example.test' },
    gr_techniciansubmissionsubmittedon: '2026-01-01T00:00:00Z',
    gr_techniciansubmissionstory: 'Historical test evidence',
    ...overrides,
})
const renderFields = (job) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(JobCardFields, {
    job, mechanics: [], assignments: [], onStatusChange: noAction, onCreateAssignment: noAction,
    onSendPrimary: noAction, onSendAssignment: noAction, onDeleteAssignment: noAction,
})))

test('ordinary Job renders Azure history and preserves closed legacy evidence without old controls', () => {
    const markup = renderFields(fixture())
    assert.match(markup, /Azure links &amp; submissions/)
    assert.match(markup, /Historical submissions · old system/)
    assert.doesNotMatch(markup, /Historical test evidence|Previous submission|Download PDF/)
    assert.match(markup, /Loading Job Card history/)
    assert.doesNotMatch(markup, /Office status|Job Card progress|Ready for office|of 1 submitted/)
    assert.match(markup, /disabled="">Send<\/button>/)
})

test('Site Check retains its existing office status and progress controls', () => {
    const markup = renderFields(fixture({ gr_jobtype: 122830004, _gr_sitecheck_value: 'occurrence-1' }))
    assert.match(markup, /Office status|Job Card progress/)
    assert.doesNotMatch(markup, /Azure links &amp; submissions/)
})

test('Azure history distinguishes created links from delivered email and exposes saved-review navigation', () => {
    const base = { reviewId: 'review-1', technicianName: 'Fixture technician', createdOn: '2026-10-02T00:00:00Z', expiresOn: '2026-10-09T00:00:00Z', photoCount: 0 }
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(HistoryPanel, {
        busy: false, refresh: noAction, data: { truncated: false, items: [
            { ...base, status: 'active' }, { ...base, reviewId: 'review-2', status: 'reviewed', submittedOn: '2026-10-02T00:01:00Z' },
        ] },
    })))
    assert.match(markup, /does not confirm email delivery/)
    assert.match(markup, /Link created/)
    assert.match(markup, /href="\/job-card-reviews\/review-2"/)
    assert.doesNotMatch(markup, /href="\/job-card-reviews\/review-1"/)
})

test('history errors are never shown as an empty submission history', () => {
    const markup = renderToStaticMarkup(createElement(HistoryPanel, { busy: false, refresh: noAction, error: 'Access unavailable.' }))
    assert.match(markup, /role="alert"/)
    assert.match(markup, /does not mean no cards exist/)
    assert.doesNotMatch(markup, /No Azure Job Cards/)
})

const reviewFixture = (overrides = {}) => ({
    reviewId: 'review-1', sourceJobId: '00000000-0000-4000-8000-000000000001', etag: 'fixture',
    jobNumber: '142314', status: 'pendingReview', submittedOn: '2026-10-01T23:00:00Z',
    workRequired: 'Repair hydraulics', equipmentDisplayName: 'Forklift 123', fleetNumber: '123',
    equipmentMake: 'Fixture make', equipmentModel: 'Fixture model', equipmentSerial: 'Fixture serial',
    customerName: 'Fixture customer', siteName: 'Warehouse', siteAddress: '123 Example Road\nAuckland',
    hourMeter: 0, story: 'Inspected pump\nReplaced hose', furtherWorkRequired: true,
    furtherWorkDetails: 'Order seal kit', safetyIssueIdentified: true, safetyIssueDetails: 'Damaged guard',
    timeEntries: [{ date: '2026-10-02', hours: 1.25, kilometres: 12 }], parts: [{ description: 'Hose', quantity: 1 }],
    photos: [{ id: 'photo-1', fileName: 'Evidence.jpg', mimeType: 'image/jpeg', size: 3 }],
    notificationStatus: 'sent', officeStatus: 'pending', officeActivities: [], isTerminal: false, ...overrides,
})
const renderReview = (overrides = {}, state = {}, embedded = false) => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ReviewDetail, {
    embedded, review: reviewFixture(overrides), state: { busy: false, error: '', photoUrls: {}, photoLoading: {},
        contact: { data: { name: 'Fixture contact', phone: '021 000 000', email: 'contact@example.test' } },
        refresh: noAction, markReviewed: noAction, downloadPdf: noAction, retryNotification: noAction,
        loadPhoto: noAction, downloadPhotos: noAction, ...state },
})))

const renderQueue = (props = {}, path = '/job-card-reviews') => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(ReviewQueue, {
    items: [reviewFixture({ jobType: 122830001, photoCount: 1, technicianName: 'Fixture technician' })], busy: false, error: '', truncated: false, refresh: noAction, ...props,
})))

test('legacy backend keeps supported office actions but hides unadvertised recovery controls', () => {
    for (const officeRecoveryAvailable of [undefined, false, 'true']) {
        const markup = renderReview({ officeRecoveryAvailable, officeStatus: 'needsClarification' })
        assert.doesNotMatch(markup, /Technician returns|Refresh returns|>Resume entry<|>Record office correction</)
        for (const label of ['Mark complete', 'Needs follow-up', 'Save all documentation', 'Download job card PDF']) assert.ok(markup.includes(label))
    }
    const current = renderReview({ officeRecoveryAvailable: true, officeStatus: 'needsClarification' })
    for (const label of ['Technician returns', 'Refresh returns', 'Resume entry', 'Record office correction']) assert.ok(current.includes(label))
    const filed = renderReview({ officeRecoveryAvailable: true, officeStatus: 'processedInGreenTree', isTerminal: true })
    assert.match(filed, />Record office correction</)
    assert.doesNotMatch(filed, />Resume entry<|>Mark complete</)
})

test('meter date rendering, validation and submission require backend support', () => {
    const source = readFileSync(new URL('../src/alpha/portal/TechnicianJobSubmissionPage.tsx', import.meta.url), 'utf8')
    assert.match(source, /job\.meterRecordedDateAvailable === true && hourMeter\.trim\(\) && <label>Meter reading date/)
    assert.match(source, /if \(job\?\.meterRecordedDateAvailable === true && hourMeter\.trim\(\)/)
    assert.match(source, /hourMeterRecordedDate: job\?\.meterRecordedDateAvailable === true && parsedHourMeter != null \? hourMeterRecordedDate : undefined/)
})

test('queue reuses shared table controls and exposes only review navigation, not operational actions', () => {
    const markup = renderQueue()
    for (const value of ['operations-table-panel', 'operations-table-toolbar', 'operations-filter-pills', 'operations-table-sort', 'searchable-select', 'drawer-tabs', 'Sort by photos', 'Reported attention', 'Repair hydraulics', '1 of 1 shown']) assert.ok(markup.includes(value), value)
    assert.equal((markup.match(/role="tab"/g) || []).length, 4)
    for (const label of ['Open jobs', 'Submitted', 'Needs follow-up', 'Completed']) assert.ok(markup.includes(`role="tab">${label}</button>`))
    assert.match(markup, /label="Job Card workflow"/)
    assert.match(markup, /review-type-filter-label">Job type/)
    assert.doesNotMatch(markup, /job-type-tabs|>Active<|>History</)
    assert.match(markup, /aria-sort="descending"/)
    assert.match(markup, /aria-label="Open Job 142314 submitted by Fixture technician"/)
    assert.match(markup, /href="\/job-card-reviews\?review=review-1"/)
    assert.doesNotMatch(markup, /Mark reviewed|Send email|Office status|Schedule|Site Check|Operational jobs/)
})

test('selected reviews open in a contained modal while preserving the queue URL state', () => {
    assert.match(reviewScreenSource, /className="job-card-review-dialog-backdrop"/)
    assert.match(reviewScreenSource, /role="dialog" aria-modal="true"/)
    assert.match(reviewScreenSource, /document\.body\.style\.overflow = 'hidden'/)
    assert.match(reviewScreenSource, /event\.key === 'Escape'/)
    assert.match(reviewScreenSource, /`Job \$\{review\.jobNumber/)
    assert.match(reviewScreenSource, /review\.fleetNumber[\s\S]*review\.workRequired[\s\S]*\.join\('\s-\s'\)/)
    assert.match(reviewScreenSource, /job-card-review-dialog-submitted[\s\S]*Submitted \{formatReviewDate\(review\.submittedOn\)\}/)
    assert.doesNotMatch(reviewScreenSource, /job-card-review-drawer|<EditDrawerShell/)
})

test('queue loading, failure, empty, no matches and bounded results stay distinct', () => {
    assert.match(renderQueue({ busy: true, items: [] }), /Loading submitted job cards/)
    const failure = renderQueue({ items: [], error: 'Access denied' })
    assert.match(failure, /role="alert"/)
    assert.match(failure, /does not mean the queue is empty/)
    assert.doesNotMatch(failure, /No new technician submissions are waiting/)
    assert.match(renderQueue({ error: 'Offline' }), /Previously loaded rows remain below/)
    assert.match(renderQueue({ items: [] }), /No new technician submissions are waiting/)
    assert.match(renderQueue({}, '/job-card-reviews?q=nonexistent'), /No records match these filters/)
    assert.match(renderQueue({ truncated: true }), /More records are available to check for this stage/)
    assert.match(renderQueue({ truncated: true, items: [] }), /No matching records in the pages checked so far/)
    const capped = renderQueue({ truncated: true, canLoadMore: false })
    assert.match(capped, /safe scan limit has been reached/)
    assert.doesNotMatch(capped, />Load more</)
})

test('Open jobs shows sent progress, not fabricated submission evidence or editable managed Jobs', () => {
    const { reviewId, submittedOn, officeStatus, ...base } = reviewFixture()
    void reviewId; void submittedOn; void officeStatus
    const markup = renderQueue({ queueView: 'open', items: [{ ...base, dispatchId: 'sent-1', sentOn: '2026-10-01T23:00:00Z' }] }, '/job-card-reviews?view=open&officeStatus=onHold&administrator=Jess&attention=safety&sort=photos')
    assert.match(markup, /Awaiting submission/)
    assert.match(markup, /Sort by sent/)
    assert.match(markup, /1 of 1 shown/)
    assert.match(markup, /Unsent and unnumbered jobs remain in staging/)
    assert.doesNotMatch(markup, /href="\/jobs|href="\/job-card-reviews\/|Sort by photos|review-office-status-filter|review-administrator-filter|Reported attention|>Review →</)
})

test('Review explains notes-only clarification; Completed never relabels legacy outcomes as GreenTree processing', () => {
    const reviewing = renderQueue({ queueView: 'review', items: [reviewFixture({ officeStatus: 'needsClarification' })] })
    assert.match(reviewing, /Job Cards needing follow-up/)
    assert.match(reviewing, /Cards awaiting information or resolution before GreenTree entry can be completed/)
    assert.match(reviewing, /Includes entry already started/)
    assert.doesNotMatch(reviewing, /In progress|GreenTree entry in progress/)
    assert.match(reviewing, /Follow-up records status and notes only; no message is sent/)
    assert.match(reviewing, /Needs follow-up/)
    assert.match(reviewing, /review-office-status-filter/)
    assert.match(renderQueue({ queueView: 'review', items: [] }), /No Job Cards need follow-up in the loaded records/)
    const completed = renderQueue({ queueView: 'completed', items: [reviewFixture({ officeStatus: 'legacyReviewed', isTerminal: true })] })
    assert.match(completed, /Reviewed \(legacy outcome not recorded\)/)
    assert.doesNotMatch(completed, /class="review-office-status processedInGreenTree"/)
    assert.match(completed, /Historical outcomes retain their original labels/)
})

test('queue API preserves truncation metadata and delegated read-only authentication', async (t) => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, '/api/jobcardreviews')
        assert.equal(options.headers['X-Dataverse-Authorization'], 'Bearer fixture-token')
        assert.equal(options.cache, 'no-store')
        assert.equal(options.method, undefined)
        return Response.json({ items: [], truncated: true })
    })
    assert.deepEqual(await reviewApi.fetchPendingJobCardReviews('fixture-token'), { items: [], truncated: true })
})

test('Jobs still renders operational filters, sort state and actions using the same table primitives', () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(JobsTable, {
        jobs: [fixture({ createdon: '2026-10-01T23:00:00Z' })], visibleStatuses: defaultJobsView.visibleStatuses, viewState: defaultJobsView,
        onViewStateChange: noAction, onToggleStatus: noAction, onResetToDefault: noAction, resetToDefaultDisabled: true,
        onStatusChange: noAction, onJobFieldsChange: noAction, onJobNumberAllocation: noAction, onEmailTechnician: noAction,
        emailDeliveryStates: {}, onEditJob: noAction, onOpenJobCard: noAction, onOpenEquipment: noAction,
        mechanics: [], officeUpdates: [], scheduleOptions: [], stickyThroughColumnId: null,
    })))
    for (const value of ['operations-table-panel', 'operations-table-toolbar', 'operations-filter-pills', 'operations-table-sort', 'Sort by status priority', 'Sort by created date', 'Filter jobs by office attention', 'Job cards']) assert.ok(markup.includes(value), value)
    assert.match(markup, /aria-sort="ascending"/)
    assert.match(markup, /TEST ONLY/)
})

test('review return link only accepts the review queue and preserves its filters', () => {
    const renderReturn = (returnTo) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [{ pathname: '/job-card-reviews/review-1', state: { reviewQueueReturnTo: returnTo } }] }, createElement(ReviewDetail, {
        review: reviewFixture(), state: { busy: false, error: '', photoUrls: {}, photoLoading: {}, contact: { data: null } },
    })))
    assert.match(renderReturn('/job-card-reviews?attention=safety'), /href="\/job-card-reviews\?attention=safety"/)
    for (const unsafe of ['https://example.test', '//example.test', '/jobs', '/job-card-reviews/review-2']) {
        assert.match(renderReturn(unsafe), /class="review-back" href="\/job-card-reviews"/)
    }
})

test('review places Job, equipment/customer/contact/address, and prominent hour meter/story in order', () => {
    const markup = renderReview()
    const jobIndex = markup.indexOf('<h1>Job 142314</h1>')
    const equipmentIndex = markup.indexOf('Job details')
    const storyIndex = markup.indexOf('id="review-story-heading"')
    assert.ok(jobIndex >= 0 && jobIndex < equipmentIndex && equipmentIndex < storyIndex)
    assert.match(markup, /Saved equipment<\/p><h2>123<\/h2>/)
    assert.match(markup, /class="review-equipment-identity"><strong>Fixture make · Fixture model<\/strong><span>Serial Fixture serial<\/span>/)
    assert.match(markup, /Saved customer &amp; site<\/p><h2>Fixture customer<\/h2><div class="review-customer-location"><strong>Warehouse<\/strong><address>123 Example Road/)
    for (const text of ['Fixture customer', '123 Example Road', 'Site contact', 'Fixture contact', '021 000 000', 'contact@example.test', 'Inspected pump', 'Order seal kit', 'Damaged guard']) assert.ok(markup.includes(text), text)
    assert.match(markup, /Submitted hour meter<\/span><strong>0<\/strong>/)
    assert.match(markup, /class="review-scan-strip"/)
    assert.match(markup, /class="review-overview-bar"/)
    const scanStrip = markup.match(/<section class="review-scan-strip"[\s\S]*?<\/section>/)?.[0] || ''
    for (const text of ['Technician', 'Submitted', 'Order number']) assert.ok(scanStrip.includes(text), text)
    assert.doesNotMatch(scanStrip, /Labour|1.25 h|Travel|12 km|Evidence|Reported attention|Safety issue|Further work/)
    assert.doesNotMatch(markup, /Office reference|Current Job contact/)
    assert.match(markup, /has-further-work/)
    assert.match(markup, /has-safety-issue/)
    assert.match(markup, />Associated quotes<\/button>/)
    assert.match(markup, />Download all photos<\/button>/)
    assert.doesNotMatch(markup, /target="_blank"/)
})

test('review handles missing photos, hour reading and failed current contact without invented evidence', () => {
    const markup = renderReview({ photos: [], hourMeter: undefined, furtherWorkRequired: false, safetyIssueIdentified: false }, { contact: { error: 'Current contact unavailable.' } })
    assert.match(markup, /disabled="">Download all photos/)
    assert.match(markup, /Submitted hour meter<\/span><strong>Not supplied<\/strong>/)
    assert.match(markup, /Current contact unavailable/)
    assert.match(markup, /No further work reported/)
    assert.match(markup, /No safety issues reported/)
    assert.doesNotMatch(markup, /Fixture contact|No contact assigned/)
})

test('embedded report keeps document access, evidence and audit exceptions without duplicate controls', () => {
    const markup = renderReview({ technicianName: 'Alex', orderNumber: 'PO-123', notificationStatus: 'failed', reviewedOn: '2026-10-02T01:00:00Z' }, { readOnly: true }, true)
    for (const value of ['Alex', 'PO-123', 'Fixture customer', 'Fixture serial', 'Inspected pump', 'Order seal kit', 'Damaged guard', 'Review email: failed', 'Reviewed 2 Oct']) assert.ok(markup.includes(value), value)
    for (const label of ['Save all documentation', 'Associated quotes', 'Download job card PDF', 'Start GreenTree entry', 'Mark complete']) assert.equal(markup.split(`>${label}</button>`).length - 1, 1, label)
    assert.match(markup, /disabled="">Start GreenTree entry<\/button>/)
    assert.match(markup, /disabled="">Retry notification<\/button>/)
    const terminal = renderReview({ officeStatus: 'processedInGreenTree', isTerminal: true }, {}, true)
    assert.match(terminal, />Download job card PDF<\/button>/)
    assert.doesNotMatch(terminal, />Start GreenTree entry<\/button>|>Mark complete<\/button>/)
})

test('review groups the story beside evidence and retains every long submission entry', () => {
    const story = Array.from({ length: 30 }, (_, index) => `Inspection step ${index + 1}: retained original evidence.`).join('\n')
    const photos = Array.from({ length: 20 }, (_, index) => ({ id: `photo-${index}`, fileName: `Original ${index + 1}.jpg`, mimeType: 'image/jpeg', size: 1024 }))
    const parts = Array.from({ length: 12 }, (_, index) => ({ description: `Part ${index + 1}`, quantity: index + 1 }))
    const markup = renderReview({ story, photos, parts })
    assert.ok(markup.indexOf('class="review-workspace"') < markup.indexOf('id="review-story-heading"'))
    assert.ok(markup.indexOf('class="review-evidence-rail"') < markup.indexOf('id="review-photos-heading"'))
    assert.match(markup, /class="review-summary review-card"/)
    assert.match(markup, /class="review-context-workflow-grid"/)
    assert.ok(markup.includes(story), 'Full story including line breaks is retained')
    for (const photo of photos) assert.ok(markup.includes(photo.fileName))
    for (const part of parts) assert.ok(markup.includes(`<td>${part.description}</td><td class="review-number">${part.quantity}</td>`))
    assert.match(markup, /table class="review-resource-table" aria-labelledby="review-time-heading"/)
    assert.match(markup, /table class="review-resource-table review-parts-table" aria-labelledby="review-parts-heading"/)
    assert.equal((markup.match(/<figure>/g) || []).length, 20)
})

test('compact evidence tables preserve dated entries, totals and zero readings without inventing missing evidence', () => {
    const single = renderReview({ timeEntries: [{ date: '2026-10-09', hours: 0, kilometres: 0 }] }, {}, true)
    assert.match(single, /dateTime="2026-10-09">09\/10\/2026<\/time>/i)
    assert.match(single, /<td class="review-number">0 h<\/td><td class="review-number">0 km<\/td>/)
    assert.match(single, /<th scope="col" class="review-number">Labour<\/th>/)
    assert.match(single, /<th scope="row">Total<\/th>/)
    assert.doesNotMatch(single, /No time or travel recorded/)
    const multiple = renderReview({ timeEntries: [{ date: '2026-10-08', hours: 1.25, kilometres: 12 }, { date: '2026-10-09', hours: 2.5, kilometres: 20 }] }, {}, true)
    for (const value of ['08/10/2026', '09/10/2026', '<td class="review-number">1.25 h</td><td class="review-number">12 km</td>', '<td class="review-number">2.5 h</td><td class="review-number">20 km</td>', '<tfoot><tr><th scope="row">Total</th><td class="review-number">3.75 h</td><td class="review-number">32 km</td>']) assert.ok(multiple.includes(value), value)
    const empty = renderReview({ timeEntries: [], parts: [] }, {}, true)
    assert.match(empty, /No time or travel recorded/)
    assert.match(empty, /No parts recorded/)
    assert.doesNotMatch(empty, /<table|<tfoot>/)
})

test('read-only local reviews disable review updates and email retries but retain read/download controls', () => {
    const markup = renderReview({ notificationStatus: 'failed' }, { readOnly: true })
    for (const label of ['Start GreenTree entry', 'Needs follow-up', 'Mark complete']) {
        assert.match(markup, new RegExp(`disabled="">${label}<\\/button>`))
    }
    assert.match(markup, /disabled="">Retry notification<\/button>/)
    assert.match(markup, /<button type="button">Associated quotes<\/button>/)
    assert.match(markup, /<button type="button">Download job card PDF<\/button>/)
    assert.doesNotMatch(markup, /No invoice required/)
})

test('one follow-up action replaces clarification/hold buttons while preserving existing hold notes', () => {
    for (const officeStatus of ['pending', 'inReview', 'needsClarification', 'onHold']) {
        const markup = renderReview({ officeStatus, officeNote: 'Waiting for technician hours.' }, {}, true)
        assert.equal(markup.split('>Needs follow-up</button>').length - 1, 1)
        assert.doesNotMatch(markup, />Needs clarification<\/button>|>On hold<\/button>/)
        assert.match(markup, /Waiting for technician hours/)
        if (officeStatus === 'onHold') assert.match(markup, />On hold<\/h2>/)
    }
    const terminal = renderReview({ officeStatus: 'processedInGreenTree', isTerminal: true }, {}, true)
    assert.doesNotMatch(terminal, />Needs follow-up<\/button>/)
})

test('office workflow presents every explicit state and keeps terminal outcomes immutable', () => {
    const active = renderReview({
        officeStatus: 'needsClarification',
        officeNote: 'Please verify the order number.',
        officeActionBy: { userId: 'admin-1', displayName: 'Jess Admin', email: 'jess@example.test' },
        officeActionOn: '2026-10-02T01:00:00Z',
        officeActivities: [{ action: 'setNeedsClarification', fromStatus: 'inReview', toStatus: 'needsClarification', occurredOn: '2026-10-02T01:00:00Z', actor: { userId: 'admin-1', displayName: 'Jess Admin' }, note: 'Please verify the order number.' }],
    })
    for (const value of ['Needs follow-up', 'Jess Admin', 'Please verify the order number.', 'Activity history', 'Opening this review does not change its state']) assert.match(active, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(active, />Mark complete<\/button>/)
    assert.doesNotMatch(active, /No invoice required/)

    const terminal = renderReview({ officeStatus: 'legacyReviewed', isTerminal: true, officeActivities: [] })
    assert.match(terminal, /Reviewed \(legacy outcome not recorded\)/)
    assert.doesNotMatch(terminal, />Mark complete<\/button>|>No invoice required<\/button>/)
    const retired = renderReview({ officeStatus: 'noInvoiceRequired', isTerminal: true, officeNote: 'Historical reason' })
    assert.match(retired, /No invoice required \(retired outcome\)/)
    assert.match(retired, /Historical reason/)
    assert.doesNotMatch(retired, />Mark complete<\/button>|>No invoice required<\/button>/)
})

test('photo downloads stay on the authenticated private API and pass cancellation', async (t) => {
    const controller = new AbortController()
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, '/api/jobcardreviews/review%2F1/photo%2F1')
        assert.equal(options.cache, 'no-store')
        assert.equal(options.headers['X-Dataverse-Authorization'], 'Bearer fixture-token')
        assert.equal(options.signal, controller.signal)
        return new Response(new Uint8Array([1, 2, 3]))
    })
    assert.equal((await reviewApi.fetchJobCardPhotoBlob('fixture-token', 'review/1', 'photo/1', controller.signal)).size, 3)
})

test('current contact is one minimal delegated GET; missing and failed contacts remain distinct', async (t) => {
    let status = 200
    let body = { gr_Contact: { gr_name: 'Name', gr_phone: 'Phone', gr_email: 'Email' } }
    t.mock.method(globalThis, 'fetch', async (value, options) => {
        const url = new URL(value)
        assert.match(url.pathname, /gr_jobs\(00000000-0000-4000-8000-000000000001\)$/)
        assert.equal(url.searchParams.get('$select'), 'gr_jobid')
        assert.equal(url.searchParams.get('$expand'), 'gr_Contact($select=gr_name,gr_phone,gr_email)')
        assert.equal(options.method ?? 'GET', 'GET')
        assert.equal(options.headers.Authorization, 'Bearer fixture-token')
        assert.equal(options.cache, 'no-store')
        return Response.json(body, { status })
    })
    const fetchContact = () => contactApi.fetchJobCardContact('fixture-token', reviewFixture().sourceJobId)
    assert.deepEqual(await fetchContact(), { name: 'Name', phone: 'Phone', email: 'Email' })
    body = { gr_Contact: null }
    assert.equal(await fetchContact(), null)
    status = 403
    await assert.rejects(fetchContact(), /could not be loaded/)
    await assert.rejects(contactApi.fetchJobCardContact('fixture-token', '../bad'), /valid Job/)
})

test('quote preview fetches only the associated Job and selected quote, failing on truncated results', async (t) => {
    let truncated = false
    t.mock.method(globalThis, 'fetch', async (value, options) => {
        const url = new URL(value)
        const headers = url.pathname.endsWith('/gr_quotes')
        assert.equal(url.searchParams.get('$filter'), headers ? '_gr_job_value eq fixture-job' : '_gr_quote_value eq fixture-quote')
        assert.equal(url.searchParams.get('$top'), headers ? '51' : '201')
        assert.equal(options.method ?? 'GET', 'GET')
        assert.equal(options.headers.Authorization, 'Bearer fixture-token')
        return Response.json({ value: [], ...(truncated ? { '@odata.nextLink': 'Never followed' } : {}) })
    })
    assert.deepEqual(await quotesApi.fetchQuotesForJob('fixture-token', 'fixture-job'), [])
    assert.deepEqual(await quotesApi.fetchQuoteLines('fixture-token', 'fixture-quote'), [])
    truncated = true
    await assert.rejects(quotesApi.fetchQuotesForJob('fixture-token', 'fixture-job'), /more than 50/)
    await assert.rejects(quotesApi.fetchQuoteLines('fixture-token', 'fixture-quote'), /more than 200/)
})
