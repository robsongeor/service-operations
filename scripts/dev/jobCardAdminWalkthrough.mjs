// Standalone loopback-only fixture server. Does not load vite.config.ts or any .env file.
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createUnifiedJobFixture, fixtureBooks } from './unifiedJobFixture.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const port = Number(process.argv.find((value) => value.startsWith('--port='))?.split('=')[1] || 5180)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local walkthrough port.')
const simulatedMode = process.argv.includes('--full-access') ? 'full' : 'job-card-admin'
const unified = process.argv.includes('--unified')
const origin = `http://127.0.0.1:${port}`
const id = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
if (process.env.WEBSITE_INSTANCE_ID || process.env.WEBSITE_HOSTNAME || process.env.FUNCTIONS_WORKER_RUNTIME || process.env.NODE_ENV === 'production') throw new Error('This walkthrough can run only on a local development machine.')
process.env.JOB_CARD_STORAGE_MODE = 'memory'
process.env.JOB_CARD_LOCAL_DEVELOPMENT = 'false'
process.env.JOB_CARD_NOTIFICATION_MODE = 'memory'
process.env.DATAVERSE_URL = 'https://job-card-walkthrough.invalid'
process.env.JOB_CARD_REVIEWER_EMAILS = 'nargiza@example.invalid,jess@example.invalid'
const actors = {
    'walkthrough-nargiza': { userId: id(901), displayName: 'Nargiza (sample administrator)', email: 'nargiza@example.invalid' },
    'walkthrough-jess': { userId: id(902), displayName: 'Jess (sample administrator)', email: 'jess@example.invalid' },
    'walkthrough-coordinator': { userId: id(903), displayName: 'Sample coordinator', email: 'coordinator@example.invalid' },
}
// Exercise the real server identity lookup with synthetic responses. All other outbound fetches fail.
globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.origin !== 'https://job-card-walkthrough.invalid') throw new Error('Outbound connections are disabled in the walkthrough.')
    const actor = actors[new Headers(options?.headers).get('Authorization')?.replace(/^Bearer /, '')]
    if (!actor) return Response.json({ error: 'Unknown sample identity.' }, { status: 401 })
    if (url.pathname === '/api/data/v9.2/WhoAmI') return Response.json({ UserId: actor.userId })
    if (url.pathname === `/api/data/v9.2/systemusers(${actor.userId})`) return Response.json({ fullname: actor.displayName, internalemailaddress: actor.email, domainname: actor.email })
    if (url.pathname === '/api/data/v9.2/gr_emaildispatchs') return Response.json({ value: sampleDispatches.filter((row) => row.gr_emailsent).slice(0, Number(url.searchParams.get('$top') || 100)) })
    throw new Error('Only fixture identity and dispatch reads are available to the review service.')
}
const { getJobCardStore, resetJobCardStore } = require('../../api/services/jobCardStorage')
const { handleReviewRequest } = require('../../api/services/jobSubmissionService')
const { applyOfficeTransition } = require('../../api/services/jobCardOfficeReview')
const requests = []
const customer = { gr_customerid: id(101), gr_name: 'Sample Logistics Ltd', statecode: 0 }
const site = { gr_siteid: id(102), gr_name: 'Sample Warehouse', gr_address: 'Sample address — local test only', _gr_customer_value: customer.gr_customerid, gr_Customer: customer, statecode: 0 }
const destinationCustomer = { gr_customerid: id(111), gr_name: 'Sample Destination Ltd', statecode: 0 }
const destinationSite = { gr_siteid: id(112), gr_name: 'Sample Destination Depot', gr_address: 'Destination address — local test only', _gr_customer_value: destinationCustomer.gr_customerid, gr_Customer: destinationCustomer, statecode: 0 }
const createdCustomers = []
const createdSites = []
const createdEquipment = []
const contact = { gr_contactid: id(103), gr_name: 'Sample Site Contact', gr_phone: 'TEST ONLY', gr_email: 'contact@example.invalid', _gr_site_value: site.gr_siteid, gr_Site: site, statecode: 0 }
const mechanic = { gr_mechanicid: id(104), gr_name: 'Sample Technician', gr_email: 'technician@example.invalid', statecode: 0 }
let equipment = { gr_equipmentid: id(105), gr_fleet: 'TEST-FORKLIFT-01', gr_make: 'Sample make', gr_model: 'Sample model', gr_serial: 'TEST-SERIAL-001', gr_currenthourmeter: 1200, _gr_site_value: site.gr_siteid, gr_Site: site, statecode: 0 }
equipment['@odata.etag'] = 'W/"equipment-1"'
let unlinkedEquipment = { ...equipment, gr_equipmentid: id(115), gr_fleet: 'TEST-UNLINKED-02', _gr_site_value: null, gr_Site: null }
const job = { gr_jobid: id(201), gr_jobnumber: '900001', gr_description: 'Sample hydraulic hose repair', gr_jobtype: 122830000, gr_status: 122830003, gr_gtentered: false, gr_timecloudentered: false, createdon: '2026-10-02T01:00:00Z', gr_Equipment: equipment, gr_Site: site, gr_Contact: contact, gr_Mechanic: mechanic, _gr_site_value: site.gr_siteid, _gr_equipment_value: equipment.gr_equipmentid, _gr_mechanic_value: mechanic.gr_mechanicid, '@odata.etag': 'W/"sample-job"' }
const quote = { gr_quoteid: id(301), gr_quotenumber: 'TEST-Q001', gr_name: 'Sample replacement seal kit', gr_quotestatus: 122830000, gr_revision: 1, gr_quotedate: '2026-10-02', gr_validuntil: '2026-11-02', gr_notes: 'Sample associated Quote. Read-only in this role.', gr_gstrate: 0.15, gr_subtotal: 100, gr_gst: 15, gr_total: 115, createdon: '2026-10-02T01:00:00Z', _gr_job_value: job.gr_jobid, _gr_customer_value: customer.gr_customerid, gr_Job: job, gr_Customer: customer, gr_Equipment: equipment, createdby: { fullname: 'Sample Author', systemuserid: id(901) } }
const quoteLine = { gr_quotelineid: id(302), _gr_quote_value: quote.gr_quoteid, gr_description: 'Sample seal kit', gr_quantity: 1, gr_unitprice: 100, gr_extendedprice: 100, gr_taxable: true, gr_sortorder: 1, gr_category: 122830001 }
const intake = { gr_jobbookentryid: id(401), gr_jobnumber: '900010', gr_stage: 122830000, createdon: '2026-10-02T02:00:00Z', gr_description: 'Sample Intake entry — equipment not yet known', gr_mechanictext: mechanic.gr_name, gr_customersnapshot: customer.gr_name, gr_sitesnapshot: site.gr_name, gr_addresssnapshot: site.gr_address, gr_addressverified: true, gr_equipmentreviewrequired: true, gr_entered: false, gr_timecloudentered: false, gr_Customer: customer, gr_Site: site, gr_Contact: contact, '@odata.etag': 'W/"sample-intake"' }
let intakeRows = []
const workingJobs = []
const ledgerRows = Object.fromEntries(Object.values(fixtureBooks).map(([table]) => [table, []]))
const fixtureTables = () => ({ gr_customers: [customer, destinationCustomer, ...createdCustomers], gr_sites: [site, destinationSite, ...createdSites], gr_contacts: [contact], gr_sitecontacts: [{ gr_sitecontactid: id(106), gr_Site: site, gr_Contact: contact }], gr_equipments: [equipment, unlinkedEquipment, ...createdEquipment], gr_mechanics: [mechanic], gr_jobs: unified ? workingJobs : [job], gr_quotes: [quote], gr_quotelines: [quoteLine], ...ledgerRows, gr_jobbookentries: intakeRows })
let unifiedJobs
let loseNextRegistrationResponse = false
const sampleDispatches = [
    { gr_Job: { ...job, gr_jobid: id(202), gr_jobnumber: '900020', gr_description: 'Sample: sent to technician, awaiting submission' } },
    { gr_Job: { ...job, gr_jobid: id(203), gr_jobnumber: 'WJ123456', gr_description: 'Sample: regional numbered job with technician' } },
    { gr_Job: job },
    { gr_Job: { ...job, gr_jobid: id(204), gr_jobnumber: '', gr_description: 'Staging — must not appear' } },
    { gr_Job: { ...job, gr_jobid: id(205), gr_jobnumber: '900021' }, gr_emailsent: false },
].map((row, index) => ({
    gr_emaildispatchid: id(601 + index), _gr_job_value: row.gr_Job.gr_jobid,
    gr_recipientname: mechanic.gr_name, gr_recipientemail: mechanic.gr_email,
    gr_requestedon: '2026-10-01T20:00:00Z', gr_completedon: '2026-10-01T20:01:00Z',
    gr_emailsent: true, ...row,
}))
const evidenceFields = ['sourceJobId', 'jobNumber', 'submittedOn', 'story', 'hourMeter', 'timeEntriesJson', 'partsJson', 'photosJson', 'customerName', 'siteName', 'technicianName', 'furtherWorkRequired', 'furtherWorkDetails', 'safetyIssueIdentified', 'safetyIssueDetails']
let originals = new Map()
const evidenceOf = (record) => JSON.stringify(Object.fromEntries(evidenceFields.map((field) => [field, record[field]])))

