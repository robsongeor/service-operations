#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(repository, 'dataverse/service-coordination/migration-manifest.json'), 'utf8'))

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
function canonical(value) { return JSON.stringify(stable(value)) }
function sha(value) { return createHash('sha256').update(canonical(value)).digest('hex') }
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
    return resolved
}
function integer(value) { return Number.isInteger(value) ? value : null }
function strings(value) { return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().toLowerCase()))] }
function values(value) { return [...new Set((Array.isArray(value) ? value : []).map(integer).filter((item) => item !== null))] }
function normalizeEtag(value) {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
    if (!text) return ''
    const match = /^(?:W\/)?"?(\d+)"?$/.exec(text)
    return match ? `W/"${match[1]}"` : text
}

function validateSnapshot(snapshot) {
    if (snapshot?.schemaVersion !== 1 || !Array.isArray(snapshot.jobs)) throw new Error('Snapshot schemaVersion 1 with a jobs array is required.')
    if (snapshot.jobs.length > manifest.maximumRecords) throw new Error(`Snapshot exceeds the reviewed ${manifest.maximumRecords}-record bound.`)
    const ids = new Set()
    for (const job of snapshot.jobs) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(job.id ?? '')) throw new Error('Every Job requires a GUID id.')
        const id = job.id.toLowerCase()
        if (ids.has(id)) throw new Error(`Duplicate Job id: ${id}`)
        ids.add(id)
        if (integer(job.status) === null) throw new Error(`Job ${id} requires an integer status.`)
    }
    return snapshot.jobs.map((job) => ({ ...job, id: job.id.toLowerCase(), etag: normalizeEtag(job.etag) })).sort((a, b) => a.id.localeCompare(b.id))
}

function exception(job, target, code) {
    return { jobId: job.id, target, disposition: 'exception', currentValue: target === 'status' ? job.status : job.operatingBranch ?? null, proposedValue: null, expectedEtag: job.etag ?? '', reasonCode: code }
}
function outcome(job, target, proposedValue, reasonCode) {
    const currentValue = target === 'status' ? job.status : job.operatingBranch ?? null
    return { jobId: job.id, target, disposition: currentValue === proposedValue ? 'unchanged' : 'change', currentValue, proposedValue, expectedEtag: job.etag ?? '', reasonCode }
}

function classifyStatus(job) {
    const v = manifest.status.values
    if (!job.etag) return exception(job, 'status', 'missing-etag')
    if (job.inactive || job.registrationVoid || job.importedHistorical) return exception(job, 'status', 'excluded-history')
    if (job.status === v.legacyUnconfirmed) return outcome(job, 'status', v.staging, 'legacy-unconfirmed-retirement')
    if (job.status === v.actionRequired) return outcome(job, 'status', v.actionRequired, 'preserve-action-required')
    if (job.status === v.complete) return exception(job, 'status', 'complete-requires-side-effect-audit')
    if (job.externalSupplier && !job.externalHandoffAccepted) return exception(job, 'status', 'external-handoff-undefined')
    const evidence = job.statusEvidence
    if (!evidence || evidence.complete !== true || evidence.truncated || evidence.contradictory || evidence.assignmentChanged || evidence.duplicateLifecycle) {
        return exception(job, 'status', 'incomplete-or-conflicting-evidence')
    }
    const accepted = integer(evidence.acceptedReturns) ?? 0
    const required = integer(evidence.currentRequiredTechnicians) ?? 0
    if (accepted > 0 && required > 0 && evidence.allCurrentRequiredReturned === true) {
        return outcome(job, 'status', v.completionReview, 'all-current-required-cards-returned')
    }
    if (evidence.successfulDispatch === true || evidence.activeCardLifecycle === true || evidence.linkExpired === true) {
        return outcome(job, 'status', v.withTechnician, evidence.linkExpired ? 'expired-dispatch-follow-up' : 'confirmed-current-dispatch')
    }
    if (accepted === 0 && evidence.successfulDispatch === false && evidence.activeCardLifecycle === false) {
        return outcome(job, 'status', v.staging, 'no-authoritative-dispatch-or-return')
    }
    return exception(job, 'status', 'ambiguous-status-evidence')
}

