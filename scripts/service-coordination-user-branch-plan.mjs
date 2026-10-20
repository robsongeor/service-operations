#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const branchValues = new Set([122830000, 122830001, 122830002, 122830003])

function parseArgs(values) {
    const result = {}
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]
        if (!value.startsWith('--')) throw new Error(`Unexpected argument: ${value}`)
        const key = value.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        const next = values[index + 1]
        if (!next || next.startsWith('--')) result[key] = true
        else { result[key] = next; index += 1 }
    }
    return result
}

function stable(value) {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    return value
}

function hash(value) {
    return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

function readJson(path, label) {
    if (!path) throw new Error(`${label} path is required.`)
    const resolved = resolve(path)
    if (!existsSync(resolved)) throw new Error(`${label} was not found: ${resolved}`)
    return JSON.parse(readFileSync(resolved, 'utf8'))
}

function writeJson(path, value) {
    if (!path) throw new Error('An explicit --output path is required.')
    const resolved = resolve(path)
    const temporary = `${resolved}.tmp`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    renameSync(temporary, resolved)
}

function normalizeUpn(value) {
    const upn = typeof value === 'string' ? value.trim().toLowerCase() : ''
    if (!/^[^@\s]+@[^@\s]+$/.test(upn)) throw new Error('Every mapping requires a valid user principal name.')
    return upn
}

function createPlan(snapshot, mapping) {
    if (snapshot?.schemaVersion !== 1 || snapshot.mutationsPerformed !== false || !Array.isArray(snapshot.users)) {
        throw new Error('A read-only System User branch snapshot with schemaVersion 1 is required.')
    }
    if (mapping?.schemaVersion !== 1 || mapping.allBranchesAvailable !== true || !Array.isArray(mapping.users)) {
        throw new Error('A reviewed all-branches user mapping with schemaVersion 1 is required.')
    }
    const snapshotByUpn = new Map()
    for (const user of snapshot.users) {
        const upn = normalizeUpn(user.userPrincipalName)
        if (snapshotByUpn.has(upn)) throw new Error(`Duplicate snapshot user: ${upn}`)
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(user.systemUserId ?? '')) throw new Error(`Invalid System User id for ${upn}.`)
        if (!String(user.etag ?? '').trim()) throw new Error(`Missing row version for ${upn}.`)
        if (user.isDisabled !== false) throw new Error(`Mapped System User is disabled: ${upn}`)
        snapshotByUpn.set(upn, user)
    }
    const seen = new Set()
    const outcomes = mapping.users.map((item) => {
        const upn = normalizeUpn(item.userPrincipalName)
        if (seen.has(upn)) throw new Error(`Duplicate mapping user: ${upn}`)
        seen.add(upn)
        if (!branchValues.has(item.homeBranch)) throw new Error(`Unsupported home branch for ${upn}.`)
        const current = snapshotByUpn.get(upn)
        if (!current) throw new Error(`No resolved enabled System User evidence exists for ${upn}.`)
        return {
            systemUserId: current.systemUserId.toLowerCase(),
            userPrincipalName: upn,
            disposition: current.currentBranch === item.homeBranch ? 'unchanged' : 'change',
            currentValue: current.currentBranch ?? null,
            proposedValue: item.homeBranch,
            expectedRowVersion: String(current.etag),
            reasonCode: 'approved-home-branch-mapping',
        }
    }).sort((left, right) => left.systemUserId.localeCompare(right.systemUserId))
    if (outcomes.length !== snapshot.users.length) throw new Error('Every resolved snapshot user must have exactly one reviewed mapping.')
    const basis = {
        schemaVersion: 1,
        migrationId: 'service-coordination-user-home-branches-v1',
        target: 'systemuser.gr_serviceoperationsbranch',
        allBranchesAvailable: true,
        outcomes,
    }
    const planHash = hash(basis)
    return {
        ...basis,
        planHash,
        runIdentifier: `service-coordination-user-home-branches-v1-${planHash.slice(0, 16)}`,
        counts: {
            change: outcomes.filter((item) => item.disposition === 'change').length,
            unchanged: outcomes.filter((item) => item.disposition === 'unchanged').length,
        },
        mutationsPerformed: false,
        applyRequiresExactHash: true,
    }
}

function assertPlan(plan, approvedHash) {
    const basis = {
        schemaVersion: plan.schemaVersion,
        migrationId: plan.migrationId,
        target: plan.target,
        allBranchesAvailable: plan.allBranchesAvailable,
        outcomes: plan.outcomes,
    }
    const actual = hash(basis)
    if (actual !== plan.planHash || actual !== approvedHash) throw new Error('The user home-branch Plan hash does not match the explicitly approved artifact.')
    if (plan.migrationId !== 'service-coordination-user-home-branches-v1') throw new Error('The Plan belongs to a different migration.')
    return actual
}

function rowVersion(etag) {
    const match = /(?:W\/)?"?(\d+)"?/.exec(String(etag ?? ''))
    return match?.[1] ?? ''
}

function loadCheckpoint(path, planHash) {
    if (!path || !existsSync(resolve(path))) return { schemaVersion: 1, planHash, completed: [], audit: [] }
    const checkpoint = readJson(path, 'Checkpoint')
    if (checkpoint.planHash !== planHash) throw new Error('Checkpoint belongs to a different Plan.')
    return checkpoint
}

