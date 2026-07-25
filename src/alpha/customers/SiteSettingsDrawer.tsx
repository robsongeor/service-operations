import { type FormEvent, useMemo, useState } from 'react'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Site } from '../jobs/types/site.types'
import {
    MAINTENANCE_PROFILES,
    type MaintenanceProfile,
} from '../equipment/servicePlans/maintenanceConfiguration'
import DrawerTabs from '../shared/drawer/DrawerTabs'
import EditDrawerConfirmation from '../shared/drawer/EditDrawerConfirmation'
import EditDrawerSection from '../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import './SiteMaintenanceSettingsDrawer.css'
import './SiteSettingsDrawer.css'

export type SiteSettingsTab = 'details' | 'settings' | 'bulk-equipment'

type Props = {
    site: Site
    equipment: Equipment[]
    busy: boolean
    error: string
    bulkImportAllowed: boolean
    onSaveDetails: (name: string, address: string) => Promise<void>
    onSaveSettings: (profile: MaintenanceProfile, equipmentIds: string[]) => Promise<void>
    onDetailsComplete: (name: string) => void
    onSettingsComplete: () => void
    onOpenBulkImport: () => void
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

export default function SiteSettingsDrawer({
    site,
    equipment,
    busy,
    error,
    bulkImportAllowed,
    onSaveDetails,
    onSaveSettings,
    onDetailsComplete,
    onSettingsComplete,
    onOpenBulkImport,
    onClose,
}: Props) {
    const [activeTab, setActiveTab] = useState<SiteSettingsTab>('details')
    const [name, setName] = useState(site.gr_name)
    const [address, setAddress] = useState(site.gr_address ?? '')
    const [savedDetails, setSavedDetails] = useState({ name: site.gr_name, address: site.gr_address ?? '' })
    const [profile, setProfile] = useState<MaintenanceProfile>(
        site.gr_defaultmaintenanceprofile ?? MAINTENANCE_PROFILES.STANDARD,
    )
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [confirming, setConfirming] = useState(false)
    const [localError, setLocalError] = useState('')
    const [detailsSuccess, setDetailsSuccess] = useState('')

    const sortedEquipment = useMemo(() => [...equipment].sort((left, right) =>
        equipmentLabel(left).localeCompare(equipmentLabel(right), undefined, { numeric: true }),
    ), [equipment])
    const selected = sortedEquipment.filter((item) => selectedIds.includes(item.gr_equipmentid))
    const detailsDirty = name.trim() !== savedDetails.name.trim() || address.trim() !== savedDetails.address.trim()

    const saveDetails = async (event: FormEvent) => {
        event.preventDefault()
        const normalizedName = name.trim()
        if (!normalizedName) {
            setLocalError('Enter a Site name.')
            return
        }
        setLocalError('')
        setDetailsSuccess('')
        try {
            await onSaveDetails(normalizedName, address.trim())
            setSavedDetails({ name: normalizedName, address: address.trim() })
            setDetailsSuccess('Site changes saved to Dataverse.')
            onDetailsComplete(normalizedName)
        } catch (caught) {
            setLocalError(caught instanceof Error ? caught.message : 'Site changes could not be saved. Please try again.')
        }
    }

    const saveSettings = async () => {
        setLocalError('')
        try {
            await onSaveSettings(profile, selectedIds)
            setConfirming(false)
            onSettingsComplete()
        } catch (caught) {
            setLocalError(caught instanceof Error ? caught.message : 'Site maintenance settings could not be saved.')
        }
    }

    const requestSettingsSave = () => {
        if (selectedIds.length) setConfirming(true)
        else void saveSettings()
    }

    const requestClose = () => {
        if (busy) return
        if (detailsDirty && !window.confirm('Discard unsaved Site changes?')) return
        onClose()
    }

    const tabs = [
        { id: 'details' as const, label: 'Details', hasError: activeTab === 'details' && Boolean(localError) },
        { id: 'settings' as const, label: 'Settings', hasError: activeTab === 'settings' && Boolean(localError || error) },
        ...(bulkImportAllowed ? [{ id: 'bulk-equipment' as const, label: 'Bulk Add Equipment' }] : []),
    ]

    return <>
        <EditDrawerShell
            eyebrow={site.gr_name}
            title="Site Settings"
            busy={busy}
            onClose={requestClose}
            footer={<>
                <span>{activeTab === 'settings'
                    ? `${selectedIds.length} machine${selectedIds.length === 1 ? '' : 's'} selected for update`
                    : activeTab === 'bulk-equipment'
                        ? 'Customer and Site will be selected automatically.'
                        : detailsSuccess || 'Site name and address changes save to Dataverse.'}</span>
                <div className="site-maintenance-footer-actions">
                    <button type="button" onClick={requestClose} disabled={busy}>Cancel</button>
                    {activeTab === 'details' && <button type="submit" form="site-settings-details-form" className="primary" disabled={busy || !detailsDirty}>Save changes</button>}
                    {activeTab === 'settings' && <button type="button" className="primary" onClick={requestSettingsSave} disabled={busy}>Save settings</button>}
                    {activeTab === 'bulk-equipment' && <button type="button" className="primary" onClick={onOpenBulkImport}>Open bulk add</button>}
                </div>
            </>}
        >
            <DrawerTabs tabs={tabs} activeTab={activeTab} onChange={(tab) => { setLocalError(''); setActiveTab(tab) }} ariaLabel="Site settings sections" />

            <div role="tabpanel" aria-labelledby="drawer-tab-details" hidden={activeTab !== 'details'}>
                <form id="site-settings-details-form" onSubmit={saveDetails}>
                    <EditDrawerSection title="Site details">
                        <div className="site-settings-fields">
                            <label>Site name<input autoFocus value={name} aria-invalid={!name.trim()} onChange={(event) => { setName(event.target.value); setDetailsSuccess(''); setLocalError('') }} /></label>
                            <label>Address<input value={address} onChange={(event) => { setAddress(event.target.value); setDetailsSuccess('') }} /></label>
                        </div>
                    </EditDrawerSection>
                </form>
            </div>

            <div role="tabpanel" aria-labelledby="drawer-tab-settings" hidden={activeTab !== 'settings'}>
                <section className="site-maintenance-setting">
                    <label htmlFor="site-default-maintenance-profile">Default Maintenance Profile</label>
                    <select id="site-default-maintenance-profile" value={profile} onChange={(event) => setProfile(Number(event.target.value) as MaintenanceProfile)} disabled={busy}>
                        {profileOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <p>New Equipment at this Site will inherit this profile. Existing Equipment is unchanged unless selected below.</p>
                </section>
                <section className="site-maintenance-bulk" aria-labelledby="site-maintenance-bulk-heading">
                    <div className="site-maintenance-section-heading">
                        <div><h3 id="site-maintenance-bulk-heading">Apply to existing Equipment</h3><p>Choose only the machines whose current profile should be replaced.</p></div>
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
                    {selected.length > 0 && <ul className="site-maintenance-selected">{selected.map((item) => <li key={item.gr_equipmentid}>
                        <span><strong>{equipmentLabel(item)}</strong><small>{[item.gr_make, item.gr_model].filter(Boolean).join(' · ') || 'No machine details'} · Current: {profileLabel(item.gr_maintenanceprofile)}</small></span>
                        <button type="button" onClick={() => setSelectedIds((current) => current.filter((id) => id !== item.gr_equipmentid))} disabled={busy}>Remove</button>
                    </li>)}</ul>}
                </section>
            </div>

            <div role="tabpanel" aria-labelledby="drawer-tab-bulk-equipment" hidden={activeTab !== 'bulk-equipment'} className="site-settings-bulk-launch">
                <h3>Bulk Add Equipment</h3>
                <p>Paste, validate, review, correct, and import Equipment using the existing bulk-add workflow. The destination is already set to <strong>{site.gr_name}</strong>.</p>
            </div>
            {(localError || error) && <p className="site-maintenance-error" role="alert">{localError || error}</p>}
        </EditDrawerShell>

        {confirming && <EditDrawerConfirmation
            eyebrow="Confirm profile update"
            title={`Apply ${profileLabel(profile)} to ${selected.length} machine${selected.length === 1 ? '' : 's'}?`}
            message="This replaces the Maintenance Profile on the selected Equipment. Service plans, maintenance history, and all other Equipment settings remain unchanged."
            error={localError || error}
            isBusy={busy}
            confirmLabel={busy ? 'Applying…' : 'Apply and save'}
            onCancel={() => { if (!busy) setConfirming(false) }}
            onConfirm={() => void saveSettings()}
        />}
    </>
}
