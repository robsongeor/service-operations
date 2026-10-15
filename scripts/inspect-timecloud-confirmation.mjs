import fs from 'node:fs'

const jobNumber = process.argv[2]
if (!/^\d{6}$/.test(jobNumber || '')) throw new Error('Supply one six-digit test Job Number.')
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim()
}
const origin = new URL(process.env.DATAVERSE_URL).origin
const tokenResponse = await fetch(`https://login.microsoftonline.com/${process.env.DATAVERSE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: process.env.DATAVERSE_CLIENT_ID,
        client_secret: process.env.DATAVERSE_CLIENT_SECRET, scope: `${origin}/.default`,
    }),
})
if (!tokenResponse.ok) throw new Error(`Token HTTP ${tokenResponse.status}`)
const token = (await tokenResponse.json()).access_token
const query = new URL(`${origin}/api/data/v9.2/gr_jobs`)
query.searchParams.set('$select', 'gr_jobnumber,gr_timecloudentered,gr_timecloudjobitemid,gr_timecloudcode')
query.searchParams.set('$filter', `gr_jobnumber eq '${jobNumber}'`)
const response = await fetch(query, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
if (!response.ok) throw new Error(`Dataverse HTTP ${response.status}`)
const rows = (await response.json()).value
if (rows.length !== 1) throw new Error(`Expected one Job; found ${rows.length}.`)
const row = rows[0]
console.log(`JOB=${row.gr_jobnumber} ENTERED=${row.gr_timecloudentered} ITEM_ID=${row.gr_timecloudjobitemid} CODE=${row.gr_timecloudcode}`)
