import fs from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const outputPath = path.resolve(process.argv[2] || path.join(repositoryRoot, '.tmp', 'greentree-billing-review-data.json'))
const cachePath = path.resolve(process.argv[3] || path.join(repositoryRoot, '.tmp', 'greentree-job-customer-cache.json'))

async function loadEnvironment() {
    for (const name of ['.env', '.env.local', '.env.development.local']) {
        try {
            const text = await fs.readFile(path.join(repositoryRoot, name), 'utf8')
            for (const line of text.split(/\r?\n/)) {
                const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
                if (!match || process.env[match[1]]) continue
                const raw = match[2].trim()
                process.env[match[1]] = raw.replace(/^(['"])(.*)\1$/, '$2')
            }
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error
        }
    }
}

function requiredEnvironment(name) {
    const value = String(process.env[name] || '').trim()
    if (!value) throw new Error(`${name} is not configured.`)
    return value
}

async function acquireDataverseToken() {
    const origin = new URL(requiredEnvironment('DATAVERSE_URL')).origin
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(requiredEnvironment('DATAVERSE_TENANT_ID'))}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: requiredEnvironment('DATAVERSE_CLIENT_ID'),
            client_secret: requiredEnvironment('DATAVERSE_CLIENT_SECRET'),
            scope: `${origin}/.default`,
        }),
    })
    if (!response.ok) throw new Error(`Dataverse application sign-in failed (${response.status}).`)
    const body = await response.json()
    if (!body.access_token) throw new Error('Dataverse application sign-in returned no token.')
    return { origin, token: body.access_token }
}

async function fetchAllDataverseRows(initialUrl, token) {
    const rows = []
    let next = initialUrl
    while (next) {
        const response = await fetch(next, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error(`Dataverse read failed (${response.status}).`)
        const body = await response.json()
        rows.push(...(Array.isArray(body.value) ? body.value : []))
        next = body['@odata.nextLink'] || ''
    }
    return rows
}

function dataverseCollectionUrl(origin, entitySet, select, expand = '') {
    const url = new URL(`/api/data/v9.2/${entitySet}`, origin)
    url.searchParams.set('$select', select)
    if (expand) url.searchParams.set('$expand', expand)
    return url.toString()
}

function decodeXml(value) {
    return String(value || '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&#([0-9]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
        .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'").replaceAll('&amp;', '&')
        .replaceAll('\u0091', '‘').replaceAll('\u0092', '’')
        .replaceAll('\u0093', '“').replaceAll('\u0094', '”')
        .replaceAll('\u0096', '–').replaceAll('\u0097', '—')
        .trim()
}

function xmlText(xml, name) {
    const match = String(xml).match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
    return match ? decodeXml(match[1]) : ''
}

async function readCache() {
    try { return JSON.parse(await fs.readFile(cachePath, 'utf8')) }
    catch (error) {
        if (error?.code === 'ENOENT') return {}
        throw error
    }
}

async function writeCache(cache) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true })
    await fs.writeFile(cachePath, JSON.stringify(cache, null, 2))
}

async function fetchGreenTreeJob(jobNumber) {
    const url = new URL(`/api/01/JCJob/${encodeURIComponent(jobNumber)}`, 'https://webview.liftrucks.co.nz')
    url.searchParams.set('ApiKey', process.env.LIFTTRUCKS_API_KEY || '500256')
    const authorization = Buffer.from(`${requiredEnvironment('LIFTTRUCKS_API_USERNAME')}:${requiredEnvironment('LIFTTRUCKS_API_PASSWORD')}`).toString('base64')
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await fetch(url, { headers: { Accept: 'application/xml', Authorization: `Basic ${authorization}` } })
        if (response.status === 404) return { found: false }
        if (response.ok) {
            const xml = await response.text()
            return {
                found: true,
                code: xmlText(xml, 'Code') || jobNumber,
                customerCode: xmlText(xml, 'Customer'),
                customerName: xmlText(xml, 'CustomerName'),
                modifiedOn: xmlText(xml, 'ModifiedTimeStamp'),
                createdOn: xmlText(xml, 'CreateDate'),
            }
        }
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
            continue
        }
        throw new Error(`GreenTree lookup for ${jobNumber} failed (${response.status}).`)
    }
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

await loadEnvironment()
const { origin, token } = await acquireDataverseToken()
const [sites, jobs] = await Promise.all([
    fetchAllDataverseRows(dataverseCollectionUrl(
        origin,
        'gr_sites',
        'gr_siteid,gr_name,gr_address,_gr_customer_value',
        'gr_Customer($select=gr_customerid,gr_name)',
    ), token),
    fetchAllDataverseRows(dataverseCollectionUrl(
        origin,
        'gr_jobs',
        'gr_jobid,gr_jobnumber,gr_description,createdon,_gr_site_value,_gr_equipment_value',
        'gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial)',
    ), token),
])

const jobsToCheck = jobs
    .filter((job) => job.gr_jobnumber && job.gr_Site?.gr_siteid)
    .map((job) => ({
        jobId: job.gr_jobid,
        jobNumber: String(job.gr_jobnumber).trim(),
        createdOn: job.createdon || '',
        siteId: job.gr_Site.gr_siteid,
        siteName: job.gr_Site.gr_name || '',
        siteAddress: job.gr_Site.gr_address || '',
        serviceCustomerName: job.gr_Site.gr_Customer?.gr_name || '',
        description: job.gr_description || '',
        equipmentFleet: job.gr_Equipment?.gr_fleet || '',
        equipmentMake: job.gr_Equipment?.gr_make || '',
        equipmentModel: job.gr_Equipment?.gr_model || '',
        equipmentSerial: job.gr_Equipment?.gr_serial || '',
    }))

