import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUnifiedJobFixture, fixtureBooks } from '../scripts/dev/unifiedJobFixture.mjs'
import { jobMatchesWorklist, jobWorklistLabel, UNIFIED_JOB_WALKTHROUGH } from '../src/alpha/jobs/domain/unifiedJobWorkflow.ts'
import { registrationAttemptStore } from '../src/alpha/jobs/services/jobRegistrationAttempt.ts'
import { createJobRegistrationClient, type RegisterJobBookCommand } from '../src/alpha/jobs/services/jobRegistrationApi.ts'
import { reconcileJobBookRows } from '../src/alpha/job-book/reconcileJobBookRows.ts'
import { createBlankJobBookRow } from '../src/alpha/job-book/jobBookPrototype.ts'
import { jobBookVoidBlockedReason } from '../src/alpha/job-book/jobBookEntryWorkflow.ts'
import type { Job } from '../src/alpha/jobs/types/job.types.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = { userId: id(90), displayName: 'Sample admin' }
const customer = { gr_customerid: id(1), gr_name: 'Sample customer', statecode: 0 }
const site = { gr_siteid: id(2), gr_name: 'Sample site', gr_address: 'Sample address', gr_Customer: customer, statecode: 0 }
const mechanic = { gr_mechanicid: id(3), gr_name: 'Sample technician', statecode: 0 }
const command = { RequestId: id(4), Book: 'auckland', Description: 'Original description', OrderNumber: '', SiteId: id(2), EquipmentUnknown: true, MechanicId: id(3) }
function setup() {
    type SampleRecord = Record<string, unknown> & { gr_jobid?: string; gr_Mechanic?: typeof mechanic; gr_RegisteredJob?: { gr_jobid: string } }
    const jobs: SampleRecord[] = []
    const ledgers: Record<string, SampleRecord[]> = Object.fromEntries(Object.values(fixtureBooks).map(([table]) => [table, []]))
    const fixture = createUnifiedJobFixture({ jobs, ledgers, tables: () => ({ gr_sites: [site], gr_customers: [customer], gr_mechanics: [mechanic], gr_equipments: [], gr_contacts: [], gr_sitecontacts: [] }) })
    const register = (body = command, who = actor) => fixture.registration('gr_RegisterJobBookJob', body, who, false)
    return { ...fixture, jobs, ledgers, register }
}
test('walkthrough workflow stays disabled in ordinary builds', () => assert.equal(UNIFIED_JOB_WALKTHROUGH, false))
test('sample registration creates one basic working Job plus a regional ledger, with initial assignment only', () => {
    for (const [book, [table, , prefix]] of Object.entries(fixtureBooks)) {
        const f = setup(); const result = f.register({ ...command, Book: book })
        assert.match(result.JobNumber, new RegExp(`^${prefix}\\d{6,}$`))
        assert.equal(f.jobs.length, 1); assert.equal(f.ledgers[table].length, 1)
        assert.equal(f.jobs[0].gr_coordinatormanaged, false)
        assert.equal(f.jobs[0].gr_jobtype, undefined)
        assert.equal(f.jobs[0].gr_Mechanic.gr_mechanicid, id(3))
        assert.equal(f.ledgers[table][0].gr_RegisteredJob.gr_jobid, result.JobId)
        assert.equal(f.jobs[0].gr_gtentered, false)
    }
})
test('lost-response recovery through the real client uses the same body and preserves subsequent corrections', async () => {
    const f = setup(); let lose = true
    const client = createJobRegistrationClient({ enabled: true, apiUrl: 'https://sample.invalid', fetcher: async (_url, options) => {
        const result = f.register(JSON.parse(String(options?.body)))
        if (lose) { lose = false; throw new Error('lost response') }
        return Response.json(result)
    } })
    const request: RegisterJobBookCommand = { kind: 'register', requestId: id(4), book: 'auckland', description: command.Description, siteId: id(2), equipmentUnknown: true, mechanicId: id(3) }
    await assert.rejects(client('sample', request), { kind: 'unknown' })
    f.jobs[0].gr_description = 'Corrected details'
    const result = await client('sample', request)
    assert.equal(result.replayed, true); assert.equal(f.jobs.length, 1)
    assert.equal(f.jobs[0].gr_description, 'Corrected details')
    assert.equal(f.ledgers.gr_jobbookentries[0].gr_description, 'Original description')
})
test('sample retries reject a changed body, actor or region rather than create another Job', () => {
    const f = setup(); f.register()
    for (const patch of [{ Description: 'different' }, { Book: 'waikato' }, { MechanicId: id(9) }]) assert.throws(() => f.register({ ...command, ...patch }), /REQUEST_REUSED/)
    assert.throws(() => f.register(command, { ...actor, userId: id(91) }), /REQUEST_REUSED/)
    assert.equal(f.jobs.length, 1)
})
test('snapshot identifiers and operational fields cannot be registered as master data', () => {
    const f = setup()
    assert.throws(() => f.register({ ...command, SiteId: 'prototype-site' }), /NOT_FOUND/)
    for (const field of ['JobNumber', 'JobType', 'Status', 'Actor', 'Schedule']) assert.throws(() => f.register({ ...command, [field]: 'tampered' }), /INVALID/)
    assert.equal(f.jobs.length, 0); assert.equal(f.ledgers.gr_jobbookentries.length, 0)
})
test('allocation and management are independent, with coordinator-only fixture commands', () => {
    const f = setup()
    f.jobs.push({ gr_jobid: id(20), gr_jobnumber: null, gr_description: 'Staging', gr_Site: site, gr_gtentered: false, gr_timecloudentered: false, gr_coordinatormanaged: false, '@odata.etag': 'W/"10"' })
    const request = { RequestId: id(21), JobId: id(20), Book: 'hastings', ExpectedRowVersion: '10' }
    assert.throws(() => f.registration('gr_AllocateJobBookNumber', request, actor, false), /FORBIDDEN/)
    assert.throws(() => f.manage({ jobId: id(20), etag: 'W/"10"' }, actor, false), /FORBIDDEN/)
    f.registration('gr_AllocateJobBookNumber', request, actor, true)
    assert.equal(f.jobs[0].gr_coordinatormanaged, false)
    f.manage({ jobId: id(20), etag: f.jobs[0]['@odata.etag'] }, actor, true)
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].gr_coordinatormanaged, true)
    assert.equal(f.ledgers.gr_hastingsjobbookentries.length, 1)
})
test('two allocation requests cannot overwrite each other and stale management fails closed', () => {
    const f = setup(); f.register()
    assert.throws(() => f.manage({ jobId: id(4), etag: 'W/"0"' }, actor, true), /CONFLICT/)
    assert.throws(() => f.registration('gr_AllocateJobBookNumber', { RequestId: id(50), JobId: id(4), Book: 'waikato', ExpectedRowVersion: '1001' }, actor, true), /ALREADY_NUMBERED/)
    assert.equal(f.ledgers.gr_waikatojobbookentries.length, 0)
})
test('registered Void preserves allocation, snapshots and technician assignment; retry is idempotent', () => {
    const f = setup(); const result = f.register(); const ledger = f.ledgers.gr_jobbookentries[0]
    const request = { book: 'auckland', ledgerId: id(4), jobId: id(4), jobEtag: f.jobs[0]['@odata.etag'], ledgerEtag: ledger['@odata.etag'], reason: 'Duplicate of Job 900001' }
    f.voidEntry(request, actor); f.voidEntry(request, actor)
    assert.equal(f.jobs[0].gr_registrationvoid, true); assert.equal(ledger.gr_stage, 122830003)
    assert.equal(f.jobs[0].gr_jobnumber, result.JobNumber); assert.equal(ledger.gr_jobnumber, result.JobNumber)
    assert.equal(f.jobs[0].gr_Mechanic.gr_mechanicid, id(3)); assert.equal(ledger.gr_description, command.Description)
    assert.equal(f.register().WasReplay, true)
})
test('either factual marker, coordinator membership, missing reason, or competing write blocks registered Void', () => {
    for (const change of [{ gr_gtentered: true }, { gr_timecloudentered: true }, { gr_coordinatormanaged: true }, { gr_gtentered: undefined }, { '@odata.etag': 'W/"99"' }]) {
        const f = setup(); f.register(); const ledger = f.ledgers.gr_jobbookentries[0]
        const etag = f.jobs[0]['@odata.etag']; Object.assign(f.jobs[0], change)
        assert.throws(() => f.voidEntry({ book: 'auckland', ledgerId: id(4), jobId: id(4), jobEtag: etag, ledgerEtag: ledger['@odata.etag'], reason: 'Mistake' }, actor))
        assert.equal(ledger.gr_stage, 122830004); assert.equal(f.jobs[0].gr_registrationvoid, false)
    }
    const f = setup(); f.register()
    assert.throws(() => f.voidEntry({ book: 'auckland', ledgerId: id(4), jobId: id(4), reason: ' ' }, actor), /INVALID/)
})
test('Staging means unnumbered, not Unconfirmed, and older work retains its operational fallback', () => {
    const base = { gr_jobid: id(1), gr_jobnumber: null, gr_status: 122830003, gr_coordinatormanaged: false } as Job
    assert.equal(jobMatchesWorklist(base, 'staging'), true)
    assert.equal(jobMatchesWorklist(base, 'operational'), false)
    assert.equal(jobMatchesWorklist({ ...base, gr_jobnumber: 'WJ12345', gr_status: 122830004 }, 'staging'), false)
    assert.equal(jobMatchesWorklist({ ...base, gr_coordinatormanaged: undefined }, 'operational'), true)
    assert.equal(jobMatchesWorklist({ ...base, gr_registrationvoid: true }, 'all'), true)
    assert.equal(jobMatchesWorklist({ ...base, gr_registrationvoid: true }, 'staging'), false)
    assert.equal(jobWorklistLabel({ ...base, gr_jobnumber: '1' }), 'Job Book')
})
test('Job Book reconciles only explicit registration links, keeping legacy and snapshot-only rows', () => {
    const base = createBlankJobBookRow(1)
    const registered = { ...base, id: 'linked', registeredLedgerId: 'ledger', linkedJobId: 'job', ledgerEtag: 'W/"20"', etag: '', coordinatorManaged: false, entryStage: 'registered' as const }
    const history = { ...base, id: 'history', entryStage: 'legacy' as const }
    const result = reconcileJobBookRows([registered, history], [{ ...base, id: 'job-row', linkedJobId: 'job', etag: 'W/"10"', entered: true }, { ...base, id: 'unrelated-job', linkedJobId: 'other' }])
    assert.deepEqual(result.map((row) => row.id), ['linked', 'history', 'unrelated-job'])
    assert.equal(result[0].etag, 'W/"10"', 'the direct Job supplies its exact version')
    assert.equal(result[0].ledgerEtag, 'W/"20"', 'the ledger keeps its independent exact version')
    assert.equal(result[0].entered, true, 'current Job markers override an expanded ledger snapshot')
    assert.equal(registered.etag, '', 'reconciliation never mutates source records')
    assert.equal(jobBookVoidBlockedReason({ ...registered, entered: false }), '')
    assert.ok(jobBookVoidBlockedReason({ ...registered, entered: true }))
})
test('recovery storage survives remount, is actor scoped and preserves the identical request', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const command: RegisterJobBookCommand = { kind: 'register', requestId: id(4), book: 'auckland', description: 'work', siteId: id(2), equipmentUnknown: true }
    registrationAttemptStore(storage, 'admin-a').save(command)
    assert.deepEqual(registrationAttemptStore(storage, 'admin-a').read(), command)
    assert.equal(registrationAttemptStore(storage, 'admin-b').read(), null)
    registrationAttemptStore(storage, 'admin-a').clear()
    assert.equal(values.size, 0)
    assert.throws(() => registrationAttemptStore({ ...storage, setItem: () => {} }, 'admin-a').save(command), /No request was sent/)
})

