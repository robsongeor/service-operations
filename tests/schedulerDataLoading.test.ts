import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchJobScheduleOptionsForWindow } from '../src/alpha/jobs/services/jobScheduleApi.ts'
import { fetchJobsByIds } from '../src/alpha/jobs/services/jobsApi.ts'
import {
    adjacentSchedulerWindows,
    schedulerWindow,
} from '../src/alpha/scheduling/schedulerWindow.ts'

test('Scheduler windows use Monday-to-Sunday Date Only boundaries', () => {
    const visible = schedulerWindow(new Date(2026, 7, 19, 12))
    assert.deepEqual(visible, { startDate: '2026-08-17', endDate: '2026-08-23' })
    assert.deepEqual(adjacentSchedulerWindows(new Date(2026, 7, 19, 12)), [
        { startDate: '2026-08-10', endDate: '2026-08-16' },
        { startDate: '2026-08-24', endDate: '2026-08-30' },
    ])
})

test('Scheduler Schedule Option request is bounded to the visible window and follows paging', async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input)
        requests.push(url)
        if (requests.length === 1) {
            return Response.json({
                value: [{ gr_jobscheduleoptionid: 'option-1' }],
                '@odata.nextLink': 'https://example.invalid/scheduler?page=2',
            })
        }
        return Response.json({ value: [{ gr_jobscheduleoptionid: 'option-2' }] })
    }) as typeof fetch

    try {
        const rows = await fetchJobScheduleOptionsForWindow('token', '2026-08-17', '2026-08-23')
        assert.deepEqual(rows.map((row) => row.gr_jobscheduleoptionid), ['option-1', 'option-2'])
        assert.equal(requests.length, 2)
        assert.match(decodeURIComponent(requests[0]), /gr_scheduledate ge 2026-08-17 and gr_scheduledate le 2026-08-23/)
        assert.equal(requests[1], 'https://example.invalid/scheduler?page=2')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Scheduler loads only unique Jobs referenced by the bounded options', async () => {
    const originalFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        requests.push(String(input))
        return Response.json({ value: [
            { gr_jobid: '11111111-1111-4111-8111-111111111111' },
            { gr_jobid: '22222222-2222-4222-8222-222222222222' },
        ] })
    }) as typeof fetch

    try {
        const rows = await fetchJobsByIds('token', [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
            '11111111-1111-4111-8111-111111111111',
        ])
        assert.equal(rows.length, 2)
        assert.equal(requests.length, 1)
        const decoded = decodeURIComponent(requests[0])
        assert.match(decoded, /gr_jobid eq 11111111-1111-4111-8111-111111111111/)
        assert.match(decoded, /gr_jobid eq 22222222-2222-4222-8222-222222222222/)

        requests.length = 0
        assert.deepEqual(await fetchJobsByIds('token', []), [])
        assert.equal(requests.length, 0)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Scheduler screen consumes scoped weekly data and prefetches adjacent windows', () => {
    const screen = readFileSync(new URL('../src/alpha/scheduling/SchedulingScreen.tsx', import.meta.url), 'utf8')
    const hook = readFileSync(new URL('../src/alpha/scheduling/useSchedulerWindowData.ts', import.meta.url), 'utf8')
    const jobsHook = readFileSync(new URL('../src/alpha/jobs/hooks/useJobs.ts', import.meta.url), 'utf8')

    assert.match(screen, /useSchedulerWindowData\(weekStart\)/)
    assert.match(screen, /loadGlobalOperationalData: false/)
    assert.match(screen, /scheduleOptions: schedulerData\.scheduleOptions/)
    assert.match(hook, /adjacentSchedulerWindows\(weekStart\)/)
    assert.match(hook, /client\.prefetchQuery/)
    assert.match(jobsHook, /hasScopedScheduleOptions/)
    assert.match(jobsHook, /onScopedDataChangedRef\.current/)
})
