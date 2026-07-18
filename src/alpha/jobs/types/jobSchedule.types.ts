export const SCHEDULE_TYPE = {
    WEEK: 122830000,
    ANY_TIME: 122830001,
    MORNING: 122830002,
    AFTER_TIME: 122830003,
    EXACT_TIME: 122830004,
} as const

export type ScheduleType =
    (typeof SCHEDULE_TYPE)[keyof typeof SCHEDULE_TYPE]

export type JobScheduleOption = {
    gr_jobscheduleoptionid: string
    gr_name: string
    gr_scheduletype: ScheduleType
    gr_scheduledate: string
    gr_scheduletime: string | null
    gr_confirmed: boolean
    _gr_job_value: string
}

export type JobScheduleOptionInput = {
    jobId: string
    scheduleType: ScheduleType
    scheduleDate: string
    scheduleTime?: string
    confirmed: boolean
}

export type JobScheduleOptionDraft = Omit<JobScheduleOptionInput, 'jobId'> & {
    clientId: string
}
