const JOB_STATUS_COMPLETE = 122830003
const JOB_STATUS_COMPLETION_REVIEW = 122830004
const JOB_BOOK_STAGE_VOID = 122830003
const QUERY_CHUNK_SIZE = 20
const JOB_BOOKS = [
    { prefix: 'WJ', tableSetName: 'gr_waikatojobbookentries', idField: 'gr_waikatojobbookentryid' },
    { prefix: 'HJ', tableSetName: 'gr_hastingsjobbookentries', idField: 'gr_hastingsjobbookentryid' },
    { prefix: 'CJ', tableSetName: 'gr_christchurchjobbookentries', idField: 'gr_christchurchjobbookentryid' },
    { prefix: '', tableSetName: 'gr_jobbookentries', idField: 'gr_jobbookentryid' },
]

function escapeOData(value) {
    return String(value).replaceAll("'", "''")
}

function chunk(values, size = QUERY_CHUNK_SIZE) {
    const chunks = []
    for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
    return chunks
}

function jobBookForCode(code) {
    const normalized = String(code || '').trim().toUpperCase()
    return JOB_BOOKS.find((book) => book.prefix && new RegExp(`^${book.prefix}[0-9]+$`).test(normalized))
        || (/^[0-9]+$/.test(normalized) ? JOB_BOOKS.find((book) => !book.prefix) : null)
}

async function reconcileIntakeRows({ codes, dataverseOrigin, authorization, fetchImpl, result }) {
    const codesByBook = new Map()
    codes.forEach((code) => {
        const book = jobBookForCode(code)
        if (!book) return
        const values = codesByBook.get(book) || []
        values.push(code)
        codesByBook.set(book, values)
    })

    for (const [book, bookCodes] of codesByBook) {
        const records = []
        for (const codeChunk of chunk(bookCodes)) {
            const filter = codeChunk.map((code) => `gr_jobnumber eq '${escapeOData(code)}'`).join(' or ')
            const select = `${book.idField},gr_jobnumber,gr_entered,gr_stage`
            const url = `${dataverseOrigin}/api/data/v9.2/${book.tableSetName}?$select=${select}&$filter=${encodeURIComponent(filter)}`
            const response = await fetchImpl(url, {
                headers: { Authorization: authorization, Accept: 'application/json', Prefer: 'odata.maxpagesize=100' },
            })
            if (!response.ok) throw new Error('Dataverse Job Book entries could not be matched to the GreenTree changes.')
            const data = await response.json()
            records.push(...(Array.isArray(data.value) ? data.value : []))
        }

        const recordsByCode = new Map()
        records.forEach((record) => {
            const code = typeof record.gr_jobnumber === 'string' ? record.gr_jobnumber.trim() : ''
            if (!code) return
            const matches = recordsByCode.get(code) || []
            matches.push(record)
            recordsByCode.set(code, matches)
        })

        for (const code of bookCodes) {
            const matches = recordsByCode.get(code) || []
            if (!matches.length) continue
            if (matches.length !== 1) { result.conflicts.push(code); continue }
            const record = matches[0]
            result.matched += 1
            result.intakeMatched += 1
            result.unmatched = result.unmatched.filter((value) => value !== code)
            if (record.gr_entered === true || record.gr_stage === JOB_BOOK_STAGE_VOID) continue
            if (!/^W\/"[^"]+"$/.test(record['@odata.etag'] || '')) { result.conflicts.push(code); continue }
            const response = await fetchImpl(`${dataverseOrigin}/api/data/v9.2/${book.tableSetName}(${record[book.idField]})`, {
                method: 'PATCH',
                headers: {
                    Authorization: authorization,
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'If-Match': record['@odata.etag'],
                },
                body: JSON.stringify({ gr_entered: true }),
            })
            if (response.status === 412) { result.conflicts.push(code); continue }
            if (!response.ok) throw new Error('A matched Dataverse Job Book entry could not be reconciled.')
            result.updated += 1
            result.markedEntered += 1
            result.intakeUpdated += 1
        }
    }
}

