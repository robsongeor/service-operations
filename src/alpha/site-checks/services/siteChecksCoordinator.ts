import type {
    SiteCheck,
    SiteCheckJobProgressInput,
    SiteCheckSchedule,
    SiteCheckScheduleEquipment,
} from '../types/siteCheck.types.ts'
import {
    fetchSiteCheckJobs,
    fetchSiteCheckSchedulesForSites,
    fetchSiteCheckScheduleEquipment,
    fetchSiteChecksByIds,
} from './siteChecksApi.ts'

export type SiteChecksSnapshot = {
    schedules: SiteCheckSchedule[]
    siteChecks: SiteCheck[]
    jobs: SiteCheckJobProgressInput[]
    scheduleEquipment: SiteCheckScheduleEquipment[]
}

type SiteChecksCoordinatorDependencies = {
    acquireAccessToken: () => Promise<string>
    fetchSchedules?: typeof fetchSiteCheckSchedulesForSites
    fetchSiteChecks?: typeof fetchSiteChecksByIds
    fetchJobs?: typeof fetchSiteCheckJobs
    fetchScheduleEquipment?: typeof fetchSiteCheckScheduleEquipment
}

function scopeKey(siteIds: readonly string[]) {
    return [...new Set(siteIds.map((id) => id.toLowerCase()))].sort().join(',')
}

export function createSiteChecksDataCoordinator({
    acquireAccessToken,
    fetchSchedules = fetchSiteCheckSchedulesForSites,
    fetchSiteChecks = fetchSiteChecksByIds,
    fetchJobs = fetchSiteCheckJobs,
    fetchScheduleEquipment = fetchSiteCheckScheduleEquipment,
}: SiteChecksCoordinatorDependencies) {
    const inFlight = new Map<string, Promise<SiteChecksSnapshot>>()

    async function loadSiteChecks(
        siteIds: readonly string[],
        suppliedAccessToken?: string,
    ): Promise<SiteChecksSnapshot> {
        const key = scopeKey(siteIds)
        if (!key) return { schedules: [], siteChecks: [], jobs: [], scheduleEquipment: [] }

        const existing = inFlight.get(key)
        if (existing) return existing

        const request = (async () => {
            const accessToken = suppliedAccessToken ?? await acquireAccessToken()
            const schedules = await fetchSchedules(accessToken, key.split(','))
            const activeIds = schedules.flatMap((schedule) =>
                schedule._gr_activesitecheck_value
                    ? [schedule._gr_activesitecheck_value]
                    : [],
            )
            const selectionScheduleIds = schedules.map((schedule) =>
                schedule.gr_sitecheckscheduleid)
            const [siteChecks, jobs, scheduleEquipment] = await Promise.all([
                activeIds.length
                    ? fetchSiteChecks(accessToken, activeIds)
                    : Promise.resolve([]),
                activeIds.length
                    ? fetchJobs(accessToken, activeIds)
                    : Promise.resolve([]),
                selectionScheduleIds.length
                    ? fetchScheduleEquipment(accessToken, selectionScheduleIds)
                    : Promise.resolve([]),
            ])
            return { schedules, siteChecks, jobs, scheduleEquipment }
        })()

        inFlight.set(key, request)
        try {
            return await request
        } finally {
            if (inFlight.get(key) === request) inFlight.delete(key)
        }
    }

    return { loadSiteChecks }
}
