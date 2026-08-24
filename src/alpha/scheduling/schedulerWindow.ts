export type SchedulerWindow = Readonly<{
    startDate: string
    endDate: string
}>

export function schedulerDateKey(value: Date | string) {
    if (typeof value === 'string') return value.slice(0, 10)
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function addSchedulerDays(value: Date, days: number) {
    const date = new Date(value)
    date.setDate(date.getDate() + days)
    return date
}

export function startOfSchedulerWeek(value: Date) {
    const date = new Date(value)
    date.setHours(12, 0, 0, 0)
    const daysSinceMonday = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - daysSinceMonday)
    return date
}

export function schedulerWindow(value: Date): SchedulerWindow {
    const start = startOfSchedulerWeek(value)
    return {
        startDate: schedulerDateKey(start),
        endDate: schedulerDateKey(addSchedulerDays(start, 6)),
    }
}

export function adjacentSchedulerWindows(value: Date): SchedulerWindow[] {
    return [
        schedulerWindow(addSchedulerDays(value, -7)),
        schedulerWindow(addSchedulerDays(value, 7)),
    ]
}
