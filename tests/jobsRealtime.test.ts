import assert from 'node:assert/strict'
import test from 'node:test'
import { isJobsRealtimeEvent } from '../src/alpha/jobs/services/jobsRealtime.ts'
import {
    createOperationalCrossTabInvalidation,
    operationalCrossTabChannelName,
} from '../src/alpha/shared/realtime/operationalCrossTabInvalidation.ts'
import { realtimeQueryDependsOn } from '../src/alpha/shared/realtime/operationalRealtimeInvalidation.ts'
import { readFileSync } from 'node:fs'

test('Jobs realtime accepts only bounded Dataverse change notifications', () => {
    assert.equal(isJobsRealtimeEvent({ jobId: '11111111-1111-4111-8111-111111111111', operation: 'update', changedAt: '2026-08-16T01:00:00.000Z' }), true)
    assert.equal(isJobsRealtimeEvent({ jobId: 'not-a-guid', operation: 'update', changedAt: 'now' }), false)
    assert.equal(isJobsRealtimeEvent({ jobId: '11111111-1111-4111-8111-111111111111', operation: 'read', changedAt: '2026-08-16T01:00:00.000Z' }), false)
})

test('app shell owns one realtime connection and Jobs reconciles events without polling', () => {
    const app = readFileSync('src/App.tsx', 'utf8')
    const provider = readFileSync('src/alpha/shared/realtime/OperationalRealtimeProvider.tsx', 'utf8')
    const connection = readFileSync('src/alpha/shared/realtime/operationalRealtime.ts', 'utf8')
    const hook = readFileSync('src/alpha/jobs/hooks/useJobs.ts', 'utf8')
    const equipmentHook = readFileSync('src/alpha/equipment/hooks/useEquipmentManager.ts', 'utf8')
    const jobMapHook = readFileSync('src/alpha/job-map/useJobMapData.ts', 'utf8')

    assert.match(app, /<OperationalRealtimeProvider key=/)
    assert.doesNotMatch(app, /<StaffRealtimeBridge/)
    assert.equal((connection.match(/new HubConnectionBuilder\(\)/g) ?? []).length, 1)
    assert.match(connection, /connection\.on\('jobChanged'/)
    assert.match(connection, /connection\.on\('equipmentChanged'/)
    assert.match(connection, /connection\.on\('staffChanged'/)
    assert.match(provider, /onReconnected: \(\) => recover\('reconnected'\)/)
    assert.match(provider, /visibilitychange/)
    assert.match(provider, /window\.setTimeout\(\(\) => \{ void flushInvalidations\(\) \}, 750\)/)
    assert.match(provider, /createOperationalCrossTabInvalidation\(client\.scope/)
    assert.match(provider, /subscribeToLocalOperationalInvalidations/)
    assert.match(provider, /broadcast: false/)
    assert.match(hook, /subscribeToJobChanges\(refreshJobs\)/)
    assert.match(hook, /subscribeToOperationalRealtimeRecovery\(refreshJobs\)/)
    assert.match(equipmentHook, /subscribeToEquipmentChanges\(refreshEquipment\)/)
    assert.doesNotMatch(hook, /startJobsRealtime\(/)
    assert.doesNotMatch(equipmentHook, /startEquipmentRealtime\(/)
    assert.doesNotMatch(jobMapHook, /startJobsRealtime\(/)
    assert.doesNotMatch(provider, /setInterval\(/)
    assert.doesNotMatch(hook, /setInterval\(/)
})

test('realtime invalidation stays bounded to dependent shared query families', () => {
    const jobs = new Set(['jobs'] as const)
    const equipment = new Set(['equipment'] as const)
    const recovery = new Set(['jobs', 'equipment'] as const)

    assert.equal(realtimeQueryDependsOn(['job', 'job-id', 'core-v1'], jobs), true)
    assert.equal(realtimeQueryDependsOn(['scheduler', 'jobs-v1', 'start', 'end'], jobs), true)
    assert.equal(realtimeQueryDependsOn(['scheduler', 'options-v1', 'start', 'end'], jobs), false)
    assert.equal(realtimeQueryDependsOn(['wof', 'inspections-v1'], jobs), true)
    assert.equal(realtimeQueryDependsOn(['wof', 'schedule-options-v1', 'job-fingerprint'], jobs), true)
    assert.equal(realtimeQueryDependsOn(['equipment', 'operational-list', 'summary-v1'], equipment), true)
    assert.equal(realtimeQueryDependsOn(['job-map', 'jobs-v1', 'statuses'], equipment), true)
    assert.equal(realtimeQueryDependsOn(['wof', 'inspections-v1'], equipment), true)
    assert.equal(realtimeQueryDependsOn(['wof', 'schedule-options-v1', 'job-fingerprint'], equipment), false)
    assert.equal(realtimeQueryDependsOn(['quotes', 'register-v1'], recovery), true)
    assert.equal(realtimeQueryDependsOn(['quote', 'quote-id', 'core-v1'], jobs), true)
    assert.equal(realtimeQueryDependsOn(['quote', 'quote-id', 'core-v1'], equipment), true)
    assert.equal(realtimeQueryDependsOn(['quotes', 'register-v1'], new Set(['quotes'])), true)
})

test('cross-tab invalidation is account scoped, bounded, and does not echo to its sender', () => {
    const original = globalThis.BroadcastChannel
    class FakeBroadcastChannel {
        static instances: FakeBroadcastChannel[] = []
        readonly name: string
        onmessage: ((event: MessageEvent<unknown>) => void) | null = null

        constructor(name: string) {
            this.name = name
            FakeBroadcastChannel.instances.push(this)
        }

        postMessage(data: unknown) {
            FakeBroadcastChannel.instances
                .filter((channel) => channel !== this && channel.name === this.name)
                .forEach((channel) => channel.onmessage?.({ data } as MessageEvent<unknown>))
        }

        close() {
            FakeBroadcastChannel.instances = FakeBroadcastChannel.instances.filter((channel) => channel !== this)
        }
    }

    globalThis.BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel
    try {
        const senderMessages: string[][] = []
        const receiverMessages: string[][] = []
        const otherAccountMessages: string[][] = []
        const sender = createOperationalCrossTabInvalidation('environment:tenant:account-a', (resources) => {
            senderMessages.push([...resources])
        })
        const receiver = createOperationalCrossTabInvalidation('environment:tenant:account-a', (resources) => {
            receiverMessages.push([...resources])
        })
        const otherAccount = createOperationalCrossTabInvalidation('environment:tenant:account-b', (resources) => {
            otherAccountMessages.push([...resources])
        })

        sender.publish(['jobs', 'jobs', 'equipment', 'quotes'])
        assert.deepEqual(senderMessages, [])
        assert.deepEqual(receiverMessages, [['jobs', 'equipment', 'quotes']])
        assert.deepEqual(otherAccountMessages, [])
        assert.notEqual(
            operationalCrossTabChannelName('environment:tenant:account-a'),
            operationalCrossTabChannelName('environment:tenant:account-b'),
        )
        assert.doesNotMatch(operationalCrossTabChannelName('environment:tenant:account-a'), /account-a/)

        sender.close()
        receiver.close()
        otherAccount.close()
    } finally {
        globalThis.BroadcastChannel = original
    }
})
