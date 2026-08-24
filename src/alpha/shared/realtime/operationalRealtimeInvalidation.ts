import type { OperationalQueryKey } from '../data/OperationalDataClient.ts'

export type OperationalRealtimeResource = 'jobs' | 'equipment' | 'quotes'

export function realtimeQueryDependsOn(
    key: OperationalQueryKey,
    resources: ReadonlySet<OperationalRealtimeResource>,
) {
    const refreshJobs = resources.has('jobs')
    const refreshEquipment = resources.has('equipment')
    const refreshQuotes = resources.has('quotes')
    return Boolean(
        (refreshJobs && (
            key[0] === 'jobs'
            || key[0] === 'job'
            || (key[0] === 'equipment' && key[2] === 'jobs')
            || key[0] === 'customer-dashboard'
            || key[0] === 'job-map'
            || (key[0] === 'staff' && (key[1] === 'open-job-allocations-v1' || key[2] === 'jobs-v1'))
            || key[0] === 'wof'
            || key[0] === 'quotes'
            || key[0] === 'quote'
            || (key[0] === 'scheduler' && key[1] === 'jobs-v1')
        ))
        || (refreshEquipment && (
            key[0] === 'equipment'
            || key[0] === 'customer-dashboard'
            || key[0] === 'job-map'
            || key[0] === 'quotes'
            || key[0] === 'quote'
            || (key[0] === 'wof' && key[1] === 'inspections-v1')
        ))
        || (refreshQuotes && (key[0] === 'quotes' || key[0] === 'quote')),
    )
}