test('deployment readiness tooling is read-only and non-interactive by default', () => {
    const script = readFileSync(new URL('../scripts/inspect-unified-job-workflow-readiness.ps1', import.meta.url), 'utf8')
    const provisioner = readFileSync(new URL('../scripts/manage-unified-job-workflow-deployment.ps1', import.meta.url), 'utf8')
    const manifest = JSON.parse(readFileSync(new URL('../dataverse/job-registration/readiness-manifest.json', import.meta.url), 'utf8'))
    assert.match(script, /\[string\]\$LoginPrompt = 'Never'/)
    assert.match(script, /WhoAmIRequest|RetrieveEntityRequest|RetrieveAttributeRequest|RetrieveRolePrivilegesRoleRequest/)
    assert.doesNotMatch(script, /CreateEntityRequest|CreateAttributeRequest|UpdateAttributeRequest|DeleteRequest|PublishXmlRequest|AddPrivilegesRoleRequest/)
    assert.equal(manifest.status, 'read-only-preflight-not-approved-for-provisioning')
    assert.equal(manifest.customApis.length, 5)
    assert.equal(manifest.regionalNumberContracts.length, 4)
    assert.match(script, /AutoNumberFormat[\s\S]*EntityKeyIndexStatus/)
    assert.match(script, /regionalTables[\s\S]*IsOptimisticConcurrencyEnabled/)
    assert.match(provisioner, /Ensure-OptimisticConcurrency \$service 'gr_job'/)
    assert.match(provisioner, /regionalTables\)\{Ensure-OptimisticConcurrency/)
    assert.ok(manifest.activationBlockers.length >= 5)
})

