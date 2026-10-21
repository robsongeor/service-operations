#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(repository, 'dataverse/service-coordination/v3-managed-migration-manifest.json'), 'utf8'))
const GUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

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
const hash = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
function readJson(path, label) {
    if (!path) throw new Error(`${label} path is required.`)
    const target = resolve(path)
    if (!existsSync(target)) throw new Error(`${label} was not found: ${target}`)
    return JSON.parse(readFileSync(target, 'utf8'))
}
function writeJson(path, value) {
    if (!path) throw new Error('An explicit --output path is required.')
    const target = resolve(path)
    const temporary = `${target}.tmp`
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    renameSync(temporary, target)
}
function normalizeEtag(value) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
    const match = /^(?:W\/)?"?(\d+)"?$/.exec(text)
    return match ? `W/"${match[1]}"` : text
}
function normalizeStatus(value) { return typeof value === 'string' ? value.trim().toLowerCase() : '' }
function validateSnapshot(snapshot) {
    if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.jobs)) throw new Error('Snapshot schemaVersion 1 with a jobs array is required.')
    if (snapshot.jobs.length > manifest.maximumRecords) throw new Error(`Snapshot exceeds the reviewed ${manifest.maximumRecords}-record bound.`)
    const ids = new Set()
    return snapshot.jobs.map((row) => {
        const id = String(row?.id ?? '').toLowerCase()
        if (!GUID.test(id) || ids.has(id)) throw new Error('Every Job requires one unique GUID id.')
        ids.add(id)
        if (row.coordinatorManaged !== true && row.coordinatorManaged !== false && row.coordinatorManaged !== null && row.coordinatorManaged !== undefined) throw new Error(`Job ${id} has an invalid managed value.`)
        if (row.operatingBranch !== null && row.operatingBranch !== undefined && !Number.isInteger(row.operatingBranch)) throw new Error(`Job ${id} has an invalid branch value.`)
        return {
            id,
            etag: normalizeEtag(row.etag),
            inactive: row.inactive === true,
            registrationVoid: row.registrationVoid === true,
            greenTreeStatus: normalizeStatus(row.greenTreeStatus),
            coordinatorManaged: row.coordinatorManaged === true,
            operatingBranch: row.operatingBranch ?? null,
        }
    }).sort((left, right) => left.id.localeCompare(right.id))
}
function classify(row) {
    const current = { coordinatorManaged: row.coordinatorManaged, operatingBranch: row.operatingBranch }
    if (!row.etag) return { jobId: row.id, disposition: 'exception', expectedEtag: '', current, proposed: null, reasonCode: 'missing-etag' }
    if (row.inactive) return { jobId: row.id, disposition: 'excluded', expectedEtag: row.etag, current, proposed: null, reasonCode: 'inactive' }
    if (row.registrationVoid) return { jobId: row.id, disposition: 'excluded', expectedEtag: row.etag, current, proposed: null, reasonCode: 'registration-void' }
    if (manifest.terminalGreenTreeStatuses.includes(row.greenTreeStatus)) return { jobId: row.id, disposition: 'excluded', expectedEtag: row.etag, current, proposed: null, reasonCode: `greentree-${row.greenTreeStatus}` }
    const proposed = { coordinatorManaged: manifest.target.coordinatorManaged, operatingBranch: manifest.target.operatingBranch }
    const unchanged = current.coordinatorManaged === proposed.coordinatorManaged && current.operatingBranch === proposed.operatingBranch
    return { jobId: row.id, disposition: unchanged ? 'unchanged' : 'change', expectedEtag: row.etag, current, proposed, reasonCode: 'active-history-managed-auckland' }
}
function makePlan(snapshot) {
    const outcomes = validateSnapshot(snapshot).map(classify)
    const basis = { schemaVersion: 1, migrationId: manifest.migrationId, outcomes }
    const planHash = hash(basis)
    return {
        ...basis,
        planHash,
        runIdentifier: `${manifest.migrationId}-${planHash.slice(0, 16)}`,
        target: manifest.target,
        counts: Object.fromEntries(['change', 'unchanged', 'excluded', 'exception'].map((kind) => [kind, outcomes.filter((item) => item.disposition === kind).length])),
        applyRequiresExactHash: true,
        mutationsPerformed: false,
    }
}
function validatePlan(plan, approvedHash) {
    const actual = hash({ schemaVersion: plan.schemaVersion, migrationId: plan.migrationId, outcomes: plan.outcomes })
    if (actual !== plan.planHash || actual !== approvedHash) throw new Error('The Plan hash does not match the explicitly approved artifact.')
    if (plan.migrationId !== manifest.migrationId) throw new Error('The Plan belongs to a different migration.')
    return actual
}
function requireApplicablePlan(plan) {
    const exceptions = plan.outcomes.filter((item) => item.disposition === 'exception')
    if (exceptions.length > 0) throw new Error(`Apply is blocked because the Plan contains ${exceptions.length} exception record(s).`)
}
function nextEtag(etag) {
    const match = /^(?:W\/)?"(\d+)"$/.exec(etag ?? '')
    return `W/"${match ? Number(match[1]) + 1 : 1}"`
}
class FakeStore {
    constructor(path) { this.path = path; this.state = readJson(path, 'Fake state') }
    async get(id) {
        const row = this.state.jobs.find((item) => item.id.toLowerCase() === id)
        return row ? { ...row, etag: normalizeEtag(row.etag), coordinatorManaged: row.coordinatorManaged === true, operatingBranch: row.operatingBranch ?? null } : null
    }
    async update(id, values, etag) {
        const row = this.state.jobs.find((item) => item.id.toLowerCase() === id)
        if (!row || normalizeEtag(row.etag) !== normalizeEtag(etag)) return { conflict: true }
        Object.assign(row, values); row.etag = nextEtag(normalizeEtag(row.etag)); writeJson(this.path, this.state)
        return { etag: row.etag }
    }
}
class DataverseStore {
    constructor(url, token) { this.base = new URL('/api/data/v9.2/', url); this.token = token }
    headers(extra = {}) { return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...extra } }
    async get(id) {
        const fields = Object.values(manifest.dataverseFields).join(',')
        const response = await fetch(new URL(`gr_jobs(${id})?$select=gr_jobid,${fields}`, this.base), { cache: 'no-store', headers: this.headers() })
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Dataverse read failed with ${response.status}.`)
        const row = await response.json()
        return { id, etag: normalizeEtag(row['@odata.etag']), coordinatorManaged: row.gr_coordinatormanaged === true, operatingBranch: row.gr_operatingbranch ?? null }
    }
    async update(id, values, etag) {
        const body = {
            [manifest.dataverseFields.coordinatorManaged]: values.coordinatorManaged,
            [manifest.dataverseFields.operatingBranch]: values.operatingBranch,
        }
        const response = await fetch(new URL(`gr_jobs(${id})`, this.base), {
            method: 'PATCH',
            headers: this.headers({ 'Content-Type': 'application/json', 'If-Match': normalizeEtag(etag) }),
            body: JSON.stringify(body),
        })
        if (response.status === 412) return { conflict: true }
        if (!response.ok) throw new Error(`Dataverse conditional update failed with ${response.status}.`)
        return { etag: (await this.get(id))?.etag ?? '' }
    }
}
function equalState(row, expected) {
    return row?.coordinatorManaged === expected?.coordinatorManaged && row?.operatingBranch === expected?.operatingBranch
}
function checkpoint(path, planHash) {
    if (!existsSync(resolve(path))) return { schemaVersion: 1, planHash, completed: [], audit: [] }
    const current = readJson(path, 'Checkpoint')
    if (current.planHash !== planHash) throw new Error('Checkpoint belongs to a different Plan.')
    return current
}
async function applyPlan(plan, args, store) {
    const planHash = validatePlan(plan, args.approvedPlanHash)
    requireApplicablePlan(plan)
    if (!args.checkpoint) throw new Error('Apply requires an explicit --checkpoint path.')
    const saved = checkpoint(args.checkpoint, planHash)
    const completed = new Set(saved.completed)
    const audit = [...saved.audit]
    let writes = 0
    const changes = plan.outcomes.filter((item) => item.disposition === 'change')
    for (let offset = 0; offset < changes.length; offset += manifest.batchSize) {
        for (const change of changes.slice(offset, offset + manifest.batchSize)) {
            if (completed.has(change.jobId)) continue
            const current = await store.get(change.jobId)
            if (!current) audit.push({ jobId: change.jobId, outcome: 'missing' })
            else if (equalState(current, change.proposed)) audit.push({ jobId: change.jobId, outcome: 'already-applied', afterEtag: current.etag })
            else if (!equalState(current, change.current) || normalizeEtag(current.etag) !== change.expectedEtag) audit.push({ jobId: change.jobId, outcome: 'conflict', current: { coordinatorManaged: current.coordinatorManaged, operatingBranch: current.operatingBranch }, currentEtag: current.etag })
            else {
                const result = await store.update(change.jobId, change.proposed, change.expectedEtag)
                if (result.conflict) audit.push({ jobId: change.jobId, outcome: 'conflict' })
                else { audit.push({ jobId: change.jobId, outcome: 'updated', previous: change.current, applied: change.proposed, beforeEtag: change.expectedEtag, afterEtag: result.etag }); writes += 1 }
            }
            completed.add(change.jobId)
            writeJson(args.checkpoint, { schemaVersion: 1, planHash, completed: [...completed].sort(), audit })
            if (args.failAfter && writes >= Number(args.failAfter)) throw new Error('Simulated interruption after checkpointed writes.')
        }
    }
    const artifact = { schemaVersion: 1, mode: 'Apply', migrationId: manifest.migrationId, planHash, runIdentifier: plan.runIdentifier, mutationsPerformed: writes > 0, audit }
    writeJson(args.output, artifact)
    return artifact
}
async function verify(plan, args, store) {
    validatePlan(plan, args.approvedPlanHash ?? plan.planHash)
    const results = []
    for (const item of plan.outcomes) {
        if (item.disposition === 'exception') { results.push({ jobId: item.jobId, outcome: 'exception-retained' }); continue }
        const current = await store.get(item.jobId)
        if (item.disposition === 'excluded') {
            const untouched = equalState(current, item.current) && normalizeEtag(current?.etag) === item.expectedEtag
            results.push({ jobId: item.jobId, outcome: untouched ? 'excluded-verified' : 'excluded-mismatch' })
            continue
        }
        results.push({ jobId: item.jobId, outcome: equalState(current, item.proposed) ? 'verified' : 'mismatch' })
    }
    const artifact = { schemaVersion: 1, mode: 'Verify', mutationsPerformed: false, counts: { verified: results.filter((row) => row.outcome === 'verified').length, mismatch: results.filter((row) => row.outcome === 'mismatch').length, excluded: results.filter((row) => row.outcome === 'excluded-verified').length, excludedMismatch: results.filter((row) => row.outcome === 'excluded-mismatch').length, exceptions: results.filter((row) => row.outcome === 'exception-retained').length }, results }
    if (args.output) writeJson(args.output, artifact)
    return artifact
}
async function rollback(applyArtifact, args, store) {
    if (applyArtifact.runIdentifier !== args.approvedRunId) throw new Error('Rollback requires the exact approved Apply run identifier.')
    const audit = []
    for (const item of applyArtifact.audit.filter((row) => row.outcome === 'updated')) {
        const current = await store.get(item.jobId)
        if (!current || current.etag !== item.afterEtag || !equalState(current, item.applied)) audit.push({ jobId: item.jobId, outcome: 'conflict-newer-work-preserved' })
        else {
            const result = await store.update(item.jobId, item.previous, item.afterEtag)
            audit.push({ jobId: item.jobId, outcome: result.conflict ? 'conflict-newer-work-preserved' : 'rolled-back', afterEtag: result.etag })
        }
    }
    const artifact = { schemaVersion: 1, mode: 'Rollback', migrationId: manifest.migrationId, runIdentifier: applyArtifact.runIdentifier, audit }
    writeJson(args.output, artifact)
    return artifact
}
async function main() {
    const args = parseArgs(process.argv.slice(2))
    const mode = String(args.mode ?? 'Inspect').toLowerCase()
    if (mode === 'inspect' || mode === 'plan') {
        const snapshot = readJson(args.input, 'Snapshot')
        const plan = makePlan(snapshot)
        if (mode === 'inspect') return { schemaVersion: 1, mode: 'Inspect', mutationsPerformed: false, jobsInspected: plan.outcomes.length, counts: plan.counts }
        writeJson(args.output, plan)
        return { mode: 'Plan', mutationsPerformed: false, planHash: plan.planHash, runIdentifier: plan.runIdentifier, counts: plan.counts }
    }
    const artifact = readJson(mode === 'rollback' ? args.applyArtifact : args.plan, mode === 'rollback' ? 'Apply artifact' : 'Plan')
    const store = args.live
        ? new DataverseStore(args.environmentUrl || (() => { throw new Error('Live mode requires --environment-url.') })(), process.env.DATAVERSE_ACCESS_TOKEN || (() => { throw new Error('Live mode requires DATAVERSE_ACCESS_TOKEN.') })())
        : new FakeStore(args.state)
    if (mode === 'apply') return applyPlan(artifact, args, store)
    if (mode === 'verify') return verify(artifact, args, store)
    if (mode === 'rollback') return rollback(artifact, args, store)
    throw new Error('--mode must be Inspect, Plan, Apply, Verify or Rollback.')
}

try { console.log(JSON.stringify(await main())) }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
