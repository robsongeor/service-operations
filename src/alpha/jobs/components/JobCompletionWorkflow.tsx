import { useState } from 'react'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import { SERVICE_TYPE_OPTIONS } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { getPlansToUpdate } from '../../equipment/servicePlans/servicePlanCalculations'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import {
    MAINTENANCE_PROFILES,
    POWER_TYPES,
    SERVICE_PROGRAMMES,
    type EquipmentMaintenanceSetupInput,
    type MaintenanceProfile,
    type PowerType,
    type ServiceProgramme,
} from '../../equipment/servicePlans/maintenanceConfiguration'
import {
    isLargeHourMeterIncrease,
    isHistoricalHourMeterReading,
    jobCompletionDateTime,
    resolveCompletionEquipment,
    resolveCompletionServiceType,
    validateCompletionHourMeter,
    validateHourMeterRecordedDate,
    validateJobCompletionDate,
    validateWofCompletionExpiry,
    type JobCompletionRequest,
} from '../completion/jobCompletion'
import type { Equipment } from '../types/equipment.types'
import type { Job } from '../types/job.types'
import { getJobTypeLabel } from '../types/jobType.types'
import JobMaintenanceSummary from './JobMaintenanceSummary'
import { formatWofDateOnly } from '../../wof/utils/wofRules'
import { currentNewZealandDateOnly, defaultWofExpiryDate, newZealandDateOnly } from '../../shared/dates/dateOnly'
import './JobCompletionWorkflow.css'
import { calculateEquipmentUsageForecast, estimateHourMeterReading, resolveLatestHourMeterReading } from '../../equipment/servicePlans/equipmentUsageForecast'
import { HOUR_METER_CLASSIFICATION_ENABLED, HOUR_METER_READING_TYPES, type HourMeterReadingType } from '../../equipment/hourMeter/hourMeterReading.types'

type Props = {
    request: JobCompletionRequest | null
    equipment: Equipment[]
    jobs: Job[]
    servicePlans: EquipmentServicePlan[]
    isCompleting: boolean
    error: string
    onCancel: () => void
    onSetupMaintenance: (equipment: Equipment, input: EquipmentMaintenanceSetupInput) => Promise<void>
    onCompleteStandard: (hourMeter: number, readingType: HourMeterReadingType, readingDate: string, completionDate: string) => Promise<void>
    onCompleteService: (hourMeter: number, readingType: HourMeterReadingType, readingDate: string, completionDate: string) => Promise<void>
    onCompleteWof: (newExpiry: string, hourMeter: number, readingType: HourMeterReadingType, readingDate: string, completionDate: string) => Promise<void>
}

type MaintenanceSetupDraft = Omit<EquipmentMaintenanceSetupInput,
    'customAIntervalDays' | 'customBIntervalDays' | 'customCIntervalDays'> & {
        customAIntervalDays: string
        customBIntervalDays: string
        customCIntervalDays: string
    }

function createMaintenanceSetupDraft(equipment?: Equipment): MaintenanceSetupDraft {
    return {
        powerType: equipment?.gr_powertype ?? POWER_TYPES.OTHER_UNKNOWN,
        serviceProgramme: equipment?.gr_serviceprogramme ?? SERVICE_PROGRAMMES.ICE_STANDARD,
        maintenanceProfile: equipment?.gr_maintenanceprofile ?? MAINTENANCE_PROFILES.STANDARD,
        customAEnabled: equipment?.gr_customaenabled !== false,
        customBEnabled: equipment?.gr_custombenabled === true,
        customCEnabled: equipment?.gr_customcenabled !== false,
        customAIntervalDays: equipment?.gr_customaintervaldays?.toString() ?? '',
        customBIntervalDays: equipment?.gr_custombintervaldays?.toString() ?? '',
        customCIntervalDays: equipment?.gr_customcintervaldays?.toString() ?? '',
    }
}

function intervalValue(value: string) {
    return value.trim() ? Number(value) : null
}

