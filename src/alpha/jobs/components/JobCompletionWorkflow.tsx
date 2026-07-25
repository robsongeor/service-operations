import { useState } from 'react'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import { SERVICE_TYPE_OPTIONS } from '../../equipment/servicePlans/equipmentServicePlan.types'
import { getPlansToUpdate } from '../../equipment/servicePlans/servicePlanCalculations'
import type { EquipmentServicePlan } from '../../equipment/servicePlans/equipmentServicePlan.types'
import {
    isLargeHourMeterIncrease,
    resolveCompletionEquipment,
    resolveCompletionServiceType,
    validateCompletionHourMeter,
    validateWofCompletionExpiry,
    type JobCompletionRequest,
} from '../completion/jobCompletion'
import type { Equipment } from '../types/equipment.types'
import JobMaintenanceSummary from './JobMaintenanceSummary'
import { formatWofDateOnly } from '../../wof/utils/wofRules'
import { defaultWofExpiryDate } from '../../shared/dates/dateOnly'
import './JobCompletionWorkflow.css'

type Props = {
    request: JobCompletionRequest | null
    equipment: Equipment[]
    servicePlans: EquipmentServicePlan[]
    isCompleting: boolean
    error: string
    onCancel: () => void
    onCompleteService: (hourMeter: number) => Promise<void>
    onCompleteWof: (newExpiry: string) => Promise<void>
}

export default function JobCompletionWorkflow({ request, equipment, servicePlans, isCompleting, error, onCancel, onCompleteService, onCompleteWof }: Props) {
    const selectedEquipment = request ? resolveCompletionEquipment(request, equipment) : undefined
    const serviceType = request ? resolveCompletionServiceType(request) : null
    const currentHourMeter = selectedEquipment?.gr_currenthourmeter ?? 0
    const [hourMeter, setHourMeter] = useState('')
    const [wofExpiryInput, setWofExpiryInput] = useState({ jobId: '', value: '' })
    const [validationError, setValidationError] = useState('')
    const [showLargeIncreaseWarning, setShowLargeIncreaseWarning] = useState(false)

    if (!request || request.kind === 'standard') return null

    if (request.kind === 'wof') {
        const wofExpiry = wofExpiryInput.jobId === request.job.gr_jobid
            ? wofExpiryInput.value
            : defaultWofExpiryDate()
        const completionDate = request.job.gr_completeddate ?? new Date().toISOString()
        const submitWof = () => {
            if (isCompleting) return
            const nextError = validateWofCompletionExpiry(
                wofExpiry,
                selectedEquipment?.gr_currentwofexpiry,
                completionDate,
            )
            setValidationError(nextError)
            if (!nextError) void onCompleteWof(wofExpiry)
        }
        return <EditDrawerFormDialog
            eyebrow="Job completion"
            title="Complete WOF Job"
            error={validationError || error}
            isBusy={isCompleting}
            submitLabel={isCompleting ? 'Completingâ€¦' : 'Complete WOF Job'}
            onCancel={onCancel}
            onSubmit={submitWof}
        >
            <div className="job-completion-equipment">
                <span>Equipment</span>
                <strong>{selectedEquipment?.gr_fleet || 'No fleet number'}</strong>
                <p>{[selectedEquipment?.gr_make, selectedEquipment?.gr_model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
            </div>
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
                    autoFocus
                />
            </label>
            <div className="job-completion-summary">
                <strong>This will update:</strong>
                <ul>
                    <li>WOF Inspection history</li>
                    <li>Equipment current WOF expiry</li>
                    <li>Job status</li>
                </ul>
            </div>
        </EditDrawerFormDialog>
    }

    const submit = () => {
        if (isCompleting) return
        const nextError = validateCompletionHourMeter(hourMeter, currentHourMeter)
        setValidationError(nextError)
        if (nextError) return
        const reading = Number(hourMeter)
        if (isLargeHourMeterIncrease(reading, currentHourMeter)) {
            setShowLargeIncreaseWarning(true)
            return
        }
        void onCompleteService(reading)
    }

    const affectedServices = serviceType == null
        ? []
        : getPlansToUpdate(serviceType).map((type) => SERVICE_TYPE_OPTIONS.find((option) => option.value === type)!)

    return <>
        <EditDrawerFormDialog
            eyebrow="Job completion"
            title="Complete Service Job"
            error={validationError || error}
            isBusy={isCompleting}
            submitLabel={isCompleting ? 'Completing…' : 'Complete Service Job'}
            onCancel={onCancel}
            onSubmit={submit}
        >
            <div className="job-completion-equipment">
                <span>Equipment</span>
                <strong>{selectedEquipment?.gr_fleet || 'No fleet number'}</strong>
                <p>{[selectedEquipment?.gr_make, selectedEquipment?.gr_model].filter(Boolean).join(' ') || 'Make and model not recorded'}</p>
            </div>
            <div className="job-completion-service">
                <span>Service Type</span>
                <strong>{SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label ?? 'Not selected'}</strong>
            </div>
            <JobMaintenanceSummary
                equipment={selectedEquipment}
                servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === selectedEquipment?.gr_equipmentid.toLowerCase())}
            />
            <label>
                Current Equipment Hour Meter
                <output>{currentHourMeter.toLocaleString('en-NZ')} hours</output>
            </label>
            <label>
                Hour Meter at Completion *
                <input
                    type="number"
                    min={currentHourMeter}
                    step="1"
                    inputMode="numeric"
                    value={hourMeter}
                    onChange={(event) => { setHourMeter(event.target.value); setValidationError('') }}
                    placeholder="4936"
                    autoFocus
                />
            </label>
            <div className="job-completion-summary">
                <strong>This will update:</strong>
                <ul>
                    <li>Equipment Current Hour Meter</li>
                    <li>Service History</li>
                    <li>Maintenance Schedule</li>
                    {affectedServices.map((option) => <li key={option.value}>Next {option.label}</li>)}
                </ul>
            </div>
        </EditDrawerFormDialog>
        {showLargeIncreaseWarning && <EditDrawerConfirmation
            eyebrow="Confirm hour meter"
            title="Large hour meter increase"
            message="The entered hour meter is much higher than the current equipment reading. Are you sure this is correct?"
            error={error}
            isBusy={isCompleting}
            confirmLabel="Continue"
            onCancel={() => setShowLargeIncreaseWarning(false)}
            onConfirm={() => void onCompleteService(Number(hourMeter))}
        />}
    </>
}
