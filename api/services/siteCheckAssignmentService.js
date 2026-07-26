const { createHash, randomBytes } = require('node:crypto')
const { persistPhotos } = require('./jobSubmissionService')

const IN_PROGRESS = 122830000
const JOB_CARD_SUBMITTED = 122830002
const RESPONSE_PASS_FAIL_NA = 122830000
const RESPONSE_NUMBER = 122830002
const ANSWER_PASS = 122830000
const ANSWER_FAIL = 122830001
const ANSWER_NOT_APPLICABLE = 122830002
const CHOICE_ANSWERS = new Set([ANSWER_PASS, ANSWER_FAIL, ANSWER_NOT_APPLICABLE])
const MAX_PHOTOS = 20
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
const DEFAULT_EXPIRY_HOURS = 168

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
        body: JSON.stringify(body),
    }
}

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function dataverseOrigin() {
    try {
        const url = new URL((process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim())
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

const hashToken = (token) => createHash('sha256').update(token, 'utf8').digest('hex')
const generateToken = () => randomBytes(32).toString('base64url')
const validGuid = (value) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const validEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const escapeOData = (value) => value.replaceAll("'", "''")

async function applicationToken() {
    const tenantId = process.env.DATAVERSE_TENANT_ID
    const clientId = process.env.DATAVERSE_CLIENT_ID
    const clientSecret = process.env.DATAVERSE_CLIENT_SECRET
    const origin = dataverseOrigin()
    if (!tenantId || !clientId || !clientSecret || !origin) throw new Error('Server identity is unavailable.')
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: `${origin}/.default`,
        }),
    })
    if (!response.ok) throw new Error('Server identity could not be authenticated.')
    const body = await response.json()
    if (typeof body.access_token !== 'string') throw new Error('Server identity response was invalid.')
    return body.access_token
}

