const { createHash, randomBytes, randomUUID } = require('node:crypto')
const { getJobCardStore, resetJobCardStore } = require('./jobCardStorage')
const { sendReviewNotification } = require('./jobCardNotification')
const { isLocalDevelopment } = require('./jobCardEnvironment')

const SERVICE_JOB = 122830001
const DEFAULT_EXPIRY_HOURS = 168
const MAX_PHOTOS = 20
const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const MAX_TIME_ENTRIES = 50
const MAX_PARTS = 100
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif'])
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const GUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const PILOT_RECIPIENTS = new Set(['nzmouhib@yahoo.co.nz', 'georger@liftrucks.co.nz'])

function jsonResponse(status, body, headers = {}) {
    return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(body) }
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
    } catch { return '' }
}

function hashToken(token) { return createHash('sha256').update(token, 'utf8').digest('hex') }
function generateToken() { return randomBytes(32).toString('base64url') }

function safeJson(value, fallback) {
    try { return JSON.parse(value || '') ?? fallback } catch { return fallback }
}

async function validateAuthenticatedUser(request) {
    const authorization = requestHeader(request, 'x-dataverse-authorization') || requestHeader(request, 'authorization')
    if (!/^Bearer\s+\S+$/i.test(authorization)) return null
    if (isLocalDevelopment()) return { authorization, userId: 'local-office-user' }
    const origin = dataverseOrigin()
    if (!origin) return null
    const response = await fetch(`${origin}/api/data/v9.2/WhoAmI`, { headers: { Authorization: authorization, Accept: 'application/json' } })
    if (!response.ok) return null
    const identity = await response.json()
    return typeof identity.UserId === 'string' && identity.UserId ? { authorization, userId: identity.UserId } : null
}

function tokenFailure(code) {
    const messages = { invalid: 'This job card link is invalid.', expired: 'This job card link has expired.', used: 'This job card has already been submitted.', unavailable: 'This job is unavailable.' }
    return jsonResponse(code === 'invalid' ? 404 : 410, { code, error: messages[code] })
}

function snapshotFromLocalBody(body) {
    const source = body?.snapshot
    if (!source || typeof source !== 'object') return null
    return {
        sourceJobId: body.jobId,
        assignmentId: typeof body.assignmentId === 'string' ? body.assignmentId : '',
        jobNumber: String(source.jobNumber || '').trim(),
        jobType: Number(source.jobType),
        workRequired: String(source.workRequired || '').trim(),
        equipmentId: String(source.equipmentId || '').trim(),
        equipmentDisplayName: String(source.equipmentDisplayName || '').trim(),
        fleetNumber: String(source.fleetNumber || '').trim(),
        currentHourMeter: Number.isSafeInteger(source.currentHourMeter) ? source.currentHourMeter : null,
        customerName: String(source.customerName || '').trim(),
        siteName: String(source.siteName || '').trim(),
        technicianId: String(source.technicianId || '').trim(),
        technicianName: String(source.technicianName || '').trim(),
        technicianEmail: String(source.technicianEmail || '').trim(),
    }
}