function branchEvidence(job) {
    const registered = values(job.registeredLedgerBranches)
    if (registered.length > 1) return { error: 'conflicting-registered-ledgers' }
    if (registered.length === 1) return { value: registered[0], reason: 'linked-registered-regional-ledger' }
    const legacy = values(job.approvedLegacySourceBranches)
    if (legacy.length > 1) return { error: 'conflicting-approved-legacy-sources' }
    if (legacy.length === 1) return { value: legacy[0], reason: 'approved-legacy-regional-source' }
    const number = typeof job.jobNumber === 'string' ? job.jobNumber.trim().toUpperCase() : ''
    const prefix = Object.keys(manifest.branch.numberPrefixes).find((item) => number.startsWith(item) && /^\D+[0-9]+$/.test(number))
    if (prefix) return { value: manifest.branch.numberPrefixes[prefix], reason: 'unambiguous-supported-number-format' }
    const explicit = values(job.explicitReviewedBranches)
    if (explicit.length === 1) return { value: explicit[0], reason: 'explicit-reviewed-branch' }
    if (explicit.length > 1) return { error: 'conflicting-explicit-review' }
    return { error: number && /^\d+$/.test(number) ? 'plain-number-requires-approved-source-map' : 'branch-unclassified' }
}
function classifyBranch(job, policy = {}) {
    if (!job.etag) return exception(job, 'branch', 'missing-etag')
    if (job.registrationVoid) return exception(job, 'branch', 'excluded-void-history')
    const evidence = branchEvidence(job)
    if (evidence.error) {
        if (evidence.error === 'plain-number-requires-approved-source-map' && integer(policy.approvedPlainNumberBranch) !== null) {
            return outcome(job, 'branch', policy.approvedPlainNumberBranch, 'approved-historical-plain-number-baseline')
        }
        return exception(job, 'branch', evidence.error)
    }
    if (!Object.values(manifest.branch.values).includes(evidence.value)) return exception(job, 'branch', 'unsupported-branch-value')
    return outcome(job, 'branch', evidence.value, evidence.reason)
}

function approvedPlainNumberBranch(value) {
    if (value === undefined || value === null || value === '') return null
    const normalized = String(value).trim().toLowerCase()
    const branch = manifest.branch.values[normalized] ?? integer(Number(value))
    if (!Object.values(manifest.branch.values).includes(branch)) {
        throw new Error('--approved-plain-number-branch must name a supported branch or use its integer choice value.')
    }
    return branch
}

function policyFromArgs(args, target) {
    const branch = approvedPlainNumberBranch(args.approvedPlainNumberBranch)
    if (branch !== null && target !== 'branch') throw new Error('--approved-plain-number-branch is valid only with --target branch.')
    return branch === null ? {} : { approvedPlainNumberBranch: branch }
}

function plan(snapshot, target, policy = {}) {
    if (!['status', 'branch'].includes(target)) throw new Error('--target must be status or branch.')
    const outcomes = validateSnapshot(snapshot).map(target === 'status' ? classifyStatus : (job) => classifyBranch(job, policy))
    const basis = {
        schemaVersion: 1,
        migrationId: manifest.migrationId,
        target,
        ...(Object.keys(policy).length ? { policy } : {}),
        outcomes,
    }
    const planHash = sha(basis)
    return {
        ...basis, planHash, runIdentifier: `${manifest.migrationId}-${target}-${planHash.slice(0, 16)}`,
        counts: Object.fromEntries(['change', 'unchanged', 'exception'].map((kind) => [kind, outcomes.filter((item) => item.disposition === kind).length])),
        applyRequiresExactHash: true,
    }
}

function assertPlan(planArtifact, approvedHash) {
    const basis = {
        schemaVersion: planArtifact.schemaVersion,
        migrationId: planArtifact.migrationId,
        target: planArtifact.target,
        ...(Object.prototype.hasOwnProperty.call(planArtifact, 'policy') ? { policy: planArtifact.policy } : {}),
        outcomes: planArtifact.outcomes,
    }
    const actual = sha(basis)
    if (actual !== planArtifact.planHash || actual !== approvedHash) throw new Error('The Plan hash does not match the explicitly approved artifact.')
    if (planArtifact.migrationId !== manifest.migrationId) throw new Error('The Plan belongs to a different migration.')
    return actual
}
function nextEtag(etag) {
    const match = /^(?:W\/)?"(\d+)"$/.exec(etag ?? '')
    return `W/"${match ? Number(match[1]) + 1 : 1}"`
}

class FakeStore {
    constructor(path) { this.path = path; this.state = readJson(path, 'Fake state') }
    async get(id) { return this.state.jobs.find((job) => job.id.toLowerCase() === id) ?? null }
    async update(id, field, value, etag) {
        const job = await this.get(id)
        if (!job || job.etag !== etag) return { conflict: true, current: job }
        job[field] = value
        job.etag = nextEtag(job.etag)
        writeJson(this.path, this.state)
        return { etag: job.etag }
    }
}

