const { fetchGreenTreeJobByCode } = require('./greenTreeJobs')
const { _test: reconciliationTest } = require('./greenTreeJobReconciliation')

const NOT_ENTERED_INTERVAL_MS = 15 * 60_000
const OPEN_INTERVAL_MS = 3 * 60 * 60_000
const DEFAULT_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 250
const QUERY_SIZE_PER_TABLE = 250
const LOOKUP_CONCURRENCY = 5
const TABLES = [
    { tableSet: 'gr_jobs', idField: 'gr_jobid', marker: 'gr_gtentered' },
    { tableSet: 'gr_jobbookentries', idField: 'gr_jobbookentryid', marker: 'gr_entered' },
    { tableSet: 'gr_waikatojobbookentries', idField: 'gr_waikatojobbookentryid', marker: 'gr_entered' },
    { tableSet: 'gr_hastingsjobbookentries', idField: 'gr_hastingsjobbookentryid', marker: 'gr_entered' },
    { tableSet: 'gr_christchurchjobbookentries', idField: 'gr_christchurchjobbookentryid', marker: 'gr_entered' },
]

function aucklandParts(timestamp) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
}

function normalizedStatus(value) {
    return value === 'open' || value === 'closed' || value === 'finalised' ? value : ''
}

function statusRefreshDue(statusValue, checkedOnValue, now = Date.now()) {
    const status = normalizedStatus(statusValue)
    if (status === 'finalised') return false
    const checkedOn = Date.parse(checkedOnValue || '')
    if (!Number.isFinite(checkedOn)) return true
    if (!status) return now - checkedOn >= NOT_ENTERED_INTERVAL_MS
    if (status === 'open') return now - checkedOn >= OPEN_INTERVAL_MS
    const current = aucklandParts(now)
    if (Number(current.hour) < 7) return false
    const previous = aucklandParts(checkedOn)
    const currentDate = `${current.year}-${current.month}-${current.day}`
    const previousDate = `${previous.year}-${previous.month}-${previous.day}`
    return previousDate !== currentDate || Number(previous.hour) < 7
}

function transitionAllowed(fromValue, toValue) {
    const from = normalizedStatus(fromValue)
    const to = normalizedStatus(toValue)
    if (!to || from === to || !from) return true
    if (from === 'open') return to === 'closed' || to === 'finalised'
    return from === 'closed' && to === 'finalised'
}

function trustedNextLink(value, origin) {
    if (typeof value !== 'string' || !value) return ''
    try {
        const url = new URL(value)
        return url.origin === origin && url.pathname.startsWith('/api/data/v9.2/') ? url.toString() : ''
    } catch { return '' }
}

async function readCandidatePage(table, mode, dataverseOrigin, authorization, fetchImpl) {
    const select = `${table.idField},gr_jobnumber,${table.marker},gr_greentreestatus,gr_greentreestatuscheckedon`
    const filter = mode === 'backfill'
        ? 'statecode eq 0 and gr_jobnumber ne null and gr_greentreestatuscheckedon eq null'
        : "statecode eq 0 and gr_jobnumber ne null and (gr_greentreestatus eq null or gr_greentreestatus ne 'finalised')"
    const url = `${dataverseOrigin}/api/data/v9.2/${table.tableSet}?$select=${select}&$filter=${encodeURIComponent(filter)}&$orderby=gr_greentreestatuscheckedon asc&$top=${QUERY_SIZE_PER_TABLE}`
    const response = await fetchImpl(url, { headers: { Authorization: authorization, Accept: 'application/json', Prefer: `odata.maxpagesize=${QUERY_SIZE_PER_TABLE}` } })
    if (!response.ok) throw new Error('Dataverse GreenTree polling candidates could not be loaded.')
    const body = await response.json()
    return (Array.isArray(body.value) ? body.value : []).map((record) => ({ ...record, ...table }))
}