async function loadDataverseSnapshot(authorization, jobId, assignmentId, recipientEmail) {
    const select = 'gr_jobid,gr_jobnumber,gr_ordernumber,gr_description,gr_jobtype'
    const expand = [
        'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial,gr_currenthourmeter)',
        'gr_Site($select=gr_name,gr_address;$expand=gr_Customer($select=gr_name))',
        'gr_Mechanic($select=gr_mechanicid,gr_name,gr_email)',
    ].join(',')
    const response = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_jobs(${jobId})?$select=${select}&$expand=${expand}`, { headers: { Authorization: authorization, Accept: 'application/json' } })
    if (!response.ok) return null
    const job = await response.json()
    let technician = job.gr_Mechanic
    let workRequired = job.gr_description || ''
    if (assignmentId) {
        const assignmentResponse = await fetch(
            `${dataverseOrigin()}/api/data/v9.2/gr_jobassignments(${assignmentId})?$select=gr_workinstructions,_gr_job_value&$expand=gr_Mechanic($select=gr_mechanicid,gr_name,gr_email)`,
            { headers: { Authorization: authorization, Accept: 'application/json' } },
        )
        if (!assignmentResponse.ok) return null
        const assignment = await assignmentResponse.json()
        if (String(assignment._gr_job_value || '').toLowerCase() !== jobId.toLowerCase()) return null
        technician = assignment.gr_Mechanic
        workRequired = assignment.gr_workinstructions || workRequired
    }
    return {
        sourceJobId: jobId,
        assignmentId: assignmentId || '',
        jobNumber: job.gr_jobnumber || 'Not recorded',
        orderNumber: job.gr_ordernumber || '',
        jobType: job.gr_jobtype,
        workRequired,
        equipmentId: job.gr_Equipment?.gr_equipmentid || '',
        equipmentDisplayName: [job.gr_Equipment?.gr_make, job.gr_Equipment?.gr_model].filter(Boolean).join(' '),
        equipmentMake: job.gr_Equipment?.gr_make || '',
        equipmentModel: job.gr_Equipment?.gr_model || '',
        equipmentSerial: job.gr_Equipment?.gr_serial || '',
        fleetNumber: job.gr_Equipment?.gr_fleet || '',
        currentHourMeter: job.gr_Equipment?.gr_currenthourmeter ?? null,
        customerName: job.gr_Site?.gr_Customer?.gr_name || '',
        siteName: job.gr_Site?.gr_name || '',
        siteAddress: job.gr_Site?.gr_address || '',
        technicianId: technician?.gr_mechanicid || '',
        technicianName: technician?.gr_name || '',
        technicianEmail: recipientEmail || technician?.gr_email || '',
    }
}

function validateSnapshot(snapshot) {
    return Boolean(snapshot && snapshot.jobNumber && GUID_PATTERN.test(snapshot.sourceJobId)
        && Number.isInteger(snapshot.jobType) && (!snapshot.assignmentId || GUID_PATTERN.test(snapshot.assignmentId))
        && GUID_PATTERN.test(snapshot.technicianId) && snapshot.technicianName
        && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(snapshot.technicianEmail)
        && snapshot.jobNumber.length <= 200 && snapshot.workRequired.length <= 10000
        && snapshot.equipmentDisplayName.length <= 500 && snapshot.fleetNumber.length <= 200
        && snapshot.customerName.length <= 500 && snapshot.siteName.length <= 500
        && snapshot.technicianName.length <= 500 && snapshot.technicianEmail.length <= 500)
}

function publicDetails(record) {
    return {
        jobNumber: record.jobNumber,
        orderNumber: record.orderNumber || undefined,
        equipmentMake: record.equipmentMake || undefined,
        equipmentModel: record.equipmentModel || undefined,
        equipmentSerial: record.equipmentSerial || undefined,
        siteAddress: record.siteAddress || undefined,
        equipmentDisplayName: record.equipmentDisplayName || undefined,
        fleetNumber: record.fleetNumber || undefined,
        customerName: record.customerName || undefined,
        siteName: record.siteName || undefined,
        technicianName: record.technicianName || undefined,
        workRequired: record.workRequired || undefined,
        requiresHourMeter: record.jobType === SERVICE_JOB && Boolean(record.equipmentId),
        currentHourMeter: record.currentHourMeter ?? undefined,
    }
}

async function findRequest(token) {
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return { error: tokenFailure('invalid') }
    const record = await getJobCardStore().getByTokenHash(hashToken(token))
    if (!record || record.status === 'superseded') return { error: tokenFailure('invalid') }
    if (record.status === 'pendingReview' || record.status === 'reviewed') return { error: tokenFailure('used') }
    if (record.status !== 'active') return { error: tokenFailure('unavailable') }
    const expires = Date.parse(record.expiresOn)
    if (!Number.isFinite(expires) || expires <= Date.now()) return { error: tokenFailure('expired') }
    return { record }
}

function normalizeSubmission(body) {
    return {
        story: typeof body.story === 'string' ? body.story.trim() : '', hourMeter: body.hourMeter,
        lowerHourMeterConfirmed: body.lowerHourMeterConfirmed === true,
        timeEntries: body.timeEntries ?? [], parts: body.parts ?? [],
        furtherWorkRequired: body.furtherWorkRequired ?? false,
        furtherWorkDetails: typeof body.furtherWorkDetails === 'string' ? body.furtherWorkDetails.trim() : '',
        safetyIssueIdentified: body.safetyIssueIdentified ?? false,
        safetyIssueDetails: typeof body.safetyIssueDetails === 'string' ? body.safetyIssueDetails.trim() : '',
        photos: body.photos ?? [],
    }
}

function validateSubmission(record, body) {
    body = normalizeSubmission(body)
    if (!body.story) return 'Enter the work completed or job story.'
    if (body.story.length > 10000) return 'The job story is too long.'
    const required = record.jobType === SERVICE_JOB && Boolean(record.equipmentId)
    if (required && body.hourMeter == null) return 'Enter the current hour meter.'
    if (body.hourMeter != null && (!Number.isSafeInteger(body.hourMeter) || body.hourMeter < 0)) return 'Hour meter must be a non-negative whole number.'
    if (body.hourMeter != null && record.currentHourMeter != null && body.hourMeter < record.currentHourMeter && !body.lowerHourMeterConfirmed) return 'Confirm the lower hour meter reading before submitting.'
    if (!Array.isArray(body.timeEntries) || body.timeEntries.length < 1 || body.timeEntries.length > MAX_TIME_ENTRIES) return 'Enter at least one valid Time & Travel entry.'
    for (const entry of body.timeEntries) {
        if (!entry || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(`${entry.date}T00:00:00Z`))
            || new Date(`${entry.date}T00:00:00Z`).toISOString().slice(0, 10) !== entry.date
            || typeof entry.hours !== 'number' || !Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > 24
            || !Number.isSafeInteger(entry.kilometres) || entry.kilometres < 0) return 'Check each time entry. Hours must be between 0 and 24 and kilometres must be a whole number.'
    }
    if (!Array.isArray(body.parts) || body.parts.length > MAX_PARTS || body.parts.some((part) => !part || typeof part.description !== 'string' || !part.description.trim() || part.description.trim().length > 500 || !Number.isFinite(part.quantity) || part.quantity <= 0 || part.quantity > 100000)) return 'Parts are invalid.'
    if (typeof body.furtherWorkRequired !== 'boolean') return 'Further work selection is invalid.'
    if (body.furtherWorkRequired && !body.furtherWorkDetails) return 'Enter the further work details.'
    if (body.furtherWorkDetails.length > 10000) return 'Further work details are too long.'
    if (typeof body.safetyIssueIdentified !== 'boolean') return 'Safety issue selection is invalid.'
    if (body.safetyIssueIdentified && !body.safetyIssueDetails) return 'Enter the safety issue details.'
    if (body.safetyIssueDetails.length > 10000) return 'Safety issue details are too long.'
    if (!Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS || body.photos.some((photo) => !photo || typeof photo.uploadId !== 'string' || !GUID_PATTERN.test(photo.uploadId))) return 'One or more photos are invalid.'
    return ''
}

function validatePhotoUpload(photo) {
    if (!photo || typeof photo.fileName !== 'string' || !photo.fileName.trim() || photo.fileName.length > 255
        || typeof photo.mimeType !== 'string' || !PHOTO_TYPES.has(photo.mimeType.toLowerCase())
        || !Number.isSafeInteger(photo.size) || photo.size < 1 || photo.size > MAX_PHOTO_BYTES
        || typeof photo.data !== 'string' || photo.data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) return false
    const bytes = Buffer.from(photo.data, 'base64')
    if (bytes.length !== photo.size || bytes.length > MAX_PHOTO_BYTES) return false
    const mimeType = photo.mimeType.toLowerCase()
    if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const brand = bytes.length >= 12 ? bytes.subarray(4, 12).toString('ascii').toLowerCase() : ''
    return brand.startsWith('ftyp') && ['heic', 'heix', 'hevc', 'hevx', 'mif1'].some((value) => brand.includes(value))
}

async function validateStoredPhotos(record, photos) {
    const results = []
    const seen = new Set()
    for (const photo of photos) {
        if (seen.has(photo.uploadId)) throw new Error('Duplicate photo upload.')
        seen.add(photo.uploadId)
        const blobName = `uploads/${record.tokenHash}/${photo.uploadId}`
        const stored = await getJobCardStore().inspectPhoto(blobName)
        if (!stored || stored.tokenHash !== record.tokenHash || !PHOTO_TYPES.has(String(stored.mimeType).toLowerCase())
            || !Number.isSafeInteger(stored.size) || stored.size < 1 || stored.size > MAX_PHOTO_BYTES) throw new Error('Photo validation failed.')
        results.push({ id: photo.uploadId, blobName, fileName: stored.fileName, mimeType: stored.mimeType, size: stored.size })
    }
    return results
}

async function generate(request) {
    const identity = await validateAuthenticatedUser(request)
    if (!identity) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    const jobId = typeof request.body?.jobId === 'string' ? request.body.jobId.trim() : ''
    const assignmentId = typeof request.body?.assignmentId === 'string' ? request.body.assignmentId.trim() : ''
    if (!GUID_PATTERN.test(jobId) || (assignmentId && !GUID_PATTERN.test(assignmentId))) return jsonResponse(400, { error: 'A valid Job is required.' })
    const recipientEmail = typeof request.body?.recipientEmail === 'string' ? request.body.recipientEmail.trim().toLowerCase() : ''
    if (!isLocalDevelopment() && !PILOT_RECIPIENTS.has(recipientEmail)) return jsonResponse(403, { error: 'Online Job Cards are restricted to the approved pilot recipients.' })
    const snapshot = isLocalDevelopment()
        ? snapshotFromLocalBody(request.body)
        : await loadDataverseSnapshot(identity.authorization, jobId, assignmentId, recipientEmail)
    if (!validateSnapshot(snapshot)) return jsonResponse(404, { error: 'The Job or technician could not be loaded.' })
    const now = new Date()
    const hours = Number.isInteger(request.body?.expiresInHours) ? Math.min(Math.max(request.body.expiresInHours, 1), 720) : DEFAULT_EXPIRY_HOURS
    const token = generateToken()
    const tokenHash = hashToken(token)
    let record
    try { record = await getJobCardStore().createActive({
        ...snapshot, tokenHash, reviewId: randomUUID(), status: 'active', schemaVersion: 1,
        createdOn: now.toISOString(), createdByUserId: identity.userId,
        expiresOn: new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString(),
    }, request.body?.replaceActive === true) } catch (error) {
        if (error.code === 'active-link') return jsonResponse(409, { code: 'active-link', error: 'An active link for this technician already exists.' })
        if ([409, 412].includes(error.statusCode)) return jsonResponse(409, { code: 'temporary', error: 'The Job Card changed. Refresh and retry.' })
        throw error
    }
    return jsonResponse(201, { token, path: `/portal/job/${token}`, expiresOn: record.expiresOn })
}

async function handlePublicGet(request) {
    const found = await findRequest(request.query?.token)
    return found.error || jsonResponse(200, publicDetails(found.record))
}

async function uploadPhoto(request) {
    const found = await findRequest(request.body?.token)
    if (found.error) return found.error
    if (!validatePhotoUpload(request.body?.photo)) return jsonResponse(400, { code: 'invalid', error: 'The photo is invalid.' })
    const photo = { ...request.body.photo, fileName: request.body.photo.fileName.trim(), mimeType: request.body.photo.mimeType.toLowerCase() }
    const digest = createHash('sha256').update(JSON.stringify([photo.fileName, photo.mimeType])).update(Buffer.from(photo.data, 'base64')).digest('hex')
    const uploadId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`
    const uploads = safeJson(found.record.uploadIdsJson, [])
    if (!uploads.includes(uploadId)) {
        if (uploads.length >= MAX_PHOTOS) return jsonResponse(400, { code: 'invalid', error: 'A maximum of 20 distinct photos may be uploaded.' })
        try {
            await getJobCardStore().replace({ ...found.record, uploadIdsJson: JSON.stringify([...uploads, uploadId]) }, found.record.etag)
        } catch (error) {
            if (error?.statusCode === 412) return jsonResponse(409, { code: 'temporary', error: 'The photo upload conflicted with another request. Please retry.' })
            throw error
        }
    }
    const uploaded = await getJobCardStore().uploadPhoto(found.record.tokenHash, photo, uploadId)
    return jsonResponse(201, { uploadId: uploaded.uploadId })
}