async function seed() {
    resetJobCardStore()
    intakeRows = [structuredClone(intake)]
    for (const rows of Object.values(ledgerRows)) rows.length = 0
    ledgerRows.gr_jobbookentries = intakeRows
    workingJobs.length = 0
    workingJobs.push({ ...structuredClone(job), '@odata.etag': 'W/"901"', gr_coordinatormanaged: true, gr_registrationvoid: false },
        { ...structuredClone(job), gr_jobid: id(211), gr_jobnumber: null, gr_description: 'Sample staging — not yet numbered or managed', gr_status: 122830001, gr_Mechanic: null, '@odata.etag': 'W/"902"', gr_coordinatormanaged: false, gr_registrationvoid: false })
    unifiedJobs = createUnifiedJobFixture({ jobs: workingJobs, ledgers: ledgerRows, tables: fixtureTables })
    createdEquipment.length = 0
    createdCustomers.length = 0
    createdSites.length = 0
    originals = new Map()
    requests.length = 0
    for (let i = 1; i <= 7; i++) {
        let record = {
            tokenHash: `walkthrough-card-${i}`, reviewId: id(i), sourceJobId: job.gr_jobid,
            jobNumber: String(900000 + i), jobType: i === 2 ? 122830001 : 122830000,
            createdOn: '2026-10-01T20:00:00Z', submittedOn: `2026-10-02T0${8 - i}:00:00Z`,
            status: 'pendingReview', officeStatus: 'pending', officeActivitiesJson: '[]',
            technicianName: mechanic.gr_name, technicianEmail: mechanic.gr_email, customerName: customer.gr_name, siteName: site.gr_name,
            siteAddress: site.gr_address, equipmentDisplayName: 'Sample forklift', fleetNumber: equipment.gr_fleet,
            equipmentMake: equipment.gr_make, equipmentModel: equipment.gr_model, equipmentSerial: equipment.gr_serial,
            workRequired: ['Hydraulic hose repair · workflow sample', 'Routine service · GreenTree sample', 'Brake inspection · conflict sample', 'Waiting for purchase order', 'Completed sample', 'Completed sample without reference', 'Historical reviewed sample'][i - 1],
            hourMeter: 1234, story: 'SAMPLE EVIDENCE ONLY\nInspected the hydraulic system. Replaced the damaged hose and checked for leaks.\nTechnician submission must remain unchanged.',
            timeEntriesJson: '[{"date":"2026-10-02","hours":1.5,"kilometres":12}]',
            partsJson: '[{"description":"Sample hydraulic hose","quantity":1}]', photosJson: '[]', photoCount: 0,
            furtherWorkRequired: i === 1, furtherWorkDetails: i === 1 ? 'Sample: replace seal kit at next service.' : '',
            safetyIssueIdentified: i === 1, safetyIssueDetails: i === 1 ? 'Sample: damaged guard requires follow-up.' : '', notificationStatus: 'sent',
        }
        if (i === 4) record = applyOfficeTransition(record, { action: 'setOnHold', note: 'Sample: awaiting customer purchase order.' }, actors['walkthrough-jess'])
        if (i === 5) record = applyOfficeTransition(record, { action: 'completeGreenTreeProcessing', greentreeReference: 'SAMPLE-GT-001' }, actors['walkthrough-nargiza'])
        if (i === 6) record = applyOfficeTransition(record, { action: 'completeGreenTreeProcessing', note: 'Sample: data entry complete.' }, actors['walkthrough-jess'])
        if (i === 7) { record.status = 'reviewed'; delete record.officeStatus; record.reviewedOn = '2026-10-02T01:00:00Z' }
        originals.set(record.reviewId, evidenceOf(record))
        await getJobCardStore().create(record)
    }
}
await seed()