test('migration audit is bounded, aggregate-only and cannot write backfills', () => {
    const script = readFileSync(new URL('../scripts/inspect-unified-job-migration.ps1', import.meta.url), 'utf8')
    const manifest = JSON.parse(readFileSync(new URL('../dataverse/job-registration/migration-manifest.json', import.meta.url), 'utf8'))
    assert.equal(manifest.writeIncluded, false)
    assert.equal(manifest.autoLinkAllowed, false)
    assert.equal(manifest.regionalBooks.length, 4)
    assert.ok(manifest.maximumRecordsPerTable > 0)
    assert.match(script, /\[string\]\$LoginPrompt = 'Never'/)
    assert.match(script, /exceeds the reviewed \$Maximum-row audit bound/)
    assert.match(script, /No identifiers, number values or record changes were emitted/)
    assert.match(script, /\[switch\]\$ShowExceptionNumbers/)
    assert.match(script, /if \(\$ShowExceptionNumbers\)/)
    assert.match(script, /\[switch\]\$ShowCutoverCandidates/)
    assert.match(script, /recalculate immediately before cutover/)
    assert.deepEqual(manifest.regionalBooks.map((book: { minimumDigits: number }) => book.minimumDigits), [6, 4, 5, 5])
    assert.doesNotMatch(script, /CreateRequest|UpdateRequest|DeleteRequest|AssociateRequest|DisassociateRequest|ExecuteMultipleRequest|ImportSolutionRequest|AddPrivilegesRoleRequest/)
    assert.ok(manifest.decisionRules.some((rule: string) => /Never create or update a link/.test(rule)))
    assert.ok(manifest.decisionRules.some((rule: string) => /Never infer coordinator membership/.test(rule)))
    assert.ok(manifest.decisionRules.some((rule: string) => /Never fabricate regional ledger rows/.test(rule)))
    assert.ok(manifest.decisionRules.some((rule: string) => /Leave existing coordinator membership unset/.test(rule)))
    assert.equal(manifest.reviewedUnknownFormatExceptionSet.count, 8)
    assert.match(manifest.reviewedUnknownFormatExceptionSet.sha256, /^[a-f0-9]{64}$/)
    assert.match(script, /reviewedExceptionSetMatches/)
})

