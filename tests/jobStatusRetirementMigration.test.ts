import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const scriptUrl = new URL('../scripts/plan-job-status-retirement.ps1', import.meta.url)
const manifestUrl = new URL('../dataverse/service-coordination/job-status-retirement-manifest.json', import.meta.url)
const fixtureUrl = new URL('./fixtures/job-status-retirement-snapshot.json', import.meta.url)

test('legacy status retirement contract is narrow and cannot apply writes', () => {
    const script = readFileSync(scriptUrl, 'utf8')
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))

    assert.equal(manifest.migrationId, 'job-status-unconfirmed-retirement-v1')
    assert.equal(manifest.table, 'gr_job')
    assert.equal(manifest.statusColumn, 'gr_status')
    assert.equal(manifest.sourceStatus, 122830005)
    assert.equal(manifest.targetStatus, 122830001)
    assert.equal(manifest.writeIncluded, false)
    assert.equal(manifest.choiceRetirementIncluded, false)
    assert.equal(manifest.otherStatusReclassificationIncluded, false)
    assert.match(script, /\[ValidateSet\('Inspect', 'Plan'\)\]/)
    assert.match(script, /\[string\]\$Mode = 'Inspect'/)
    assert.match(script, /\[string\]\$LoginPrompt = 'Never'/)
    assert.match(script, /Plan mode requires an explicit OutputPath/)
    assert.match(script, /exception-missing-etag/)
    assert.match(script, /applySupportedByThisTool = \$false/)
    assert.match(script, /exceeds the reviewed \$limit-row migration bound/)
    assert.doesNotMatch(
        script,
        /CreateRequest|UpdateRequest|DeleteRequest|UpsertRequest|ExecuteMultipleRequest|ImportSolutionRequest|PublishXmlRequest|DeleteOptionValueRequest/,
    )
})

test('offline legacy status inspection and plan are deterministic and privacy-minimal', {
    skip: process.platform !== 'win32' ? 'PowerShell 5.1 compatibility test runs on Windows' : false,
}, () => {
    const scriptPath = decodeURIComponent(scriptUrl.pathname).replace(/^\/(?:([A-Za-z]:))/, '$1')
    const fixturePath = decodeURIComponent(fixtureUrl.pathname).replace(/^\/(?:([A-Za-z]:))/, '$1')
    const inspection = JSON.parse(execFileSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-Mode', 'Inspect', '-InputPath', fixturePath,
    ], { encoding: 'utf8' }))

    assert.equal(inspection.mutationsPerformed, false)
    assert.equal(inspection.jobsInspected, 4)
    assert.equal(inspection.legacyUnconfirmedRows, 3)
    assert.equal(inspection.legacyRowsMissingEtag, 1)

    const directory = mkdtempSync(join(tmpdir(), 'job-status-retirement-'))
    try {
        const firstPath = join(directory, 'first.json')
        const secondPath = join(directory, 'second.json')
        const runPlan = (outputPath: string) => JSON.parse(execFileSync('powershell.exe', [
            '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
            '-Mode', 'Plan', '-InputPath', fixturePath, '-OutputPath', outputPath,
        ], { encoding: 'utf8' }))

        const firstSummary = runPlan(firstPath)
        const secondSummary = runPlan(secondPath)
        const first = JSON.parse(readFileSync(firstPath, 'utf8'))
        const second = JSON.parse(readFileSync(secondPath, 'utf8'))

        assert.equal(firstSummary.mutationsPerformed, false)
        assert.equal(firstSummary.applySupportedByThisTool, false)
        assert.equal(firstSummary.plannedChanges, 3)
        assert.equal(firstSummary.ready, 2)
        assert.equal(firstSummary.exceptions, 1)
        assert.equal(firstSummary.planHash, secondSummary.planHash)
        assert.match(first.planHash, /^[a-f0-9]{64}$/)
        assert.equal(first.planHash, second.planHash)
        assert.deepEqual(first.changes, second.changes)
        assert.deepEqual(first.changes.map((change: { jobId: string }) => change.jobId), [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000003',
        ])
        assert.ok(first.changes.every((change: Record<string, unknown>) => (
            change.currentStatus === 122830005
            && change.proposedStatus === 122830001
            && change.reasonCode === 'legacy-unconfirmed-retirement'
            && !('description' in change)
            && !('customer' in change)
            && !('technician' in change)
        )))
    } finally {
        rmSync(directory, { recursive: true, force: true })
    }
})
