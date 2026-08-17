import type { Job } from '../jobs/types/job.types.ts'
import { JOB_STATUSES, type JobStatus } from '../jobs/types/jobStatus.types.ts'
import type { JobMapSite } from './jobMap.types.ts'

export const JOB_MAP_STATUSES = [
    JOB_STATUSES.ALLOCATED,
    JOB_STATUSES.UNALLOCATED,
    JOB_STATUSES.WAITING_FOR_PARTS,
] as const

export function isJobMapStatus(status: JobStatus) {
    return (JOB_MAP_STATUSES as readonly JobStatus[]).includes(status)
}

export function jobMapStatusLabel(status: JobStatus) {
    if (status === JOB_STATUSES.ALLOCATED) return 'Allocated'
    if (status === JOB_STATUSES.UNALLOCATED) return 'Unallocated'
    if (status === JOB_STATUSES.WAITING_FOR_PARTS) return 'Waiting for parts'
    return 'Other'
}

export function jobMapMarkerTone(statuses: JobStatus[]): JobMapSite['markerTone'] {
    const unique = new Set(statuses)
    if (unique.size !== 1) return 'mixed'
    if (unique.has(JOB_STATUSES.ALLOCATED)) return 'allocated'
    if (unique.has(JOB_STATUSES.UNALLOCATED)) return 'unallocated'
    return 'waiting'
}

export function groupJobsBySite(jobs: Job[]): JobMapSite[] {
    const sites = new Map<string, JobMapSite>()
    for (const job of jobs) {
        if (!isJobMapStatus(job.gr_status)) continue
        const site = job.gr_Site
        if (!site?.gr_siteid) continue
        const existing = sites.get(site.gr_siteid)
        if (existing) {
            existing.jobs.push(job)
            existing.statuses.push(job.gr_status)
        } else {
            sites.set(site.gr_siteid, {
                siteId: site.gr_siteid,
                siteName: site.gr_name || 'Unnamed Site',
                address: site.gr_address?.trim() || '',
                customerId: site.gr_Customer?.gr_customerid || '',
                customerName: site.gr_Customer?.gr_name || 'Unknown Customer',
                jobs: [job],
                statuses: [job.gr_status],
                markerTone: 'mixed',
            })
        }
    }
    return [...sites.values()]
        .map((site) => ({
            ...site,
            markerTone: jobMapMarkerTone(site.statuses),
            jobs: site.jobs.sort((a, b) => (a.gr_jobnumber || '').localeCompare(b.gr_jobnumber || '', undefined, { numeric: true })),
        }))
        .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.siteName.localeCompare(b.siteName))
}

export function jobsWithoutSite(jobs: Job[]) {
    return jobs.filter((job) => isJobMapStatus(job.gr_status) && !job.gr_Site?.gr_siteid)
}