async function validateAuthenticatedUser(request) {
    const authorization = requestHeader(request, 'authorization')
    if (!/^Bearer\s+\S+$/i.test(authorization) || !dataverseOrigin()) return null
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/WhoAmI`, {
        headers: { Authorization: authorization, Accept: 'application/json' },
    })
    if (!response.ok) return null
    const identity = await response.json()
    return typeof identity.UserId === 'string' && identity.UserId ? authorization : null
}

function unavailable(code = 'unavailable') {
    const message = code === 'expired'
        ? 'This Site Check assignment link has expired.'
        : code === 'revoked'
            ? 'This Site Check assignment link has been replaced or revoked.'
            : code === 'complete'
                ? 'This Site Check is complete.'
                : 'This Site Check assignment link is unavailable.'
    return jsonResponse(code === 'unavailable' ? 404 : 410, { code, error: message })
}

async function readOccurrence(siteCheckId, bearer) {
    const select = [
        'gr_sitecheckid', 'gr_name', 'gr_status', 'gr_startedon', 'gr_frequencysnapshot',
        'gr_duedatesnapshot', 'gr_expectedjobcount', '_gr_assignedtechnician_value',
    ].join(',')
    const expand = [
        'gr_AssignedTechnician($select=gr_mechanicid,gr_name,gr_email,statecode)',
        'gr_Site($select=gr_name;$expand=gr_Customer($select=gr_name))',
    ].join(',')
    const response = await fetch(
        `${dataverseOrigin()}/api/data/v9.2/gr_sitechecks(${siteCheckId})?$select=${select}&$expand=${expand}`,
        { headers: { Authorization: bearer, Accept: 'application/json' } },
    )
    if (!response.ok) return null
    return { occurrence: await response.json(), etag: response.headers.get('etag') }
}

async function readJobs(siteCheckId, bearer) {
    const select = [
        'gr_jobid', 'gr_jobnumber', 'gr_description', 'gr_status', 'gr_jobcardstatus',
        '_gr_mechanic_value', '_gr_sitecheck_value',
    ].join(',')
    const expand = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial)'
    const response = await fetch(
        `${dataverseOrigin()}/api/data/v9.2/gr_jobs?$select=${select}&$expand=${expand}`
        + `&$filter=_gr_sitecheck_value eq ${siteCheckId}&$orderby=createdon asc`,
        { headers: { Authorization: bearer, Accept: 'application/json' } },
    )
    if (!response.ok) throw new Error('Site Check Job lookup failed.')
    const body = await response.json()
    return Array.isArray(body.value) ? body.value : []
}

async function readSnapshots(siteCheckId, bearer) {
    const select = [
        'gr_sitecheckchecklistsnapshotitemid', 'gr_name', '_gr_sitecheck_value',
        '_gr_job_value', 'gr_itemkey', 'gr_groupname', 'gr_prompt', 'gr_responsetype',
        'gr_displayorder', 'gr_required', 'gr_commentrequiredonnegative',
        'gr_photorequiredonnegative',
    ].join(',')
    const response = await fetch(
        `${dataverseOrigin()}/api/data/v9.2/gr_sitecheckchecklistsnapshotitems?$select=${select}`
        + `&$filter=_gr_sitecheck_value eq ${siteCheckId}`
        + '&$orderby=gr_displayorder asc,gr_itemkey asc',
        { headers: { Authorization: bearer, Accept: 'application/json' } },
    )
    if (!response.ok) throw new Error('Site Check checklist lookup failed.')
    const body = await response.json()
    return Array.isArray(body.value) ? body.value : []
}

function validateDispatch(occurrence, jobs) {
    if (occurrence.gr_status !== IN_PROGRESS) return 'Only an in-progress Site Check can be sent.'
    const technician = occurrence.gr_AssignedTechnician
    if (!technician || technician.statecode === 1 || !validEmail(technician.gr_email)) {
        return 'The assigned active technician needs a valid email address.'
    }
    if (!Number.isSafeInteger(occurrence.gr_expectedjobcount)
        || occurrence.gr_expectedjobcount < 1
        || jobs.length !== occurrence.gr_expectedjobcount) {
        return 'Generated Job integrity does not match the Site Check.'
    }
    if (jobs.some((job) => !/^\d+$/.test(String(job.gr_jobnumber || '').trim()))) {
        return 'Every generated Job needs a numeric Job Number before this Site Check can be sent.'
    }
    const technicianId = String(technician.gr_mechanicid).toLowerCase()
    if (jobs.some((job) => String(job._gr_mechanic_value || '').toLowerCase() !== technicianId)) {
        return 'Every generated Job must still be assigned to the Site Check technician.'
    }
    return ''
}

async function generate(request) {
    const bearer = await validateAuthenticatedUser(request)
    if (!bearer) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    const siteCheckId = typeof request.body?.siteCheckId === 'string' ? request.body.siteCheckId.trim() : ''
    if (!validGuid(siteCheckId)) return jsonResponse(400, { error: 'A valid Site Check is required.' })
    const context = await readOccurrence(siteCheckId, bearer)
    if (!context) return unavailable()
    const jobs = await readJobs(siteCheckId, bearer)
    const validation = validateDispatch(context.occurrence, jobs)
    if (validation) return jsonResponse(409, { error: validation })

    const hours = Number.isInteger(request.body?.expiresInHours)
        ? Math.min(Math.max(request.body.expiresInHours, 1), 720)
        : DEFAULT_EXPIRY_HOURS
    const token = generateToken()
    const now = new Date()
    const expires = new Date(now.getTime() + hours * 60 * 60 * 1000)
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_sitechecks(${siteCheckId})`, {
        method: 'PATCH',
        headers: {
            Authorization: bearer,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(context.etag ? { 'If-Match': context.etag } : {}),
        },
        body: JSON.stringify({
            gr_sitechecktechnicianaccesstokenhash: hashToken(token),
            gr_sitechecktechnicianaccesstokencreatedon: now.toISOString(),
            gr_sitechecktechnicianaccesstokenexpireson: expires.toISOString(),
            gr_sitechecktechnicianaccesstokenrevokedon: null,
        }),
    })
    if (response.status === 412) return jsonResponse(409, { error: 'The Site Check changed. Reload it and try again.' })
    if (!response.ok) return jsonResponse(response.status === 404 ? 404 : 502, { error: 'The assignment link could not be created.' })
    return jsonResponse(201, {
        path: `/portal/site-check/${token}`,
        expiresOn: expires.toISOString(),
        recipientEmail: context.occurrence.gr_AssignedTechnician.gr_email.trim(),
        recipientName: context.occurrence.gr_AssignedTechnician.gr_name,
    })
}

