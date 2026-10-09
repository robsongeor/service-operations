import fs from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
if (process.argv.includes('--apply')) {
    throw new Error('The application identity is read-only. Generate the plan here, then use apply-greentree-site-customer-backfill.ps1 -Apply.')
}
const positional = process.argv.slice(2).filter((value) => !value.startsWith('--'))
const reviewPath = path.resolve(positional[0] || path.join(repositoryRoot, '.tmp', 'greentree-billing-review-data.json'))
const decisionsPath = path.resolve(positional[1] || path.join(repositoryRoot, 'config', 'greentree-site-conflict-decisions.json'))
const planPath = path.resolve(positional[2] || path.join(repositoryRoot, '.tmp', 'greentree-site-customer-backfill-plan.json'))

async function loadEnvironment() {
    for (const name of ['.env', '.env.local', '.env.development.local']) {
        try {
            const text = await fs.readFile(path.join(repositoryRoot, name), 'utf8')
            for (const line of text.split(/\r?\n/)) {
                const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
                if (!match || process.env[match[1]]) continue
                process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
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

function normalizeLegacyText(value) {
    return String(value || '')
        .replaceAll('\u0091', '‘').replaceAll('\u0092', '’')
        .replaceAll('\u0093', '“').replaceAll('\u0094', '”')
        .replaceAll('\u0096', '–').replaceAll('\u0097', '—')
        .trim()
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

async function fetchCurrentSites(origin, token) {
    const rows = []
    let next = new URL('/api/data/v9.2/gr_sites', origin)
    next.searchParams.set('$select', 'gr_siteid,gr_name,gr_greentreecustomercode,gr_greentreecustomername')
    while (next) {
        const response = await fetch(next, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } })
        if (!response.ok) throw new Error(`Dataverse Site read failed (${response.status}). Provision the mapping columns first.`)
        const body = await response.json()
        rows.push(...(body.value || []))
        next = body['@odata.nextLink'] ? new URL(body['@odata.nextLink']) : null
    }
    return rows
}

function buildPlan(review, decisions, currentSites) {
    const decisionBySite = new Map(decisions.map((decision) => [decision.siteId.toLowerCase(), decision]))
    const currentBySite = new Map(currentSites.map((site) => [site.gr_siteid.toLowerCase(), site]))
    const unresolvedConflicts = review.rows.filter((row) => row.conflictingCodes === 'Yes'
        && !decisionBySite.has(row.siteId.toLowerCase()))
    if (unresolvedConflicts.length) {
        throw new Error(`Conflict decisions are missing for ${unresolvedConflicts.length} Site(s).`)
    }

    return review.rows.map((row) => {
        const decision = decisionBySite.get(row.siteId.toLowerCase())
        if (decision?.decision === 'skip') return { ...row, action: 'skip', reason: 'Explicitly excluded during review.' }
        const code = String(decision?.code || row.proposedCustomerCode || '').trim()
        const name = normalizeLegacyText(decision?.name || row.proposedLegalName)
        if (!code) return { ...row, action: 'skip', reason: 'No GreenTree customer evidence.' }
        const current = currentBySite.get(row.siteId.toLowerCase())
        if (!current) return { ...row, code, name, action: 'error', reason: 'Site no longer exists in Dataverse.' }
        const unchanged = String(current.gr_greentreecustomercode || '').trim() === code
            && String(current.gr_greentreecustomername || '').trim() === name
        return {
            siteId: row.siteId,
            customerName: row.customerName,
            siteName: row.siteName,
            code,
            name,
            currentCode: String(current.gr_greentreecustomercode || '').trim(),
            currentName: String(current.gr_greentreecustomername || '').trim(),
            action: unchanged ? 'unchanged' : 'update',
            evidenceJobs: row.evidenceJobs,
            conflictDecision: row.conflictingCodes === 'Yes' ? decision?.decision : 'single-account evidence',
        }
    })
}

await loadEnvironment()
const [review, decisions] = await Promise.all([
    fs.readFile(reviewPath, 'utf8').then(JSON.parse),
    fs.readFile(decisionsPath, 'utf8').then(JSON.parse),
])
const { origin, token } = await acquireDataverseToken()
const currentSites = await fetchCurrentSites(origin, token)
const plan = buildPlan(review, decisions, currentSites)
const counts = Object.fromEntries(['update', 'unchanged', 'skip', 'error'].map((action) => [
    action,
    plan.filter((row) => row.action === action).length,
]))
await fs.mkdir(path.dirname(planPath), { recursive: true })
await fs.writeFile(planPath, JSON.stringify({ generatedOn: new Date().toISOString(), counts, rows: plan }, null, 2))
process.stdout.write(`Audit plan: ${JSON.stringify(counts)}\n`)
process.stdout.write(`Plan written to ${planPath}\n`)
if (counts.error) throw new Error('The plan contains missing Sites; no changes were applied.')
process.stdout.write('No Dataverse records changed. Use the delegated PowerShell apply script after reviewing the plan.\n')