class DataverseUserStore {
    constructor(url, token) {
        this.base = new URL('/api/data/v9.2/', url).toString()
        this.token = token
    }
    headers(extra = {}) { return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...extra } }
    async get(id) {
        const response = await fetch(new URL(`systemusers(${id})?$select=systemuserid,gr_serviceoperationsbranch,isdisabled`, this.base), { cache: 'no-store', headers: this.headers() })
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Dataverse System User read failed with ${response.status}.`)
        const row = await response.json()
        return { id, etag: row['@odata.etag'] ?? '', rowVersion: rowVersion(row['@odata.etag']), currentBranch: row.gr_serviceoperationsbranch ?? null, isDisabled: row.isdisabled === true }
    }
    async update(id, value, etag) {
        const response = await fetch(new URL(`systemusers(${id})`, this.base), {
            method: 'PATCH',
            headers: this.headers({ 'Content-Type': 'application/json', 'If-Match': etag }),
            body: JSON.stringify({ gr_serviceoperationsbranch: value }),
        })
        if (response.status === 412) return { conflict: true }
        if (!response.ok) throw new Error(`Dataverse System User conditional update failed with ${response.status}.`)
        return { conflict: false }
    }
}

async function applyPlan(plan, args) {
    const planHash = assertPlan(plan, args.approvedPlanHash)
    if (!args.checkpoint || !args.output) throw new Error('Apply requires explicit --checkpoint and --output paths.')
    if (!args.environmentUrl || !process.env.DATAVERSE_ACCESS_TOKEN) throw new Error('Live Apply requires --environment-url and DATAVERSE_ACCESS_TOKEN.')
    const checkpoint = loadCheckpoint(args.checkpoint, planHash)
    const completed = new Set(checkpoint.completed)
    const audit = Array.isArray(checkpoint.audit) ? [...checkpoint.audit] : []
    const store = new DataverseUserStore(args.environmentUrl, process.env.DATAVERSE_ACCESS_TOKEN)
    for (const change of plan.outcomes.filter((item) => item.disposition === 'change')) {
        if (completed.has(change.systemUserId)) continue
        const current = await store.get(change.systemUserId)
        if (!current) audit.push({ systemUserId: change.systemUserId, outcome: 'missing' })
        else if (current.isDisabled) audit.push({ systemUserId: change.systemUserId, outcome: 'disabled-preserved' })
        else if (current.currentBranch === change.proposedValue) audit.push({ systemUserId: change.systemUserId, outcome: 'already-applied', afterRowVersion: current.rowVersion })
        else if (current.currentBranch !== change.currentValue || current.rowVersion !== rowVersion(change.expectedRowVersion)) {
            audit.push({ systemUserId: change.systemUserId, outcome: 'conflict', currentValue: current.currentBranch, currentRowVersion: current.rowVersion })
        } else {
            const result = await store.update(change.systemUserId, change.proposedValue, current.etag)
            audit.push({ systemUserId: change.systemUserId, outcome: result.conflict ? 'conflict' : 'updated', previousValue: change.currentValue, newValue: change.proposedValue, beforeRowVersion: current.rowVersion })
        }
        completed.add(change.systemUserId)
        writeJson(args.checkpoint, { schemaVersion: 1, planHash, completed: [...completed].sort(), audit })
    }
    const result = { schemaVersion: 1, mode: 'Apply', migrationId: plan.migrationId, planHash, runIdentifier: plan.runIdentifier, mutationsPerformed: audit.some((item) => item.outcome === 'updated'), audit }
    writeJson(args.output, result)
    return result
}

async function verifyPlan(plan, args) {
    assertPlan(plan, args.approvedPlanHash)
    if (!args.environmentUrl || !process.env.DATAVERSE_ACCESS_TOKEN) throw new Error('Live Verify requires --environment-url and DATAVERSE_ACCESS_TOKEN.')
    const store = new DataverseUserStore(args.environmentUrl, process.env.DATAVERSE_ACCESS_TOKEN)
    const results = []
    for (const item of plan.outcomes) {
        const current = await store.get(item.systemUserId)
        results.push({ systemUserId: item.systemUserId, outcome: current && !current.isDisabled && current.currentBranch === item.proposedValue ? 'verified' : 'mismatch' })
    }
    const result = { schemaVersion: 1, mode: 'Verify', mutationsPerformed: false, planHash: plan.planHash, counts: { verified: results.filter((item) => item.outcome === 'verified').length, mismatch: results.filter((item) => item.outcome === 'mismatch').length }, results }
    writeJson(args.output, result)
    return result
}

try {
    const args = parseArgs(process.argv.slice(2))
    const mode = String(args.mode ?? 'Plan').toLowerCase()
    if (mode === 'plan') {
        const plan = createPlan(readJson(args.input, 'Snapshot'), readJson(args.mapping, 'Mapping'))
        writeJson(args.output, plan)
        console.log(JSON.stringify({ mode: 'Plan', mutationsPerformed: false, counts: plan.counts, planHash: plan.planHash, runIdentifier: plan.runIdentifier }))
    } else if (mode === 'apply') {
        const result = await applyPlan(readJson(args.plan, 'Plan'), args)
        console.log(JSON.stringify({ mode: 'Apply', mutationsPerformed: result.mutationsPerformed, auditCount: result.audit.length }))
    } else if (mode === 'verify') {
        const result = await verifyPlan(readJson(args.plan, 'Plan'), args)
        console.log(JSON.stringify({ mode: 'Verify', mutationsPerformed: false, counts: result.counts }))
    } else throw new Error('--mode must be Plan, Apply or Verify.')
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
}
