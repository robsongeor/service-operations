import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
    fetchJobCardProgressSummaries,
    fetchPersonalJobWatches,
    fetchServiceCoordinationContext,
    setPersonalJobWatch,
} from '../src/alpha/jobs/services/serviceCoordinationApi.ts'
import { JOB_TYPES, SERVICE_COORDINATION_JOB_TYPE_OPTIONS, serviceCoordinationJobTypeFilter } from '../src/alpha/jobs/types/jobType.types.ts'

const originalFetch = globalThis.fetch

test.afterEach(() => { globalThis.fetch = originalFetch })

test('service coordination client delegates identity and never accepts watcher identity from the UI', async () => {
    const requests: Array<{ url: string; options: RequestInit }> = []
    globalThis.fetch = async (input, options = {}) => {
        requests.push({ url: String(input), options })
        if (String(input).includes('view=context')) return Response.json({ branch: { value: 122830003, label: 'Christchurch' } })
        if (String(input).includes('view=watches')) return Response.json({ items: [] })
        return Response.json({ watched: true })
    }

    await fetchServiceCoordinationContext('delegated-token')
    await fetchPersonalJobWatches('delegated-token')
    await setPersonalJobWatch('delegated-token', '00000000-0000-4000-8000-000000000001', true)

    for (const request of requests) {
        const headers = request.options.headers as Record<string, string>
        assert.equal(headers['X-Dataverse-Authorization'], 'Bearer delegated-token')
        assert.equal(request.options.cache, 'no-store')
    }
    assert.deepEqual(JSON.parse(String(requests[2].options.body)), {
        action: 'watch', jobId: '00000000-0000-4000-8000-000000000001',
    })
})

test('Job Card progress requests are bounded and use the shared authenticated backend contract', async () => {
    await assert.rejects(() => fetchJobCardProgressSummaries('token', []), /bounded/i)
    await assert.rejects(() => fetchJobCardProgressSummaries('token', Array.from({ length: 101 }, (_, index) => String(index))), /bounded/i)

    let body: Record<string, unknown> = {}
    globalThis.fetch = async (_input, options = {}) => {
        body = JSON.parse(String(options.body)) as Record<string, unknown>
        return Response.json({ items: [] })
    }
    await fetchJobCardProgressSummaries('token', ['00000000-0000-4000-8000-000000000001'])
    assert.deepEqual(body, {
        action: 'coordinationSummary', jobIds: ['00000000-0000-4000-8000-000000000001'],
    })
})

test('Jobs screen keeps home branch, all branches and personal watchlist as distinct views', () => {
    const source = readFileSync(new URL('../src/alpha/jobs/JobsScreen.tsx', import.meta.url), 'utf8')
    assert.match(source, /activeCoordinationView === 'watchlist'[\s\S]*watchedJobs[\s\S]*unifiedWorklist\.jobs/)
    assert.match(source, /activeCoordinationView === 'all'/)
    assert.match(source, /activeCoordinationView === 'branch'[\s\S]*coordination\.context\?\.branch\.value[\s\S]*: undefined/)
    assert.ok(source.indexOf('<ServiceCoordinationViews') < source.indexOf('displayedJobs.length === 0'))
    const views = readFileSync(new URL('../src/alpha/jobs/components/ServiceCoordinationViews.tsx', import.meta.url), 'utf8')
    assert.match(views, /Home branch/)
    assert.match(views, /All branches/)
    assert.match(views, /My watchlist/)
    assert.match(views, /watchlistEnabled &&/)
})

test('Service Coordination omits the Site Check tab and migrates an old saved selection', () => {
    assert.equal(SERVICE_COORDINATION_JOB_TYPE_OPTIONS.some((option) => option.value === JOB_TYPES.SITE_CHECK), false)
    assert.equal(serviceCoordinationJobTypeFilter(JOB_TYPES.SITE_CHECK), 'operational')
    assert.equal(serviceCoordinationJobTypeFilter(JOB_TYPES.SERVICE), JOB_TYPES.SERVICE)
    const table = readFileSync(new URL('../src/alpha/jobs/components/JobsTable.tsx', import.meta.url), 'utf8')
    assert.match(table, /jobTypeOptions=\{unifiedWorklist \? SERVICE_COORDINATION_JOB_TYPE_OPTIONS : undefined\}/)
})
