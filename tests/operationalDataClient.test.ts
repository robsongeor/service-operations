import assert from 'node:assert/strict'
import test from 'node:test'
import { OperationalDataClient } from '../src/alpha/shared/data/OperationalDataClient.ts'
import {
    focusedJobCardMetadataQueryKey,
    focusedJobCoreQueryKey,
    jobPhotoBodyQueryKey,
} from '../src/alpha/shared/data/operationalCollectionKeys.ts'

const waitFor = <T>() => {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((next) => { resolve = next })
    return { promise, resolve }
}

test('concurrent observers share one query request and accepted value', async () => {
    const client = new OperationalDataClient('test')
    const key = ['equipment', 'one', 'jobs', 'v1'] as const
    const pending = waitFor<string[]>()
    let calls = 0
    const loader = async () => { calls += 1; return pending.promise }
    let notifications = 0
    const stopA = client.subscribe(key, () => { notifications += 1 })
    const stopB = client.subscribe(key, () => { notifications += 1 })

    const first = client.fetchQuery(key, loader)
    const second = client.fetchQuery(key, loader)
    pending.resolve(['job-1'])

    assert.deepEqual(await first, ['job-1'])
    assert.deepEqual(await second, ['job-1'])
    assert.equal(calls, 1)
    assert.deepEqual(client.getState<string[]>(key).data, ['job-1'])
    assert.ok(notifications >= 4)
    stopA()
    stopB()
    client.dispose()
})

test('invalidation aborts an old request and refreshes an observed query', async () => {
    const client = new OperationalDataClient('test')
    const key = ['equipment', 'one', 'jobs', 'v1'] as const
    const first = waitFor<string[]>()
    let calls = 0
    const loader = ({ signal }: { signal: AbortSignal }) => {
        calls += 1
        if (calls === 1) {
            signal.addEventListener('abort', () => first.resolve(['obsolete']))
            return first.promise
        }
        return Promise.resolve(['fresh'])
    }
    const stop = client.subscribe(key, () => undefined)
    const oldRequest = client.fetchQuery(key, loader)
    client.invalidate((candidate) => candidate[0] === 'equipment')

    await oldRequest
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(calls, 2)
    assert.deepEqual(client.getState<string[]>(key).data, ['fresh'])
    stop()
    client.dispose()
})

test('unobserved focused data is evicted after its cache window', async () => {
    const client = new OperationalDataClient('test')
    const key = ['equipment', 'one', 'jobs', 'v1'] as const
    const stop = client.subscribe(key, () => undefined, { cacheTimeMs: 5 })
    await client.fetchQuery(key, async () => ['job-1'], { cacheTimeMs: 5 })
    stop()
    await new Promise((resolve) => setTimeout(resolve, 15))
    assert.equal(client.getState<string[]>(key).status, 'initial')
    client.dispose()
})

test('shared collection updates reconcile every observer without a route-local copy', () => {
    const client = new OperationalDataClient('test')
    const key = ['jobs', 'operational-list', 'summary-v1'] as const
    let firstNotifications = 0
    let secondNotifications = 0
    const stopFirst = client.subscribe(key, () => { firstNotifications += 1 })
    const stopSecond = client.subscribe(key, () => { secondNotifications += 1 })

    client.setQueryData(key, [{ id: 'job-1', status: 'allocated' }])
    client.updateQueryData<Array<{ id: string; status: string }>>(key, (current) => (
        (current ?? []).map((job) => job.id === 'job-1' ? { ...job, status: 'complete' } : job)
    ))

    assert.deepEqual(client.getState<Array<{ id: string; status: string }>>(key).data, [
        { id: 'job-1', status: 'complete' },
    ])
    assert.equal(firstNotifications, 2)
    assert.equal(secondNotifications, 2)
    stopFirst()
    stopSecond()
    client.dispose()
})

test('focused Job and photo keys normalize Dataverse IDs across drawer entry points', () => {
    assert.deepEqual(focusedJobCoreQueryKey('ABC-123'), focusedJobCoreQueryKey('abc-123'))
    assert.deepEqual(focusedJobCardMetadataQueryKey('ABC-123'), focusedJobCardMetadataQueryKey('abc-123'))
    assert.deepEqual(jobPhotoBodyQueryKey('PHOTO-1'), jobPhotoBodyQueryKey('photo-1'))
})

test('focused Job observers share one exact-record request', async () => {
    const client = new OperationalDataClient('test')
    const key = focusedJobCoreQueryKey('JOB-1')
    const pending = waitFor<{ id: string }>()
    let calls = 0
    const loader = async () => { calls += 1; return pending.promise }
    const stopA = client.subscribe(key, () => undefined, { cacheTimeMs: 5 })
    const stopB = client.subscribe(key, () => undefined, { cacheTimeMs: 5 })

    const first = client.fetchQuery(key, loader)
    const second = client.fetchQuery(focusedJobCoreQueryKey('job-1'), loader)
    pending.resolve({ id: 'job-1' })

    assert.deepEqual(await first, { id: 'job-1' })
    assert.deepEqual(await second, { id: 'job-1' })
    assert.equal(calls, 1)
    stopA()
    stopB()
    client.dispose()
})

test('query metrics aggregate cache, deduplication, duration, and payload size without retaining record IDs', async () => {
    const client = new OperationalDataClient('test')
    const key = ['customer-dashboard', 'SECRET-CUSTOMER-ID', 'jobs-v1', 'secret-site-hash'] as const
    const pending = waitFor<Array<{ id: string }>>()
    const first = client.fetchQuery(key, async () => pending.promise)
    const duplicate = client.fetchQuery(key, async () => [{ id: 'unused' }])
    pending.resolve([{ id: 'job-1' }])
    await Promise.all([first, duplicate])
    await client.fetchQuery(key, async () => [{ id: 'unused' }])

    const [metric] = client.getMetricsSnapshot()
    assert.equal(metric.family, 'customer-dashboard:jobs-v1')
    assert.equal(metric.requests, 1)
    assert.equal(metric.deduplicatedRequests, 1)
    assert.equal(metric.cacheHits, 1)
    assert.equal(metric.successes, 1)
    assert.ok(metric.totalDurationMs >= 0)
    assert.ok(metric.payloadBytes > 0)
    assert.equal(JSON.stringify(metric).includes('SECRET-CUSTOMER-ID'), false)
    assert.equal(JSON.stringify(metric).includes('secret-site-hash'), false)
    client.dispose()
})