async function notifyReview(record) {
    let fields
    try {
        const notification = await sendReviewNotification(record)
        fields = { notificationStatus: notification.status, notificationSentOn: notification.sentOn }
    } catch {
        fields = { notificationStatus: 'failed', notificationErrorOn: new Date().toISOString() }
        console.error('Job Card review notification failed; evidence remains in the review queue.')
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        const current = await getJobCardStore().getByTokenHash(record.tokenHash)
        if (!current) return
        try { return await getJobCardStore().replace({ ...current, ...fields }, current.etag) }
        catch (error) { if (error.statusCode !== 412) throw error }
    }
}

async function handlePublicPost(request) {
    if (request.body?.action === 'uploadPhoto') return uploadPhoto(request)
    const found = await findRequest(request.body?.token)
    if (found.error) return found.error
    const body = normalizeSubmission(request.body || {})
    const validation = validateSubmission(found.record, body)
    if (validation) return jsonResponse(400, { code: 'invalid', error: validation })
    let photos
    try { photos = await validateStoredPhotos(found.record, body.photos) }
    catch { return jsonResponse(400, { code: 'invalid', error: 'One or more uploaded photos are unavailable or invalid.' }) }
    const submitted = {
        ...found.record, status: 'pendingReview', submittedOn: new Date().toISOString(), story: body.story,
        hourMeter: body.hourMeter ?? null, lowerHourMeterConfirmed: body.lowerHourMeterConfirmed,
        timeEntriesJson: JSON.stringify(body.timeEntries.map(({ date, hours, kilometres }) => ({ date, hours, kilometres }))),
        partsJson: JSON.stringify(body.parts.map((part) => ({ description: part.description.trim(), quantity: part.quantity }))),
        furtherWorkRequired: body.furtherWorkRequired, furtherWorkDetails: body.furtherWorkRequired ? body.furtherWorkDetails : '',
        safetyIssueIdentified: body.safetyIssueIdentified, safetyIssueDetails: body.safetyIssueIdentified ? body.safetyIssueDetails : '',
        photosJson: JSON.stringify(photos), photoCount: photos.length, notificationStatus: 'pending',
    }
    let saved
    try { saved = await getJobCardStore().replace(submitted, found.record.etag) }
    catch (error) {
        if (error?.statusCode === 412 || error?.code === 'UpdateConditionNotSatisfied') return tokenFailure('used')
        throw error
    }
    try { await notifyReview(saved) } catch { /* Saved evidence is authoritative even if email status cannot be saved. */ }
    return jsonResponse(200, { submitted: true })
}

