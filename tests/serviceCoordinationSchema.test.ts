import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const scriptUrl = new URL('../scripts/manage-service-coordination-schema.ps1', import.meta.url)
const manifestUrl = new URL('../dataverse/service-coordination/schema-manifest.json', import.meta.url)

test('service coordination schema contract preserves lifecycle values and private watch ownership', () => {
    const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))

    assert.equal(manifest.defaultMode, 'Inspect')
    assert.equal(manifest.provisioningRequiresExplicitApproval, true)
    assert.equal(manifest.migrationIncluded, false)
    assert.equal(manifest.choiceDeletionIncluded, false)
    assert.deepEqual(manifest.jobStatusChoice.options.map((option: { value: number }) => option.value), [
        122830000, 122830001, 122830002, 122830003, 122830004, 122830005,
    ])
    assert.deepEqual(
        manifest.jobStatusChoice.options.filter((option: { updateLabel: boolean }) => option.updateLabel)
            .map((option: { label: string }) => option.label),
        ['With Technician', 'Staging', 'Action Required', 'Complete', 'Completion Review'],
    )
    assert.deepEqual(manifest.branchChoice.options, [
        { value: 122830000, label: 'Auckland' },
        { value: 122830001, label: 'Waikato' },
        { value: 122830002, label: 'Hastings' },
        { value: 122830003, label: 'Christchurch' },
    ])
    assert.equal(manifest.watchTable.logicalName, 'gr_jobwatch')
    assert.equal(manifest.watchTable.entitySetName, 'gr_jobwatchs')
    assert.deepEqual(manifest.watchTable.alternateKey.attributes, ['gr_job', 'gr_watcher'])
    assert.deepEqual(manifest.watchTable.lookups.map((lookup: { target: string; deleteBehavior: string }) => ({
        target: lookup.target,
        deleteBehavior: lookup.deleteBehavior,
    })), [
        { target: 'gr_job', deleteBehavior: 'Cascade' },
        { target: 'systemuser', deleteBehavior: 'Restrict' },
    ])
    assert.equal(manifest.watchTable.lookups[1].relationship, 'gr_systemuser_gr_jobwatch_watcher')
    assert.equal(manifest.watchTable.lookups[1].referencedNavigationProperty, 'gr_systemuser_gr_jobwatch_gr_watcher')
    assert.equal(manifest.rolePolicy.roleName, 'Service Operations')
    assert.equal(manifest.rolePolicy.requiredDepth, 'Basic')
    assert.equal(manifest.rolePolicy.ordinaryUsersMayMutateOtherUsersWatches, false)
    assert.deepEqual(manifest.rolePolicy.forbiddenOperations, ['Assign', 'Share'])
})

test('schema manager is read-only by default and keeps provisioning narrowly gated', () => {
    const script = readFileSync(scriptUrl, 'utf8')

    assert.match(script, /\[ValidateSet\('Inspect', 'Provision', 'Verify'\)\]/)
    assert.match(script, /\[string\]\$Mode = 'Inspect'/)
    assert.match(script, /\[string\]\$LoginPrompt = 'Never'/)
    assert.match(script, /\$provision = \$Mode -eq 'Provision'/)
    assert.match(script, /Provision preflight failed before any write/)
    assert.match(script, /UpdateOptionValueRequest/)
    assert.match(script, /\$request\.MergeLabels = \$true/)
    assert.match(script, /PrivilegeDepth\]::Basic/)
    assert.match(script, /DoNotIncludeSubcomponents=\$true/)
    assert.match(script, /Test-SolutionComponentCoverage/)
    assert.match(script, /rootcomponentbehavior/)
    assert.match(script, /Microsoft\.Xrm\.Sdk\.OptionSetValue/)
    assert.match(script, /Wait-WatchKey/)
    assert.match(script, /RetrieveEntityKeyRequest/)
    assert.match(script, /Get-OptionalProperty \$watchKeys\[0\] 'EntityKeyIndexStatus'/)
    assert.doesNotMatch(script, /\$OptionSet\.IsManaged\.Value/)
    assert.match(script, /if \(\$null -eq \$entity\) \{ return \}/)
    assert.match(script, /assignmentsChanged=\$false/)
    assert.match(script, /branchValuesChanged=\$false/)
    assert.match(script, /choiceDeleted=\$false/)
    assert.doesNotMatch(script, /DeleteOptionValueRequest|DeleteEntityRequest|DeleteAttributeRequest|RemovePrivilegeRoleRequest/)
    assert.doesNotMatch(script, /AssociateRequest|DisassociateRequest|systemuserroles_association/)
    assert.doesNotMatch(script, /\$Service\.(Create|Update|Delete)\(/)

    const inspectStart = script.indexOf("if ($Mode -eq 'Inspect')")
    const verifyStart = script.indexOf("if ($Mode -eq 'Verify')", inspectStart)
    const provisionStart = script.indexOf('$issues=@(Get-ContractIssues $service $false)', verifyStart)
    assert.ok(inspectStart > 0 && verifyStart > inspectStart && provisionStart > verifyStart)
    assert.match(script.slice(inspectStart, verifyStart), /Get-Inspection \$service[\s\S]*return/)
    assert.match(script.slice(verifyStart, provisionStart), /Get-ContractIssues \$service \$true[\s\S]*mutationsPerformed=\$false[\s\S]*return/)
})

test('service coordination schema definition validates without a Dataverse connection', {
    skip: process.platform !== 'win32' ? 'PowerShell 5.1 compatibility test runs on Windows' : false,
}, () => {
    const scriptPath = decodeURIComponent(scriptUrl.pathname).replace(/^\/(?:([A-Za-z]:))/, '$1')
    const output = JSON.parse(execFileSync('powershell.exe', [
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ValidateDefinition',
    ], { encoding: 'utf8' }))

    assert.equal(output.valid, true)
    assert.equal(output.defaultMode, 'Inspect')
    assert.equal(output.provisioningRequiresExplicitApproval, true)
    assert.equal(output.assignmentsIncluded, false)
    assert.equal(output.migrationIncluded, false)
})
