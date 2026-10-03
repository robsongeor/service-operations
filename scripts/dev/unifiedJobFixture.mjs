// SAMPLE-ONLY simulation of the proposed contract. No SDK, network or production import.
import { createHash } from 'node:crypto'

export const fixtureBooks = {
    auckland: ['gr_jobbookentries', 'gr_jobbookentryid', '', 910000],
    waikato: ['gr_waikatojobbookentries', 'gr_waikatojobbookentryid', 'WJ', 910000],
    hastings: ['gr_hastingsjobbookentries', 'gr_hastingsjobbookentryid', 'HJ', 910000],
    christchurch: ['gr_christchurchjobbookentries', 'gr_christchurchjobbookentryid', 'CJ', 910000],
}
const guid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const fail = (code, status = 400) => { throw Object.assign(new Error(`[JOB_REGISTRATION_${code}] Sample workflow rejected.`), { status }) }
const version = (row) => row?.['@odata.etag']?.match(/^W\/"(\d+)"$/)?.[1]
const fields = (body, allowed) => { if (Object.keys(body).some((key) => !allowed.includes(key))) fail('INVALID') }
const required = (value, max = 4000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) fail('INVALID'); return value.trim() }

export function createUnifiedJobFixture({ jobs, ledgers, tables }) {
    let revision = 1000
    const sequences = Object.fromEntries(Object.entries(fixtureBooks).map(([book, config]) => [book, config[3]]))
    const stamp = (row, actor) => Object.assign(row, { '@odata.etag': `W/"${++revision}"`, modifiedon: new Date().toISOString(), modifiedby: { systemuserid: actor.userId, fullname: actor.displayName } })
    const find = (collection, key, id) => {
        const row = tables()[collection]?.find((record) => record[key] === id && record.statecode !== 1)
        if (!row) fail('NOT_FOUND')
        return row
    }
    const relations = (body) => {
        const site = find('gr_sites', 'gr_siteid', body.SiteId)
        if (!site.gr_Customer || !site.gr_address?.trim()) fail('INVALID')
        const customer = find('gr_customers', 'gr_customerid', site.gr_Customer.gr_customerid)
        const equipment = body.EquipmentId ? find('gr_equipments', 'gr_equipmentid', body.EquipmentId) : null
        const mechanic = body.MechanicId ? find('gr_mechanics', 'gr_mechanicid', body.MechanicId) : null
        if (mechanic?.gr_jobassignmentenabled === false) fail('INVALID')
        const contact = body.ContactId ? find('gr_contacts', 'gr_contactid', body.ContactId) : null
        if (contact && !tables().gr_sitecontacts.some((link) => link.gr_Site?.gr_siteid === site.gr_siteid && link.gr_Contact?.gr_contactid === contact.gr_contactid)) fail('INVALID')
        return { site, customer, equipment, mechanic, contact }
    }
    function registration(action, body, actor, coordinator) {
        const allocate = action === 'gr_AllocateJobBookNumber'
        if (!allocate && action !== 'gr_RegisterJobBookJob') fail('INVALID')
        if (allocate && !coordinator) fail('FORBIDDEN', 403)
        fields(body, allocate ? ['RequestId', 'Book', 'JobId', 'ExpectedRowVersion'] : ['RequestId', 'Book', 'Description', 'OrderNumber', 'SiteId', 'EquipmentUnknown', 'EquipmentId', 'ContactId', 'MechanicId'])
        if (!guid.test(body.RequestId) || !Object.hasOwn(fixtureBooks, body.Book)) fail('INVALID')
        const [collection, key, prefix] = fixtureBooks[body.Book]
        const fingerprint = createHash('sha256').update(JSON.stringify([actor.userId, action, Object.entries(body).sort(([a], [b]) => a.localeCompare(b))])).digest('hex')
        const existingLedger = Object.values(ledgers).flat().find((row) => Object.entries(row).some(([name, value]) => name.endsWith('jobbookentryid') && value === body.RequestId))
        if (existingLedger) {
            if (!ledgers[collection].includes(existingLedger) || existingLedger.gr_registrationfingerprint !== fingerprint) fail('REQUEST_REUSED', 409)
            const existingJob = jobs.find((row) => row.gr_jobid === existingLedger.gr_RegisteredJob?.gr_jobid)
            if (!existingJob || existingJob.gr_jobnumber !== existingLedger.gr_jobnumber) fail('INCONSISTENT')
            return result(existingJob, body, true)
        }
        let job
        if (allocate) {
            job = jobs.find((row) => row.gr_jobid === body.JobId)
            if (!job) fail('NOT_FOUND')
            if (job.gr_jobnumber?.trim()) fail('ALREADY_NUMBERED', 409)
            if (version(job) !== body.ExpectedRowVersion) fail('CONFLICT', 412)
            if ([122830003, 122830004].includes(job.gr_jobtype)) fail('SPECIALIST')
        } else {
            if (typeof body.EquipmentUnknown !== 'boolean' || body.EquipmentUnknown === Boolean(body.EquipmentId)) fail('INVALID')
            if (jobs.some((row) => row.gr_jobid === body.RequestId)) fail('REQUEST_REUSED', 409)
            const related = relations(body)
            job = { gr_jobid: body.RequestId, gr_jobnumber: null, gr_description: required(body.Description), gr_ordernumber: body.OrderNumber ? required(body.OrderNumber, 100) : null,
                gr_Equipment: related.equipment, gr_Site: related.site, gr_Mechanic: related.mechanic, gr_Contact: related.contact,
                gr_status: related.mechanic ? 122830000 : 122830001, gr_coordinatormanaged: false, gr_registrationvoid: false,
                gr_gtentered: false, gr_timecloudentered: false, createdon: new Date().toISOString(), createdby: { systemuserid: actor.userId, fullname: actor.displayName } }
        }
        const related = relations({ SiteId: job.gr_Site?.gr_siteid, EquipmentId: job.gr_Equipment?.gr_equipmentid, MechanicId: job.gr_Mechanic?.gr_mechanicid, ContactId: job.gr_Contact?.gr_contactid })
        // This arithmetic is solely the synthetic server's fake AutoNumber. Neither
        // browser nor production allocator calculates numbers; these are NOT migration seeds.
        const number = `${prefix}${++sequences[body.Book]}`
        if (jobs.some((row) => row.gr_jobnumber === number)) fail('INCONSISTENT')
        const ledger = { [key]: body.RequestId, gr_jobnumber: number, gr_stage: 122830004, gr_RegisteredJob: { gr_jobid: job.gr_jobid }, gr_registrationfingerprint: fingerprint,
            gr_description: job.gr_description, gr_customerpo: job.gr_ordernumber, gr_Customer: related.customer, gr_Site: related.site, gr_Equipment: related.equipment, gr_Mechanic: related.mechanic, gr_Contact: related.contact,
            gr_customersnapshot: related.customer.gr_name, gr_sitesnapshot: related.site.gr_name, gr_addresssnapshot: related.site.gr_address,
            gr_fleetsnapshot: related.equipment?.gr_fleet, gr_serialsnapshot: related.equipment?.gr_serial, gr_makesnapshot: related.equipment?.gr_make, gr_modelsnapshot: related.equipment?.gr_model,
            gr_entered: job.gr_gtentered === true, gr_timecloudentered: job.gr_timecloudentered === true, gr_equipmentreviewrequired: !related.equipment, createdon: new Date().toISOString(), createdby: { systemuserid: actor.userId, fullname: actor.displayName } }
        // All validations precede this synchronous commit. The real server transaction
        // and rollback behavior are tested separately against the compiled plugin source.
        stamp(job, actor)
        job.gr_jobnumber = number
        if (!allocate) jobs.push(job)
        ledgers[collection].push(stamp(ledger, actor))
        return result(job, body, false)
    }
    function result(job, body, replay) {
        return { JobId: job.gr_jobid, LedgerId: body.RequestId, Book: body.Book, JobNumber: job.gr_jobnumber, JobRowVersion: version(job), WasReplay: replay }
    }
    function voidEntry(body, actor) {
        fields(body, ['book', 'ledgerId', 'jobId', 'jobEtag', 'ledgerEtag', 'reason'])
        const config = fixtureBooks[body.book]
        const ledger = config && ledgers[config[0]].find((row) => row[config[1]] === body.ledgerId)
        const job = jobs.find((row) => row.gr_jobid === body.jobId)
        if (!ledger || !job || ledger.gr_RegisteredJob?.gr_jobid !== job.gr_jobid) fail('NOT_FOUND')
        const reason = required(body.reason, 1000)
        if (job.gr_registrationvoid && ledger.gr_stage === 122830003 && ledger.gr_voidreason === reason) return { job, ledger }
        if (job['@odata.etag'] !== body.jobEtag || ledger['@odata.etag'] !== body.ledgerEtag) fail('CONFLICT', 412)
        if (job.gr_gtentered !== false || job.gr_timecloudentered !== false || job.gr_coordinatormanaged !== false || ledger.gr_stage !== 122830004 || job.gr_registrationvoid) fail('INVALID')
        Object.assign(job, { gr_registrationvoid: true, gr_registrationvoidreason: reason })
        Object.assign(ledger, { gr_stage: 122830003, gr_voidreason: reason })
        stamp(job, actor); stamp(ledger, actor)
        return { job, ledger }
    }
    function manage(body, actor, coordinator) {
        if (!coordinator) fail('FORBIDDEN', 403)
        fields(body, ['jobId', 'etag'])
        const job = jobs.find((row) => row.gr_jobid === body.jobId)
        if (!job) fail('NOT_FOUND')
        if (job.gr_registrationvoid) fail('INVALID')
        if (job.gr_coordinatormanaged === true) return job
        if (job['@odata.etag'] !== body.etag) fail('CONFLICT', 412)
        stamp(job, actor)
        job.gr_coordinatormanaged = true
        return job
    }
    return { registration, voidEntry, manage, stamp }
}
