import { useId } from 'react'
import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type Props = {
    showSite?: boolean
    showContact?: boolean
    customerId: string
    siteId: string
    contactId: string
    sites: Site[]
    contacts: SiteContact[]
    siteLoadStatus?: LoadStatus
    siteLoadError?: string
    siteError?: string
    locationRequired?: boolean
    address?: string
    addressError?: string
    contactLoadStatus?: LoadStatus
    contactLoadError?: string
    contactDisabledReason?: string
    onSiteChange: (siteId: string) => void
    onContactChange: (contactId: string) => void
    onAddSite?: () => void
    onAddContact?: () => void
    onRetrySites?: () => void
    onRetryContacts?: () => void
}

export default function JobSiteContactFields({
    showSite = true,
    showContact = true,
    customerId,
    siteId,
    contactId,
    sites,
    contacts,
    siteLoadStatus = 'idle',
    siteLoadError = '',
    siteError,
    locationRequired = false,
    address,
    addressError,
    contactLoadStatus = 'idle',
    contactLoadError = '',
    contactDisabledReason = '',
    onSiteChange,
    onContactChange,
    onAddSite,
    onAddContact,
    onRetrySites,
    onRetryContacts,
}: Props) {
    const fieldId = useId()
    const selectedAddress = address ?? sites.find((site) => site.gr_siteid === siteId)?.gr_address ?? ''
    const siteVisible = showSite && Boolean(customerId)
    const contactVisible = showContact && Boolean(customerId && siteId)
    return <>
        {siteVisible && <label className={`job-edit-field job-edit-field-wide${siteError ? ' error' : ''}`}><span>Site{locationRequired && ' *'}</span>
            <select value={siteId} disabled={!customerId} aria-required={locationRequired || undefined}
                aria-invalid={Boolean(siteError) || undefined} aria-describedby={siteError ? `${fieldId}-site-error` : undefined} onChange={(event) => {
                if (event.target.value === '__new__') onAddSite?.()
                else onSiteChange(event.target.value)
            }}>
                <option value="">{customerId ? 'Select site' : 'Select a customer first'}</option>
                {customerId && onAddSite && <option value="__new__">+ Add new site</option>}
                {sites.map((item) => <option key={item.gr_siteid} value={item.gr_siteid}>{item.gr_name} — {item.gr_address}</option>)}
            </select>
            {customerId && siteLoadStatus === 'loading' && <small role="status">Loading Sites for this Customer…</small>}
            {customerId && siteLoadStatus === 'error' && <small className="job-edit-field-error" role="alert">Sites are temporarily unavailable. {siteLoadError} {onRetrySites && <button type="button" onClick={onRetrySites}>Try again</button>}</small>}
            {siteError && <small className="job-edit-field-error" id={`${fieldId}-site-error`} role="alert">{siteError}</small>}
        </label>}

        {siteVisible && locationRequired && <label className={`job-edit-field job-edit-field-wide${addressError ? ' error' : ''}`}>
            <span>Site address *</span>
            <input readOnly value={selectedAddress} placeholder="Filled from the selected site" aria-required="true"
                aria-invalid={Boolean(addressError) || undefined} aria-describedby={`${fieldId}-address-help`} />
            <small id={`${fieldId}-address-help`} className={addressError ? 'job-edit-field-error' : undefined} role={addressError ? 'alert' : undefined}>
                {addressError || (siteId && !selectedAddress.trim() ? 'This site has no address. Choose a site with an address.' : 'The address comes from the selected site.')}
            </small>
        </label>}

        {contactVisible && <label className="job-edit-field job-edit-field-wide"><span>Contact</span>
            <select value={contactId} disabled={!siteId || Boolean(contactDisabledReason)} onChange={(event) => {
                if (event.target.value === '__new__') onAddContact?.()
                else onContactChange(event.target.value)
            }}>
                <option value="">{contactDisabledReason || (siteId ? 'No contact' : 'Select a site first')}</option>
                {siteId && onAddContact && <option value="__new__">+ Add new contact</option>}
                {contacts.map((item) => <option key={item.gr_sitecontactid} value={item.gr_Contact?.gr_contactid ?? ''}>{item.gr_Contact?.gr_name}{item.gr_Contact?.gr_phone ? ` — ${item.gr_Contact.gr_phone}` : ''}</option>)}
            </select>
            {siteId && contactLoadStatus === 'loading' && <small role="status">Loading Contacts for this Site…</small>}
            {siteId && contactLoadStatus === 'error' && <small className="job-edit-field-error" role="alert">Site Contacts are temporarily unavailable. {contactLoadError} {onRetryContacts && <button type="button" onClick={onRetryContacts}>Try again</button>}</small>}
            {contactDisabledReason && <small>{contactDisabledReason}</small>}
        </label>}
    </>
}
