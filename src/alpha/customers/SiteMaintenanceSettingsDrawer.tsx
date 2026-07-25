import { useMemo, useState } from 'react'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Site } from '../jobs/types/site.types'
import {
    MAINTENANCE_PROFILES,
    type MaintenanceProfile,
} from '../equipment/servicePlans/maintenanceConfiguration'
import EditDrawerConfirmation from '../shared/drawer/EditDrawerConfirmation'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import './SiteMaintenanceSettingsDrawer.css'

type Props = {
    site: Site
    equipment: Equipment[]
    busy: boolean
    error: string
    onSave: (profile: MaintenanceProfile, equipmentIds: string[]) => Promise<void>
    onComplete: () => void
    onClose: () => void
}

const profileOptions = [
    { value: MAINTENANCE_PROFILES.HIGH_USAGE, label: 'High Usage' },
    { value: MAINTENANCE_PROFILES.STANDARD, label: 'Standard' },
    { value: MAINTENANCE_PROFILES.LOW_USAGE, label: 'Low Usage' },
    { value: MAINTENANCE_PROFILES.CUSTOM, label: 'Custom' },
] as const

const profileLabel = (value?: number | null) =>
    profileOptions.find((option) => option.value === value)?.label ?? 'Not set'

const equipmentLabel = (item: Equipment) => item.gr_fleet || item.gr_serial || 'Unnamed Equipment'

export default function SiteMaintenanceSettingsDrawer({
    site,
    equipment,
    busy,
    error,
    onSave,
    onComplete,
    onClose,
}: Props) {
    const [profile, setProfile] = useState<MaintenanceProfile>(
        site.gr_defaultmaintenanceprofile ?? MAINTENANCE_PROFILES.STANDARD,
    )
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [confirming, setConfirming] = useState(false)
    const [localError, setLocalError] = useState('')

    const sortedEquipment = useMemo(() => [...equipment].sort((left, right) =>
        equipmentLabel(left).localeCompare(equipmentLabel(right), undefined, { numeric: true }),
    ), [equipment])
    const selected = sortedEquipment.filter((item) => selectedIds.includes(item.gr_equipmentid))

    const save = async () => {
        setLocalError('')
        try {
            await onSave(profile, selectedIds)
            setConfirming(false)
            onComplete()
        } catch (caught) {
            setLocalError(caught instanceof Error ? caught.message : 'Site maintenance settings could not be saved.')
        }
    }

    const requestSave = () => {
        if (selectedIds.length) setConfirming(true)
        else void save()
    }

    return <>
        <EditDrawerShell
            eyebrow="Site settings"
            title={`${site.gr_name} maintenance`}
            busy={busy}
            onClose={onClose}
            footer={<>
                <span>{selectedIds.length} machine{selectedIds.length === 1 ? '' : 's'} selected for update</span>
                <div className="site-maintenance-footer-actions">
                    <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="primary" onClick={requestSave} disabled={busy}>
                        Save settings
                    </button>
                </div>
            </>}
        >
            <section className="site-maintenance-setting">
                <label htmlFor="site-default-maintenance-profile">Default Maintenance Profile</label>
                <select
                    id="site-default-maintenance-profile"
                    value={profile}
                    onChange={(event) => setProfile(Number(event.target.value) as MaintenanceProfile)}
                    disabled={busy}
                >
                    {profileOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p>New Equipment at this Site will inherit this profile. Existing Equipment is unchanged unless selected below.</p>
            </section>

            <section className="site-maintenance-bulk" aria-labelledby="site-maintenance-bulk-heading">
                <div className="site-maintenance-section-heading">
                    <div>
                        <h3 id="site-maintenance-bulk-heading">Apply to existing Equipment</h3>
                        <p>Choose only the machines whose current profile should be replaced.</p>
                    </div>
                    <div>
                        <button type="button" onClick={() => setSelectedIds(sortedEquipment.map((item) => item.gr_equipmentid))} disabled={busy || !sortedEquipment.length}>Select all</button>
                        <button type="button" onClick={() => setSelectedIds([])} disabled={busy || !selectedIds.length}>Clear all</button>
                    </div>
                </div>
                <SearchableSelect
                    id="site-maintenance-equipment"
                    label="Equipment"
                    value=""
                    onChange={() => undefined}
                    multiple
                    values={selectedIds}
                    onValuesChange={setSelectedIds}
                    options={sortedEquipment.map((item) => ({
                        value: item.gr_equipmentid,
                        label: [equipmentLabel(item), item.gr_make, item.gr_model].filter(Boolean).join(' · '),
                        secondary: `Current profile: ${profileLabel(item.gr_maintenanceprofile)}`,
                        searchText: [item.gr_fleet, item.gr_serial, item.gr_make, item.gr_model].filter(Boolean).join(' '),
                    }))}
                    placeholder="Select Equipment"
                    searchPlaceholder="Search fleet, serial, make or model"
                    emptyLabel="No Equipment at this Site"
                />
                {selected.length > 0 && <ul className="site-maintenance-selected">
                    {selected.map((item) => <li key={item.gr_equipmentid}>
                        <span><strong>{equipmentLabel(item)}</strong><small>{[item.gr_make, item.gr_model].filter(Boolean).join(' · ') || 'No machine details'} · Current: {profileLabel(item.gr_maintenanceprofile)}</small></span>
                        <button type="button" onClick={() => setSelectedIds((current) => current.filter((id) => id !== item.gr_equipmentid))} disabled={busy}>Remove</button>
                    </li>)}
                </ul>}
            </section>
            {(localError || error) && <p className="site-maintenance-error" role="alert">{localError || error}</p>}
        </EditDrawerShell>

        {confirming && <EditDrawerConfirmation
            eyebrow="Confirm profile update"
            title={`Apply ${profileLabel(profile)} to ${selected.length} machine${selected.length === 1 ? '' : 's'}?`}
            message={`This replaces the Maintenance Profile on the selected Equipment. Service plans, maintenance history, and all other Equipment settings remain unchanged.`}
            error={localError || error}
            isBusy={busy}
            confirmLabel={busy ? 'Applying…' : 'Apply and save'}
            onCancel={() => { if (!busy) setConfirming(false) }}
            onConfirm={() => void save()}
        />}
    </>
}