test('role policy agrees with Custom API gates and permanently denies direct numbering', () => {
    const readiness = JSON.parse(readFileSync(new URL('../dataverse/job-registration/readiness-manifest.json', import.meta.url), 'utf8'))
    const policy = JSON.parse(readFileSync(new URL('../dataverse/access/unified-workflow-role-policy.json', import.meta.url), 'utf8'))
    assert.equal(policy.default, 'deny')
    assert.equal(policy.directNumberMutation, false)
    assert.deepEqual(policy.profiles.map((profile: { profile: string }) => profile.profile), ['full', 'coordinator', 'office', 'book'])
    for (const profile of policy.profiles) {
        const expected = readiness.roles.find((role: { profile: string }) => role.profile === profile.profile)
        assert.ok(expected)
        assert.deepEqual([...profile.allowedApis].sort(), [...expected.allowedApis].sort())
    }
    assert.ok(policy.alwaysDenied.includes('direct-job-number-create-update-clear'))
    assert.ok(policy.alwaysDenied.includes('system-service-impersonation'))
})

test('dry-run deployment package is complete, ordered and cannot deploy', () => {
    const readiness = JSON.parse(readFileSync(new URL('../dataverse/job-registration/readiness-manifest.json', import.meta.url), 'utf8'))
    const contract = JSON.parse(readFileSync(new URL('../dataverse/job-registration/contract.json', import.meta.url), 'utf8'))
    const plan = JSON.parse(readFileSync(new URL('../dataverse/job-registration/deployment-plan.json', import.meta.url), 'utf8'))
    const planner = readFileSync(new URL('../scripts/plan-unified-job-workflow-deployment.ps1', import.meta.url), 'utf8')
    const builder = readFileSync(new URL('../scripts/build-unified-job-workflow-plugin.ps1', import.meta.url), 'utf8')
    assert.equal(readiness.columns.length, 13)
    assert.equal(readiness.regionalTables.length, 4)
    assert.equal(readiness.customApis.length, 5)
    assert.equal(plan.featureFlagDuringDeployment, false)
    assert.equal(plan.assembly.version, '1.0.0.0')
    assert.equal(plan.provisioningIncluded, false)
    assert.equal(plan.deploymentIncluded, false)
    assert.equal(plan.assignmentIncluded, false)
    assert.equal(plan.featureEnableIncluded, false)
    assert.deepEqual(plan.assembly.types, [
        'ServiceOperations.JobRegistration.JobRegistrationPlugin',
        'ServiceOperations.JobRegistration.JobWorkflowPlugin',
        'ServiceOperations.JobRegistration.JobNumberInvariantPlugin',
        'ServiceOperations.Access.RestrictedAccessPlugin',
    ])
    const invariant = plan.guardSteps[0]
    assert.deepEqual(invariant.tables, contract.invariantPlugin.tables)
    assert.deepEqual(invariant.messages, contract.invariantPlugin.messages)
    assert.deepEqual(invariant.images.Update.ledgerColumns, contract.invariantPlugin.updateAndDeletePreImage.columns)
    assert.deepEqual(invariant.filteringAttributes, [])
    assert.match(plan.rollback.data, /Never renumber, delete ledgers, clear links/)
    assert.match(builder, /Package mode requires an existing, owner-approved strong-name key/)
    assert.match(builder, /strong-name key must be stored outside the repository/)
    assert.match(builder, /existing artifacts are never overwritten/)
    assert.match(builder, /ServiceOperations\.UnifiedJobWorkflow\.manifest\.json/)
    assert.match(builder, /deploymentPerformed = \$false/)
    assert.doesNotMatch(planner, /CrmServiceClient|CreateRequest|UpdateRequest|DeleteRequest|ImportSolutionRequest|AddPrivilegesRoleRequest/)
    assert.doesNotMatch(builder, /CrmServiceClient|RegisterPlugin|ImportSolution|pac solution import/)
})

