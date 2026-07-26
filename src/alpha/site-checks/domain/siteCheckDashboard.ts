import {
    calculateSiteCheckProgress,
    calculateSiteCheckSubmissionProgress,
    getSiteCheckScheduleState,
} from './siteCheckCalculations.ts'
import type {
    SiteCheck,
    SiteCheckJobProgressInput,
    SiteCheckProgress,
    SiteCheckSubmissionProgress,
    SiteCheckSchedule,
    SiteCheckScheduleState,
} from '../types/siteCheck.types.ts'

export type ReportableSiteCheckState = Exclude<SiteCheckScheduleState, 'disabled' | 'invalid'>

export type SiteCheckDashboardItem = {
    siteId: string
    schedule: SiteCheckSchedule
    state: SiteCheckScheduleState
    activeSiteCheck?: SiteCheck
    progress?: SiteCheckProgress
    submissionProgress?: SiteCheckSubmissionProgress
}

export type SiteCheckDashboardSummary = Record<ReportableSiteCheckState, number>

const EMPTY_SUMMARY: SiteCheckDashboardSummary = {
    'up-to-date': 0,
    due: 0,
    overdue: 0,
    'in-progress': 0,
}

export function buildSiteCheckDashboardProjection(input: {
    schedules: readonly SiteCheckSchedule[]
    siteChecks: readonly SiteCheck[]
    jobs: readonly SiteCheckJobProgressInput[]
    today: string
}) {
    const checkById = new Map(input.siteChecks.map((check) => [
        check.gr_sitecheckid.toLowerCase(),
        check,
    ]))
    const jobsByCheck = new Map<string, SiteCheckJobProgressInput[]>()
    input.jobs.forEach((job) => {
        const checkId = job._gr_sitecheck_value?.toLowerCase()
        if (!checkId) return
        jobsByCheck.set(checkId, [...(jobsByCheck.get(checkId) ?? []), job])
    })

    const items = input.schedules.map((schedule): SiteCheckDashboardItem => {
        const activeId = schedule._gr_activesitecheck_value?.toLowerCase()
        const activeSiteCheck = activeId ? checkById.get(activeId) : undefined
        return {
            siteId: schedule._gr_site_value.toLowerCase(),
            schedule,
            state: getSiteCheckScheduleState({
                enabled: schedule.gr_enabled,
                frequency: schedule.gr_frequency,
                nextDueDate: schedule.gr_nextduedate,
                activeSiteCheckId: schedule._gr_activesitecheck_value,
                today: input.today,
            }),
            activeSiteCheck,
            progress: activeSiteCheck
                ? calculateSiteCheckProgress(
                    jobsByCheck.get(activeSiteCheck.gr_sitecheckid.toLowerCase()) ?? [],
                    activeSiteCheck.gr_expectedjobcount,
                )
                : undefined,
            submissionProgress: activeSiteCheck
                ? calculateSiteCheckSubmissionProgress(
                    jobsByCheck.get(activeSiteCheck.gr_sitecheckid.toLowerCase()) ?? [],
                    activeSiteCheck.gr_expectedjobcount,
                )
                : undefined,
        }
    })

    const summary = items.reduce((counts, item) => {
        if (item.state !== 'disabled' && item.state !== 'invalid') counts[item.state] += 1
        return counts
    }, { ...EMPTY_SUMMARY })

    return {
        items,
        summary,
        invalidCount: items.filter((item) => item.state === 'invalid').length,
    }
}
