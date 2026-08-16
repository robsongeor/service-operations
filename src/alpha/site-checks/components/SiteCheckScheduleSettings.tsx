import { useMemo, useState } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import { equipmentIdentifierSearchValues } from '../../equipment/identifiers/alternateFleetNumbers'
import FormSwitch from '../../shared/form-switch/FormSwitch'
import SearchableSelect from '../../shared/searchable-select/SearchableSelect'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection'
import {
    resolveSiteCheckEquipmentScope,
    SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS,
    SITE_CHECK_EQUIPMENT_SCOPES,
    SITE_CHECK_FREQUENCY_OPTIONS,
    type SiteCheckEquipmentScope,
    type SiteCheckFrequency,
    type SiteCheckSchedule,
    type SiteCheckScheduleSaveInput,
} from '../types/siteCheck.types'
import {
    validateSiteCheckSchedule,
} from '../domain/siteCheckCalculations'
import '../../customers/SiteMaintenanceSettingsDrawer.css'
import '../../customers/SiteSettingsDrawer.css'

type Props = {
    siteId: string
    siteName: string
    equipment: Equipment[]
    schedule?: SiteCheckSchedule
    selectedEquipmentIds: string[]
    loading: boolean
    saving: boolean
    error: string
    onSave: (input: SiteCheckScheduleSaveInput) => Promise<void>
}

const equipmentLabel = (item: Equipment) => item.gr_fleet || item.gr_serial || 'Unnamed Equipment'

