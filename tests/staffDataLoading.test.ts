import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fetchStaffOpenJobCounts } from '../src/alpha/mechanics/services/staffWorkloadApi.ts'

test('Staff directory does not block on the complete operational Jobs collection', () => {
    const hook = readFileSync('src/alpha/mechanics/hooks/useMechanics.ts', 'utf8')
    assert.doesNotMatch(hook, /fetchJobs\s*\(/)
    assert.match(hook, /STAFF_DIRECTORY_QUERY_KEY/)
    assert.match(hook, /STAFF_OPEN_ALLOCATIONS_QUERY_KEY/)
    assert.match(hook, /focusedStaffJobsQueryKey/)
    assert.match(hook, /loadQualificationTypes/)
})

test('Staff open allocation summary follows Dataverse continuation pages', async () => {
    const originalFetch = globalThis.fetch
    const requested: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input)
        requested.push(url)
        if (url === 'https://next.example/staff-jobs') {
            return new Response(JSON.stringify({
                value: [
                    { gr_jobid: 'job-3', gr_status: 122830000, _gr_mechanic_value: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB' },
                ],
            }), { status: 200 })
        }
        return new Response(JSON.stringify({
            value: [
                { gr_jobid: 'job-1', gr_status: 122830000, _gr_mechanic_value: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' },
                { gr_jobid: 'job-2', gr_status: 122830002, _gr_mechanic_value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
            ],
            '@odata.nextLink': 'https://next.example/staff-jobs',
        }), { status: 200 })
    }) as typeof fetch

    try {
        const counts = await fetchStaffOpenJobCounts('token')
        assert.equal(counts['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], 2)
        assert.equal(counts['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], 1)
        assert.equal(requested.length, 2)
        assert.match(requested[0], /_gr_mechanic_value%20ne%20null/i)
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Staff qualification collections use the shared continuation-page reader', () => {
    const service = readFileSync('src/alpha/wof/services/qualificationApi.ts', 'utf8')
    assert.match(service, /fetchAllDataversePages<QualificationType>/)
    assert.match(service, /fetchAllDataversePages<TechnicianQualification>/)
    assert.match(service, /signal/)
})
