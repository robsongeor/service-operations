import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/v3-managed-jobs-migration.mjs', import.meta.url))
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const jobs = [
    { id: id(1), etag: 'W/"1"', inactive: false, registrationVoid: false, greenTreeStatus: null, coordinatorManaged: false, operatingBranch: null },
    { id: id(2), etag: 'W/"2"', inactive: false, registrationVoid: false, greenTreeStatus: 'open', coordinatorManaged: true, operatingBranch: 122830000 },
    { id: id(3), etag: 'W/"3"', inactive: false, registrationVoid: false, greenTreeStatus: 'Closed', coordinatorManaged: false, operatingBranch: null },
    { id: id(4), etag: 'W/"4"', inactive: false, registrationVoid: false, greenTreeStatus: 'finalised', coordinatorManaged: false, operatingBranch: null },
    { id: id(5), etag: 'W/"5"', inactive: true, registrationVoid: false, greenTreeStatus: null, coordinatorManaged: false, operatingBranch: null },
    { id: id(6), etag: '', inactive: false, registrationVoid: false, greenTreeStatus: null, coordinatorManaged: false, operatingBranch: null },
]
const run = (args) => JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' }))

test('V3 plan manages only active history, assigns Auckland, and excludes GreenTree terminal rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'v3-managed-plan-'))
    try {
        const snapshot = join(directory, 'snapshot.json'); const planPath = join(directory, 'plan.json')
        writeFileSync(snapshot, JSON.stringify({ schemaVersion: 1, jobs }))
        const result = run(['--mode', 'Plan', '--input', snapshot, '--output', planPath])
        assert.deepEqual(result.counts, { change: 1, unchanged: 1, excluded: 3, exception: 1 })
        const plan = JSON.parse(readFileSync(planPath, 'utf8'))
        assert.deepEqual(plan.outcomes[0].proposed, { coordinatorManaged: true, operatingBranch: 122830000 })
        assert.equal(plan.outcomes[2].reasonCode, 'greentree-closed')
        assert.equal(plan.outcomes[3].reasonCode, 'greentree-finalised')
        assert.ok(plan.outcomes.every((row) => !('description' in row) && !('customer' in row) && !('jobNumber' in row)))
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('V3 Apply requires exact hash, checkpoints, verifies, and protects newer work during rollback', () => {
    const directory = mkdtempSync(join(tmpdir(), 'v3-managed-apply-'))
    try {
        const snapshot = join(directory, 'snapshot.json'); const state = join(directory, 'state.json'); const planPath = join(directory, 'plan.json')
        const checkpoint = join(directory, 'checkpoint.json'); const applyPath = join(directory, 'apply.json'); const verifyPath = join(directory, 'verify.json'); const rollbackPath = join(directory, 'rollback.json')
        const applicableJobs = jobs.filter((job) => job.etag)
        writeFileSync(snapshot, JSON.stringify({ schemaVersion: 1, jobs: applicableJobs })); writeFileSync(state, JSON.stringify({ jobs: applicableJobs }))
        const plan = run(['--mode', 'Plan', '--input', snapshot, '--output', planPath])
        const rejected = spawnSync(process.execPath, [script, '--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', 'wrong', '--state', state, '--checkpoint', checkpoint, '--output', applyPath], { encoding: 'utf8' })
        assert.notEqual(rejected.status, 0); assert.match(rejected.stderr, /approved artifact/)
        const applied = run(['--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', plan.planHash, '--state', state, '--checkpoint', checkpoint, '--output', applyPath])
        assert.equal(applied.mutationsPerformed, true)
        const changed = JSON.parse(readFileSync(state, 'utf8')).jobs[0]
        assert.equal(changed.coordinatorManaged, true); assert.equal(changed.operatingBranch, 122830000)
        const verified = run(['--mode', 'Verify', '--plan', planPath, '--state', state, '--output', verifyPath])
        assert.deepEqual(verified.counts, { verified: 2, mismatch: 0, excluded: 3, excludedMismatch: 0, exceptions: 0 })
        const terminalChanged = JSON.parse(readFileSync(state, 'utf8'))
        terminalChanged.jobs[2].coordinatorManaged = true
        terminalChanged.jobs[2].etag = 'W/"98"'
        writeFileSync(state, JSON.stringify(terminalChanged))
        const terminalVerification = run(['--mode', 'Verify', '--plan', planPath, '--state', state])
        assert.equal(terminalVerification.counts.excludedMismatch, 1)
        changed.operatingBranch = 122830003; changed.etag = 'W/"99"'
        const next = JSON.parse(readFileSync(state, 'utf8')); next.jobs[0] = changed; writeFileSync(state, JSON.stringify(next))
        const rolledBack = run(['--mode', 'Rollback', '--apply-artifact', applyPath, '--approved-run-id', applied.runIdentifier, '--state', state, '--output', rollbackPath])
        assert.equal(rolledBack.audit[0].outcome, 'conflict-newer-work-preserved')
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('V3 Apply refuses a Plan that contains exceptions before writing a checkpoint', () => {
    const directory = mkdtempSync(join(tmpdir(), 'v3-managed-exception-'))
    try {
        const snapshot = join(directory, 'snapshot.json'); const state = join(directory, 'state.json'); const planPath = join(directory, 'plan.json')
        const checkpoint = join(directory, 'checkpoint.json'); const applyPath = join(directory, 'apply.json')
        writeFileSync(snapshot, JSON.stringify({ schemaVersion: 1, jobs })); writeFileSync(state, JSON.stringify({ jobs }))
        const plan = run(['--mode', 'Plan', '--input', snapshot, '--output', planPath])
        const rejected = spawnSync(process.execPath, [script, '--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', plan.planHash, '--state', state, '--checkpoint', checkpoint, '--output', applyPath], { encoding: 'utf8' })
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, /Plan contains 1 exception record/)
        assert.equal(readFileSync(state, 'utf8'), JSON.stringify({ jobs }))
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('V3 live migration is allowlisted, conditional, and snapshot export is read-only', () => {
    const source = readFileSync(script, 'utf8')
    const exporter = readFileSync(new URL('../scripts/export-v3-managed-jobs-snapshot.ps1', import.meta.url), 'utf8')
    assert.match(source, /DATAVERSE_ACCESS_TOKEN/)
    assert.match(source, /'If-Match': normalizeEtag\(etag\)/)
    assert.match(source, /gr_coordinatormanaged/)
    assert.match(source, /gr_operatingbranch/)
    assert.doesNotMatch(source, /gr_description|gr_customer|gr_site|gr_mechanic|gr_jobnumber/)
    assert.match(exporter, /RetrieveMultiple/)
    assert.match(exporter, /mutationsPerformed = \$false/)
    assert.doesNotMatch(exporter, /\.Create\(|\.Update\(|\.Delete\(|UpdateRequest|CreateRequest|DeleteRequest/)
    assert.doesNotMatch(exporter, /gr_description|gr_customer|gr_site|gr_mechanic|gr_jobnumber/)
})