function json(response, status, body) {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(body))
}
async function bodyOf(request) {
    const chunks = []
    let bytes = 0
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 64000) throw new Error('Fixture request too large.'); chunks.push(chunk) }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
}
const plugin = {
    name: 'isolated-job-card-walkthrough',
    transformIndexHtml: (html) => html.replace('/src/main.tsx', '/scripts/dev/jobCardWalkthroughApp.tsx').replace('<title>service-operations</title>', '<title>Local Job Card walkthrough</title>'),
    configureServer(server) {
        server.middlewares.use((request, response, next) => {
            response.setHeader('Content-Security-Policy', "connect-src 'self' ws://127.0.0.1:*; form-action 'self'; object-src 'none'")
            const url = new URL(request.url, origin)
            if (request.method === 'GET' && url.pathname.startsWith('/api/assets/')) return next()
            if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/__walkthrough/')) return next()
            if (request.headers.origin && request.headers.origin !== origin) return json(response, 403, { error: 'Local walkthrough requests only.' })
            void (async () => {
                const actorKey = request.headers.authorization?.replace(/^Bearer /, '')
                const actor = actors[actorKey]
                const coordinator = actorKey === 'walkthrough-coordinator' || simulatedMode === 'full'
                if (unified && url.pathname.startsWith('/__walkthrough/jobs')) {
                    if (!actor) return json(response, 401, {})
                    if (url.pathname === '/__walkthrough/jobs' && request.method === 'GET') {
                        if (!coordinator) return json(response, 403, {})
                        const offset = Number(url.searchParams.get('cursor') || 0)
                        if (!Number.isInteger(offset) || offset < 0) return json(response, 400, {})
                        return json(response, 200, { records: workingJobs.slice(offset, offset + 100), next: offset + 100 < workingJobs.length ? String(offset + 100) : '' })
                    }
                    if (request.method === 'POST') {
                        const body = await bodyOf(request)
                        if (url.pathname === '/__walkthrough/jobs/void') return json(response, 200, unifiedJobs.voidEntry(body, actor))
                        if (url.pathname === '/__walkthrough/jobs/manage') return json(response, 200, unifiedJobs.manage(body, actor, coordinator))
                        if (url.pathname === '/__walkthrough/jobs/lose-response') { loseNextRegistrationResponse = true; return json(response, 200, { armed: true }) }
                    }
                    return json(response, 404, {})
                }
                if (url.pathname === '/__walkthrough/reset' && request.method === 'POST') { await seed(); return json(response, 200, { reset: true }) }
                if (url.pathname === '/__walkthrough/report' && request.method === 'GET') {
                    const records = [...getJobCardStore().entities.values()]
                    return json(response, 200, { evidenceUnchanged: records.every((record) => originals.get(record.reviewId) === evidenceOf(record)), requests, ...(unified ? { workingJobs, ledgers: ledgerRows } : {}), records: records.map((record) => ({ reviewId: record.reviewId, status: record.officeStatus || 'legacyReviewed', activities: JSON.parse(record.officeActivitiesJson) })) })
                }
                if (url.pathname === '/api/addresssearch' && request.method === 'POST') {
                    await bodyOf(request)
                    return json(response, 200, { suggestions: [{ id: 'sample-address', formattedAddress: '1 Sample Road, Sample Town, New Zealand', addressLine1: '1 Sample Road', addressLine2: 'Sample Town, New Zealand', siteName: 'Sample Town', latitude: 0, longitude: 0 }] })
                }
                const review = url.pathname.match(/^\/api\/jobcardreviews(?:\/([^/]+))?(?:\/([^/]+))?$/)
                if (review) {
                    const body = request.method === 'POST' ? await bodyOf(request) : {}
                    if (body.action === 'retryNotification') return json(response, 405, { error: 'Email delivery is disabled in this walkthrough.' })
                    const result = await handleReviewRequest({ method: request.method, headers: request.headers, query: { ...Object.fromEntries(url.searchParams), reviewId: review[1] || '', photoId: review[2] || '' }, body })
                    requests.push({ method: request.method, path: url.pathname, action: body.action, status: result.status })
                    response.writeHead(result.status, result.headers); return response.end(result.body)
                }
                const table = url.pathname.match(/^\/api\/data\/v9\.2\/(\w+)(?:\(([^)]+)\))?$/)
                if (table) {
                    const tables = fixtureTables()
                    if (unified && ['gr_RegisterJobBookJob', 'gr_AllocateJobBookNumber'].includes(table[1]) && request.method === 'POST') {
                        if (!actor) return json(response, 401, {})
                        const result = unifiedJobs.registration(table[1], await bodyOf(request), actor, coordinator)
                        if (loseNextRegistrationResponse) { loseNextRegistrationResponse = false; return json(response, 503, { error: { message: 'Simulated lost acknowledgement after commit.' } }) }
                        return json(response, 200, result)
                    }
                    if (request.method === 'GET') {
                        let rows = tables[table[1]] || []
                        const filter = url.searchParams.get('$filter') || ''
                        const jobId = filter.match(/gr_jobid eq ([\da-f-]+)/i)?.[1]
                        if (jobId) rows = rows.filter((row) => row.gr_jobid === jobId)
                        if (table[1] === 'gr_jobs' && filter.includes('gr_jobnumber ne null')) rows = rows.filter((row) => row.gr_jobnumber)
                        const prefix = filter.match(/startswith\(gr_jobnumber,'([^']+)'\)/)?.[1]
                        if (prefix) rows = rows.filter((row) => row.gr_jobnumber?.startsWith(prefix))
                        const equipmentId = filter.match(/gr_equipmentid eq ([\da-f-]+)/i)?.[1]
                        const customerId = filter.match(/(?:_gr_customer_value|gr_Customer\/gr_customerid) eq ([\da-f-]+)/i)?.[1]
                        if (equipmentId) rows = rows.filter((row) => row.gr_equipmentid === equipmentId)
                        if (table[1] === 'gr_sites' && customerId) rows = rows.filter((row) => row._gr_customer_value === customerId)
                        if (table[1] === 'gr_sitecontacts') {
                            const siteId = filter.match(/_gr_site_value eq ([\da-f-]+)/i)?.[1]
                            const contactId = filter.match(/_gr_contact_value eq ([\da-f-]+)/i)?.[1]
                            if (siteId) rows = rows.filter((row) => row.gr_Site.gr_siteid === siteId)
                            if (contactId) rows = rows.filter((row) => row.gr_Contact.gr_contactid === contactId)
                        }
                        const name = filter.match(/gr_name eq '((?:[^']|'')*)'/)?.[1]?.replaceAll("''", "'")
                        if (name != null) rows = rows.filter((row) => row.gr_name?.toLowerCase() === name.toLowerCase())
                        if (unified && ledgerRows[table[1]]) rows = rows.map((row) => row.gr_RegisteredJob ? { ...row, gr_RegisteredJob: workingJobs.find((job) => job.gr_jobid === row.gr_RegisteredJob.gr_jobid) } : row)
                        if (table[2]) {
                            const row = rows.find((row) => Object.entries(row).some(([key, value]) => /^gr_\w+id$/.test(key) && value === table[2]))
                            return json(response, row ? 200 : 404, row || {})
                        }
                        const offset = Number(url.searchParams.get('$skiptoken') || 0)
                        const size = Math.min(100, Number(url.searchParams.get('$top') || 100))
                        const nextPage = new URL(url); nextPage.searchParams.set('$skiptoken', String(offset + size))
                        return json(response, 200, { value: rows.slice(offset, offset + size), ...(offset + size < rows.length ? { '@odata.nextLink': nextPage.toString() } : {}) })
                    }
                    if (table[1] === 'gr_jobs' && request.method === 'PATCH') {
                        if (!actor) return json(response, 403, {})
                        const targetJob = tables.gr_jobs.find((row) => row.gr_jobid === table[2])
                        if (!targetJob) return json(response, 404, {})
                        if (targetJob.gr_registrationvoid) return json(response, 409, {})
                        if (request.headers['if-match'] !== targetJob['@odata.etag']) return json(response, 412, {})
                        const body = await bodyOf(request)
                        const allowed = ['gr_description', 'gr_ordernumber', 'gr_Equipment@odata.bind', 'gr_Site@odata.bind', 'gr_Contact@odata.bind', 'gr_gtentered', 'gr_timecloudentered', ...(unified && coordinator ? ['gr_Mechanic@odata.bind', 'gr_jobtype', 'gr_status', 'gr_servicetype', 'gr_currentofficeaction', 'gr_officeactionowner', 'gr_officeattentionrequired', 'gr_hourmeter'] : [])]
                        if (Object.keys(body).some((key) => !allowed.includes(key))) return json(response, 403, {})
                        if ('gr_description' in body && (typeof body.gr_description !== 'string' || !body.gr_description.trim())) return json(response, 400, {})
                        for (const marker of ['gr_gtentered', 'gr_timecloudentered']) if (marker in body && typeof body[marker] !== 'boolean') return json(response, 400, {})
                        const changes = { ...body }
                        for (const [field, collection, key, lookup] of [
                            ['gr_Equipment', 'gr_equipments', 'gr_equipmentid', '_gr_equipment_value'],
                            ['gr_Site', 'gr_sites', 'gr_siteid', '_gr_site_value'],
                            ['gr_Contact', 'gr_contacts', 'gr_contactid', '_gr_contact_value'],
                            ['gr_Mechanic', 'gr_mechanics', 'gr_mechanicid', '_gr_mechanic_value'],
                        ]) {
                            const bind = `${field}@odata.bind`
                            if (!(bind in body)) continue
                            const target = body[bind] === null ? null : tables[collection].find((row) => `/${collection}(${row[key]})` === body[bind])
                            if (target === undefined) return json(response, 400, {})
                            changes[field] = target
                            changes[lookup] = target?.[key] ?? null
                            delete changes[bind]
                        }
                        Object.assign(targetJob, changes)
                        if (unified) unifiedJobs.stamp(targetJob, actor)
                        else targetJob['@odata.etag'] = `W/"${Date.now()}"`
                        requests.push({ method: request.method, path: url.pathname, fields: Object.keys(body), status: 200 })
                        return json(response, 200, targetJob)
                    }
                    if (unified && table[1] === 'gr_jobs' && request.method === 'POST') {
                        if (!actor || !coordinator) return json(response, 403, {})
                        const body = await bodyOf(request)
                        if (body.gr_jobnumber || !body.gr_description?.trim() || Object.keys(body).some((key) => !['gr_jobnumber', 'gr_description', 'gr_ordernumber', 'gr_jobtype', 'gr_status', 'gr_servicetype', 'gr_Equipment@odata.bind', 'gr_Site@odata.bind', 'gr_Contact@odata.bind', 'gr_Mechanic@odata.bind'].includes(key))) return json(response, 400, {})
                        const row = { ...body, gr_jobid: randomUUID(), gr_jobnumber: null, createdon: new Date().toISOString(), gr_coordinatormanaged: false, gr_registrationvoid: false, gr_gtentered: false, gr_timecloudentered: false }
                        for (const [field, collection, key] of [['gr_Equipment', 'gr_equipments', 'gr_equipmentid'], ['gr_Site', 'gr_sites', 'gr_siteid'], ['gr_Contact', 'gr_contacts', 'gr_contactid'], ['gr_Mechanic', 'gr_mechanics', 'gr_mechanicid']]) {
                            const bind = `${field}@odata.bind`
                            row[field] = body[bind] ? tables[collection].find((record) => `/${collection}(${record[key]})` === body[bind]) : null
                            if (body[bind] && !row[field]) return json(response, 400, {})
                            delete row[bind]
                        }
                        workingJobs.push(unifiedJobs.stamp(row, actor))
                        return json(response, 201, row)
                    }
                    if (unified && table[1] === 'gr_equipments' && !table[2] && request.method === 'POST') {
                        const body = await bodyOf(request)
                        if (!actor || (!body.gr_fleet?.trim() && !body.gr_serial?.trim()) || Object.keys(body).some((key) => !['gr_fleet', 'gr_alternatefleetnumbers', 'gr_serial', 'gr_make', 'gr_model'].includes(key))) return json(response, 400, {})
                        const row = { ...body, gr_equipmentid: randomUUID(), statecode: 0, gr_Site: null, '@odata.etag': 'W/"1"' }
                        createdEquipment.push(row)
                        return json(response, 201, row)
                    }
                    if (table[1] === 'gr_customers' && !table[2] && request.method === 'POST') {
                        const body = await bodyOf(request)
                        if (Object.keys(body).some((key) => key !== 'gr_name') || !body.gr_name?.trim()) return json(response, 400, {})
                        const row = { gr_customerid: id(2000 + createdCustomers.length), gr_name: body.gr_name.trim(), statecode: 0 }
                        createdCustomers.push(row)
                        requests.push({ method: request.method, path: url.pathname, status: 201 })
                        return json(response, 201, row)
                    }
                    if (table[1] === 'gr_sites' && !table[2] && request.method === 'POST') {
                        const body = await bodyOf(request)
                        const parent = tables.gr_customers.find((row) => `/gr_customers(${row.gr_customerid})` === body['gr_Customer@odata.bind'])
                        if (!parent || !body.gr_name?.trim() || Object.keys(body).some((key) => !['gr_name', 'gr_address', 'gr_Customer@odata.bind'].includes(key))) return json(response, 400, {})
                        const row = { gr_siteid: id(3000 + createdSites.length), gr_name: body.gr_name.trim(), gr_address: body.gr_address || '', _gr_customer_value: parent.gr_customerid, gr_Customer: parent, statecode: 0 }
                        createdSites.push(row)
                        requests.push({ method: request.method, path: url.pathname, status: 201 })
                        return json(response, 201, row)
                    }
                    if (table[1] === 'gr_equipments' && request.method === 'PATCH') {
                        const row = tables.gr_equipments.find((item) => item.gr_equipmentid === table[2])
                        if (!row) return json(response, 404, {})
                        if (request.headers['if-match'] !== row['@odata.etag']) return json(response, 412, {})
                        const body = await bodyOf(request)
                        if (Object.keys(body).length !== 1 || !body['gr_Site@odata.bind']) return json(response, 403, {})
                        const target = tables.gr_sites.find((item) => `/gr_sites(${item.gr_siteid})` === body['gr_Site@odata.bind'])
                        if (!target) return json(response, 400, {})
                        // Replace the fixture object, preserving Job/Quote snapshots referencing the old one.
                        const next = { ...row, gr_Site: target, _gr_site_value: target.gr_siteid, '@odata.etag': `W/"equipment-${Date.now()}"` }
                        if (row === equipment) equipment = next
                        else if (row === unlinkedEquipment) unlinkedEquipment = next
                        else createdEquipment.splice(createdEquipment.indexOf(row), 1, next)
                        requests.push({ method: request.method, path: url.pathname, status: 204 })
                        response.writeHead(204); return response.end()
                    }
                    // Only synthetic Intake markers and Intake entries may be changed here.
                    if (ledgerRows[table[1]] && ['PATCH', 'POST'].includes(request.method)) {
                        const body = await bodyOf(request)
                        if (unified && request.method === 'POST') return json(response, 403, { error: 'Use the registration action for new sample entries.' })
                        const row = table[2] ? intakeRows.find((item) => item.gr_jobbookentryid === table[2]) : { ...intake, gr_voidreason: null, gr_jobbookentryid: id(402 + intakeRows.length), gr_jobnumber: String(900010 + intakeRows.length) }
                        if (!row) return json(response, 404, { error: 'Sample Intake entry not found.' })
                        if (row.gr_RegisteredJob) return json(response, 403, { error: 'Registered allocation snapshots are immutable.' })
                        if (request.method === 'PATCH') {
                            if (request.headers['if-match'] !== row['@odata.etag']) return json(response, 412, {})
                            if (row.gr_stage === 122830003) return json(response, 409, { error: 'Void entries are read-only.' })
                            if (body.gr_stage === 122830003 && (row.gr_stage !== 122830000 || row.gr_PromotedJob || row.gr_entered || row.gr_timecloudentered || !body.gr_voidreason?.trim() || body.gr_voidreason.length > 1000)) return json(response, 409, { error: 'This entry cannot be voided.' })
                        }
                        Object.assign(row, body, { '@odata.etag': `W/"sample-${Date.now()}"` })
                        if (!table[2]) intakeRows.push(row)
                        requests.push({ method: request.method, path: url.pathname, status: 200 }); return json(response, 200, row)
                    }
                }
                requests.push({ method: request.method, path: url.pathname, status: 403 })
                json(response, 403, { error: 'This operation is unavailable in the local walkthrough.' })
            })().catch((error) => { console.error('Local fixture request failed:', error.message); json(response, error.status || 500, { error: { message: error.status ? error.message : 'Local fixture request failed.' } }) })
        })
    },
}
const server = await createServer({
    root, configFile: false, envDir: false, cacheDir: `node_modules/.vite-job-card-walkthrough-${port}`, plugins: [plugin, react()],
    resolve: { alias: { '@azure/msal-react': fileURLToPath(new URL('./jobCardWalkthroughAuth.mjs', import.meta.url)) } },
    define: {
        'import.meta.env.VITE_DATAVERSE_URL': JSON.stringify(origin),
        'import.meta.env.VITE_APPLICATION_ACCESS_CONTROL_ENABLED': '"true"',
        'import.meta.env.VITE_SIMULATED_ACCESS_MODE': JSON.stringify(unified ? '' : simulatedMode),
        'import.meta.env.VITE_UNIFIED_JOB_WALKTHROUGH': JSON.stringify(unified ? 'true' : 'false'),
        'import.meta.env.VITE_UNIFIED_JOB_REGISTRATION_ENABLED': JSON.stringify(unified ? 'true' : 'false'),
        'import.meta.env.VITE_REGIONAL_JOB_BOOKS_ENABLED': JSON.stringify(unified ? 'true' : 'false'),
        'import.meta.env.VITE_REGIONAL_JOB_BOOK_ALLOCATION_ENABLED': JSON.stringify(unified ? 'true' : 'false'),
        'import.meta.env.VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED': '"true"',
        'import.meta.env.VITE_JOB_CARD_READ_ONLY': '"false"',
        'import.meta.env.VITE_EQUIPMENT_REALTIME_API_URL': '""',
    },
    server: { host: '127.0.0.1', port, strictPort: true },
})
await server.listen()
console.log(`Local sample-only walkthrough ready: ${origin}/job-card-reviews`)