export default function JobCompletionWorkflow({ request, equipment, jobs, servicePlans, isCompleting, error, onCancel, onSetupMaintenance, onCompleteStandard, onCompleteService, onCompleteWof }: Props) {
    const selectedEquipment = request ? resolveCompletionEquipment(request, equipment) : undefined
    const serviceType = request ? resolveCompletionServiceType(request) : null
    const jobNumber = request
        ? request.pendingSave?.jobNumber.trim() || request.job.gr_jobnumber?.trim() || 'Not assigned'
        : 'Not assigned'
    const latestHourMeterReading = selectedEquipment ? resolveLatestHourMeterReading(selectedEquipment, jobs) : null
    const currentHourMeter = latestHourMeterReading?.hours ?? 0
    const [hourMeter, setHourMeter] = useState('')
    const [wofExpiryInput, setWofExpiryInput] = useState({ jobId: '', value: '' })
    const [validationError, setValidationError] = useState('')
    const [hourMeterWarning, setHourMeterWarning] = useState<'large' | 'lower' | null>(null)
    const [maintenanceDraftState, setMaintenanceDraftState] = useState<{ equipmentId: string; draft: MaintenanceSetupDraft } | null>(null)
    const [isSavingMaintenance, setIsSavingMaintenance] = useState(false)
    const [maintenanceError, setMaintenanceError] = useState('')
    const [useEstimatedReading, setUseEstimatedReading] = useState(false)
    const [completionDateInput, setCompletionDateInput] = useState({ jobId: '', value: '' })

    const completionDate = request && completionDateInput.jobId === request.job.gr_jobid
        ? completionDateInput.value
        : request
            ? newZealandDateOnly(request.pendingSave?.completedDate ?? request.job.gr_completeddate ?? '') || currentNewZealandDateOnly()
            : currentNewZealandDateOnly()
    const readingDate = completionDate
    const currentHourMeterRecordedDate = latestHourMeterReading?.date ?? null

    const usageForecast = selectedEquipment ? calculateEquipmentUsageForecast(selectedEquipment, jobs) : null
    const estimatedReading = selectedEquipment && usageForecast
        ? estimateHourMeterReading(usageForecast, selectedEquipment, new Date(`${completionDate}T12:00:00Z`))
        : null
    const hasPreviousJobReading = Boolean(usageForecast?.readings.some((reading) => reading.id !== 'equipment-current'
        && reading.timestamp <= Date.parse(`${completionDate}T23:59:59Z`)
        && reading.assessment !== 'Potentially incorrect'
        && reading.assessment !== 'Possible reset'))
    const canUseEstimatedReading = Boolean(estimatedReading && hasPreviousJobReading)
    const isUsingEstimatedReading = useEstimatedReading && canUseEstimatedReading
    const historicalReading = isHistoricalHourMeterReading(readingDate, currentHourMeterRecordedDate)
    const readingType = isUsingEstimatedReading ? HOUR_METER_READING_TYPES.ESTIMATED : HOUR_METER_READING_TYPES.ACTUAL
    const readingValue = isUsingEstimatedReading && estimatedReading ? String(estimatedReading.hours) : hourMeter
    const validateReading = () => validateHourMeterRecordedDate(readingDate)
        || validateCompletionHourMeter(readingValue, currentHourMeter, readingDate, currentHourMeterRecordedDate)
    const warnForReading = (reading: number) => {
        if (reading < currentHourMeter && !historicalReading) return 'lower' as const
        if (isLargeHourMeterIncrease(reading, currentHourMeter)) return 'large' as const
        return null
    }
    const renderCompletionEntryFields = () => <>
        <label className="job-completion-current-meter job-edit-field-wide">Current Equipment Hour Meter<output>{currentHourMeter.toLocaleString('en-NZ')} hours{currentHourMeterRecordedDate && <small>Recorded {formatWofDateOnly(currentHourMeterRecordedDate)}</small>}</output></label>
        <label>{isUsingEstimatedReading ? 'Estimated Hour Meter at Completion' : 'Hour Meter at Completion *'}<input type="number" min="0" step="1" inputMode="numeric" value={readingValue} onChange={(event) => { if (!isUsingEstimatedReading) setHourMeter(event.target.value); setValidationError('') }} autoFocus readOnly={isUsingEstimatedReading} /></label>
        <label>Job Completion Date *<input type="date" required max={currentNewZealandDateOnly()} value={completionDate} onChange={(event) => { if (request) setCompletionDateInput({ jobId: request.job.gr_jobid, value: event.target.value }); setValidationError('') }} /></label>
        {HOUR_METER_CLASSIFICATION_ENABLED && <label className="job-completion-estimate-toggle job-edit-field-wide"><input type="checkbox" checked={isUsingEstimatedReading} disabled={!canUseEstimatedReading} onChange={(event) => { setUseEstimatedReading(event.target.checked); setValidationError('') }} /><span><strong>Technician did not record hours</strong>{isUsingEstimatedReading && estimatedReading
            ? <><b className="job-completion-estimate-value">Estimated: {estimatedReading.hours.toLocaleString('en-NZ')} hours</b><small>{estimatedReading.confidenceScore}% {estimatedReading.confidence} confidence. Calculated from previous Jobs, not editable, and saved as Estimated.</small></>
            : <small>{canUseEstimatedReading ? 'Use an estimate calculated from previous Jobs.' : 'No usable previous Job reading is available, so an estimate cannot be generated.'}</small>}</span></label>}
        {historicalReading && <p className="job-completion-historical-note job-edit-field-wide">This Job is earlier than the Equipment's current reading. Its hours will be retained in history without replacing the current meter.</p>}
    </>

    if (!request) return null

    if (request.kind === 'standard') {
        const submitStandard = () => {
            if (isCompleting) return
            const nextError = validateJobCompletionDate(completionDate) || validateReading()
            setValidationError(nextError)
            if (nextError) return
            const reading = Number(readingValue)
            const warning = warnForReading(reading)
            if (warning) {
                setHourMeterWarning(warning)
                return
            }
            void onCompleteStandard(reading, readingType, readingDate, completionDate)
        }
        return <>
            <EditDrawerFormDialog eyebrow="Job completion" title="Complete Job" dialogClassName="job-completion-dialog" fieldsClassName="job-completion-fields" error={validationError || error} isBusy={isCompleting} submitLabel={isCompleting ? 'Completing…' : 'Complete Job'} onCancel={onCancel} onSubmit={submitStandard}>
                <div className="job-completion-reference"><span>Job Number</span><strong>{jobNumber}</strong></div>
                <div className="job-completion-equipment">
                    <span>Equipment</span>
                    <strong>{selectedEquipment?.gr_fleet || 'No fleet number'}</strong>
                    <p>{[selectedEquipment?.gr_make, selectedEquipment?.gr_model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
                </div>
                <div className="job-completion-service"><span>Job Type</span><strong>{getJobTypeLabel(request.job.gr_jobtype)}</strong></div>
                {renderCompletionEntryFields()}
                <div className="job-completion-summary"><strong>This will update:</strong><ul><li>Job Completion Date</li><li>Equipment Current Hour Meter</li><li>Job Hour Meter</li><li>Job Status</li></ul></div>
            </EditDrawerFormDialog>
            {hourMeterWarning && <EditDrawerConfirmation eyebrow="Confirm hour meter" title={hourMeterWarning === 'lower' ? 'Lower hour meter reading' : 'Large hour meter increase'} message={hourMeterWarning === 'lower' ? 'This dated reading is lower than the current Equipment meter and may indicate a meter reset. Continue with this clearly signalled reading?' : 'The entered hour meter is much higher than the current equipment reading. Are you sure this is correct?'} error={error} isBusy={isCompleting} confirmLabel="Continue" onCancel={() => setHourMeterWarning(null)} onConfirm={() => void onCompleteStandard(Number(readingValue), readingType, readingDate, completionDate)} />}
        </>
    }

    if (request.kind === 'wof') {
        const wofExpiry = wofExpiryInput.jobId === request.job.gr_jobid
            ? wofExpiryInput.value
            : defaultWofExpiryDate()
        const submitWof = () => {
            if (isCompleting) return
            const nextError = validateJobCompletionDate(completionDate) || validateWofCompletionExpiry(
                wofExpiry,
                selectedEquipment?.gr_currentwofexpiry,
                jobCompletionDateTime(completionDate),
            )
            setValidationError(nextError)
            if (nextError) return
            const hourError = validateReading()
            setValidationError(hourError)
            if (hourError) return
            const reading = Number(readingValue)
            const warning = warnForReading(reading)
            if (warning) {
                setHourMeterWarning(warning)
                return
            }
            void onCompleteWof(wofExpiry, reading, readingType, readingDate, completionDate)
        }
        return <>
        <EditDrawerFormDialog
            eyebrow="Job completion"
            title="Complete WOF Job"
            dialogClassName="job-completion-dialog"
            fieldsClassName="job-completion-wof-fields"
            error={validationError || error}
            isBusy={isCompleting}
            submitLabel={isCompleting ? 'Completing…' : 'Complete WOF Job'}
            onCancel={onCancel}
            onSubmit={submitWof}
        >
            <div className="job-completion-reference">
                <span>Job Number</span>
                <strong>{jobNumber}</strong>
            </div>
            <div className="job-completion-equipment">
                <span>Equipment</span>
                <strong>{selectedEquipment?.gr_fleet || 'No fleet number'}</strong>
                <p>{[selectedEquipment?.gr_make, selectedEquipment?.gr_model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
            </div>
            {renderCompletionEntryFields()}
            <label>
                Current WOF expiry
                <output>{formatWofDateOnly(selectedEquipment?.gr_currentwofexpiry) || 'Not recorded'}</output>
            </label>
            <label>
                New WOF expiry *
                <input
                    type="date"
                    required
                    value={wofExpiry}
                    onChange={(event) => {
                        setWofExpiryInput({ jobId: request.job.gr_jobid, value: event.target.value })
                        setValidationError('')
                    }}
                />
            </label>
            <div className="job-completion-summary">
                <strong>This will update:</strong>
                <ul>
                    <li>Job Completion Date</li>
                    <li>WOF Inspection history</li>
                    <li>Equipment current WOF expiry</li>
                    <li>Equipment Current Hour Meter</li>
                    <li>Job Hour Meter</li>
                    <li>Job status</li>
                </ul>
            </div>
        </EditDrawerFormDialog>
        {hourMeterWarning && <EditDrawerConfirmation eyebrow="Confirm hour meter" title={hourMeterWarning === 'lower' ? 'Lower hour meter reading' : 'Large hour meter increase'} message={hourMeterWarning === 'lower' ? 'This dated reading is lower than the current Equipment meter and may indicate a meter reset. Continue with this clearly signalled reading?' : 'The entered hour meter is much higher than the current equipment reading. Are you sure this is correct?'} error={error} isBusy={isCompleting} confirmLabel="Continue" onCancel={() => setHourMeterWarning(null)} onConfirm={() => void onCompleteWof(wofExpiry, Number(readingValue), readingType, readingDate, completionDate)} />}
        </>
    }

    const submit = () => {
        if (isCompleting) return
        const nextError = validateJobCompletionDate(completionDate) || validateReading()
        setValidationError(nextError)
        if (nextError) return
        const reading = Number(readingValue)
        const warning = warnForReading(reading)
        if (warning) {
            setHourMeterWarning(warning)
            return
        }
        void onCompleteService(reading, readingType, readingDate, completionDate)
    }

    const affectedServices = serviceType == null
        ? []
        : getPlansToUpdate(serviceType, selectedEquipment).map((type) => SERVICE_TYPE_OPTIONS.find((option) => option.value === type)!)
    const selectedEquipmentPlans = servicePlans.filter((plan) =>
        plan._gr_equipment_value?.toLowerCase() === selectedEquipment?.gr_equipmentid.toLowerCase())
    const missingServicePlans = affectedServices.filter((service) =>
        !selectedEquipmentPlans.some((plan) => plan.gr_servicetype === service.value))
    const maintenanceDraft = maintenanceDraftState && maintenanceDraftState.equipmentId === selectedEquipment?.gr_equipmentid
        ? maintenanceDraftState.draft
        : createMaintenanceSetupDraft(selectedEquipment)
    const updateMaintenanceDraft = (patch: Partial<MaintenanceSetupDraft>) => {
        if (!selectedEquipment) return
        setMaintenanceDraftState({
            equipmentId: selectedEquipment.gr_equipmentid,
            draft: { ...maintenanceDraft, ...patch },
        })
        setMaintenanceError('')
    }
    const saveMaintenanceSetup = async () => {
        if (!selectedEquipment || isSavingMaintenance) return
        setIsSavingMaintenance(true)
        setMaintenanceError('')
        try {
            await onSetupMaintenance(selectedEquipment, {
                ...maintenanceDraft,
                customAIntervalDays: intervalValue(maintenanceDraft.customAIntervalDays),
                customBIntervalDays: intervalValue(maintenanceDraft.customBIntervalDays),
                customCIntervalDays: intervalValue(maintenanceDraft.customCIntervalDays),
            })
        } catch (setupError) {
            setMaintenanceError(setupError instanceof Error ? setupError.message : 'Maintenance setup could not be saved.')
        } finally {
            setIsSavingMaintenance(false)
        }
    }

    return <>
        <EditDrawerFormDialog
            eyebrow="Job completion"
            title="Complete Service Job"
            dialogClassName="job-completion-dialog"
            fieldsClassName="job-completion-fields"
            error={validationError || error}
            isBusy={isCompleting || isSavingMaintenance}
            submitDisabled={missingServicePlans.length > 0 || isSavingMaintenance}
            hideSubmit={missingServicePlans.length > 0}
            submitLabel={isCompleting ? 'Completing…' : 'Complete Service Job'}
            onCancel={onCancel}
            onSubmit={submit}
        >
            <div className="job-completion-reference">
                <span>Job Number</span>
                <strong>{jobNumber}</strong>
            </div>
            <div className="job-completion-equipment">
                <span>Equipment</span>
                <strong>{selectedEquipment?.gr_fleet || 'No fleet number'}</strong>
                <p>{[selectedEquipment?.gr_make, selectedEquipment?.gr_model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
            </div>
            <div className="job-completion-service">
                <span>Service Type</span>
                <strong>{SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label ?? 'Not selected'}</strong>
            </div>
            {missingServicePlans.length > 0 && <section className="job-completion-schedule-warning job-edit-field-wide" aria-labelledby="maintenance-setup-title">
                <strong id="maintenance-setup-title">Maintenance setup required</strong>
                <p>Confirm this Equipment’s maintenance configuration. Saving it will create the missing service plans without closing this Job.</p>
                <div className="job-completion-maintenance-grid">
                    <label>Power Type<select value={maintenanceDraft.powerType} onChange={(event) => {
                        const powerType = Number(event.target.value) as PowerType
                        updateMaintenanceDraft({
                            powerType,
                            serviceProgramme: maintenanceDraft.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM
                                ? maintenanceDraft.serviceProgramme
                                : powerType === POWER_TYPES.ELECTRIC
                                    ? SERVICE_PROGRAMMES.ELECTRIC_STANDARD
                                    : SERVICE_PROGRAMMES.ICE_STANDARD,
                        })
                    }}><option value={POWER_TYPES.ICE}>ICE</option><option value={POWER_TYPES.ELECTRIC}>Electric</option><option value={POWER_TYPES.OTHER_UNKNOWN}>Other / Unknown</option></select></label>
                    <label>Service Programme<select value={maintenanceDraft.serviceProgramme} onChange={(event) => updateMaintenanceDraft({ serviceProgramme: Number(event.target.value) as ServiceProgramme })}><option value={SERVICE_PROGRAMMES.ICE_STANDARD}>ICE Standard — A/B/C</option><option value={SERVICE_PROGRAMMES.ELECTRIC_STANDARD}>Electric Standard — A/C</option><option value={SERVICE_PROGRAMMES.CUSTOM}>Custom</option></select></label>
                    <label>Default Maintenance Profile<select value={maintenanceDraft.maintenanceProfile} onChange={(event) => updateMaintenanceDraft({ maintenanceProfile: Number(event.target.value) as MaintenanceProfile })}><option value={MAINTENANCE_PROFILES.HIGH_USAGE}>High Usage</option><option value={MAINTENANCE_PROFILES.STANDARD}>Standard</option><option value={MAINTENANCE_PROFILES.LOW_USAGE}>Low Usage</option><option value={MAINTENANCE_PROFILES.CUSTOM}>Custom</option></select></label>
                </div>
                {maintenanceDraft.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM && <div className="job-completion-maintenance-levels">
                    {([['A', 'customAEnabled'], ['B', 'customBEnabled'], ['C', 'customCEnabled']] as const).map(([label, field]) => <label key={field}><input type="checkbox" checked={maintenanceDraft[field]} onChange={(event) => updateMaintenanceDraft({ [field]: event.target.checked })} /> {label} Service</label>)}
                </div>}
                {maintenanceDraft.maintenanceProfile === MAINTENANCE_PROFILES.CUSTOM && <div className="job-completion-maintenance-grid">
                    {maintenanceDraft.customAEnabled && <label>Custom A interval (days)<input type="number" min="1" step="1" value={maintenanceDraft.customAIntervalDays} onChange={(event) => updateMaintenanceDraft({ customAIntervalDays: event.target.value })} /></label>}
                    {maintenanceDraft.customBEnabled && maintenanceDraft.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM && <label>Custom B interval (days)<input type="number" min="1" step="1" value={maintenanceDraft.customBIntervalDays} onChange={(event) => updateMaintenanceDraft({ customBIntervalDays: event.target.value })} /></label>}
                    {maintenanceDraft.customCEnabled && <label>Custom C interval (days)<input type="number" min="1" step="1" value={maintenanceDraft.customCIntervalDays} onChange={(event) => updateMaintenanceDraft({ customCIntervalDays: event.target.value })} /></label>}
                </div>}
                {maintenanceError && <p className="job-completion-maintenance-error" role="alert">{maintenanceError}</p>}
                <div className="job-completion-maintenance-actions">
                    <small>Missing {missingServicePlans.map((service) => service.label).join(', ')} {missingServicePlans.length === 1 ? 'plan' : 'plans'}.</small>
                    <button type="button" onClick={() => void saveMaintenanceSetup()} disabled={isSavingMaintenance}>{isSavingMaintenance ? 'Saving…' : 'Save maintenance setup'}</button>
                </div>
            </section>}
            {missingServicePlans.length === 0 && <>
                {renderCompletionEntryFields()}
                <JobMaintenanceSummary
                    equipment={selectedEquipment}
                    servicePlans={selectedEquipmentPlans}
                />
                <div className="job-completion-summary">
                    <strong>This will update:</strong>
                    <ul>
                        <li>Job Completion Date</li>
                        <li>Equipment Current Hour Meter</li>
                        <li>Service History</li>
                        <li>Maintenance Schedule</li>
                        {affectedServices.map((option) => <li key={option.value}>Next {option.label}</li>)}
                    </ul>
                </div>
            </>}
        </EditDrawerFormDialog>
        {hourMeterWarning && <EditDrawerConfirmation
            eyebrow="Confirm hour meter"
            title={hourMeterWarning === 'lower' ? 'Lower hour meter reading' : 'Large hour meter increase'}
            message={hourMeterWarning === 'lower' ? 'This dated reading is lower than the current Equipment meter and may indicate a meter reset. Continue with this clearly signalled reading?' : 'The entered hour meter is much higher than the current equipment reading. Are you sure this is correct?'}
            error={error}
            isBusy={isCompleting}
            confirmLabel="Continue"
            onCancel={() => setHourMeterWarning(null)}
            onConfirm={() => void onCompleteService(Number(readingValue), readingType, readingDate, completionDate)}
        />}
    </>
}
