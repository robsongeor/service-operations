/** Number allocation is separate from editing or completing a Job. Never coerce to Number. */
export type JobNumberRecord = {
    gr_jobid: string
    gr_jobnumber?: string | null
    '@odata.etag'?: string
}

export function hasAllocatedJobNumber(job: Pick<JobNumberRecord, 'gr_jobnumber'>) {
    return Boolean(job.gr_jobnumber?.trim())
}

export function assertJobNumberUnchanged(current: JobNumberRecord, requested: string) {
    if ((current.gr_jobnumber ?? '').trim() !== requested.trim()) {
        throw new Error('Job numbers cannot be changed in the editor. Allocate a number separately for an unnumbered Job.')
    }
}

export function assertJobCanReceiveNumber(job: JobNumberRecord) {
    if (hasAllocatedJobNumber(job)) {
        throw new Error(`Job ${job.gr_jobnumber!.trim()} already has a number. Allocated numbers cannot be replaced or reused.`)
    }
}

export function assertJobCanBeDeleted(job: JobNumberRecord) {
    if (hasAllocatedJobNumber(job)) {
        throw new Error('A numbered Job cannot be deleted. Retain its number and use the appropriate cancellation workflow.')
    }
}

/** Transitional spreadsheet allocation only; this does not generate or reserve a number. */
export function validateImportedJobNumber(value: string) {
    const number = value.trim()
    if (number.length > 30 || !/^(?:WJ|HJ|CJ)?\d+$/.test(number)) {
        throw new Error('Use a numeric Job number, or WJ, HJ or CJ followed by digits (up to 30 characters).')
    }
    return number
}

export function requireJobNumberRecordId(value: string) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) {
        throw new Error('A valid saved Job is required.')
    }
    return value.toLowerCase()
}

export function requireJobNumberEtag(job: JobNumberRecord) {
    const etag = job['@odata.etag']
    if (!etag || !/^(?:W\/)?"[^"\r\n]+"$/.test(etag)) {
        throw new Error('Reload the Job before allocating a number or deleting it.')
    }
    return etag
}
