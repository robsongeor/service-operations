const { createHash } = require('node:crypto')

// Existing Site Check evidence remains on its established Dataverse workflow.
// Do not import this module into the Azure-only technician Job Card service.
function dataverseOrigin() {
    try {
        const url = new URL((process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim())
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

function hashToken(token) { return createHash('sha256').update(token, 'utf8').digest('hex') }

async function persistPhotos(token, job, photos, bearer, now, submissionId = '') {
    for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index]
        const uploadKey = hashToken(`${hashToken(token)}:${index}`)
        const lookupUrl = `${dataverseOrigin()}/api/data/v9.2/gr_jobphotos?$select=gr_jobphotoid,_gr_job_value&$filter=gr_uploadkey eq '${uploadKey}'&$top=2`
        const lookup = await fetch(lookupUrl, { headers: { Authorization: bearer, Accept: 'application/json' } })
        if (!lookup.ok) throw new Error('Job photo lookup failed.')
        const existing = (await lookup.json()).value ?? []
        if (existing.length > 1 || (existing[0] && String(existing[0]._gr_job_value).toLowerCase() !== job.gr_jobid.toLowerCase())) {
            throw new Error('Job photo upload identity conflict.')
        }
        let photoId = existing[0]?.gr_jobphotoid
        if (!photoId) {
            const create = await fetch(`${dataverseOrigin()}/api/data/v9.2/gr_jobphotos`, {
                method: 'POST',
                headers: {
                    Authorization: bearer,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({
                    gr_name: photo.fileName.trim(),
                    'gr_Job@odata.bind': `/gr_jobs(${job.gr_jobid})`,
                    gr_filename: photo.fileName.trim(),
                    gr_uploadedon: now,
                    gr_displayorder: index,
                    gr_uploadkey: uploadKey,
                    ...(submissionId ? { 'gr_JobCardSubmission@odata.bind': `/gr_jobcardsubmissions(${submissionId})` } : {}),
                }),
            })
            if (!create.ok) throw new Error('Job photo record creation failed.')
            photoId = (await create.json()).gr_jobphotoid
            if (!photoId) throw new Error('Job photo record response was invalid.')
        }
        const upload = await fetch(
            `${dataverseOrigin()}/api/data/v9.2/gr_jobphotos(${photoId})/gr_photo?x-ms-file-name=${encodeURIComponent(photo.fileName.trim())}`,
            {
                method: 'PATCH',
                headers: {
                    Authorization: bearer,
                    Accept: 'application/json',
                    'Content-Type': 'application/octet-stream',
                },
                body: Buffer.from(photo.data, 'base64'),
            },
        )
        if (!upload.ok) throw new Error('Job photo upload failed.')
    }
}


module.exports = { persistPhotos }