async function reconcileGreenTreeJobs({ jobs, dataverseOrigin, authorization, fetchImpl = fetch }) {
    const byCode = new Map(jobs.filter((job) => job.code).map((job) => [job.code, job]))
    const result = {
        received: jobs.length,
        matched: 0,
        updated: 0,
        markedEntered: 0,
        movedToComplete: 0,
        movedToCompletionReview: 0,
        alreadyComplete: 0,
        intakeMatched: 0,
        intakeUpdated: 0,
        unmatched: [],
        conflicts: [],
    }
    if (!byCode.size) return result

    const records = []
    for (const codes of chunk([...byCode.keys()])) {
        const filter = codes.map((code) => `gr_jobnumber eq '${escapeOData(code)}'`).join(' or ')
        const url = `${dataverseOrigin}/api/data/v9.2/gr_jobs?$select=gr_jobid,gr_jobnumber,gr_gtentered,gr_status,gr_completeddate&$filter=${encodeURIComponent(filter)}`
        const response = await fetchImpl(url, {
            headers: { Authorization: authorization, Accept: 'application/json', Prefer: 'odata.maxpagesize=100' },
        })
        if (!response.ok) throw new Error('Dataverse Jobs could not be matched to the GreenTree changes.')
        const data = await response.json()
        records.push(...(Array.isArray(data.value) ? data.value : []))
    }

    const recordsByCode = new Map()
    records.forEach((record) => {
        const code = typeof record.gr_jobnumber === 'string' ? record.gr_jobnumber.trim() : ''
        if (!code) return
        const matches = recordsByCode.get(code) || []
        matches.push(record)
        recordsByCode.set(code, matches)
    })

    for (const [code, greenTreeJob] of byCode) {
        const matches = recordsByCode.get(code) || []
        if (!matches.length) { result.unmatched.push(code); continue }
        if (matches.length !== 1) { result.conflicts.push(code); continue }
        result.matched += 1
        const record = matches[0]
        const payload = {}
        const markEntered = record.gr_gtentered !== true
        let moveToCompletionReview = false
        if (markEntered) payload.gr_gtentered = true
        if (greenTreeJob.isClosed) {
            if (record.gr_status === JOB_STATUS_COMPLETE) result.alreadyComplete += 1
            else if (record.gr_status !== JOB_STATUS_COMPLETION_REVIEW) {
                // GT closure confirms billing, not operational evidence or service/WOF side effects.
                // Only the canonical completion workflow may mark the operational Job Complete.
                payload.gr_status = JOB_STATUS_COMPLETION_REVIEW
                moveToCompletionReview = true
            }
        }
        if (!Object.keys(payload).length) continue
        if (!/^W\/"[^"]+"$/.test(record['@odata.etag'] || '')) { result.conflicts.push(code); continue }
        const response = await fetchImpl(`${dataverseOrigin}/api/data/v9.2/gr_jobs(${record.gr_jobid})`, {
            method: 'PATCH',
            headers: {
                Authorization: authorization,
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'If-Match': record['@odata.etag'],
            },
            body: JSON.stringify(payload),
        })
        if (response.status === 412) { result.conflicts.push(code); continue }
        if (!response.ok) throw new Error('A matched Dataverse Job could not be reconciled.')
        result.updated += 1
        if (markEntered) result.markedEntered += 1
        if (moveToCompletionReview) result.movedToCompletionReview += 1
    }

    await reconcileIntakeRows({
        codes: [...result.unmatched],
        dataverseOrigin,
        authorization,
        fetchImpl,
        result,
    })

    return result
}

module.exports = {
    reconcileGreenTreeJobs,
    _test: { escapeOData, chunk, jobBookForCode, JOB_STATUS_COMPLETE, JOB_BOOK_STAGE_VOID, QUERY_CHUNK_SIZE },
}