function reviewSummary(record) {
    return {
        reviewId: record.reviewId, jobNumber: record.jobNumber, customerName: record.customerName || undefined,
        siteName: record.siteName || undefined, technicianName: record.technicianName || undefined, submittedOn: record.submittedOn,
        safetyIssueIdentified: Boolean(record.safetyIssueIdentified), furtherWorkRequired: Boolean(record.furtherWorkRequired),
        photoCount: record.photoCount || 0, notificationStatus: record.notificationStatus,
    }
}

function reviewDetails(record) {
    return {
        ...reviewSummary(record), etag: record.etag, status: record.status, sourceJobId: record.sourceJobId, assignmentId: record.assignmentId || undefined,
        workRequired: record.workRequired || undefined, equipmentDisplayName: record.equipmentDisplayName || undefined,
        fleetNumber: record.fleetNumber || undefined, currentHourMeter: record.currentHourMeter ?? undefined, hourMeter: record.hourMeter ?? undefined,
        story: record.story, timeEntries: safeJson(record.timeEntriesJson, []), parts: safeJson(record.partsJson, []),
        furtherWorkDetails: record.furtherWorkDetails || undefined, safetyIssueDetails: record.safetyIssueDetails || undefined,
        photos: safeJson(record.photosJson, []).map((photo) => ({ id: photo.id, fileName: photo.fileName, mimeType: photo.mimeType, size: photo.size })),
        reviewedOn: record.reviewedOn || undefined, reviewedByUserId: record.reviewedByUserId || undefined,
    }
}

