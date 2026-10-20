import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/service-coordination-migration.mjs', import.meta.url))
const fixture = fileURLToPath(new URL('./fixtures/service-coordination-migration-snapshot.json', import.meta.url))
const run = (args) => JSON.parse(execFileSync(process.execPath, [script, ...args], { encoding: 'utf8' }))

test('evidence status and branch plans are deterministic, privacy-minimal and preserve controlled states', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coordination-plan-'))
    try {
        const statusPath = join(directory, 'status.json')
        const secondStatusPath = join(directory, 'status-2.json')
        const branchPath = join(directory, 'branch.json')
        const first = run(['--mode', 'Plan', '--target', 'status', '--input', fixture, '--output', statusPath])
        const second = run(['--mode', 'Plan', '--target', 'status', '--input', fixture, '--output', secondStatusPath])
        assert.equal(first.planHash, second.planHash)
        const status = JSON.parse(readFileSync(statusPath, 'utf8'))
        assert.deepEqual(status.counts, { change: 3, unchanged: 1, exception: 2 })
        assert.equal(status.outcomes[0].reasonCode, 'legacy-unconfirmed-retirement')
        assert.equal(status.outcomes[3].reasonCode, 'preserve-action-required')
        assert.equal(status.outcomes[4].reasonCode, 'complete-requires-side-effect-audit')
        assert.ok(status.outcomes.every((row) => !('description' in row) && !('customer' in row) && !('technician' in row)))

        run(['--mode', 'Plan', '--target', 'branch', '--input', fixture, '--output', branchPath])
        const branch = JSON.parse(readFileSync(branchPath, 'utf8'))
        assert.deepEqual(branch.counts, { change: 4, unchanged: 0, exception: 2 })
        assert.equal(branch.outcomes[0].reasonCode, 'linked-registered-regional-ledger')
        assert.equal(branch.outcomes[3].reasonCode, 'explicit-reviewed-branch')
        assert.equal(branch.outcomes[5].reasonCode, 'conflicting-registered-ledgers')
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('an explicit historical plain-number branch baseline is plan-only policy and leaves unknown jobs unclassified', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coordination-branch-baseline-'))
    try {
        const snapshotPath = join(directory, 'snapshot.json')
        const planPath = join(directory, 'plan.json')
        const snapshot = JSON.parse(readFileSync(fixture, 'utf8'))
        delete snapshot.jobs[3].explicitReviewedBranches
        writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))

        const result = run([
            '--mode', 'Plan', '--target', 'branch', '--approved-plain-number-branch', 'auckland',
            '--input', snapshotPath, '--output', planPath,
        ])
        const plan = JSON.parse(readFileSync(planPath, 'utf8'))
        assert.equal(result.mutationsPerformed, false)
        assert.deepEqual(plan.policy, { approvedPlainNumberBranch: 122830000 })
        assert.equal(plan.outcomes[3].proposedValue, 122830000)
        assert.equal(plan.outcomes[3].reasonCode, 'approved-historical-plain-number-baseline')
        assert.equal(plan.outcomes[4].disposition, 'exception')
        assert.equal(plan.outcomes[4].reasonCode, 'branch-unclassified')
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('Apply requires the exact hash, checkpoints interruption, resumes idempotently and preserves conflicts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coordination-apply-'))
    try {
        const planPath = join(directory, 'plan.json')
        const statePath = join(directory, 'state.json')
        const checkpointPath = join(directory, 'checkpoint.json')
        const outputPath = join(directory, 'apply.json')
        const verifyPath = join(directory, 'verify.json')
        const snapshot = JSON.parse(readFileSync(fixture, 'utf8'))
        writeFileSync(statePath, JSON.stringify({ jobs: snapshot.jobs }, null, 2))
        const plan = run(['--mode', 'Plan', '--target', 'status', '--input', fixture, '--output', planPath])

        const rejected = spawnSync(process.execPath, [script, '--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', 'bad', '--state', statePath, '--checkpoint', checkpointPath, '--output', outputPath], { encoding: 'utf8' })
        assert.notEqual(rejected.status, 0)
        assert.match(rejected.stderr, /approved artifact/)

        const interrupted = spawnSync(process.execPath, [script, '--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', plan.planHash, '--state', statePath, '--checkpoint', checkpointPath, '--output', outputPath, '--fail-after', '1'], { encoding: 'utf8' })
        assert.notEqual(interrupted.status, 0)
        assert.equal(JSON.parse(readFileSync(checkpointPath, 'utf8')).completed.length, 1)

        const state = JSON.parse(readFileSync(statePath, 'utf8'))
        const conflict = state.jobs.find((job) => job.id.endsWith('0002'))
        conflict.status = 122830002
        conflict.etag = 'W/"21"'
        writeFileSync(statePath, JSON.stringify(state, null, 2))

        const applied = run(['--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', plan.planHash, '--state', statePath, '--checkpoint', checkpointPath, '--output', outputPath])
        assert.equal(applied.mutationsPerformed, true)
        assert.equal(applied.audit.some((row) => row.outcome === 'conflict'), true)
        const verified = run(['--mode', 'Verify', '--plan', planPath, '--state', statePath, '--output', verifyPath])
        assert.equal(verified.counts.mismatch, 1)
        assert.deepEqual(JSON.parse(readFileSync(verifyPath, 'utf8')).counts, verified.counts)
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('bare Dataverse row versions are normalized before conditional Apply', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coordination-etag-normalization-'))
    try {
        const snapshotPath = join(directory, 'snapshot.json')
        const planPath = join(directory, 'plan.json')
        const statePath = join(directory, 'state.json')
        const checkpointPath = join(directory, 'checkpoint.json')
        const outputPath = join(directory, 'apply.json')
        const snapshot = JSON.parse(readFileSync(fixture, 'utf8'))
        snapshot.jobs = [snapshot.jobs[0]]
        snapshot.jobs[0].etag = '10'
        writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
        writeFileSync(statePath, JSON.stringify({ jobs: [{ ...snapshot.jobs[0], etag: 'W/"10"' }] }, null, 2))

        const plan = run(['--mode', 'Plan', '--target', 'status', '--input', snapshotPath, '--output', planPath])
        const artifact = JSON.parse(readFileSync(planPath, 'utf8'))
        assert.equal(artifact.outcomes[0].expectedEtag, 'W/"10"')
        const applied = run(['--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', plan.planHash, '--state', statePath, '--checkpoint', checkpointPath, '--output', outputPath])
        assert.equal(applied.mutationsPerformed, true)
        assert.equal(applied.audit[0].outcome, 'updated')
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('conditional rollback restores only unchanged post-Apply rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coordination-rollback-'))
    try {
        const planPath = join(directory, 'plan.json')
        const statePath = join(directory, 'state.json')
        const checkpointPath = join(directory, 'checkpoint.json')
        const applyPath = join(directory, 'apply.json')
        const rollbackPath = join(directory, 'rollback.json')
        const snapshot = JSON.parse(readFileSync(fixture, 'utf8'))
        writeFileSync(statePath, JSON.stringify({ jobs: snapshot.jobs }, null, 2))
        const plan = run(['--mode', 'Plan', '--target', 'branch', '--input', fixture, '--output', planPath])
        const applied = run(['--mode', 'Apply', '--plan', planPath, '--approved-plan-hash', plan.planHash, '--state', statePath, '--checkpoint', checkpointPath, '--output', applyPath])
        const state = JSON.parse(readFileSync(statePath, 'utf8'))
        const newer = state.jobs.find((job) => job.id.endsWith('0003'))
        newer.operatingBranch = 122830003
        newer.etag = 'W/"999"'
        writeFileSync(statePath, JSON.stringify(state, null, 2))

        const rolledBack = run(['--mode', 'Rollback', '--apply-artifact', applyPath, '--approved-run-id', applied.runIdentifier, '--state', statePath, '--output', rollbackPath])
        assert.equal(rolledBack.audit.some((row) => row.outcome === 'rolled-back'), true)
        assert.equal(rolledBack.audit.some((row) => row.outcome === 'conflict-newer-work-preserved'), true)
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('migration source allows live mutation only through exact conditional fields', () => {
    const source = readFileSync(script, 'utf8')
    assert.match(source, /DATAVERSE_ACCESS_TOKEN/)
    assert.match(source, /'If-Match': etag/)
    assert.match(source, /Apply requires an explicit --checkpoint path/)
    assert.match(source, /conflict-newer-work-preserved/)
    assert.doesNotMatch(source, /gr_description|gr_customer|gr_mechanic|gr_completeddate/)
})

test('Dataverse migration snapshot exporter is read-only and privacy-minimal', () => {
    const source = readFileSync(new URL('../scripts/export-service-coordination-migration-snapshot.ps1', import.meta.url), 'utf8')
    assert.match(source, /RetrieveMultiple/)
    assert.match(source, /gr_registeredjob/)
    assert.match(source, /approvedLegacySourceBranches/)
    assert.match(source, /mutationsPerformed = \$false/)
    assert.doesNotMatch(source, /\.Create\(|\.Update\(|\.Delete\(|UpdateRequest|CreateRequest|DeleteRequest/)
    assert.doesNotMatch(source, /gr_description|gr_customer|gr_site|gr_mechanic/)
})

test('System User branch snapshot exporter is read-only and privacy-minimal', () => {
    const source = readFileSync(new URL('../scripts/export-service-coordination-user-branch-snapshot.ps1', import.meta.url), 'utf8')
    assert.match(source, /RetrieveMultiple/)
    assert.match(source, /gr_serviceoperationsbranch/)
    assert.match(source, /mutationsPerformed = \$false/)
    assert.doesNotMatch(source, /\.Create\(|\.Update\(|\.Delete\(|UpdateRequest|CreateRequest|DeleteRequest/)
    assert.doesNotMatch(source, /fullname|address1_|telephone|mobilephone/)
})

test('System User home-branch plan is deterministic, exact and read-only', () => {
    const directory = mkdtempSync(join(tmpdir(), 'coordination-user-branch-'))
    const userPlanScript = fileURLToPath(new URL('../scripts/service-coordination-user-branch-plan.mjs', import.meta.url))
    try {
        const snapshotPath = join(directory, 'snapshot.json')
        const mappingPath = join(directory, 'mapping.json')
        const firstPath = join(directory, 'plan-1.json')
        const secondPath = join(directory, 'plan-2.json')
        writeFileSync(snapshotPath, JSON.stringify({ schemaVersion: 1, mutationsPerformed: false, users: [
            { userPrincipalName: 'andyl@liftrucks.co.nz', systemUserId: '00000000-0000-4000-8000-000000000001', etag: '1', currentBranch: null, isDisabled: false },
            { userPrincipalName: 'brucef@liftrucks.co.nz', systemUserId: '00000000-0000-4000-8000-000000000002', etag: '2', currentBranch: null, isDisabled: false },
        ] }))
        writeFileSync(mappingPath, JSON.stringify({ schemaVersion: 1, allBranchesAvailable: true, users: [
            { userPrincipalName: 'andyl@liftrucks.co.nz', homeBranch: 122830003 },
            { userPrincipalName: 'brucef@liftrucks.co.nz', homeBranch: 122830000 },
        ] }))
        const first = JSON.parse(execFileSync(process.execPath, [userPlanScript, '--mode', 'Plan', '--input', snapshotPath, '--mapping', mappingPath, '--output', firstPath], { encoding: 'utf8' }))
        const second = JSON.parse(execFileSync(process.execPath, [userPlanScript, '--mode', 'Plan', '--input', snapshotPath, '--mapping', mappingPath, '--output', secondPath], { encoding: 'utf8' }))
        assert.equal(first.planHash, second.planHash)
        assert.deepEqual(first.counts, { change: 2, unchanged: 0 })
        const plan = JSON.parse(readFileSync(firstPath, 'utf8'))
        assert.equal(plan.mutationsPerformed, false)
        assert.equal(plan.allBranchesAvailable, true)
        assert.deepEqual(plan.outcomes.map((item) => item.proposedValue).sort(), [122830000, 122830003])
    } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('live migration wrapper keeps tokens out of arguments and requires exact plan hashes', () => {
    const source = readFileSync(new URL('../scripts/invoke-service-coordination-live-migration.ps1', import.meta.url), 'utf8')
    assert.match(source, /az account show --query user\.name/)
    assert.match(source, /az account get-access-token --resource/)
    assert.match(source, /DATAVERSE_ACCESS_TOKEN/)
    assert.match(source, /--approved-plan-hash/)
    assert.match(source, /CheckpointPath/)
    assert.doesNotMatch(source, /Write-(?:Host|Output).*token/i)
})

test('user onboarding requires an explicit reviewed branch and Apply always verifies it', () => {
    const source = readFileSync(new URL('../scripts/setup-service-operations-user-home-branch.ps1', import.meta.url), 'utf8')
    assert.match(source, /ValidateSet\('Auckland', 'Waikato', 'Hastings', 'Christchurch'\)/)
    assert.match(source, /user-branch-mapping\.json/)
    assert.match(source, /must have exactly one reviewed entry/)
    assert.match(source, /requested \$HomeBranch branch does not match the reviewed mapping/)
    assert.match(source, /User setup accepts only a Plan containing exactly one user/)
    assert.match(source, /-ApprovedPlanHash \$ApprovedPlanHash/)
    assert.match(source, /-Operation UserBranchApply/)
    assert.match(source, /-Operation UserBranchVerify/)
    assert.match(source, /onboardingComplete = \$true/)

    const accessPlan = JSON.parse(readFileSync(new URL('../dataverse/access/unified-workflow-assignment-plan.json', import.meta.url), 'utf8'))
    assert.equal(accessPlan.homeBranchSetup.requiredForEveryNewUser, true)
    assert.equal(accessPlan.homeBranchSetup.allowImplicitDefault, false)
    assert.deepEqual(accessPlan.homeBranchSetup.allowedBranches, {
        Auckland: 122830000,
        Waikato: 122830001,
        Hastings: 122830002,
        Christchurch: 122830003,
    })
    assert.match(accessPlan.homeBranchSetup.completionRule, /Apply.*Verify/)
})