async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length)
    let cursor = 0
    async function run() {
        while (cursor < items.length) {
            const index = cursor++
            results[index] = await worker(items[index], index)
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
    return results
}

async function pollGreenTreeJobStatuses({
    mode = 'scheduled', batchSize = DEFAULT_BATCH_SIZE, dataverseOrigin, authorization,
    fetchImpl = fetch, fetchJob = fetchGreenTreeJobByCode, now = Date.now(),
}) {
    if (mode !== 'scheduled' && mode !== 'backfill') throw new Error('Unknown GreenTree status polling mode.')
    if (!dataverseOrigin || !/^Bearer\s+\S+$/i.test(authorization || '')) throw new Error('Dataverse polling identity is unavailable.')
    const boundedBatchSize = Math.max(1, Math.min(Number(batchSize) || DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE))
    const pages = await Promise.all(TABLES.map((table) => readCandidatePage(table, mode, dataverseOrigin, authorization, fetchImpl)))
    const candidates = pages.flat().filter((record) => mode === 'backfill'
        ? !record.gr_greentreestatuscheckedon
        : statusRefreshDue(record.gr_greentreestatus, record.gr_greentreestatuscheckedon, now))
    const byCode = new Map()
    candidates.forEach((record) => {
        const code = String(record.gr_jobnumber || '').trim().toUpperCase()
        if (!/^(?:[A-Z]{1,2})?[0-9]{1,20}$/.test(code)) return
        const records = byCode.get(code) || []
        records.push(record)
        byCode.set(code, records)
    })
    const dueCodes = [...byCode.keys()]
    const selectedCodes = dueCodes.slice(0, boundedBatchSize)
    const result = {
        mode, due: dueCodes.length, selected: selectedCodes.length, checked: 0, updatedRecords: 0,
        notEntered: 0, open: 0, closed: 0, finalised: 0, conflicts: [], failed: [],
        remaining: Math.max(0, dueCodes.length - selectedCodes.length),
    }
    const checkedOn = new Date(now).toISOString()

    await mapWithConcurrency(selectedCodes, LOOKUP_CONCURRENCY, async (code) => {
        let greenTreeJob
        try { greenTreeJob = await fetchJob(code, { fetchImpl }) }
        catch { result.failed.push(code); return }
        result.checked += 1
        const nextStatus = greenTreeJob ? reconciliationTest.greenTreeJobStatus(greenTreeJob) : ''
        if (!nextStatus) result.notEntered += 1
        else result[nextStatus] += 1
        for (const record of byCode.get(code) || []) {
            const currentStatus = normalizedStatus(record.gr_greentreestatus)
            if (!greenTreeJob && record[record.marker] === true) { result.conflicts.push(code); continue }
            if (greenTreeJob && !transitionAllowed(currentStatus, nextStatus)) { result.conflicts.push(code); continue }
            if (!/^W\/"[^"]+"$/.test(record['@odata.etag'] || '')) { result.conflicts.push(code); continue }
            const payload = { gr_greentreestatuscheckedon: checkedOn }
            if (greenTreeJob) {
                payload[record.marker] = true
                payload.gr_greentreestatus = nextStatus
            }
            const response = await fetchImpl(`${dataverseOrigin}/api/data/v9.2/${record.tableSet}(${record[record.idField]})`, {
                method: 'PATCH',
                headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': record['@odata.etag'] },
                body: JSON.stringify(payload),
            })
            if (response.status === 412) { result.conflicts.push(code); continue }
            if (!response.ok) { result.failed.push(code); continue }
            result.updatedRecords += 1
        }
    })
    result.conflicts = [...new Set(result.conflicts)]
    result.failed = [...new Set(result.failed)]
    return result
}

module.exports = {
    pollGreenTreeJobStatuses,
    _test: {
        aucklandParts, normalizedStatus, statusRefreshDue, transitionAllowed, trustedNextLink,
        NOT_ENTERED_INTERVAL_MS, OPEN_INTERVAL_MS, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE, TABLES,
    },
}