async function handleReviewRequest(request) {
    if (!['GET', 'POST'].includes(request.method)) return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' })
    const identity = await validateAuthenticatedUser(request)
    if (!identity) return jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' })
    if (!isLocalDevelopment()) {
        const allowed = (process.env.JOB_CARD_REVIEWER_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
        if (!GUID_PATTERN.test(identity.userId) || !allowed.length) return jsonResponse(403, { error: 'Job Card reviewer access is required.' })
        const userResponse = await fetch(`${dataverseOrigin()}/api/data/v9.2/systemusers(${identity.userId})?$select=internalemailaddress,domainname`, { headers: { Authorization: identity.authorization, Accept: 'application/json' } })
        if (!userResponse.ok) return jsonResponse(403, { error: 'Job Card reviewer access is required.' })
        const user = await userResponse.json()
        if (![user.internalemailaddress, user.domainname].some((email) => typeof email === 'string' && allowed.includes(email.trim().toLowerCase()))) return jsonResponse(403, { error: 'Job Card reviewer access is required.' })
    }
    const reviewId = typeof request.query?.reviewId === 'string' ? request.query.reviewId.trim() : ''
    const photoId = typeof request.query?.photoId === 'string' ? request.query.photoId.trim() : ''
    if (!reviewId) return request.method === 'GET' ? jsonResponse(200, { items: (await getJobCardStore().listPending(100)).map(reviewSummary) }) : jsonResponse(400, { error: 'A review item is required.' })
    if (!GUID_PATTERN.test(reviewId)) return jsonResponse(404, { error: 'The review item was not found.' })
    const record = await getJobCardStore().getByReviewId(reviewId)
    if (!record || !['pendingReview', 'reviewed'].includes(record.status)) return jsonResponse(404, { error: 'The review item was not found.' })
    if (photoId) {
        if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'GET' })
        const photo = safeJson(record.photosJson, []).find((item) => item.id === photoId)
        if (!photo) return jsonResponse(404, { error: 'The photo was not found.' })
        const downloaded = await getJobCardStore().downloadPhoto(photo.blobName)
        if (!downloaded) return jsonResponse(404, { error: 'The photo was not found.' })
        return { status: 200, isRaw: true, headers: { 'Content-Type': downloaded.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `attachment; filename="photo"; filename*=UTF-8''${encodeURIComponent(photo.fileName).replace(/'/g, '%27')}` }, body: downloaded.data }
    }
    if (request.method === 'POST' && request.body?.action === 'retryNotification') {
        if (record.notificationStatus === 'sent') return jsonResponse(200, reviewDetails(record))
        return jsonResponse(200, reviewDetails(await notifyReview(record) || record))
    }
    if (request.method === 'POST' && request.body?.action === 'markReviewed') {
        if (record.status === 'reviewed') return jsonResponse(200, reviewDetails(record))
        if (request.body.etag !== record.etag) return jsonResponse(409, { error: 'The review changed. Refresh before marking it reviewed.' })
        let reviewed
        try { reviewed = await getJobCardStore().replace({ ...record, status: 'reviewed', reviewedOn: new Date().toISOString(), reviewedByUserId: identity.userId }, record.etag) }
        catch (error) { if (error.statusCode === 412) return jsonResponse(409, { error: 'The review changed. Refresh and retry.' }); throw error }
        return jsonResponse(200, reviewDetails(reviewed))
    }
    if (request.method === 'POST') return jsonResponse(400, { error: 'Unknown review action.' })
    return jsonResponse(200, reviewDetails(record))
}

module.exports = {
    generate, handlePublicGet, handlePublicPost, handleReviewRequest, jsonResponse,
    test: { generateToken, hashToken, publicDetails, validateSubmission, validatePhotoUpload, reset: resetJobCardStore },
}
