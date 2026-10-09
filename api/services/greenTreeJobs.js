const DEFAULT_ORIGIN = 'https://webview.liftrucks.co.nz'
const DEFAULT_API_KEY = '500256'
const REQUEST_TIMEOUT_MS = 60_000
const PAGE_SIZE = 100
const MAX_PAGES = 25

function configuredOrigin() {
    const configured = (process.env.LIFTTRUCKS_API_ORIGIN || DEFAULT_ORIGIN).trim()
    const url = new URL(configured)
    if (url.protocol !== 'https:') throw new Error('Lift Trucks API origin must use HTTPS.')
    return url.origin
}

function credentials() {
    const username = process.env.LIFTTRUCKS_API_USERNAME
    const password = process.env.LIFTTRUCKS_API_PASSWORD
    const apiKey = process.env.LIFTTRUCKS_API_KEY || DEFAULT_API_KEY
    if (!username || !password || !apiKey) throw new Error('Lift Trucks API credentials are not configured.')
    return { username, password, apiKey }
}

function greenTreeJobsFromPayload(payload) {
    const envelope = Array.isArray(payload) ? payload[0] : payload
    const jobs = envelope && Array.isArray(envelope.JCJobs) ? envelope.JCJobs : []
    return jobs.filter((job) => job && typeof job === 'object')
}

function decodeXmlText(value) {
    return String(value || '')
        .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
        .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&amp;', '&')
        .trim()
}

function xmlElementText(block, name) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
    return match ? decodeXmlText(match[1]) : ''
}

function greenTreeJobsFromXml(xml) {
    return [...String(xml || '').matchAll(/<JCJob(?:\s[^>]*)?>([\s\S]*?)<\/JCJob>/gi)].map((match) => ({
        Code: xmlElementText(match[1], 'Code'),
        IsClosed: xmlElementText(match[1], 'IsClosed'),
        IsFinalised: xmlElementText(match[1], 'IsFinalised'),
        CompleteDate: xmlElementText(match[1], 'CompleteDate'),
        ModifiedTimeStamp: xmlElementText(match[1], 'ModifiedTimeStamp'),
        Status: xmlElementText(match[1], 'Status'),
    }))
}

function greenTreeJobSummary(job) {
    return {
        code: typeof job.Code === 'string' ? job.Code.trim() : String(job.Code || '').trim(),
        isClosed: job.IsClosed === true || String(job.IsClosed).toLowerCase() === 'true',
        isFinalised: job.IsFinalised === true || String(job.IsFinalised).toLowerCase() === 'true',
        completeDate: typeof job.CompleteDate === 'string' && job.CompleteDate ? job.CompleteDate : null,
        modifiedTimeStamp: typeof job.ModifiedTimeStamp === 'string' && job.ModifiedTimeStamp ? job.ModifiedTimeStamp : null,
        status: typeof job.Status === 'string' && job.Status ? job.Status : null,
    }
}

async function fetchGreenTreeJobsModifiedSince(modifiedSince, options = {}) {
    const { username, password, apiKey } = credentials()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS)
    const maxPages = options.maxPages || MAX_PAGES
    const jobsByCode = new Map()

    try {
        for (let page = 1; page <= maxPages; page += 1) {
            const upstreamUrl = new URL('/api/01/JCJob', configuredOrigin())
            upstreamUrl.searchParams.set('modifiedSince', modifiedSince)
            upstreamUrl.searchParams.set('page', String(page))
            upstreamUrl.searchParams.set('pageSize', String(PAGE_SIZE))
            upstreamUrl.searchParams.set('ApiKey', apiKey)
            const response = await (options.fetchImpl || fetch)(upstreamUrl, {
                headers: {
                    Accept: 'application/json',
                    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
                },
                signal: controller.signal,
            })
            if (!response.ok) {
                const error = new Error('The Lift Trucks API could not complete the modified Job request.')
                error.status = response.status
                throw error
            }
            const responseBody = await response.text()
            const upstreamJobs = responseBody.trimStart().startsWith('<')
                ? greenTreeJobsFromXml(responseBody)
                : greenTreeJobsFromPayload(JSON.parse(responseBody))
            const pageJobs = upstreamJobs.map(greenTreeJobSummary).filter((job) => job.code)
            pageJobs.forEach((job) => {
                const existing = jobsByCode.get(job.code)
                if (!existing || String(job.modifiedTimeStamp || '') >= String(existing.modifiedTimeStamp || '')) jobsByCode.set(job.code, job)
            })
            if (pageJobs.length < PAGE_SIZE) return [...jobsByCode.values()]
        }
        throw new Error(`The Lift Trucks API modified Job result exceeded the ${maxPages * PAGE_SIZE} record safety limit.`)
    } finally {
        clearTimeout(timeout)
    }
}

module.exports = {
    fetchGreenTreeJobsModifiedSince,
    greenTreeJobsFromPayload,
    greenTreeJobsFromXml,
    greenTreeJobSummary,
    _test: { configuredOrigin, credentials, decodeXmlText, xmlElementText, PAGE_SIZE, MAX_PAGES },
}
