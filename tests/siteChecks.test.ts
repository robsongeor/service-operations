import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { JOB_STATUSES } from '../src/alpha/jobs/types/jobStatus.types.ts'
import {
    addCalendarDaysDateOnly,
    addCalendarMonthsDateOnly,
    calculateNextSiteCheckDueDate,
    calculateSiteCheckProgress,
    classifySiteCheckCreationConflict,
    filterSiteCheckEquipment,
    getSiteCheckScheduleState,
    isValidDateOnly,
    isValidSiteCheckRequestKey,
    siteCheckJobDescription,
    validateSiteCheckSchedule,
    validateSiteCheckStart,
    wasSiteCheckCompletedLate,
} from '../src/alpha/site-checks/domain/siteCheckCalculations.ts'
import {
    SITE_CHECK_EQUIPMENT_SCOPES,
    SITE_CHECK_FREQUENCIES,
} from '../src/alpha/site-checks/types/siteCheck.types.ts'
import { EQUIPMENT_OWNERSHIP_TYPES } from '../src/alpha/equipment/types/equipmentOwnership.types.ts'
import { EQUIPMENT_SITE_CHECK_AVAILABILITIES } from '../src/alpha/equipment/types/equipmentSiteCheckAvailability.types.ts'
import {
    allocateSiteCheckJobNumbers,
    deleteSiteCheckOccurrence,
    fetchSiteCheckJobs,
    fetchSiteCheckDetailJobsPage,
    fetchSiteCheckHistoryPage,
    fetchSiteCheckSchedulesForSites,
    fetchSiteChecksByIds,
    saveSiteCheckSchedule,
    saveSiteCheckScheduleConfiguration,
} from '../src/alpha/site-checks/services/siteChecksApi.ts'
import {
    buildSiteCheckJobBookRows,
    parseSiteCheckJobNumbers,
} from '../src/alpha/site-checks/domain/siteCheckJobBook.ts'
import { createSiteChecksDataCoordinator } from '../src/alpha/site-checks/services/siteChecksCoordinator.ts'
import { buildSiteCheckDashboardProjection } from '../src/alpha/site-checks/domain/siteCheckDashboard.ts'
import {
    buildSiteCheckCreationChangeSet,
    executeSiteCheckCreation,
} from '../src/alpha/site-checks/services/siteCheckCreationApi.ts'
import { assertJobTypeAllowedForCreation, JOB_TYPES } from '../src/alpha/jobs/types/jobType.types.ts'
import { startSiteCheckWorkflow } from '../src/alpha/site-checks/services/siteCheckCreationWorkflow.ts'
import { updateSiteCheckJobStatus } from '../src/alpha/site-checks/services/siteCheckCompletionApi.ts'

const IDS = {
    site: '11111111-1111-1111-1111-111111111111',
    schedule: '22222222-2222-2222-2222-222222222222',
    siteCheck: '33333333-3333-3333-3333-333333333333',
    technician: '44444444-4444-4444-4444-444444444444',
    job: '55555555-5555-5555-5555-555555555555',
}

test('Site Check Job Book export and number allocation preserve one deterministic row order', async () => {
    const jobs = [
        {
            gr_jobid: IDS.job,
            gr_status: JOB_STATUSES.ALLOCATED,
            _gr_sitecheck_value: IDS.siteCheck,
            gr_description: 'Release brake error',
            gr_Equipment: {
                gr_equipmentid: '77777777-7777-7777-7777-777777777777',
                gr_model: 'RX60',
                gr_fleet: 'FN2219',
            },
            gr_Mechanic: { gr_mechanicid: IDS.technician, gr_name: 'George R' },
            '@odata.etag': 'W/"1"',
        },
        {
            gr_jobid: '55555555-5555-5555-5555-555555555556',
            gr_status: JOB_STATUSES.ALLOCATED,
            _gr_sitecheck_value: IDS.siteCheck,
            gr_description: 'Site check',
            gr_Equipment: {
                gr_equipmentid: '77777777-7777-7777-7777-777777777778',
                gr_model: '8FG',
                gr_fleet: 'FN2220',
            },
            gr_Mechanic: { gr_mechanicid: IDS.technician, gr_name: 'George R' },
            '@odata.etag': 'W/"2"',
        },
    ]
    assert.equal(
        buildSiteCheckJobBookRows(jobs, 'Opal Tauranga', '1 Test Road, Mount Maunganui, Tauranga'),
        [
            'George R\tRX60\tFN2219\tOpal Tauranga\tRelease brake error\t1 Test Road\tMount Maunganui\tTauranga',
            'George R\t8FG\tFN2220\tOpal Tauranga\tSite check\t1 Test Road\tMount Maunganui\tTauranga',
        ].join('\n'),
    )
    const allocations = parseSiteCheckJobNumbers('145410\r\n145411\r\n', jobs)
    assert.deepEqual(allocations.map((item) => item.jobNumber), ['145410', '145411'])
    assert.equal(allocations[0].job.gr_jobid, IDS.job)
    assert.throws(() => parseSiteCheckJobNumbers('145410', jobs), /exactly 2/)
    assert.throws(() => parseSiteCheckJobNumbers('145410\n145410', jobs), /unique/)
    assert.throws(() => parseSiteCheckJobNumbers('145410\nABC', jobs), /digits only/)

    let requestBody = ''
    await allocateSiteCheckJobNumbers('token', allocations, {
        apiUrl: 'https://example.test',
        fetcher: (async (_input, init) => {
            requestBody = String(init?.body)
            return new Response(
                'HTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content\r\n',
                { status: 200 },
            )
        }) as typeof fetch,
    })
    assert.match(requestBody, /PATCH \/api\/data\/v9\.2\/gr_jobs\(55555555-5555-5555-5555-555555555555\)/)
    assert.match(requestBody, /If-Match: W\/"1"/)
    assert.match(requestBody, /"gr_jobnumber":"145410"/)
})

test('Site Check deletion atomically clears an active pointer and deletes Jobs before occurrence', async () => {
    const occurrence = {
        gr_sitecheckid: IDS.siteCheck,
        gr_name: 'Site Check',
        gr_status: 122830000,
        gr_startedon: '2026-07-26T01:00:00.000Z',
        gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_duedatesnapshot: '2026-07-26',
        gr_expectedjobcount: 1,
        gr_creationrequestkey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        _gr_sitecheckschedule_value: IDS.schedule,
        _gr_site_value: IDS.site,
        _gr_assignedtechnician_value: IDS.technician,
        '@odata.etag': 'W/"20"',
    } as const
    const jobs = [{
        gr_jobid: IDS.job,
        gr_status: JOB_STATUSES.ALLOCATED,
        _gr_sitecheck_value: IDS.siteCheck,
        '@odata.etag': 'W/"21"',
    }]
    const schedule = {
        gr_sitecheckscheduleid: IDS.schedule,
        gr_name: 'Schedule',
        gr_enabled: true,
        gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_nextduedate: '2026-07-26',
        _gr_site_value: IDS.site,
        _gr_activesitecheck_value: IDS.siteCheck,
        '@odata.etag': 'W/"22"',
    } as const
    const exclusions = [{
        gr_sitecheckequipmentexclusionid: '66666666-6666-6666-6666-666666666666',
        gr_name: 'FN100 unavailable',
        gr_availabilitysnapshot: EQUIPMENT_SITE_CHECK_AVAILABILITIES.IN_WORKSHOP,
        _gr_sitecheck_value: IDS.siteCheck,
        _gr_equipment_value: '77777777-7777-7777-7777-777777777777',
        '@odata.etag': 'W/"23"',
    }] as const
    let body = ''
    await deleteSiteCheckOccurrence('token', occurrence, jobs, exclusions, schedule, {
        apiUrl: 'https://example.test',
        fetcher: (async (_input, init) => {
            body = String(init?.body)
            return new Response(
                'HTTP/1.1 204 No Content\r\n'.repeat(4),
                { status: 200 },
            )
        }) as typeof fetch,
    })
    const scheduleIndex = body.indexOf(`PATCH /api/data/v9.2/gr_sitecheckschedules(${IDS.schedule})`)
    const jobIndex = body.indexOf(`DELETE /api/data/v9.2/gr_jobs(${IDS.job})`)
    const exclusionIndex = body.indexOf(
        `DELETE /api/data/v9.2/gr_sitecheckequipmentexclusions(${exclusions[0].gr_sitecheckequipmentexclusionid})`,
    )
    const occurrenceIndex = body.indexOf(`DELETE /api/data/v9.2/gr_sitechecks(${IDS.siteCheck})`)
    assert.ok(scheduleIndex >= 0)
    assert.ok(jobIndex > scheduleIndex)
    assert.ok(exclusionIndex > jobIndex)
    assert.ok(occurrenceIndex > exclusionIndex)
    assert.match(body, /"gr_ActiveSiteCheck@odata.bind":null/)
    assert.match(body, /If-Match: W\/"21"/)
})