test('assignment plan preserves the agreed roster and cannot change access', () => {
    const assignments = JSON.parse(readFileSync(new URL('../dataverse/access/unified-workflow-assignment-plan.json', import.meta.url), 'utf8'))
    const admissionAudit = readFileSync(new URL('../scripts/inspect-unified-job-role-admission.ps1', import.meta.url), 'utf8')
    assert.equal(assignments.assignmentIncluded, false)
    assert.equal(assignments.removalIncluded, false)
    assert.equal(assignments.intendedUsers.length, 11)
    assert.deepEqual(Object.fromEntries(['full', 'coordinator', 'office', 'book'].map((profile) => [profile, assignments.intendedUsers.filter((user: { profile: string }) => user.profile === profile).length])), {
        full: 1, coordinator: 2, office: 2, book: 6,
    })
    assert.equal(assignments.intendedUsers.filter((user: { dataverseAdmission: string }) => user.dataverseAdmission !== 'present').length, 8)
    assert.ok(assignments.gates.some((gate: string) => /direct and team-derived/.test(gate)))
    assert.ok(assignments.gates.some((gate: string) => /preserve unrelated assignments/i.test(gate)))
    assert.ok(assignments.rollback.some((step: string) => /Restore each changed account's pre-change/.test(step)))
    assert.match(admissionAudit, /\[string\]\$LoginPrompt = 'Never'/)
    for (const table of ['systemuserroles', 'teamroles', 'teammembership']) assert.match(admissionAudit, new RegExp(table))
    assert.doesNotMatch(admissionAudit, /CreateRequest|UpdateRequest|DeleteRequest|AssignRequest|AddMembersTeamRequest|AssociateRequest/)
})