export default function SiteCheckScheduleSettings({
    siteId,
    siteName,
    equipment,
    schedule,
    selectedEquipmentIds,
    loading,
    saving,
    error,
    onSave,
}: Props) {
    const existingFrequency = schedule?.gr_frequency ?? '' as SiteCheckFrequency | ''
    const initial = {
        enabled: schedule?.gr_enabled ?? false,
        frequency: existingFrequency,
        equipmentScope: resolveSiteCheckEquipmentScope(schedule?.gr_equipmentscope),
        dueDate: schedule?.gr_nextduedate ?? '',
        selectedEquipmentIds: selectedEquipmentIds.filter((id) =>
            equipment.some((item) => item.gr_equipmentid.toLowerCase() === id.toLowerCase())),
    }
    const [enabled, setEnabled] = useState(initial.enabled)
    const [frequency, setFrequency] = useState<SiteCheckFrequency | ''>(initial.frequency)
    const [dueDate, setDueDate] = useState(initial.dueDate)
    const [equipmentScope, setEquipmentScope] = useState<SiteCheckEquipmentScope>(initial.equipmentScope)
    const [equipmentIds, setEquipmentIds] = useState(initial.selectedEquipmentIds)
    const [saved, setSaved] = useState(initial)
    const [localError, setLocalError] = useState('')
    const [success, setSuccess] = useState('')
    const [confirmingDisable, setConfirmingDisable] = useState(false)
    const sortedEquipment = useMemo(() => [...equipment].sort((left, right) =>
        equipmentLabel(left).localeCompare(equipmentLabel(right), undefined, { numeric: true })), [equipment])
    const dirty = enabled !== saved.enabled
        || frequency !== saved.frequency
        || dueDate !== saved.dueDate
        || equipmentScope !== saved.equipmentScope
        || [...equipmentIds].sort().join(',') !== [...saved.selectedEquipmentIds].sort().join(',')

    const save = async () => {
        const validation = validateSiteCheckSchedule({
            enabled,
            frequency: frequency || null,
            nextDueDate: dueDate || null,
        })
        if (!validation.valid) {
            setLocalError(validation.errors.join(' '))
            return
        }
        if (enabled && equipmentScope === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION && equipmentIds.length === 0) {
            setLocalError('Select at least one Equipment record for Manual Selection.')
            return
        }
        setLocalError('')
        setSuccess('')
        try {
            await onSave({
                siteId,
                siteName,
                enabled,
                frequency: frequency || null,
                equipmentScope,
                selectedEquipmentIds: equipmentIds,
                nextDueDate: dueDate || null,
            })
            setSaved({ enabled, frequency, dueDate, equipmentScope, selectedEquipmentIds: equipmentIds })
            setConfirmingDisable(false)
            setSuccess('Site Check settings saved to Dataverse.')
        } catch (cause) {
            setLocalError(cause instanceof Error ? cause.message : 'Site Check settings could not be saved.')
        }
    }

    const requestSave = () => {
        if (schedule?._gr_activesitecheck_value && schedule.gr_enabled && !enabled) {
            setConfirmingDisable(true)
            return
        }
        void save()
    }

    return <>
        <EditDrawerSection title="Site Check Settings">
            {loading ? <p>Loading Site Check settings…</p> : <>
                <div className="site-checks-enable-row">
                    <div><strong>Enable Site Checks</strong><p>Include this Site in due and overdue reporting.</p></div>
                    <FormSwitch label="Enable Site Checks" checked={enabled} disabled={saving} onChange={(value) => {
                        setEnabled(value); setSuccess(''); setLocalError('')
                    }} />
                </div>
                <div className="site-settings-fields">
                    <label>Frequency<select value={frequency} disabled={saving || !enabled} onChange={(event) => {
                        setFrequency(event.target.value ? Number(event.target.value) as SiteCheckFrequency : '')
                        setSuccess(''); setLocalError('')
                    }}><option value="">Select frequency</option>{SITE_CHECK_FREQUENCY_OPTIONS.map((option) =>
                        <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label>Equipment scope<select value={equipmentScope} disabled={saving || !enabled} onChange={(event) => {
                        setEquipmentScope(Number(event.target.value) as SiteCheckEquipmentScope)
                        setSuccess(''); setLocalError('')
                    }}>{SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS.map((option) =>
                        <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className="site-check-date-field">
                        {schedule ? 'Next check date' : 'Initial check date'}
                        <input type="date" value={dueDate} disabled={saving || !enabled} required={enabled} onChange={(event) => {
                            setDueDate(event.target.value); setSuccess(''); setLocalError('')
                        }} />
                        <small>This is when this check becomes due and can be started—not a completion deadline. The frequency automatically schedules every later check.</small>
                    </label>
                </div>
                {equipmentScope === SITE_CHECK_EQUIPMENT_SCOPES.MANUAL_SELECTION && <SearchableSelect
                    id="site-check-summary-equipment-selector"
                    label="Equipment included"
                    value=""
                    onChange={() => undefined}
                    multiple
                    values={equipmentIds}
                    onValuesChange={(ids) => { setEquipmentIds([...new Set(ids)]); setSuccess(''); setLocalError('') }}
                    options={sortedEquipment.map((item) => ({
                        value: item.gr_equipmentid,
                        label: [equipmentLabel(item), item.gr_make, item.gr_model].filter(Boolean).join(' · '),
                        secondary: item.gr_serial ? `S/N ${item.gr_serial}` : undefined,
                        searchText: [...equipmentIdentifierSearchValues(item), item.gr_make, item.gr_model].filter(Boolean).join(' '),
                    }))}
                    placeholder="Select Equipment"
                    searchPlaceholder="Search fleet, serial, make or model"
                    emptyLabel="No Equipment at this Site"
                    disabled={saving || !enabled}
                    required={enabled}
                />}
                {!enabled && schedule && <p>Existing Site Check history and generated Jobs are retained when disabled.</p>}
                {(localError || error) && <p className="site-maintenance-error" role="alert">{localError || error}</p>}
                {success && <p role="status">{success}</p>}
                <button type="button" className="site-check-settings-save" disabled={saving || !dirty} onClick={requestSave}>
                    {saving ? 'Saving…' : 'Save Site Check settings'}
                </button>
            </>}
        </EditDrawerSection>
        {confirmingDisable && <EditDrawerConfirmation
            eyebrow="Disable Site Checks"
            title={`Disable Site Checks for ${siteName}?`}
            message="The current Site Check and its Jobs remain accessible and can still be completed. No new Site Check can be started while disabled."
            error={localError || error}
            isBusy={saving}
            confirmLabel={saving ? 'Disabling…' : 'Disable Site Checks'}
            onCancel={() => { if (!saving) setConfirmingDisable(false) }}
            onConfirm={() => void save()}
        />}
    </>
}
