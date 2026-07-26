import { useRef, useState } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Mechanic } from '../../jobs/types/mechanic.types'
import SearchableMechanicSelect from '../../jobs/components/SearchableMechanicSelect'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import { formatWofDateOnly } from '../../wof/utils/wofRules'
import {
    filterSiteCheckEquipment,
    siteCheckUnavailableEquipment,
    validateSiteCheckStart,
} from '../domain/siteCheckCalculations'
import { EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS } from '../../equipment/types/equipmentSiteCheckAvailability.types'
import {
    resolveSiteCheckEquipmentScope,
    SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS,
    SITE_CHECK_FREQUENCY_OPTIONS,
    type SiteCheck,
    type SiteCheckSchedule,
} from '../types/siteCheck.types'
import type { StartSiteCheckWorkflowInput } from '../services/siteCheckCreationWorkflow'
import './RunSiteCheckDrawer.css'

type Props = {
    customerName: string
    siteName: string
    siteId: string
    schedule?: SiteCheckSchedule
    equipment: Equipment[]
    selectedEquipmentIds: string[]
    mechanics: Mechanic[]
    busy: boolean
    error: string
    onStart: (input: StartSiteCheckWorkflowInput) => Promise<SiteCheck>
    onComplete: (siteCheck: SiteCheck) => void
    onClose: () => void
}

function equipmentName(item: Equipment) {
    return item.gr_fleet
        || item.gr_serial
        || [item.gr_make, item.gr_model].filter(Boolean).join(' ')
        || 'Unnamed Equipment'
}

export default function RunSiteCheckDrawer({
    customerName,
    siteName,
    siteId,
    schedule,
    equipment,
    selectedEquipmentIds,
    mechanics,
    busy,
    error,
    onStart,
    onComplete,
    onClose,
}: Props) {
    const [technicianId, setTechnicianId] = useState('')
    const [selectorOpen, setSelectorOpen] = useState(false)
    const [localError, setLocalError] = useState('')
    const requestKey = useRef(crypto.randomUUID())
    const startedOn = useRef(new Date().toISOString())
    const frequency = SITE_CHECK_FREQUENCY_OPTIONS.find(
        (option) => option.value === schedule?.gr_frequency,
    )?.label ?? 'Not configured'
    const includedEquipment = filterSiteCheckEquipment(
        equipment,
        schedule?.gr_equipmentscope,
        selectedEquipmentIds,
    )
    const excludedCount = equipment.length - includedEquipment.length
    const unavailableEquipment = siteCheckUnavailableEquipment(
        equipment,
        schedule?.gr_equipmentscope,
        selectedEquipmentIds,
    )
    const inactiveCount = includedEquipment.filter((item) => item.statecode === 1).length
    const scope = SITE_CHECK_EQUIPMENT_SCOPE_OPTIONS.find(
        (option) => option.value === resolveSiteCheckEquipmentScope(schedule?.gr_equipmentscope),
    )?.label ?? 'All equipment'

    const start = async () => {
        const validation = validateSiteCheckStart({
            schedule,
            technicianId,
            equipmentCount: includedEquipment.length,
            requestKey: requestKey.current,
            creationInProgress: busy,
        })
        if (!validation.valid) {
            setLocalError(validation.errors.join(' '))
            return
        }
        setLocalError('')
        try {
            const created = await onStart({
                siteId,
                siteName,
                technicianId,
                requestKey: requestKey.current,
                startedOn: startedOn.current,
            })
            onComplete(created)
        } catch {
            // The hook owns safe error text. Keep the request key for an explicit retry.
        }
    }

    return <EditDrawerShell
        eyebrow="Site Checks"
        title={`Run Site Check — ${siteName}`}
        busy={busy}
        onClose={onClose}
        footer={<>
            <span>{includedEquipment.length} Job{includedEquipment.length === 1 ? '' : 's'} will be created</span>
            <div>
                <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
                <button type="button" className="primary" disabled={busy} onClick={() => void start()}>
                    {busy ? 'Creating…' : 'Create Site Check'}
                </button>
            </div>
        </>}
    >
        {(localError || error) && <p className="run-site-check-error" role="alert">{localError || error}</p>}

        <EditDrawerSection title="Review">
            <dl className="run-site-check-summary">
                <div><dt>Customer</dt><dd>{customerName}</dd></div>
                <div><dt>Site</dt><dd>{siteName}</dd></div>
                <div><dt>Frequency</dt><dd>{frequency}</dd></div>
                <div><dt>Equipment scope</dt><dd>{scope}</dd></div>
                <div><dt>Due date</dt><dd>{formatWofDateOnly(schedule?.gr_nextduedate) || 'Not configured'}</dd></div>
            </dl>
        </EditDrawerSection>

        <EditDrawerSection title="Assigned technician" meta={<span>Required</span>}>
            <p>All generated Jobs will initially be assigned to this technician.</p>
            <SearchableMechanicSelect
                mechanics={mechanics}
                selectedId={technicianId}
                isOpen={selectorOpen}
                isSaving={busy}
                onOpen={() => setSelectorOpen(true)}
                onClose={() => setSelectorOpen(false)}
                onSelect={(id) => {
                    setTechnicianId(id)
                    setSelectorOpen(false)
                    setLocalError('')
                }}
                variant="drawer"
            />
        </EditDrawerSection>

        <EditDrawerSection
            title="Equipment included"
            meta={<span>{includedEquipment.length} included{excludedCount ? ` · ${excludedCount} excluded` : ''}{inactiveCount ? ` · ${inactiveCount} inactive` : ''}</span>}
        >
            <p>The configured Equipment scope is applied again to authoritative data when you create the Site Check. {excludedCount > 0 ? `${excludedCount} Equipment record${excludedCount === 1 ? '' : 's'} excluded.` : ''}</p>
            <ul className="run-site-check-equipment">
                {includedEquipment.map((item) => <li key={item.gr_equipmentid}>
                    <span><strong>{equipmentName(item)}</strong><small>{[item.gr_make, item.gr_model, item.gr_serial && `S/N ${item.gr_serial}`].filter(Boolean).join(' · ')}</small></span>
                    {item.statecode === 1 && <em>Inactive</em>}
                </li>)}
                {includedEquipment.length === 0 && <li className="empty">No Equipment matches this Site Check scope.</li>}
            </ul>
        </EditDrawerSection>
        {unavailableEquipment.length > 0 && <EditDrawerSection
            title="Unavailable Equipment"
            meta={<span>{unavailableEquipment.length} waiting for next occurrence</span>}
        >
            <p>No Job will be created for this occurrence. These machines will be considered again at the next normal Site Check.</p>
            <ul className="run-site-check-equipment">
                {unavailableEquipment.map((item) => <li key={item.gr_equipmentid}>
                    <span><strong>{equipmentName(item)}</strong><small>{[item.gr_make, item.gr_model].filter(Boolean).join(' · ')}</small></span>
                    <em>{EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS.find(
                        (option) => option.value === item.gr_sitecheckavailability,
                    )?.label ?? 'Unavailable'}</em>
                </li>)}
            </ul>
        </EditDrawerSection>}
    </EditDrawerShell>
}
