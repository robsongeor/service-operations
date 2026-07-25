import { useMemo, useState } from 'react'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Customer } from '../jobs/types/customer.types'
import type { Site } from '../jobs/types/site.types'
import EditDrawerConfirmation from '../shared/drawer/EditDrawerConfirmation'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import './EquipmentTransferDrawer.css'

type TransferResult = {
    succeeded: string[]
    failures: Array<{ equipmentId: string; message: string }>
}

type Props = {
    customer: Customer
    site: Site
    equipment: Equipment[]
    busy: boolean
    onTransfer: (equipmentIds: string[], destinationSiteId: string, adoptDestinationProfile: boolean) => Promise<TransferResult>
    onComplete: (count: number) => void
    onClose: () => void
}

const normalize = (value?: string | null) => value?.trim().toLowerCase() ?? ''
const equipmentLabel = (item: Equipment) => item.gr_fleet || item.gr_serial || 'Unnamed equipment'

export default function EquipmentTransferDrawer({ customer, site, equipment, busy, onTransfer, onComplete, onClose }: Props) {
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [confirming, setConfirming] = useState(false)
    const [failures, setFailures] = useState<Array<{ equipmentId: string; message: string }>>([])
    const [transferredCount, setTransferredCount] = useState(0)
    const [submitError, setSubmitError] = useState('')
    const [adoptDestinationProfile, setAdoptDestinationProfile] = useState(site.gr_defaultmaintenanceprofile != null)

    const candidates = useMemo(() => equipment
        .filter((item) => item.gr_Site?.gr_siteid !== site.gr_siteid)
        .sort((left, right) => equipmentLabel(left).localeCompare(equipmentLabel(right), undefined, { numeric: true })),
    [equipment, site.gr_siteid])
    const selected = selectedIds
        .map((equipmentId) => equipment.find((item) => item.gr_equipmentid === equipmentId))
        .filter((item): item is Equipment => Boolean(item))

    const changeSelection = (nextIds: string[]) => {
        setSelectedIds([...new Set(nextIds)])
        setFailures([])
        setSubmitError('')
    }

    const transfer = async () => {
        if (selectedIds.length === 0) return
        setSubmitError('')
        try {
            const result = await onTransfer(selectedIds, site.gr_siteid, adoptDestinationProfile)
            const nextTransferredCount = transferredCount + result.succeeded.length
            setTransferredCount(nextTransferredCount)
            setConfirming(false)
            if (result.failures.length === 0) {
                onComplete(nextTransferredCount)
                return
            }
            setFailures(result.failures)
            setSelectedIds(result.failures.map((failure) => failure.equipmentId))
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'The Equipment transfer could not be started.')
        }
    }

    return <>
        <EditDrawerShell
            eyebrow="Equipment transfer"
            title={`Transfer to ${site.gr_name}`}
            busy={busy}
            onClose={onClose}
            footer={<>
                <span>{selectedIds.length} machine{selectedIds.length === 1 ? '' : 's'} selected</span>
                <div className="equipment-transfer-footer-actions">
                    <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="primary" disabled={busy || selectedIds.length === 0} onClick={() => setConfirming(true)}>
                        {failures.length ? 'Retry failed' : 'Review transfer'}
                    </button>
                </div>
            </>}
        >
            <div className="equipment-transfer-destination">
                <span>Destination</span>
                <strong>{customer.gr_name}</strong>
                <p>{site.gr_name}{site.gr_address ? ` · ${site.gr_address}` : ''}</p>
            </div>
            {transferredCount > 0 && <div className="equipment-transfer-success" role="status">{transferredCount} machine{transferredCount === 1 ? '' : 's'} transferred successfully.</div>}
            {failures.length > 0 && <div className="equipment-transfer-failures" role="alert">
                <strong>{failures.length} transfer{failures.length === 1 ? '' : 's'} failed</strong>
                <ul>{failures.map((failure) => {
                    const item = equipment.find((record) => record.gr_equipmentid === failure.equipmentId)
                    return <li key={failure.equipmentId}><b>{item ? equipmentLabel(item) : failure.equipmentId}</b><span>{failure.message}</span></li>
                })}</ul>
            </div>}
            {submitError && <p className="equipment-transfer-error" role="alert">{submitError}</p>}
            <SearchableSelect
                id="equipment-transfer-selector"
                label="Search existing Equipment"
                value=""
                onChange={() => undefined}
                multiple
                values={selectedIds}
                onValuesChange={changeSelection}
                placeholder="Select Equipment"
                searchPlaceholder="Search fleet, serial, make or model…"
                emptyLabel="No other Equipment matches this search"
                options={candidates.map((item) => ({
                    value: item.gr_equipmentid,
                    label: [equipmentLabel(item), item.gr_make, item.gr_model].filter(Boolean).join(' · '),
                    secondary: `${item.gr_Site?.gr_Customer?.gr_name || 'No current customer'} · ${item.gr_Site?.gr_name || 'No current Site'}`,
                    searchText: normalize([item.gr_fleet, item.gr_serial, item.gr_make, item.gr_model].filter(Boolean).join(' ')),
                }))}
            />
            <section className="equipment-transfer-selected" aria-labelledby="equipment-transfer-selected-heading">
                <div>
                    <h3 id="equipment-transfer-selected-heading">Selected Equipment <span>({selected.length})</span></h3>
                    {selected.length > 0 && <button type="button" onClick={() => changeSelection([])} disabled={busy}>Clear all</button>}
                </div>
                {selected.length === 0 ? <p>No Equipment selected yet.</p> : <ul>{selected.map((item) => <li key={item.gr_equipmentid}>
                    <div>
                        <strong>{equipmentLabel(item)}</strong>
                        <small>{[item.gr_make, item.gr_model, item.gr_serial && `S/N ${item.gr_serial}`].filter(Boolean).join(' · ') || 'No machine details'}</small>
                        <em>{item.gr_Site?.gr_Customer?.gr_name || 'No current customer'} · {item.gr_Site?.gr_name || 'No current Site'}</em>
                    </div>
                    <button type="button" onClick={() => changeSelection(selectedIds.filter((equipmentId) => equipmentId !== item.gr_equipmentid))} disabled={busy} aria-label={`Remove ${equipmentLabel(item)} from transfer`}>Remove</button>
                </li>)}</ul>}
            </section>
            {site.gr_defaultmaintenanceprofile != null && <label className="equipment-transfer-adopt-profile">
                <input
                    type="checkbox"
                    checked={adoptDestinationProfile}
                    onChange={(event) => setAdoptDestinationProfile(event.target.checked)}
                    disabled={busy}
                />
                Apply the destination Site's default Maintenance Profile
            </label>}
        </EditDrawerShell>
        {confirming && <EditDrawerConfirmation
            eyebrow="Confirm Equipment transfer"
            title={`Transfer ${selected.length} machine${selected.length === 1 ? '' : 's'} to ${site.gr_name}?`}
            message={<div className="equipment-transfer-confirmation">
                <p>The Equipment’s current Site will change to <strong>{site.gr_name}</strong>. Historical Jobs will not be changed.</p>
                {adoptDestinationProfile && <p>The destination Site's default Maintenance Profile will also be applied. Other maintenance configuration and history will remain unchanged.</p>}
                <ul>{selected.map((item) => <li key={item.gr_equipmentid}><strong>{equipmentLabel(item)}</strong><span>{item.gr_Site?.gr_Customer?.gr_name || 'No customer'} · {item.gr_Site?.gr_name || 'No Site'}</span></li>)}</ul>
            </div>}
            error={submitError}
            isBusy={busy}
            confirmLabel={busy ? 'Transferring…' : 'Transfer Equipment'}
            onCancel={() => { if (!busy) setConfirming(false) }}
            onConfirm={() => void transfer()}
        />}
    </>
}