test('dashboard projection excludes disabled and invalid schedules from reportable totals', () => {
    const projection = buildSiteCheckDashboardProjection({
        today: '2026-07-26',
        schedules: [
            {
                gr_sitecheckscheduleid: IDS.schedule,
                gr_name: 'Due',
                gr_enabled: true,
                gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
                gr_nextduedate: '2026-07-26',
                _gr_site_value: IDS.site,
            },
            {
                gr_sitecheckscheduleid: '22222222-2222-2222-2222-222222222223',
                gr_name: 'Disabled',
                gr_enabled: false,
                _gr_site_value: '11111111-1111-1111-1111-111111111112',
            },
            {
                gr_sitecheckscheduleid: '22222222-2222-2222-2222-222222222224',
                gr_name: 'Invalid',
                gr_enabled: true,
                _gr_site_value: '11111111-1111-1111-1111-111111111113',
            },
        ],
        siteChecks: [],
        jobs: [],
    })

    assert.deepEqual(projection.summary, {
        'up-to-date': 0,
        due: 1,
        overdue: 0,
        'in-progress': 0,
    })
    assert.equal(projection.invalidCount, 1)
})

test('rental-only scope excludes Customer-owned and Not classified Equipment', () => {
    const equipment = [
        { id: 'unclassified', gr_ownershiptype: null },
        { id: 'customer', gr_ownershiptype: EQUIPMENT_OWNERSHIP_TYPES.CUSTOMER_OWNED },
        { id: 'rental', gr_ownershiptype: EQUIPMENT_OWNERSHIP_TYPES.LIFTRUCKS_RENTAL },
    ]

    assert.deepEqual(
        filterSiteCheckEquipment(equipment, SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY),
        [equipment[2]],
    )
    assert.deepEqual(filterSiteCheckEquipment(equipment, null), equipment)
})

test('unavailable Equipment waits for the next occurrence while unclassified availability is included', () => {
    const equipment = [
        { id: 'legacy', gr_sitecheckavailability: null },
        {
            id: 'available',
            gr_sitecheckavailability: EQUIPMENT_SITE_CHECK_AVAILABILITIES.AVAILABLE_AT_SITE,
        },
        {
            id: 'offsite',
            gr_sitecheckavailability: EQUIPMENT_SITE_CHECK_AVAILABILITIES.TEMPORARILY_OFF_SITE,
        },
        {
            id: 'workshop',
            gr_sitecheckavailability: EQUIPMENT_SITE_CHECK_AVAILABILITIES.IN_WORKSHOP,
        },
    ]

    assert.deepEqual(
        filterSiteCheckEquipment(equipment, SITE_CHECK_EQUIPMENT_SCOPES.ALL_EQUIPMENT),
        equipment.slice(0, 2),
    )
})

test('manual scope includes only explicitly selected current-Site Equipment', () => {
    const equipment = [
        { gr_equipmentid: IDS.job, gr_ownershiptype: null },
        {
            gr_equipmentid: IDS.technician,
            gr_ownershiptype: EQUIPMENT_OWNERSHIP_TYPES.LIFTRUCKS_RENTAL,
        },
    ]

    assert.deepEqual(
        filterSiteCheckEquipment(
            equipment,
            SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION,
            [IDS.job, '66666666-6666-6666-6666-666666666666'],
        ),
        [equipment[0]],
    )
    assert.deepEqual(
        filterSiteCheckEquipment(
            equipment,
            SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION,
            [],
        ),
        [],
    )
})

test('dashboard projection calculates active progress from operational Job Status', () => {
    const projection = buildSiteCheckDashboardProjection({
        today: '2026-07-26',
        schedules: [{
            gr_sitecheckscheduleid: IDS.schedule,
            gr_name: 'Active',
            gr_enabled: true,
            gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
            gr_nextduedate: '2026-07-20',
            _gr_site_value: IDS.site,
            _gr_activesitecheck_value: IDS.siteCheck,
        }],
        siteChecks: [{
            gr_sitecheckid: IDS.siteCheck,
            gr_name: 'Occurrence',
            gr_status: 122830000,
            gr_startedon: '2026-07-26T01:00:00Z',
            gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
            gr_duedatesnapshot: '2026-07-20',
            gr_expectedjobcount: 2,
            gr_creationrequestkey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            _gr_sitecheckschedule_value: IDS.schedule,
            _gr_site_value: IDS.site,
            _gr_assignedtechnician_value: IDS.technician,
        }],
        jobs: [
            { gr_jobid: IDS.job, gr_status: JOB_STATUSES.COMPLETE, _gr_sitecheck_value: IDS.siteCheck },
            {
                gr_jobid: '55555555-5555-5555-5555-555555555556',
                gr_status: JOB_STATUSES.IN_PROGRESS,
                _gr_sitecheck_value: IDS.siteCheck,
            },
        ],
    })

    assert.equal(projection.summary['in-progress'], 1)
    assert.deepEqual(projection.items[0]?.progress, {
        total: 2,
        completed: 1,
        remaining: 1,
        expected: 2,
        hasIntegrityMismatch: false,
        isComplete: false,
    })
})