class DataverseStore {
    constructor(url, token) {
        this.base = new URL('/api/data/v9.2/', url).toString()
        this.token = token
    }
    headers(extra = {}) { return { Authorization: `Bearer ${this.token}`, Accept: 'application/json', ...extra } }
    async get(id, field) {
        const response = await fetch(new URL(`gr_jobs(${id})?$select=gr_jobid,${field}`, this.base), { cache: 'no-store', headers: this.headers() })
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`Dataverse read failed with ${response.status}.`)
        const row = await response.json()
        return { id, etag: row['@odata.etag'], status: row.gr_status, operatingBranch: row.gr_operatingbranch }
    }
    async update(id, field, value, etag) {
        const response = await fetch(new URL(`gr_jobs(${id})`, this.base), {
            method: 'PATCH', headers: this.headers({ 'Content-Type': 'application/json', 'If-Match': etag }),
            body: JSON.stringify({ [field]: value }),
        })
        if (response.status === 412) return { conflict: true, current: await this.get(id, field) }
        if (!response.ok) throw new Error(`Dataverse conditional update failed with ${response.status}.`)
        const current = await this.get(id, field)
        return { etag: current?.etag ?? '' }
    }
}

function fieldFor(target) { return target === 'status' ? 'status' : 'operatingBranch' }
function dataverseFieldFor(target) { return target === 'status' ? manifest.status.dataverseField : manifest.branch.dataverseField }
function loadCheckpoint(path, planHash) {
    if (!path || !existsSync(resolve(path))) return { planHash, completed: [], audit: [] }
    const checkpoint = readJson(path, 'Checkpoint')
    if (checkpoint.planHash !== planHash) throw new Error('Checkpoint belongs to a different Plan.')
    return checkpoint
}

async function applyPlan(planArtifact, args, store) {
    const planHash = assertPlan(planArtifact, args.approvedPlanHash)
    if (!args.checkpoint) throw new Error('Apply requires an explicit --checkpoint path.')
    const checkpoint = loadCheckpoint(args.checkpoint, planHash)
    const completed = new Set(checkpoint.completed)
    const audit = Array.isArray(checkpoint.audit) ? [...checkpoint.audit] : []
    const changes = planArtifact.outcomes.filter((item) => item.disposition === 'change')
    let writes = 0
    for (let offset = 0; offset < changes.length; offset += manifest.batchSize) {
        for (const change of changes.slice(offset, offset + manifest.batchSize)) {
            if (completed.has(change.jobId)) continue
            const field = fieldFor(planArtifact.target)
            const current = await store.get(change.jobId, dataverseFieldFor(planArtifact.target))
            if (!current) audit.push({ jobId: change.jobId, outcome: 'missing' })
            else if (current[field] === change.proposedValue) audit.push({ jobId: change.jobId, outcome: 'already-applied', afterEtag: current.etag })
            else if (current[field] !== change.currentValue || normalizeEtag(current.etag) !== normalizeEtag(change.expectedEtag)) audit.push({ jobId: change.jobId, outcome: 'conflict', currentValue: current[field], currentEtag: current.etag })
            else {
                const result = await store.update(change.jobId, args.live ? dataverseFieldFor(planArtifact.target) : field, change.proposedValue, change.expectedEtag)
                if (result.conflict) audit.push({ jobId: change.jobId, outcome: 'conflict' })
                else { audit.push({ jobId: change.jobId, outcome: 'updated', previousValue: change.currentValue, newValue: change.proposedValue, beforeEtag: change.expectedEtag, afterEtag: result.etag, reasonCode: change.reasonCode }); writes += 1 }
            }
            completed.add(change.jobId)
            writeJson(args.checkpoint, { schemaVersion: 1, planHash, runIdentifier: planArtifact.runIdentifier, completed: [...completed].sort(), audit })
            if (args.failAfter && writes >= Number(args.failAfter)) throw new Error('Simulated interruption after checkpointed writes.')
        }
    }
    const result = { schemaVersion: 1, mode: 'Apply', migrationId: manifest.migrationId, target: planArtifact.target, planHash, runIdentifier: planArtifact.runIdentifier, mutationsPerformed: writes > 0, audit }
    writeJson(args.output, result)
    return result
}