const cache = await readCache()
let completed = 0
const results = await mapWithConcurrency(jobsToCheck, 8, async (job) => {
    if (!cache[job.jobNumber]) {
        cache[job.jobNumber] = await fetchGreenTreeJob(job.jobNumber)
        if (Object.keys(cache).length % 50 === 0) await writeCache(cache)
    }
    completed += 1
    if (completed % 100 === 0 || completed === jobsToCheck.length) process.stdout.write(`Checked ${completed} of ${jobsToCheck.length} Jobs.\n`)
    return { ...job, greenTree: cache[job.jobNumber] }
})
await writeCache(cache)

const evidenceBySite = new Map()
for (const result of results) {
    if (!result.greenTree?.found || !result.greenTree.customerCode) continue
    const evidence = evidenceBySite.get(result.siteId.toLowerCase()) || []
    evidence.push(result)
    evidenceBySite.set(result.siteId.toLowerCase(), evidence)
}

const rows = sites.map((site) => {
    const evidence = evidenceBySite.get(String(site.gr_siteid).toLowerCase()) || []
    const byCode = new Map()
    for (const item of evidence) {
        const code = item.greenTree.customerCode
        const bucket = byCode.get(code) || { code, name: item.greenTree.customerName, count: 0, latestSort: '', latestJobNumber: '', latestJobDate: '' }
        bucket.count += 1
        const date = item.greenTree.modifiedOn || item.greenTree.createdOn || item.createdOn || ''
        if (date >= bucket.latestSort) {
            bucket.latestSort = date
            bucket.latestJobNumber = item.jobNumber
            bucket.latestJobDate = date
            bucket.name = item.greenTree.customerName || bucket.name
        }
        byCode.set(code, bucket)
    }
    const accounts = [...byCode.values()].sort((a, b) => b.count - a.count || b.latestSort.localeCompare(a.latestSort) || a.code.localeCompare(b.code))
    const proposed = accounts[0] || null
    return {
        customerName: site.gr_Customer?.gr_name || '',
        siteName: site.gr_name || '',
        address: site.gr_address || '',
        proposedCustomerCode: proposed?.code || '',
        proposedLegalName: proposed?.name || '',
        evidenceJobs: evidence.length,
        latestJobNumber: proposed?.latestJobNumber || '',
        latestJobDate: proposed?.latestJobDate || '',
        conflictingCodes: accounts.length > 1 ? 'Yes' : 'No',
        observedAccounts: accounts.map((account) => `${account.code} - ${account.name || 'Name unavailable'} (${account.count})`).join('; '),
        evidenceDetails: evidence
            .map((item) => ({
                jobId: item.jobId,
                jobNumber: item.jobNumber,
                jobCreatedOn: item.createdOn,
                siteName: item.siteName,
                siteAddress: item.siteAddress,
                serviceCustomerName: item.serviceCustomerName,
                description: item.description,
                equipmentFleet: item.equipmentFleet,
                equipmentMake: item.equipmentMake,
                equipmentModel: item.equipmentModel,
                equipmentSerial: item.equipmentSerial,
                greenTreeCustomerCode: item.greenTree.customerCode,
                greenTreeCustomerName: item.greenTree.customerName,
                greenTreeModifiedOn: item.greenTree.modifiedOn,
            }))
            .sort((a, b) => String(b.greenTreeModifiedOn || b.jobCreatedOn).localeCompare(String(a.greenTreeModifiedOn || a.jobCreatedOn))),
        decision: '',
        confirmedCustomerCode: proposed?.code || '',
        confirmedLegalName: proposed?.name || '',
        notes: '',
        siteId: site.gr_siteid,
        customerId: site.gr_Customer?.gr_customerid || site._gr_customer_value || '',
    }
}).sort((a, b) => {
    if (a.conflictingCodes !== b.conflictingCodes) return a.conflictingCodes === 'Yes' ? -1 : 1
    if (Boolean(a.proposedCustomerCode) !== Boolean(b.proposedCustomerCode)) return a.proposedCustomerCode ? -1 : 1
    return a.customerName.localeCompare(b.customerName) || a.siteName.localeCompare(b.siteName)
})

const output = {
    generatedOn: new Date().toISOString(),
    source: 'Current Dataverse Sites and Jobs matched through read-only GreenTree JCJob lookups.',
    counts: {
        sites: rows.length,
        jobsChecked: jobsToCheck.length,
        jobsFoundInGreenTree: results.filter((item) => item.greenTree?.found).length,
        jobsWithBillingAccount: results.filter((item) => item.greenTree?.found && item.greenTree.customerCode).length,
        sitesWithProposal: rows.filter((item) => item.proposedCustomerCode).length,
        sitesWithConflicts: rows.filter((item) => item.conflictingCodes === 'Yes').length,
    },
    rows,
}
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(output, null, 2))
process.stdout.write(`${JSON.stringify(output.counts)}\n`)
process.stdout.write(`Saved review data to ${outputPath}\n`)