function creationInput(equipmentCount = 22) {
    return {
        schedule: {
            gr_sitecheckscheduleid: IDS.schedule,
            gr_name: 'Schedule',
            gr_enabled: true,
            gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
            gr_nextduedate: '2026-07-26',
            _gr_site_value: IDS.site,
            '@odata.etag': 'W/"10"',
        },
        siteName: 'Test Site',
        technicianId: IDS.technician,
        equipment: Array.from({ length: equipmentCount }, (_, index) => ({
            gr_equipmentid: `60000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
            gr_fleet: `FLT-${index + 1}`,
            statecode: index === 0 ? 1 : 0,
        })),
        requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        startedOn: '2026-07-26T01:00:00.000Z',
    } as const
}

test('22-Equipment creation fits one atomic 24-operation change set', () => {
    const batch = buildSiteCheckCreationChangeSet(creationInput())
    assert.equal(batch.operationCount, 24)
    assert.ok(batch.payloadBytes < 30_000, `Unexpected payload size: ${batch.payloadBytes}`)
    assert.match(batch.body, /POST \/api\/data\/v9\.2\/gr_sitechecks HTTP\/1\.1/)
    assert.match(batch.body, /If-Match: W\/"10"/)
    assert.match(batch.body, /"gr_ActiveSiteCheck@odata.bind":"\$1"/)
    assert.equal((batch.body.match(/POST \/api\/data\/v9\.2\/gr_jobs HTTP\/1\.1/g) ?? []).length, 22)
    assert.equal((batch.body.match(/"gr_SiteCheck@odata.bind":"\$1"/g) ?? []).length, 22)
    assert.match(batch.body, /Weekly checks for 20\/07\/2026/)
})

test('atomic creation snapshots unavailable Equipment without creating a Job for it', () => {
    const input = creationInput(1)
    const excludedEquipment = [{
        gr_equipmentid: '70000000-0000-0000-0000-000000000001',
        gr_fleet: 'FLT-OFFSITE',
        gr_sitecheckavailability: EQUIPMENT_SITE_CHECK_AVAILABILITIES.TEMPORARILY_OFF_SITE,
    }] as const
    const batch = buildSiteCheckCreationChangeSet({ ...input, excludedEquipment })

    assert.equal(batch.operationCount, 4)
    assert.equal((batch.body.match(/POST \/api\/data\/v9\.2\/gr_jobs HTTP\/1\.1/g) ?? []).length, 1)
    assert.equal(
        (batch.body.match(/POST \/api\/data\/v9\.2\/gr_sitecheckequipmentexclusions HTTP\/1\.1/g) ?? []).length,
        1,
    )
    assert.match(
        batch.body,
        new RegExp(`"gr_availabilitysnapshot":${EQUIPMENT_SITE_CHECK_AVAILABILITIES.TEMPORARILY_OFF_SITE}`),
    )
    assert.match(batch.body, /"gr_Equipment@odata.bind":"\/gr_equipments\(70000000-0000-0000-0000-000000000001\)"/)
})

test('Site Check Job descriptions use frequency and the Monday of the NZ start week', () => {
    assert.equal(
        siteCheckJobDescription(
            SITE_CHECK_FREQUENCIES.WEEKLY,
            '2026-07-26T13:30:00.000Z',
        ),
        'Weekly checks for 27/07/2026',
    )
    assert.equal(
        siteCheckJobDescription(
            SITE_CHECK_FREQUENCIES.FORTNIGHTLY,
            '2026-07-26T01:00:00.000Z',
        ),
        'Fortnightly checks for 20/07/2026',
    )
    assert.equal(
        siteCheckJobDescription(
            SITE_CHECK_FREQUENCIES.MONTHLY,
            '2026-07-29T01:00:00.000Z',
        ),
        'Monthly checks for 27/07/2026',
    )
})

test('Site Check Job Type is protected from standard and WOF creation sources', () => {
    assert.throws(
        () => assertJobTypeAllowedForCreation(JOB_TYPES.SITE_CHECK),
        /Site Check workflow/,
    )
    assert.doesNotThrow(
        () => assertJobTypeAllowedForCreation(JOB_TYPES.SITE_CHECK, 'site-check'),
    )
})

test('atomic creation treats any nested failure as whole-transaction failure', async () => {
    await assert.rejects(
        executeSiteCheckCreation('token', creationInput(1), {
            apiUrl: 'https://example.test/api/data/v9.2',
            fetcher: async () => new Response(
                'HTTP/1.1 204 No Content\r\nHTTP/1.1 412 Precondition Failed',
                { status: 200 },
            ),
        }),
        /already started or its Schedule changed/,
    )
})

test('creation workflow reconciles an unknown write outcome without creating again', async () => {
    const input = creationInput(1)
    const occurrence = {
        gr_sitecheckid: IDS.siteCheck,
        gr_name: 'Occurrence',
        gr_status: 122830000 as const,
        gr_startedon: input.startedOn,
        gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_duedatesnapshot: '2026-07-26',
        gr_expectedjobcount: 1,
        gr_creationrequestkey: input.requestKey,
        _gr_sitecheckschedule_value: IDS.schedule,
        _gr_site_value: IDS.site,
        _gr_assignedtechnician_value: IDS.technician,
    }
    let executeCount = 0
    let requestKeyReads = 0
    let scheduleReads = 0
    const created = await startSiteCheckWorkflow('token', {
        siteId: IDS.site,
        siteName: input.siteName,
        technicianId: IDS.technician,
        requestKey: input.requestKey,
        startedOn: input.startedOn,
    }, {
        fetchSchedules: async () => {
            scheduleReads += 1
            return [{
                ...input.schedule,
                _gr_activesitecheck_value: scheduleReads >= 2 ? IDS.siteCheck : null,
            }]
        },
        fetchEquipment: async () => [...input.equipment],
        fetchScheduleEquipment: async () => [],
        fetchMechanic: async () => ({
            gr_mechanicid: IDS.technician,
            gr_name: 'Technician',
            statecode: 0,
        }),
        executeCreation: async () => {
            executeCount += 1
            throw new Error('Network outcome unknown')
        },
        fetchByRequestKey: async () => {
            requestKeyReads += 1
            return requestKeyReads >= 2 ? occurrence : null
        },
        fetchJobs: async () => [{
            gr_jobid: IDS.job,
            gr_status: JOB_STATUSES.ALLOCATED,
            _gr_sitecheck_value: IDS.siteCheck,
        }],
    })
    assert.equal(created.gr_sitecheckid, IDS.siteCheck)
    assert.equal(executeCount, 1)
})

test('creation workflow rejects inactive technicians before issuing the transaction', async () => {
    const input = creationInput(1)
    let executeCount = 0
    await assert.rejects(startSiteCheckWorkflow('token', {
        siteId: IDS.site,
        siteName: input.siteName,
        technicianId: IDS.technician,
        requestKey: input.requestKey,
        startedOn: input.startedOn,
    }, {
        fetchSchedules: async () => [input.schedule],
        fetchEquipment: async () => [...input.equipment],
        fetchScheduleEquipment: async () => [],
        fetchMechanic: async () => ({
            gr_mechanicid: IDS.technician,
            gr_name: 'Inactive technician',
            statecode: 1,
        }),
        executeCreation: async () => {
            executeCount += 1
            return { operationCount: 3, payloadBytes: 1 }
        },
        fetchByRequestKey: async () => null,
        fetchJobs: async () => [],
    }), /active technician/)
    assert.equal(executeCount, 0)
})

test('same-key replay validates pointer and Job count without loading Equipment or creating', async () => {
    const input = creationInput(1)
    const occurrence = {
        gr_sitecheckid: IDS.siteCheck,
        gr_name: 'Occurrence',
        gr_status: 122830000 as const,
        gr_startedon: input.startedOn,
        gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_duedatesnapshot: '2026-07-26',
        gr_expectedjobcount: 1,
        gr_creationrequestkey: input.requestKey,
        _gr_sitecheckschedule_value: IDS.schedule,
        _gr_site_value: IDS.site,
        _gr_assignedtechnician_value: IDS.technician,
    }
    let equipmentReads = 0
    let executeCount = 0
    const result = await startSiteCheckWorkflow('token', {
        siteId: IDS.site,
        siteName: input.siteName,
        technicianId: IDS.technician,
        requestKey: input.requestKey,
        startedOn: input.startedOn,
    }, {
        fetchByRequestKey: async () => occurrence,
        fetchSchedules: async () => [{
            ...input.schedule,
            _gr_activesitecheck_value: IDS.siteCheck,
        }],
        fetchJobs: async () => [{
            gr_jobid: IDS.job,
            gr_status: JOB_STATUSES.ALLOCATED,
            _gr_sitecheck_value: IDS.siteCheck,
        }],
        fetchEquipment: async () => {
            equipmentReads += 1
            return []
        },
        fetchMechanic: async () => null,
        executeCreation: async () => {
            executeCount += 1
            return { operationCount: 3, payloadBytes: 1 }
        },
    })
    assert.equal(result.gr_sitecheckid, IDS.siteCheck)
    assert.equal(equipmentReads, 0)
    assert.equal(executeCount, 0)
})

test('concurrent manager active pointer blocks before the atomic write', async () => {
    const input = creationInput(1)
    let executeCount = 0
    await assert.rejects(startSiteCheckWorkflow('token', {
        siteId: IDS.site,
        siteName: input.siteName,
        technicianId: IDS.technician,
        requestKey: input.requestKey,
        startedOn: input.startedOn,
    }, {
        fetchByRequestKey: async () => null,
        fetchSchedules: async () => [{
            ...input.schedule,
            _gr_activesitecheck_value: '33333333-3333-3333-3333-333333333334',
        }],
        fetchEquipment: async () => [...input.equipment],
        fetchMechanic: async () => ({
            gr_mechanicid: IDS.technician,
            gr_name: 'Technician',
            statecode: 0,
        }),
        fetchJobs: async () => [],
        executeCreation: async () => {
            executeCount += 1
            return { operationCount: 3, payloadBytes: 1 }
        },
    }), /already in progress/)
    assert.equal(executeCount, 0)
})

test('replay with a partial linked Job set raises an integrity error', async () => {
    const input = creationInput(2)
    const occurrence = {
        gr_sitecheckid: IDS.siteCheck,
        gr_name: 'Occurrence',
        gr_status: 122830000 as const,
        gr_startedon: input.startedOn,
        gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_duedatesnapshot: '2026-07-26',
        gr_expectedjobcount: 2,
        gr_creationrequestkey: input.requestKey,
        _gr_sitecheckschedule_value: IDS.schedule,
        _gr_site_value: IDS.site,
        _gr_assignedtechnician_value: IDS.technician,
    }
    await assert.rejects(startSiteCheckWorkflow('token', {
        siteId: IDS.site,
        siteName: input.siteName,
        technicianId: IDS.technician,
        requestKey: input.requestKey,
        startedOn: input.startedOn,
    }, {
        fetchByRequestKey: async () => occurrence,
        fetchSchedules: async () => [{
            ...input.schedule,
            _gr_activesitecheck_value: IDS.siteCheck,
        }],
        fetchJobs: async () => [{
            gr_jobid: IDS.job,
            gr_status: JOB_STATUSES.ALLOCATED,
            _gr_sitecheck_value: IDS.siteCheck,
        }],
        fetchEquipment: async () => [],
        fetchMechanic: async () => null,
        executeCreation: async () => ({ operationCount: 4, payloadBytes: 1 }),
    }), /data-integrity review/)
})

test('strict Date Only validation rejects impossible or timestamp values', () => {
    assert.equal(isValidDateOnly('2026-02-28'), true)
    assert.equal(isValidDateOnly('2026-02-29'), false)
    assert.equal(isValidDateOnly('2024-02-29'), true)
    assert.equal(isValidDateOnly('2026-07-26T00:00:00Z'), false)
})

test('weekly and fortnightly cadence use calendar days across month and year boundaries', () => {
    assert.equal(addCalendarDaysDateOnly('2026-12-29', 7), '2027-01-05')
    assert.equal(
        calculateNextSiteCheckDueDate('2026-03-29', SITE_CHECK_FREQUENCIES.WEEKLY),
        '2026-04-05',
    )
    assert.equal(
        calculateNextSiteCheckDueDate('2026-12-25', SITE_CHECK_FREQUENCIES.FORTNIGHTLY),
        '2027-01-08',
    )
})

test('monthly cadence clamps month end and uses the completion date as its anchor', () => {
    assert.equal(addCalendarMonthsDateOnly('2025-01-31', 1), '2025-02-28')
    assert.equal(addCalendarMonthsDateOnly('2024-01-31', 1), '2024-02-29')
    assert.equal(addCalendarMonthsDateOnly('2024-02-29', 1), '2024-03-29')
    assert.equal(addCalendarMonthsDateOnly('2026-03-31', 1), '2026-04-30')
    assert.equal(
        calculateNextSiteCheckDueDate('2026-07-31', SITE_CHECK_FREQUENCIES.MONTHLY),
        '2026-08-31',
    )
})

test('schedule validation only requires cadence data while enabled', () => {
    assert.deepEqual(validateSiteCheckSchedule({ enabled: false }), { valid: true, errors: [] })
    assert.deepEqual(validateSiteCheckSchedule({ enabled: true }), {
        valid: false,
        errors: ['Select a Site Check frequency.', 'Enter a valid next due date.'],
    })
    assert.equal(validateSiteCheckSchedule({
        enabled: true,
        frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        equipmentScope: SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY,
        nextDueDate: '2026-07-26',
    }).valid, true)
})

test('schedule state applies disabled, invalid, active, overdue, due, and current precedence', () => {
    const valid = {
        enabled: true,
        frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        nextDueDate: '2026-07-26',
        today: '2026-07-26',
    } as const

    assert.equal(getSiteCheckScheduleState({ ...valid, enabled: false }), 'disabled')
    assert.equal(getSiteCheckScheduleState({ ...valid, frequency: null }), 'invalid')
    assert.equal(getSiteCheckScheduleState({ ...valid, activeSiteCheckId: 'check-1' }), 'in-progress')
    assert.equal(getSiteCheckScheduleState({ ...valid, nextDueDate: '2026-07-25' }), 'overdue')
    assert.equal(getSiteCheckScheduleState(valid), 'due')
    assert.equal(getSiteCheckScheduleState({ ...valid, nextDueDate: '2026-07-27' }), 'up-to-date')
})

test('progress counts only operational Job Status Complete and detects missing Jobs', () => {
    const jobs = [
        { gr_status: JOB_STATUSES.COMPLETE },
        { gr_status: JOB_STATUSES.COMPLETION_REVIEW },
        { gr_status: JOB_STATUSES.ALLOCATED },
    ]
    assert.deepEqual(calculateSiteCheckProgress(jobs, 3), {
        total: 3,
        completed: 1,
        remaining: 2,
        expected: 3,
        hasIntegrityMismatch: false,
        isComplete: false,
    })
    assert.equal(calculateSiteCheckProgress(jobs, 4).hasIntegrityMismatch, true)
})

test('progress completes only when every expected generated Job is operationally Complete', () => {
    const completeJobs = [
        { gr_status: JOB_STATUSES.COMPLETE },
        { gr_status: JOB_STATUSES.COMPLETE },
    ]
    assert.equal(calculateSiteCheckProgress(completeJobs, 2).isComplete, true)
    assert.equal(calculateSiteCheckProgress(completeJobs, 3).isComplete, false)
    assert.equal(calculateSiteCheckProgress([], 0).isComplete, false)
})

test('history is late only when the NZ completion date is after the due snapshot', () => {
    assert.equal(wasSiteCheckCompletedLate('2026-07-27T00:01:00+12:00', '2026-07-26'), true)
    assert.equal(wasSiteCheckCompletedLate('2026-07-26T23:59:00+12:00', '2026-07-26'), false)
    assert.equal(wasSiteCheckCompletedLate(null, '2026-07-26'), false)
})

test('start validation blocks every confirmed precondition and accepts a reload-safe request', () => {
    const requestKey = '12345678-1234-4234-9234-123456789abc'
    assert.equal(isValidSiteCheckRequestKey(requestKey), true)
    const schedule = {
        gr_sitecheckscheduleid: IDS.schedule,
        gr_name: 'Weekly Site Check',
        gr_enabled: true,
        gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_nextduedate: '2026-07-26',
        _gr_site_value: IDS.site,
        '@odata.etag': 'W/"1"',
    }
    assert.equal(validateSiteCheckStart({
        schedule,
        technicianId: IDS.technician,
        equipmentCount: 2,
        requestKey,
    }).valid, true)

    const blocked = validateSiteCheckStart({
        schedule: { ...schedule, gr_enabled: false, _gr_activesitecheck_value: IDS.siteCheck },
        technicianId: '',
        equipmentCount: 0,
        requestKey: 'retry-1',
        creationInProgress: true,
    })
    assert.equal(blocked.valid, false)
    assert.equal(blocked.errors.length, 6)
})

test('creation conflicts distinguish idempotent replay from another active manager', () => {
    assert.equal(classifySiteCheckCreationConflict('request-1', 'request-1'), 'replay')
    assert.equal(
        classifySiteCheckCreationConflict('request-1', 'request-2'),
        'active-check-conflict',
    )
})

test('focused services batch IDs into one request and map ETags and relationships', async () => {
    const requests: string[] = []
    const responses = [
        {
            value: [{
                '@odata.etag': 'W/"1"',
                gr_sitecheckscheduleid: IDS.schedule,
                gr_name: 'Weekly Site Check',
                gr_enabled: true,
                gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
                gr_nextduedate: '2026-07-26',
                gr_lastcompleteddate: null,
                _gr_site_value: IDS.site,
                _gr_activesitecheck_value: IDS.siteCheck,
            }],
        },
        {
            value: [{
                '@odata.etag': 'W/"2"',
                gr_sitecheckid: IDS.siteCheck,
                gr_name: 'Site Check 26 July',
                gr_status: 122830000,
                gr_startedon: '2026-07-26T00:00:00Z',
                gr_completedon: null,
                gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
                gr_duedatesnapshot: '2026-07-26',
                gr_expectedjobcount: 1,
                gr_creationrequestkey: '12345678-1234-4234-9234-123456789abc',
                _gr_sitecheckschedule_value: IDS.schedule,
                _gr_site_value: IDS.site,
                _gr_assignedtechnician_value: IDS.technician,
            }],
        },
        {
            value: [{
                gr_jobid: IDS.job,
                gr_status: JOB_STATUSES.COMPLETE,
                _gr_sitecheck_value: IDS.siteCheck,
            }],
        },
    ]
    const fetcher = async (input: string | URL | Request) => {
        requests.push(String(input))
        return new Response(JSON.stringify(responses.shift()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    }
    const options = { apiUrl: 'https://example.test/api/data/v9.2', fetcher: fetcher as typeof fetch }

    const schedules = await fetchSiteCheckSchedulesForSites(
        'token',
        [IDS.site, IDS.site],
        options,
    )
    const checks = await fetchSiteChecksByIds('token', [IDS.siteCheck], options)
    const jobs = await fetchSiteCheckJobs('token', [IDS.siteCheck], options)

    assert.equal(requests.length, 3)
    assert.equal((requests[0].match(new RegExp(IDS.site, 'g')) ?? []).length, 1)
    assert.equal(schedules[0]['@odata.etag'], 'W/"1"')
    assert.equal(checks[0]._gr_assignedtechnician_value, IDS.technician)
    assert.equal(jobs[0].gr_status, JOB_STATUSES.COMPLETE)
})

test('focused services make no request for an empty scope and return safe read errors', async () => {
    let requests = 0
    const fetcher = async () => {
        requests += 1
        return new Response('sensitive upstream body', { status: 500 })
    }
    assert.deepEqual(await fetchSiteCheckSchedulesForSites(
        'token',
        [],
        { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch },
    ), [])
    assert.equal(requests, 0)
    await assert.rejects(
        fetchSiteCheckJobs(
            'token',
            [IDS.siteCheck],
            { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch },
        ),
        /Site Check Job progress could not be loaded/,
    )
})

test('coordinator acquires one token and coalesces identical concurrent Site scopes', async () => {
    let tokenCalls = 0
    let scheduleCalls = 0
    let checkCalls = 0
    let jobCalls = 0
    let selectionCalls = 0
    let releaseSchedules!: () => void
    const scheduleGate = new Promise<void>((resolve) => { releaseSchedules = resolve })
    const schedule = {
        gr_sitecheckscheduleid: IDS.schedule,
        gr_name: 'Weekly Site Check',
        gr_enabled: true,
        gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_nextduedate: '2026-07-26',
        _gr_site_value: IDS.site,
        _gr_activesitecheck_value: IDS.siteCheck,
        '@odata.etag': 'W/"1"',
    }
    const coordinator = createSiteChecksDataCoordinator({
        acquireAccessToken: async () => {
            tokenCalls += 1
            return 'one-token'
        },
        fetchSchedules: async (token, ids) => {
            scheduleCalls += 1
            assert.equal(token, 'one-token')
            assert.deepEqual(ids, [IDS.site])
            await scheduleGate
            return [schedule]
        },
        fetchSiteChecks: async (token, ids) => {
            checkCalls += 1
            assert.equal(token, 'one-token')
            assert.deepEqual(ids, [IDS.siteCheck])
            return []
        },
        fetchJobs: async (token, ids) => {
            jobCalls += 1
            assert.equal(token, 'one-token')
            assert.deepEqual(ids, [IDS.siteCheck])
            return []
        },
        fetchScheduleEquipment: async (token, ids) => {
            selectionCalls += 1
            assert.equal(token, 'one-token')
            assert.deepEqual(ids, [IDS.schedule])
            return []
        },
    })

    const first = coordinator.loadSiteChecks([IDS.site])
    const second = coordinator.loadSiteChecks([IDS.site.toUpperCase(), IDS.site])
    releaseSchedules()
    assert.deepEqual(await first, await second)
    assert.deepEqual(
        { tokenCalls, scheduleCalls, checkCalls, jobCalls, selectionCalls },
        { tokenCalls: 1, scheduleCalls: 1, checkCalls: 1, jobCalls: 1, selectionCalls: 1 },
    )
})

test('coordinator skips token acquisition and child reads for empty or inactive scopes', async () => {
    let tokenCalls = 0
    let childCalls = 0
    const coordinator = createSiteChecksDataCoordinator({
        acquireAccessToken: async () => {
            tokenCalls += 1
            return 'token'
        },
        fetchSchedules: async () => [],
        fetchSiteChecks: async () => {
            childCalls += 1
            return []
        },
        fetchJobs: async () => {
            childCalls += 1
            return []
        },
        fetchScheduleEquipment: async () => {
            childCalls += 1
            return []
        },
    })

    assert.deepEqual(await coordinator.loadSiteChecks([]), {
        schedules: [],
        siteChecks: [],
        jobs: [],
        scheduleEquipment: [],
    })
    assert.deepEqual(await coordinator.loadSiteChecks([IDS.site]), {
        schedules: [],
        siteChecks: [],
        jobs: [],
        scheduleEquipment: [],
    })
    assert.equal(tokenCalls, 1)
    assert.equal(childCalls, 0)
})

test('Site Checks hook uses silent authentication and contains no interactive retry path', () => {
    const source = readFileSync(
        new URL('../src/alpha/site-checks/hooks/useSiteChecks.ts', import.meta.url),
        'utf8',
    )
    assert.match(source, /useActiveMsalAccount/)
    assert.match(source, /acquireTokenSilent/)
    assert.match(source, /InteractionRequiredAuthError/)
    assert.match(source, /silentTokenRequests/)
    assert.doesNotMatch(source, /loginRedirect|loginPopup|acquireTokenRedirect|acquireTokenPopup/)
    assert.match(source, /createSiteChecksDataCoordinator/)
})

test('schedule creation uses the Site relationship and preserves disabled cadence values', async () => {
    let request: { url: string; init?: RequestInit } | undefined
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
        request = { url: String(input), init }
        return new Response(JSON.stringify({
            '@odata.etag': 'W/"1"',
            gr_sitecheckscheduleid: IDS.schedule,
            gr_name: 'Site Check Schedule — Test Site',
            gr_enabled: false,
            gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
            gr_nextduedate: '2026-07-26',
            gr_lastcompleteddate: null,
            _gr_site_value: IDS.site,
            _gr_activesitecheck_value: null,
        }), { status: 201 })
    }
    await saveSiteCheckSchedule('token', {
        siteId: IDS.site,
        siteName: 'Test Site',
        enabled: false,
        frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        equipmentScope: SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY,
        nextDueDate: '2026-07-26',
    }, null, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch })

    assert.equal(
        request?.url,
        'https://example.test/gr_sitecheckschedules',
    )
    assert.equal(request?.init?.method, 'POST')
    assert.equal((request?.init?.headers as Record<string, string>)['If-None-Match'], undefined)
    const body = JSON.parse(String(request?.init?.body))
    assert.equal(body['gr_Site@odata.bind'], `/gr_sites(${IDS.site})`)
    assert.equal(body.gr_frequency, SITE_CHECK_FREQUENCIES.WEEKLY)
    assert.equal(body.gr_equipmentscope, SITE_CHECK_EQUIPMENT_SCOPES.LIFTRUCKS_RENTALS_ONLY)
    assert.equal(body.gr_nextduedate, '2026-07-26')
})

test('schedule updates require the loaded ETag and return safe concurrency errors', async () => {
    const existing = {
        gr_sitecheckscheduleid: IDS.schedule,
        gr_name: 'Site Check Schedule — Test Site',
        gr_enabled: true,
        gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_nextduedate: '2026-07-26',
        _gr_site_value: IDS.site,
        '@odata.etag': 'W/"7"',
    }
    let headers: HeadersInit | undefined
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
        headers = init?.headers
        return new Response('', { status: 412 })
    }
    await assert.rejects(
        saveSiteCheckSchedule('token', {
            siteId: IDS.site,
            siteName: 'Test Site',
            enabled: true,
            frequency: SITE_CHECK_FREQUENCIES.MONTHLY,
            nextDueDate: '2026-08-26',
        }, existing, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch }),
        /changed elsewhere/,
    )
    assert.equal((headers as Record<string, string>)['If-Match'], 'W/"7"')
})

test('schedule write failures expose only the safe Dataverse status', async () => {
    await assert.rejects(
        saveSiteCheckSchedule('token', {
            siteId: IDS.site,
            siteName: 'Test Site',
            enabled: true,
            frequency: SITE_CHECK_FREQUENCIES.MONTHLY,
            nextDueDate: '2026-07-26',
        }, null, {
            apiUrl: 'https://example.test',
            fetcher: (async () => new Response(
                'sensitive upstream response',
                { status: 403 },
            )) as typeof fetch,
        }),
        (error: unknown) => {
            assert.match(String(error), /Dataverse HTTP 403/)
            assert.doesNotMatch(String(error), /sensitive upstream response/)
            return true
        },
    )
})

test('schedule service rejects enabled settings before issuing an invalid write', async () => {
    let requests = 0
    await assert.rejects(
        saveSiteCheckSchedule('token', {
            siteId: IDS.site,
            siteName: 'Test Site',
            enabled: true,
        }, null, {
            apiUrl: 'https://example.test',
            fetcher: (async () => {
                requests += 1
                return new Response()
            }) as typeof fetch,
        }),
        /Select a Site Check frequency.*valid next due date/,
    )
    assert.equal(requests, 0)
})

test('manual Schedule save atomically replaces selection rows with optimistic concurrency', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input)
        requests.push({ url, init })
        if (url.includes('gr_sitecheckscheduleequipments?')) {
            return new Response(JSON.stringify({ value: [{
                gr_sitecheckscheduleequipmentid: '66666666-6666-6666-6666-666666666666',
                gr_name: 'Old selection',
                _gr_sitecheckschedule_value: IDS.schedule,
                _gr_equipment_value: IDS.technician,
                '@odata.etag': 'W/"3"',
            }] }), { status: 200 })
        }
        return new Response(
            'HTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content',
            { status: 200 },
        )
    }
    await saveSiteCheckScheduleConfiguration('token', {
        siteId: IDS.site,
        siteName: 'Test Site',
        enabled: true,
        frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        equipmentScope: SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION,
        selectedEquipmentIds: [IDS.job],
        nextDueDate: '2026-08-01',
    }, {
        gr_sitecheckscheduleid: IDS.schedule,
        gr_name: 'Schedule',
        gr_enabled: true,
        gr_frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        gr_equipmentscope: SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION,
        gr_nextduedate: '2026-07-26',
        _gr_site_value: IDS.site,
        '@odata.etag': 'W/"9"',
    }, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch })

    assert.equal(requests.length, 2)
    assert.match(requests[1].url, /\/\$batch$/)
    const body = String(requests[1].init?.body)
    assert.match(body, /PATCH \/api\/data\/v9\.2\/gr_sitecheckschedules/)
    assert.match(body, /If-Match: W\/"9"/)
    assert.match(body, /DELETE \/api\/data\/v9\.2\/gr_sitecheckscheduleequipments/)
    assert.match(body, /If-Match: W\/"3"/)
    assert.match(body, /POST \/api\/data\/v9\.2\/gr_sitecheckscheduleequipments/)
    assert.match(body, new RegExp(IDS.job))
})

test('manual Schedule save blocks an enabled empty selection before writing', async () => {
    let requests = 0
    await assert.rejects(saveSiteCheckScheduleConfiguration('token', {
        siteId: IDS.site,
        siteName: 'Test Site',
        enabled: true,
        frequency: SITE_CHECK_FREQUENCIES.WEEKLY,
        equipmentScope: SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION,
        selectedEquipmentIds: [],
        nextDueDate: '2026-08-01',
    }, null, {
        apiUrl: 'https://example.test',
        fetcher: (async () => {
            requests += 1
            return new Response(null, { status: 500 })
        }) as typeof fetch,
    }), /Select at least one Equipment/)
    assert.equal(requests, 0)
})

function completionContextResponses(input: {
    currentStatus: number
    siblingStatus: number
    siteCheckStatus?: number
    active?: string | null
}) {
    const siblingId = '66666666-6666-6666-6666-666666666666'
    return [
        {
            '@odata.etag': 'W/"job"',
            gr_jobid: IDS.job,
            gr_jobtype: JOB_TYPES.SITE_CHECK,
            gr_status: input.currentStatus,
            gr_completeddate: input.currentStatus === JOB_STATUSES.COMPLETE
                ? '2026-07-26T02:00:00Z'
                : null,
            _gr_sitecheck_value: IDS.siteCheck,
            _gr_equipment_value: '77777777-7777-7777-7777-777777777777',
            _gr_site_value: IDS.site,
        },
        {
            '@odata.etag': 'W/"check"',
            gr_sitecheckid: IDS.siteCheck,
            gr_name: 'Site Check',
            gr_status: input.siteCheckStatus ?? 122830000,
            gr_startedon: '2026-07-26T00:00:00Z',
            gr_completedon: input.siteCheckStatus === 122830001 ? '2026-07-26T02:00:00Z' : null,
            gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.MONTHLY,
            gr_duedatesnapshot: '2026-07-26',
            gr_expectedjobcount: 2,
            gr_creationrequestkey: '12345678-1234-4234-9234-123456789abc',
            _gr_sitecheckschedule_value: IDS.schedule,
            _gr_site_value: IDS.site,
            _gr_assignedtechnician_value: IDS.technician,
        },
        {
            '@odata.etag': 'W/"schedule"',
            gr_sitecheckscheduleid: IDS.schedule,
            gr_name: 'Schedule',
            gr_enabled: true,
            gr_frequency: SITE_CHECK_FREQUENCIES.MONTHLY,
            gr_nextduedate: '2026-07-26',
            _gr_site_value: IDS.site,
            _gr_activesitecheck_value: input.active === undefined ? IDS.siteCheck : input.active,
        },
        {
            value: [
                {
                    '@odata.etag': 'W/"job"',
                    gr_jobid: IDS.job,
                    gr_jobtype: JOB_TYPES.SITE_CHECK,
                    gr_status: input.currentStatus,
                    gr_completeddate: input.currentStatus === JOB_STATUSES.COMPLETE
                        ? '2026-07-26T02:00:00Z'
                        : null,
                    _gr_sitecheck_value: IDS.siteCheck,
                    _gr_equipment_value: '77777777-7777-7777-7777-777777777777',
                    _gr_site_value: IDS.site,
                },
                {
                    '@odata.etag': 'W/"sibling"',
                    gr_jobid: siblingId,
                    gr_jobtype: JOB_TYPES.SITE_CHECK,
                    gr_status: input.siblingStatus,
                    gr_completeddate: input.siblingStatus === JOB_STATUSES.COMPLETE
                        ? '2026-07-26T01:00:00Z'
                        : null,
                    _gr_sitecheck_value: IDS.siteCheck,
                    _gr_equipment_value: '88888888-8888-8888-8888-888888888888',
                    _gr_site_value: IDS.site,
                },
            ],
        },
    ]
}

test('final operational Job completion atomically completes the Site Check and rolls its schedule', async () => {
    const responses: (object | Response)[] = [
        ...completionContextResponses({
            currentStatus: JOB_STATUSES.ALLOCATED,
            siblingStatus: JOB_STATUSES.COMPLETE,
        }),
        new Response(
            'HTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content\r\n',
            { status: 200 },
        ),
    ]
    let batchBody = ''
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
        const next = responses.shift()
        if (init?.method === 'POST') batchBody = String(init.body)
        return next instanceof Response
            ? next
            : new Response(JSON.stringify(next), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
    }
    const result = await updateSiteCheckJobStatus('token', {
        jobId: IDS.job,
        status: JOB_STATUSES.COMPLETE,
        completedOn: '2026-07-31T23:30:00Z',
    }, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch })

    assert.equal(result?.siteCheckCompleted, true)
    assert.match(batchBody, /PATCH \/api\/data\/v9\.2\/gr_jobs/)
    assert.match(batchBody, /PATCH \/api\/data\/v9\.2\/gr_sitechecks/)
    assert.match(batchBody, /PATCH \/api\/data\/v9\.2\/gr_sitecheckschedules/)
    assert.match(batchBody, /"gr_lastcompleteddate":"2026-08-01"/)
    assert.match(batchBody, /"gr_nextduedate":"2026-09-01"/)
    assert.match(batchBody, /"gr_ActiveSiteCheck@odata.bind":null/)
})

test('post-write reconciliation handles concurrent completion of different final Jobs', async () => {
    const responses: (object | Response)[] = [
        ...completionContextResponses({
            currentStatus: JOB_STATUSES.ALLOCATED,
            siblingStatus: JOB_STATUSES.ALLOCATED,
        }),
        new Response(null, { status: 204 }),
        ...completionContextResponses({
            currentStatus: JOB_STATUSES.COMPLETE,
            siblingStatus: JOB_STATUSES.COMPLETE,
        }),
        new Response(
            'HTTP/1.1 204 No Content\r\nHTTP/1.1 204 No Content\r\n',
            { status: 200 },
        ),
    ]
    let patchCalls = 0
    let batchOperations = 0
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
        const next = responses.shift()
        if (init?.method === 'PATCH') patchCalls += 1
        if (init?.method === 'POST') {
            batchOperations = [...String(init.body).matchAll(/Content-ID:/g)].length
        }
        return next instanceof Response
            ? next
            : new Response(JSON.stringify(next), { status: 200 })
    }
    const result = await updateSiteCheckJobStatus('token', {
        jobId: IDS.job,
        status: JOB_STATUSES.COMPLETE,
        completedOn: '2026-07-26T02:00:00Z',
    }, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch })

    assert.equal(patchCalls, 1)
    assert.equal(batchOperations, 2)
    assert.equal(result?.siteCheckCompleted, true)
})

test('a 412 final-completion retry reconciles an already committed rollover', async () => {
    const responses: (object | Response)[] = [
        ...completionContextResponses({
            currentStatus: JOB_STATUSES.ALLOCATED,
            siblingStatus: JOB_STATUSES.COMPLETE,
        }),
        new Response('HTTP/1.1 412 Precondition Failed\r\n', { status: 200 }),
        ...completionContextResponses({
            currentStatus: JOB_STATUSES.COMPLETE,
            siblingStatus: JOB_STATUSES.COMPLETE,
            siteCheckStatus: 122830001,
            active: null,
        }),
    ]
    const fetcher = async () => {
        const next = responses.shift()
        return next instanceof Response
            ? next
            : new Response(JSON.stringify(next), { status: 200 })
    }
    const result = await updateSiteCheckJobStatus('token', {
        jobId: IDS.job,
        status: JOB_STATUSES.COMPLETE,
        completedOn: '2026-07-26T02:00:00Z',
    }, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch })

    assert.equal(result?.alreadyApplied, true)
    assert.equal(result?.siteCheckCompleted, true)
})

test('completed Site Checks block Job reopening and Job Card remains outside completion routing', async () => {
    const responses = completionContextResponses({
        currentStatus: JOB_STATUSES.COMPLETE,
        siblingStatus: JOB_STATUSES.COMPLETE,
        siteCheckStatus: 122830001,
        active: null,
    })
    const fetcher = async () => new Response(JSON.stringify(responses.shift()), { status: 200 })
    await assert.rejects(
        updateSiteCheckJobStatus('token', {
            jobId: IDS.job,
            status: JOB_STATUSES.ALLOCATED,
        }, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch }),
        /cannot be reopened/,
    )

    const hook = readFileSync(
        new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url),
        'utf8',
    )
    const cardStatusMethod = hook.slice(
        hook.indexOf('const updateJobCardStatus'),
        hook.indexOf('const updateJobFields'),
    )
    assert.doesNotMatch(cardStatusMethod, /updateSiteCheckJobStatus/)
    assert.equal((hook.match(/updateSiteCheckJobStatus\(token/g) ?? []).length, 2)
})

test('history and generated Job detail reads are bounded, expanded, and continuation-safe', async () => {
    const apiUrl = 'https://example.test/api/data/v9.2'
    const requests: string[] = []
    const responses = [
        {
            value: [{
                '@odata.etag': 'W/"check"',
                gr_sitecheckid: IDS.siteCheck,
                gr_name: 'Site Check',
                gr_status: 122830001,
                gr_startedon: '2026-07-26T00:00:00Z',
                gr_completedon: '2026-07-26T02:00:00Z',
                gr_frequencysnapshot: SITE_CHECK_FREQUENCIES.WEEKLY,
                gr_duedatesnapshot: '2026-07-26',
                gr_expectedjobcount: 1,
                gr_creationrequestkey: '12345678-1234-4234-9234-123456789abc',
                _gr_sitecheckschedule_value: IDS.schedule,
                _gr_site_value: IDS.site,
                _gr_assignedtechnician_value: IDS.technician,
            }],
            '@odata.nextLink': `${apiUrl}/gr_sitechecks?$skiptoken=history`,
        },
        {
            value: [{
                gr_jobid: IDS.job,
                gr_jobnumber: 'SC-1',
                gr_description: 'Site Check',
                gr_status: JOB_STATUSES.COMPLETE,
                gr_completeddate: '2026-07-26T02:00:00Z',
                _gr_sitecheck_value: IDS.siteCheck,
                gr_Equipment: {
                    gr_equipmentid: '77777777-7777-7777-7777-777777777777',
                    gr_fleet: 'LT-7',
                    gr_serial: 'SER-7',
                    gr_make: 'Toyota',
                    gr_model: '8FG',
                },
                gr_Mechanic: {
                    gr_mechanicid: IDS.technician,
                    gr_name: 'Test Technician',
                },
            }],
        },
    ]
    const fetcher = async (input: string | URL | Request) => {
        requests.push(String(input))
        return new Response(JSON.stringify(responses.shift()), { status: 200 })
    }
    const options = { apiUrl, fetcher: fetcher as typeof fetch }
    const history = await fetchSiteCheckHistoryPage('token', IDS.site, undefined, options)
    const details = await fetchSiteCheckDetailJobsPage('token', IDS.siteCheck, undefined, options)

    assert.match(requests[0], /\$orderby=gr_startedon desc/)
    assert.match(requests[0], /\$top=25/)
    assert.match(requests[1], /\$expand=gr_Equipment/)
    assert.match(requests[1], /\$orderby=createdon asc,gr_jobid asc/)
    assert.match(requests[1], /\$top=25/)
    assert.equal(history.nextLink, `${apiUrl}/gr_sitechecks?$skiptoken=history`)
    assert.equal(details.records[0].gr_Equipment?.gr_fleet, 'LT-7')
    assert.equal(details.records[0].gr_Mechanic?.gr_name, 'Test Technician')

    await assert.rejects(
        fetchSiteCheckHistoryPage(
            'token',
            IDS.site,
            'https://untrusted.example/gr_sitechecks?$skiptoken=x',
            options,
        ),
        /continuation link is invalid/,
    )
})

test('Site Check details drawer uses accessible shared tabs, progress, pagination, and owned navigation', () => {
    const drawer = readFileSync(
        new URL('../src/alpha/site-checks/components/SiteCheckDetailsDrawer.tsx', import.meta.url),
        'utf8',
    )
    const dashboard = readFileSync(
        new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url),
        'utf8',
    )
    assert.match(drawer, /EditDrawerShell/)
    assert.match(drawer, /DrawerTabs/)
    assert.match(drawer, /<progress/)
    assert.match(drawer, /Load more Jobs/)
    assert.match(drawer, /Load more history/)
    assert.match(drawer, /onOpenJob/)
    assert.match(drawer, /onOpenEquipment/)
    assert.doesNotMatch(drawer, /loginRedirect|loginPopup|acquireTokenPopup/)
    assert.match(dashboard, /View Current Site Check/)
    assert.match(dashboard, /Site Check History/)
    assert.match(dashboard, /setSiteCheckDetails\(\{ site: runSiteCheckSite, check: created/)
})

test('hardening contract preserves disabled history and contains no interactive authentication path', async () => {
    const existing = {
        gr_sitecheckscheduleid: IDS.schedule,
        gr_name: 'Schedule',
        gr_enabled: true,
        gr_frequency: SITE_CHECK_FREQUENCIES.FORTNIGHTLY,
        gr_nextduedate: '2026-08-09',
        _gr_site_value: IDS.site,
        _gr_activesitecheck_value: IDS.siteCheck,
        '@odata.etag': 'W/"9"',
    }
    let requestBody = ''
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
        requestBody = String(init?.body)
        return new Response(JSON.stringify({
            ...existing,
            gr_enabled: false,
            '@odata.etag': 'W/"10"',
        }), { status: 200 })
    }
    await saveSiteCheckSchedule('token', {
        siteId: IDS.site,
        siteName: 'Test Site',
        enabled: false,
        frequency: existing.gr_frequency,
        nextDueDate: existing.gr_nextduedate,
    }, existing, { apiUrl: 'https://example.test', fetcher: fetcher as typeof fetch })

    const body = JSON.parse(requestBody)
    assert.equal(body.gr_enabled, false)
    assert.equal(body.gr_frequency, SITE_CHECK_FREQUENCIES.FORTNIGHTLY)
    assert.equal(body.gr_nextduedate, '2026-08-09')
    assert.equal('gr_ActiveSiteCheck@odata.bind' in body, false)

    const sources = [
        '../src/alpha/site-checks/hooks/useSiteChecks.ts',
        '../src/alpha/site-checks/services/siteChecksApi.ts',
        '../src/alpha/site-checks/services/siteCheckCreationWorkflow.ts',
        '../src/alpha/site-checks/services/siteCheckCreationApi.ts',
        '../src/alpha/site-checks/services/siteCheckCompletionApi.ts',
        '../src/alpha/site-checks/components/RunSiteCheckDrawer.tsx',
        '../src/alpha/site-checks/components/SiteCheckDetailsDrawer.tsx',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
    assert.doesNotMatch(
        sources,
        /loginRedirect|loginPopup|acquireTokenRedirect|acquireTokenPopup/,
    )
    const operationalMutationSources = [
        '../src/alpha/site-checks/services/siteCheckCreationApi.ts',
        '../src/alpha/site-checks/services/siteCheckCompletionApi.ts',
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
    assert.doesNotMatch(operationalMutationSources, /method:\s*['"]DELETE['"]/)
    assert.match(sources, /odata\.maxpagesize=25/)
    assert.match(sources, /SITE_CHECK_CREATION_MAX_PAYLOAD_BYTES/)
})

test('shared drawer and Site Check navigation enforce keyboard containment and focus return', () => {
    const shell = readFileSync(
        new URL('../src/alpha/shared/drawer/EditDrawerShell.tsx', import.meta.url),
        'utf8',
    )
    const dashboard = readFileSync(
        new URL('../src/alpha/customers/CustomerDashboardScreen.tsx', import.meta.url),
        'utf8',
    )
    assert.match(shell, /useId/)
    assert.match(shell, /event\.key === 'Escape'/)
    assert.match(shell, /event\.key !== 'Tab'/)
    assert.match(shell, /event\.shiftKey/)
    assert.match(shell, /aria-modal="true"/)
    assert.match(shell, /drawerRef\.current\?\.focus\(\)/)
    assert.match(dashboard, /siteCheckDetailsTriggerRef/)
    assert.match(dashboard, /trigger\?\.focus\(\)/)
})