async function verifyPlan(planArtifact, args, store) {
    assertPlan(planArtifact, args.approvedPlanHash ?? planArtifact.planHash)
    const results = []
    for (const item of planArtifact.outcomes) {
        if (item.disposition === 'exception') { results.push({ jobId: item.jobId, outcome: 'exception-retained' }); continue }
        const current = await store.get(item.jobId, dataverseFieldFor(planArtifact.target))
        results.push({ jobId: item.jobId, outcome: current && current[fieldFor(planArtifact.target)] === item.proposedValue ? 'verified' : 'mismatch' })
    }
    const result = { schemaVersion: 1, mode: 'Verify', mutationsPerformed: false, runIdentifier: planArtifact.runIdentifier, counts: { verified: results.filter((item) => item.outcome === 'verified').length, mismatch: results.filter((item) => item.outcome === 'mismatch').length, exceptions: results.filter((item) => item.outcome === 'exception-retained').length }, results }
    if (args.output) writeJson(args.output, result)
    return result
}

async function rollback(applyArtifact, args, store) {
    if (applyArtifact.runIdentifier !== args.approvedRunId) throw new Error('Rollback requires the exact approved Apply run identifier.')
    const audit = []
    for (const item of applyArtifact.audit.filter((row) => row.outcome === 'updated')) {
        const current = await store.get(item.jobId, dataverseFieldFor(applyArtifact.target))
        const field = fieldFor(applyArtifact.target)
        if (!current || normalizeEtag(current.etag) !== normalizeEtag(item.afterEtag) || current[field] !== item.newValue) audit.push({ jobId: item.jobId, outcome: 'conflict-newer-work-preserved' })
        else {
            const result = await store.update(item.jobId, args.live ? dataverseFieldFor(applyArtifact.target) : field, item.previousValue, item.afterEtag)
            audit.push({ jobId: item.jobId, outcome: result.conflict ? 'conflict-newer-work-preserved' : 'rolled-back', afterEtag: result.etag })
        }
    }
    const result = { schemaVersion: 1, mode: 'Rollback', migrationId: manifest.migrationId, target: applyArtifact.target, runIdentifier: applyArtifact.runIdentifier, audit }
    writeJson(args.output, result)
    return result
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const mode = String(args.mode ?? 'Inspect').toLowerCase()
    if (mode === 'inspect' || mode === 'plan') {
        const snapshot = readJson(args.input, 'Snapshot')
        const jobs = validateSnapshot(snapshot)
        const target = String(args.target ?? '').toLowerCase()
        const policy = policyFromArgs(args, target)
        if (mode === 'inspect') {
            const inspected = ['status', 'branch'].includes(target) ? jobs.map(target === 'status' ? classifyStatus : (job) => classifyBranch(job, policy)) : []
            return {
                schemaVersion: 1, mode: 'Inspect', target: target || 'inventory', mutationsPerformed: false,
                jobsInspected: jobs.length, missingEtags: jobs.filter((job) => !job.etag).length,
                ...(target === 'status' ? { evidenceIncomplete: jobs.filter((job) => job.statusEvidence?.complete !== true).length } : {}),
                ...(target === 'branch' ? {
                    classified: inspected.filter((item) => item.disposition !== 'exception').length,
                    exceptions: inspected.filter((item) => item.disposition === 'exception').length,
                    exceptionReasons: Object.fromEntries([...new Set(inspected.filter((item) => item.disposition === 'exception').map((item) => item.reasonCode))].sort().map((reason) => [reason, inspected.filter((item) => item.reasonCode === reason).length])),
                } : {}),
            }
        }
        const artifact = plan(snapshot, target, policy)
        writeJson(args.output, artifact)
        return { mode: 'Plan', mutationsPerformed: false, planHash: artifact.planHash, runIdentifier: artifact.runIdentifier, counts: artifact.counts }
    }
    const artifact = readJson(args.plan ?? args.applyArtifact, mode === 'rollback' ? 'Apply artifact' : 'Plan')
    let store
    if (args.live) {
        if (!args.environmentUrl || !process.env.DATAVERSE_ACCESS_TOKEN) throw new Error('Live mode requires --environment-url and DATAVERSE_ACCESS_TOKEN.')
        store = new DataverseStore(args.environmentUrl, process.env.DATAVERSE_ACCESS_TOKEN)
    } else store = new FakeStore(args.state)
    if (mode === 'apply') return applyPlan(artifact, args, store)
    if (mode === 'verify') return verifyPlan(artifact, args, store)
    if (mode === 'rollback') return rollback(artifact, args, store)
    throw new Error('--mode must be Inspect, Plan, Apply, Verify or Rollback.')
}

try { console.log(JSON.stringify(await main())) }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
