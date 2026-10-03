import { useEffect, useId, useState } from 'react'
import type { Equipment } from '../types/equipment.types'
import { useEquipmentLocation } from '../hooks/useEquipmentLocation'
import JobCustomerField from './JobCustomerField'
import JobSiteContactFields from './JobSiteContactFields'
import JobSiteCreatePanel from './JobSiteCreatePanel'
import JobLocationSummary from './JobLocationSummary'
import './JobEquipmentLocation.css'

type Props = {
    equipment: Equipment
    onLocationChange: (row: Equipment) => void
    onPendingChange: (pending: boolean) => void
    onSavingChange: (saving: boolean) => void
}

// Shared creation-only workflow. Existing Job/Intake history editors keep their recorded location.
export default function JobEquipmentLocation({ equipment, onLocationChange, onPendingChange, onSavingChange }: Props) {
    const location = useEquipmentLocation(equipment, onLocationChange)
    const id = useId()
    const [createFormOpen, setCreateFormOpen] = useState(false)
    const [siteFormOpen, setSiteFormOpen] = useState(false)
    const anyCreateFormOpen = createFormOpen || siteFormOpen
    useEffect(() => { onPendingChange(location.pending || anyCreateFormOpen); return () => onPendingChange(false) }, [location.pending, anyCreateFormOpen, onPendingChange])
    useEffect(() => { onSavingChange(location.saving || location.creatingDestination); return () => onSavingChange(false) }, [location.saving, location.creatingDestination, onSavingChange])
    const site = location.record.gr_Site
    return <section className="job-equipment-location job-edit-field-wide" aria-label="Equipment location">
        {!location.editing ? <JobLocationSummary customer={site?.gr_Customer?.gr_name} site={site?.gr_name} address={site?.gr_address}
            disabled={location.loading} onEdit={location.canMove ? location.edit : undefined} />
            : <fieldset disabled={location.saving || location.creatingDestination || location.loading || !location.canMove}>
            <legend>{site?.gr_Customer ? 'Move equipment' : 'Link equipment to a site'}</legend>
            {!siteFormOpen && <><JobCustomerField id={id} query={location.query} selectedId={location.customer?.gr_customerid ?? ''}
                customers={location.customer ? [location.customer] : []} onSearchCustomers={location.search}
                onQueryChange={location.setQuery} onClearSelection={() => location.chooseCustomer()}
                onSelect={location.chooseCustomer}
                onCreateOpenChange={setCreateFormOpen}
                createDescription="Create a Customer and its first Site. They are saved immediately; the machine moves only when you select Save equipment location."
                onCreateCustomerAndSite={location.canCreateDestination ? location.createDestination : undefined} />
            <JobSiteContactFields customerId={location.customer?.gr_customerid ?? ''} siteId={location.siteId}
                sites={location.sites} siteLoadStatus={location.siteStatus} onRetrySites={location.retrySites}
                onAddSite={location.canCreateDestination && !createFormOpen ? () => setSiteFormOpen(true) : undefined}
                onSiteChange={location.setSiteId} showContact={false} contactId="" contacts={[]} onContactChange={() => undefined} /></>}
            {siteFormOpen && location.customer && <JobSiteCreatePanel customerName={location.customer.gr_name}
                description="The Site is saved immediately. Select Save equipment location afterwards to move the machine."
                onCancel={() => setSiteFormOpen(false)}
                onCreate={async (input) => { await location.createSiteDestination(input); setSiteFormOpen(false) }} />}
            <p>This saves the machine’s current location immediately, even if you cancel the new job. Previous jobs and maintenance settings stay unchanged.</p>
            <div className="job-equipment-location-actions">
                <button type="button" disabled={anyCreateFormOpen} onClick={location.cancel}>Cancel location edit</button>
                <button type="button" className="primary" disabled={anyCreateFormOpen || !location.siteId || location.siteStatus !== 'ready' || !location.record['@odata.etag']}
                    onClick={() => void location.save()}>{location.saving ? 'Saving…' : 'Save equipment location'}</button>
            </div>
        </fieldset>}
        {location.loading && <small role="status">Checking current equipment location…</small>}
        {location.error && <p className="job-edit-error" role="alert">{location.error} <button type="button" disabled={location.saving || location.creatingDestination || anyCreateFormOpen} onClick={location.refresh}>Refresh location</button></p>}
        {location.notice && <small role="status">{location.notice}</small>}
    </section>
}
