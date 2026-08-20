import { useMemo, useState } from 'react'
import {
    SCHEDULE_TYPE,
    type JobScheduleOption,
    type JobScheduleOptionDraft,
    type JobScheduleOptionInput,
    type ScheduleType,
} from '../types/jobSchedule.types'

type Props = {
    jobId?: string
    scheduleOptions?: JobScheduleOption[]
    draftOptions?: JobScheduleOptionDraft[]
    onDraftOptionsChange?: (options: JobScheduleOptionDraft[]) => void
    onCreate?: (option: JobScheduleOptionInput) => Promise<void>
    onUpdate?: (optionId: string, option: JobScheduleOptionInput) => Promise<void>
    onDelete?: (optionId: string) => Promise<void>
    disabledMessage?: string
}

type DisplayOption = {
    id: string
    scheduleType: ScheduleType
    scheduleDate: string
    scheduleTime: string | null
    confirmed: boolean
}

const scheduleTypeLabels: Record<ScheduleType, string> = {
    [SCHEDULE_TYPE.WEEK]: 'Week',
    [SCHEDULE_TYPE.ANY_TIME]: 'Any time',
    [SCHEDULE_TYPE.MORNING]: 'Morning',
    [SCHEDULE_TYPE.AFTER_TIME]: 'After time',
    [SCHEDULE_TYPE.EXACT_TIME]: 'Exact time',
}

const timeOptionFormatter = new Intl.DateTimeFormat('en-NZ', {
    hour: 'numeric',
    minute: '2-digit',
})

const timeOptionGroups = [
    { label: 'Morning', startMinutes: 6 * 60, endMinutes: 11 * 60 + 30 },
    { label: 'Afternoon', startMinutes: 12 * 60, endMinutes: 16 * 60 },
].map((group) => ({
    ...group,
    options: Array.from(
        { length: Math.floor((group.endMinutes - group.startMinutes) / 30) + 1 },
        (_, index) => {
            const totalMinutes = group.startMinutes + index * 30
            const hour = Math.floor(totalMinutes / 60)
            const minute = totalMinutes % 60

            return {
                value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
                label: timeOptionFormatter.format(new Date(2000, 0, 1, hour, minute)),
            }
        },
    ),
}))

function mondayFor(dateValue: string) {
    const date = new Date(`${dateValue}T12:00:00`)
    const daysSinceMonday = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - daysSinceMonday)

    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function displayDate(dateValue: string) {
    const dateOnlyValue = dateValue.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    const date = dateOnlyValue
        ? new Date(`${dateOnlyValue}T12:00:00`)
        : new Date(dateValue)

    if (Number.isNaN(date.getTime())) return 'Date unavailable'

    return new Intl.DateTimeFormat('en-NZ', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date)
}

function displayTime(timeValue: string | null) {
    if (!timeValue) return ''

    const time = new Date(timeValue)
    if (Number.isNaN(time.getTime())) return 'Time unavailable'

    return new Intl.DateTimeFormat('en-NZ', {
        hour: 'numeric',
        minute: '2-digit',
    }).format(time)
}

