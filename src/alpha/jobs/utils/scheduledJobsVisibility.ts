import type { JobScheduleOption } from '../types/jobSchedule.types'
import type { ScheduledJobsVisibility } from '../types/jobsViewState.types'

function localDateKey(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function addLocalDays(date: Date, days: number) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
}

export function jobMatchesScheduledVisibility(
    jobId: string,
    scheduleOptions: JobScheduleOption[],
    visibility: ScheduledJobsVisibility,
    now = new Date(),
) {
    if (visibility === 'all') return true

    const scheduledDates = scheduleOptions
        .filter((option) => option._gr_job_value?.toLowerCase() === jobId.toLowerCase())
        .map((option) => option.gr_scheduledate?.slice(0, 10))
        .filter((date): date is string => Boolean(date))

    // Unscheduled Jobs remain visible for every setting.
    if (scheduledDates.length === 0) return true

    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const todayKey = localDateKey(today)

    if (visibility === 'today') return scheduledDates.includes(todayKey)
    if (visibility === 'today-tomorrow') {
        return scheduledDates.some((date) => date === todayKey || date === localDateKey(addLocalDays(today, 1)))
    }

    const monday = addLocalDays(today, -((today.getDay() + 6) % 7))
    const sunday = addLocalDays(monday, 6)
    const start = localDateKey(monday)
    const end = localDateKey(sunday)
    return scheduledDates.some((date) => date >= start && date <= end)
}