async function revoke(request) {
    const bearer = await validateAuthenticatedUser(request)
    if (!bearer) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    const siteCheckId = typeof request.body?.siteCheckId === 'string' ? request.body.siteCheckId.trim() : ''
    if (!validGuid(siteCheckId)) return jsonResponse(400, { error: 'A valid Site Check is required.' })
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_sitechecks(${siteCheckId})`, {
        method: 'PATCH',
        headers: { Authorization: bearer, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            gr_sitechecktechnicianaccesstokenhash: null,
            gr_sitechecktechnicianaccesstokenexpireson: null,
            gr_sitechecktechnicianaccesstokenrevokedon: new Date().toISOString(),
        }),
    })
    if (!response.ok) return jsonResponse(response.status === 404 ? 404 : 502, { error: 'The assignment link could not be revoked.' })
    return jsonResponse(200, { revoked: true })
}

async function findOccurrence(token, bearer) {
    if (typeof token !== 'string' || token.length < 40 || token.length > 100) return { error: unavailable() }
    const hash = hashToken(token)
    const response = await fetch(
        `${dataverseOrigin()}/api/data/v9.2/gr_sitechecks?`
        + '$select=gr_sitecheckid,gr_name,gr_status,gr_startedon,gr_frequencysnapshot,gr_duedatesnapshot,gr_expectedjobcount,'
        + 'gr_sitechecktechnicianaccesstokenexpireson,gr_sitechecktechnicianaccesstokenrevokedon,_gr_assignedtechnician_value'
        + '&$expand=gr_Site($select=gr_name;$expand=gr_Customer($select=gr_name))'
        + `&$filter=gr_sitechecktechnicianaccesstokenhash eq '${escapeOData(hash)}'&$top=2`,
        { headers: { Authorization: bearer, Accept: 'application/json' } },
    )
    if (!response.ok) throw new Error('Site Check assignment lookup failed.')
    const body = await response.json()
    if (!Array.isArray(body.value) || body.value.length !== 1) return { error: unavailable() }
    const occurrence = body.value[0]
    if (occurrence.gr_sitechecktechnicianaccesstokenrevokedon) return { error: unavailable('revoked') }
    const expires = Date.parse(occurrence.gr_sitechecktechnicianaccesstokenexpireson)
    if (!Number.isFinite(expires) || expires <= Date.now()) return { error: unavailable('expired') }
    if (occurrence.gr_status !== IN_PROGRESS) return { error: unavailable('complete') }
    return { occurrence }
}

function publicProjection(occurrence, jobs, snapshots = []) {
    const technicianId = String(occurrence._gr_assignedtechnician_value || '').toLowerCase()
    const accessibleJobs = jobs.filter((job) =>
        String(job._gr_mechanic_value || '').toLowerCase() === technicianId)
    const accessibleJobIds = new Set(
        accessibleJobs.map((job) => String(job.gr_jobid).toLowerCase()),
    )
    const accessibleSnapshots = snapshots.filter((item) =>
        accessibleJobIds.has(String(item._gr_job_value || '').toLowerCase()))
    return {
        siteCheckName: occurrence.gr_name,
        customerName: occurrence.gr_Site?.gr_Customer?.gr_name,
        siteName: occurrence.gr_Site?.gr_name,
        frequency: occurrence.gr_frequencysnapshot,
        dueDate: occurrence.gr_duedatesnapshot,
        startedOn: occurrence.gr_startedon,
        expectedJobCount: occurrence.gr_expectedjobcount,
        jobs: accessibleJobs.map((job) => ({
            jobId: job.gr_jobid,
            jobNumber: job.gr_jobnumber,
            description: job.gr_description || undefined,
            jobStatus: job.gr_status,
            jobCardStatus: job.gr_jobcardstatus,
            equipment: job.gr_Equipment ? {
                id: job.gr_Equipment.gr_equipmentid,
                fleet: job.gr_Equipment.gr_fleet || undefined,
                make: job.gr_Equipment.gr_make || undefined,
                model: job.gr_Equipment.gr_model || undefined,
                serial: job.gr_Equipment.gr_serial || undefined,
            } : undefined,
            checklist: accessibleSnapshots
                .filter((item) =>
                    String(item._gr_job_value).toLowerCase()
                    === String(job.gr_jobid).toLowerCase())
                .map((item) => ({
                    snapshotItemId: item.gr_sitecheckchecklistsnapshotitemid,
                    itemKey: item.gr_itemkey,
                    groupName: item.gr_groupname,
                    prompt: item.gr_prompt,
                    responseType: item.gr_responsetype,
                    displayOrder: item.gr_displayorder,
                    required: Boolean(item.gr_required),
                    commentRequiredOnNegative: Boolean(item.gr_commentrequiredonnegative),
                    photoRequiredOnNegative: Boolean(item.gr_photorequiredonnegative),
                })),
        })),
    }
}

function validateChecklistSubmission(job, snapshots, body) {
    if (job.gr_jobcardstatus === JOB_CARD_SUBMITTED) {
        return 'This machine Job Card has already been submitted.'
    }
    const story = typeof body?.story === 'string' ? body.story.trim() : ''
    if (!story || story.length > 10000) return 'Enter the work completed or Job Card story.'
    if (!Array.isArray(body.timeEntries) || body.timeEntries.length > 50) {
        return 'Time entries are invalid.'
    }
    for (const entry of body.timeEntries) {
        if (!entry || typeof entry.date !== 'string'
            || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
            || !Number.isFinite(Date.parse(`${entry.date}T00:00:00Z`))
            || typeof entry.hours !== 'number' || !Number.isFinite(entry.hours)
            || entry.hours < 0 || entry.hours > 24
            || !Number.isSafeInteger(entry.kilometres) || entry.kilometres < 0) {
            return 'Check each time entry. Hours must be between 0 and 24 and kilometres must be a whole number.'
        }
    }
    if (!Array.isArray(body.parts) || body.parts.length > 100
        || body.parts.some((part) =>
            typeof part !== 'string' || !part.trim() || part.trim().length > 500)) {
        return 'Parts are invalid.'
    }
    if (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS) {
        return 'A maximum of 20 photos may be attached.'
    }
    for (const photo of body.photos) {
        if (!photo || typeof photo.fileName !== 'string' || !photo.fileName.trim()
            || photo.fileName.length > 255
            || typeof photo.mimeType !== 'string'
            || !PHOTO_TYPES.has(photo.mimeType.toLowerCase())
            || !Number.isSafeInteger(photo.size) || photo.size < 1
            || photo.size > MAX_PHOTO_BYTES
            || typeof photo.data !== 'string'
            || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) {
            return 'One or more photos are invalid.'
        }
        const bytes = Buffer.from(photo.data, 'base64')
        if (bytes.length !== photo.size || bytes.length > MAX_PHOTO_BYTES) {
            return 'One or more photos are invalid.'
        }
    }
    if (!Array.isArray(body?.responses) || body.responses.length !== snapshots.length) {
        return 'Answer every checklist item.'
    }
    const byId = new Map()
    for (const response of body.responses) {
        const id = String(response?.snapshotItemId || '').toLowerCase()
        if (!validGuid(id) || byId.has(id)) return 'Checklist responses are invalid.'
        byId.set(id, response)
    }
    for (const item of snapshots) {
        const response = byId.get(String(item.gr_sitecheckchecklistsnapshotitemid).toLowerCase())
        if (!response) return 'Answer every checklist item.'
        const comment = typeof response.comment === 'string' ? response.comment.trim() : ''
        if (comment.length > 10000) return 'A checklist comment is too long.'
        if (item.gr_responsetype === RESPONSE_NUMBER) {
            if (typeof response.numericAnswer !== 'number'
                || !Number.isFinite(response.numericAnswer)
                || response.numericAnswer < 0
                || response.choiceAnswer != null) {
                return 'Enter a valid non-negative service meter reading.'
            }
        } else if (item.gr_responsetype === RESPONSE_PASS_FAIL_NA) {
            if (!CHOICE_ANSWERS.has(response.choiceAnswer) || response.numericAnswer != null) {
                return 'Select Pass, Fail, or Not applicable for every inspection item.'
            }
            if (response.choiceAnswer === ANSWER_FAIL
                && item.gr_commentrequiredonnegative
                && !comment) {
                return 'Add a comment for every failed inspection item.'
            }
        } else {
            return 'This checklist contains an unsupported response type.'
        }
    }
    return ''
}

function checklistSubmissionBatch(
    job,
    snapshots,
    responses,
    technicianId,
    story,
    now,
    timeEntries = [],
    parts = [],
) {
    const boundary = `batch_${randomBytes(12).toString('hex')}`
    const changeset = `changeset_${randomBytes(12).toString('hex')}`
    const byId = new Map(responses.map((response) => [
        String(response.snapshotItemId).toLowerCase(),
        response,
    ]))
    const requests = snapshots.map((item, index) => {
        const response = byId.get(String(item.gr_sitecheckchecklistsnapshotitemid).toLowerCase())
        const fields = {
            gr_name: `${job.gr_jobnumber || 'Job'} - ${item.gr_itemkey}`,
            'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
            'gr_SnapshotItem@odata.bind':
                `/gr_sitecheckchecklistsnapshotitems(${item.gr_sitecheckchecklistsnapshotitemid})`,
            'gr_Technician@odata.bind': `/gr_mechanics(${technicianId})`,
            gr_submittedon: now,
            ...(response.choiceAnswer == null ? {} : { gr_choiceanswer: response.choiceAnswer }),
            ...(response.numericAnswer == null ? {} : { gr_numericanswer: response.numericAnswer }),
            ...(typeof response.comment === 'string' && response.comment.trim()
                ? { gr_comment: response.comment.trim() }
                : {}),
        }
        return [
            `--${changeset}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${index + 1}`,
            '',
            'POST gr_sitecheckchecklistresponses HTTP/1.1',
            'Content-Type: application/json;type=entry',
            '',
            JSON.stringify(fields),
        ].join('\r\n')
    })
    for (const [index, entry] of timeEntries.entries()) {
        requests.push([
            `--${changeset}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${requests.length + 1}`,
            '',
            'POST gr_jobcardsubmissiontimeentries HTTP/1.1',
            'Content-Type: application/json;type=entry',
            '',
            JSON.stringify({
                gr_name: `${job.gr_jobnumber || 'Job'} - ${entry.date}`,
                'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
                gr_entrydate: entry.date,
                gr_totalhours: entry.hours,
                gr_kilometres: entry.kilometres,
                gr_displayorder: index,
            }),
        ].join('\r\n'))
    }
    for (const [index, part] of parts.entries()) {
        requests.push([
            `--${changeset}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${requests.length + 1}`,
            '',
            'POST gr_jobmaterials HTTP/1.1',
            'Content-Type: application/json;type=entry',
            '',
            JSON.stringify({
                gr_name: part.trim(),
                'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
                gr_material: part.trim(),
                gr_displayorder: index,
            }),
        ].join('\r\n'))
    }
    requests.push([
        `--${changeset}`,
        'Content-Type: application/http',
        'Content-Transfer-Encoding: binary',
        `Content-ID: ${requests.length + 1}`,
        '',
        `PATCH gr_jobs(${job.gr_jobid}) HTTP/1.1`,
        'Content-Type: application/json;type=entry',
        `If-Match: ${job['@odata.etag']}`,
        '',
        JSON.stringify({
            gr_techniciansubmissionstory: story.trim(),
            gr_techniciansubmissionsubmittedon: now,
            gr_jobcardstatus: JOB_CARD_SUBMITTED,
            gr_jobcardsubmittedon: now,
        }),
    ].join('\r\n'))
    return {
        boundary,
        operationCount: requests.length,
        payload: [
            `--${boundary}`,
            `Content-Type: multipart/mixed;boundary=${changeset}`,
            '',
            ...requests,
            `--${changeset}--`,
            `--${boundary}--`,
            '',
        ].join('\r\n'),
    }
}

async function submitJob(request) {
    const bearer = `Bearer ${await applicationToken()}`
    const found = await findOccurrence(request.body?.token, bearer)
    if (found.error) return found.error
    const jobId = typeof request.body?.jobId === 'string'
        ? request.body.jobId.trim().toLowerCase()
        : ''
    if (!validGuid(jobId)) return jsonResponse(400, { error: 'A valid machine Job is required.' })
    const [jobs, allSnapshots] = await Promise.all([
        readJobs(found.occurrence.gr_sitecheckid, bearer),
        readSnapshots(found.occurrence.gr_sitecheckid, bearer),
    ])
    const technicianId = String(found.occurrence._gr_assignedtechnician_value || '').toLowerCase()
    const job = jobs.find((candidate) =>
        String(candidate.gr_jobid).toLowerCase() === jobId
        && String(candidate._gr_mechanic_value || '').toLowerCase() === technicianId)
    if (!job) return jsonResponse(404, { error: 'This machine Job is not part of your assignment.' })
    const snapshots = allSnapshots.filter((item) =>
        String(item._gr_job_value || '').toLowerCase() === jobId)
    if (!snapshots.length) return jsonResponse(409, { error: 'This machine checklist is unavailable.' })
    const validation = validateChecklistSubmission(job, snapshots, request.body)
    if (validation) return jsonResponse(400, { error: validation })

    const now = new Date().toISOString()
    if (request.body.photos.length > 0) {
        await persistPhotos(
            `${request.body.token}:${jobId}`,
            job,
            request.body.photos,
            bearer,
            now,
        )
    }
    const batch = checklistSubmissionBatch(
        job,
        snapshots,
        request.body.responses,
        technicianId,
        request.body.story,
        now,
        request.body.timeEntries,
        request.body.parts,
    )
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/$batch`, {
        method: 'POST',
        headers: {
            Authorization: bearer,
            Accept: 'application/json',
            'Content-Type': `multipart/mixed;boundary=${batch.boundary}`,
        },
        body: batch.payload,
    })
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)]
        .map((match) => Number(match[1]))
    const failure = statuses.find((status) => status >= 400)
    if (!response.ok || failure) {
        if ([409, 412].includes(failure ?? response.status)) {
            return jsonResponse(409, { error: 'This machine Job Card was already submitted or changed.' })
        }
        throw new Error('Site Check Job Card transaction failed.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length
        !== batch.operationCount) {
        throw new Error('Site Check Job Card transaction was not fully confirmed.')
    }
    return jsonResponse(200, { submitted: true, jobId, submittedOn: now })
}

async function handlePublicGet(request) {
    const bearer = `Bearer ${await applicationToken()}`
    const found = await findOccurrence(request.query?.token, bearer)
    if (found.error) return found.error
    const [jobs, snapshots] = await Promise.all([
        readJobs(found.occurrence.gr_sitecheckid, bearer),
        readSnapshots(found.occurrence.gr_sitecheckid, bearer),
    ])
    return jsonResponse(200, publicProjection(found.occurrence, jobs, snapshots))
}

module.exports = {
    generate,
    revoke,
    handlePublicGet,
    submitJob,
    jsonResponse,
    test: {
        generateToken,
        hashToken,
        validEmail,
        validateDispatch,
        publicProjection,
        validateChecklistSubmission,
        checklistSubmissionBatch,
    },
}