function timeInputValue(timeValue: string | null) {
    if (!timeValue) return ''

    const time = new Date(timeValue)
    if (Number.isNaN(time.getTime())) return ''

    return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

export default function JobScheduleFields({
    jobId,
    scheduleOptions = [],
    draftOptions = [],
    onDraftOptionsChange,
    onCreate,
    onUpdate,
    onDelete,
    disabledMessage,
}: Props) {
    const [scheduleType, setScheduleType] = useState<ScheduleType>(
        SCHEDULE_TYPE.EXACT_TIME,
    )
    const [isExpanded, setIsExpanded] = useState(true)
    const [scheduleDate, setScheduleDate] = useState('')
    const [scheduleTime, setScheduleTime] = useState('')
    const [confirmed, setConfirmed] = useState(false)
    const [editingOptionId, setEditingOptionId] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [deletingOptionId, setDeletingOptionId] = useState('')
    const [error, setError] = useState('')

    const displayedOptions = useMemo<DisplayOption[]>(
        () => jobId
            ? scheduleOptions
                .filter((option) =>
                    option._gr_job_value?.toLowerCase() === jobId.toLowerCase(),
                )
                .map((option) => ({
                    id: option.gr_jobscheduleoptionid,
                    scheduleType: option.gr_scheduletype,
                    scheduleDate: option.gr_scheduledate,
                    scheduleTime: option.gr_scheduletime,
                    confirmed: option.gr_confirmed,
                }))
            : draftOptions.map((option) => ({
                id: option.clientId,
                scheduleType: option.scheduleType,
                scheduleDate: option.scheduleDate,
                scheduleTime: option.scheduleTime ?? null,
                confirmed: option.confirmed,
            })),
        [draftOptions, jobId, scheduleOptions],
    )

    const needsTime = scheduleType === SCHEDULE_TYPE.AFTER_TIME
        || scheduleType === SCHEDULE_TYPE.EXACT_TIME
    const showForm = displayedOptions.length === 0 || Boolean(editingOptionId)

    const resetForm = () => {
        setScheduleType(SCHEDULE_TYPE.EXACT_TIME)
        setScheduleDate('')
        setScheduleTime('')
        setConfirmed(false)
        setEditingOptionId('')
        setError('')
    }

    const beginEdit = (option: DisplayOption) => {
        setScheduleType(option.scheduleType)
        setScheduleDate(option.scheduleDate.slice(0, 10))
        setScheduleTime(timeInputValue(option.scheduleTime))
        setConfirmed(option.confirmed)
        setEditingOptionId(option.id)
        setError('')
    }

    const saveOption = async () => {
        if (!scheduleDate) {
            setError('Choose a date before saving this schedule.')
            return
        }

        if (needsTime && !scheduleTime) {
            setError('Choose a time for this schedule.')
            return
        }

        try {
            setIsSaving(true)
            setError('')

            const savedDate = scheduleType === SCHEDULE_TYPE.WEEK
                ? mondayFor(scheduleDate)
                : scheduleDate
            const option = {
                scheduleType,
                scheduleDate: savedDate,
                scheduleTime: needsTime
                    ? new Date(`${savedDate}T${scheduleTime}:00`).toISOString()
                    : undefined,
                confirmed,
            }

            if (editingOptionId) {
                if (jobId && onUpdate) {
                    await onUpdate(editingOptionId, { jobId, ...option })
                } else if (onDraftOptionsChange) {
                    onDraftOptionsChange(draftOptions.map((draftOption) =>
                        draftOption.clientId === editingOptionId
                            ? { clientId: draftOption.clientId, ...option }
                            : draftOption,
                    ))
                }
            } else if (jobId && onCreate) {
                await onCreate({ jobId, ...option })
            } else if (onDraftOptionsChange) {
                onDraftOptionsChange([
                    { clientId: crypto.randomUUID(), ...option },
                ])
            }

            resetForm()
        } catch (caughtError) {
            console.error(caughtError)
            setError(editingOptionId
                ? 'The schedule could not be updated. Please try again.'
                : 'The schedule could not be added. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const removeOption = async (optionId: string) => {
        try {
            setDeletingOptionId(optionId)
            setError('')

            if (jobId && onDelete) {
                await onDelete(optionId)
            } else if (onDraftOptionsChange) {
                onDraftOptionsChange([])
            }

            if (editingOptionId === optionId) resetForm()
        } catch (caughtError) {
            console.error(caughtError)
            setError('The schedule could not be removed. Please try again.')
        } finally {
            setDeletingOptionId('')
        }
    }

    if (disabledMessage) {
        return (
            <section className="job-edit-divider job-schedule-section">
                <div>
                    <h3>Scheduling</h3>
                    <p className="job-schedule-error" role="status">{disabledMessage}</p>
                </div>
            </section>
        )
    }

    return (
        <section className="job-edit-divider job-schedule-section">
            <button
                type="button"
                className="job-schedule-toggle"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
            >
                <span>
                    <strong>Scheduling</strong>
                    <small>
                        {displayedOptions.length > 0
                            ? '1 scheduled visit'
                            : 'Add a date or customer availability'}
                    </small>
                </span>
                <span className="job-schedule-toggle-icon" aria-hidden="true">
                    {isExpanded ? '−' : '+'}
                </span>
            </button>

            {isExpanded && (
                <>
                    {displayedOptions.length > 0 && (
                        <div className="job-schedule-options">
                            {displayedOptions.map((option) => (
                                <div className="job-schedule-option" key={option.id}>
                                    <div>
                                        <strong>{scheduleTypeLabels[option.scheduleType]}</strong>
                                        <span>
                                            {option.scheduleType === SCHEDULE_TYPE.WEEK
                                                ? `Week of ${displayDate(option.scheduleDate)}`
                                                : displayDate(option.scheduleDate)}
                                            {option.scheduleTime
                                                ? ` · ${option.scheduleType === SCHEDULE_TYPE.AFTER_TIME ? 'After ' : ''}${displayTime(option.scheduleTime)}`
                                                : ''}
                                        </span>
                                    </div>
                                    <div className="job-schedule-option-actions">
                                        <span className={`job-schedule-option-status${option.confirmed ? ' confirmed' : ''}`}>
                                            {option.confirmed ? 'Confirmed' : 'Option'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => beginEdit(option)}
                                            disabled={isSaving || deletingOptionId === option.id}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeOption(option.id)}
                                            disabled={deletingOptionId === option.id}
                                        >
                                            {deletingOptionId === option.id ? 'Removing...' : 'Remove'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {showForm && (
                        <div className="job-schedule-form">
                            <label className="job-edit-field">
                                Schedule type
                                <select
                                    value={scheduleType}
                                    onChange={(event) => {
                                        setScheduleType(Number(event.target.value) as ScheduleType)
                                        setScheduleTime('')
                                    }}
                                >
                                    {Object.entries(scheduleTypeLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="job-edit-field">
                                {scheduleType === SCHEDULE_TYPE.WEEK ? 'A date in the week' : 'Date'}
                                <input
                                    type="date"
                                    value={scheduleDate}
                                    onChange={(event) => setScheduleDate(event.target.value)}
                                />
                            </label>

                            {needsTime && (
                                <label className="job-edit-field">
                                    {scheduleType === SCHEDULE_TYPE.AFTER_TIME ? 'Available after' : 'Time'}
                                    <select
                                        value={scheduleTime}
                                        onChange={(event) => setScheduleTime(event.target.value)}
                                    >
                                        <option value="">Select a time</option>
                                        {timeOptionGroups.map((group) => (
                                            <optgroup key={group.label} label={group.label}>
                                                {group.options.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </label>
                            )}

                            <label className="job-schedule-confirmed">
                                <input
                                    type="checkbox"
                                    checked={confirmed}
                                    onChange={(event) => setConfirmed(event.target.checked)}
                                />
                                This is the confirmed visit
                            </label>

                            {error && <p className="job-schedule-error" role="alert">{error}</p>}

                            <div className="job-schedule-form-actions">
                                {editingOptionId && (
                                    <button type="button" onClick={resetForm} disabled={isSaving}>
                                        Cancel
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="job-schedule-add"
                                    onClick={saveOption}
                                    disabled={isSaving}
                                >
                                    {isSaving
                                        ? 'Saving...'
                                        : editingOptionId ? 'Save schedule' : '+ Add schedule'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}
