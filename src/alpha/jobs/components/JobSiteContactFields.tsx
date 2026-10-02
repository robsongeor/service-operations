import type { Site } from '../types/site.types'
import type { SiteContact } from '../types/siteContact.types'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type Props = {
    customerId: string
    siteId: string
    contactId: string
    sites: Site[]
    contacts: SiteContact[]
    siteLoadStatus?: LoadStatus
    siteLoadError?: string
    siteError?: string
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
    customerId,
    siteId,
    contactId,
    sites,
    contacts,
    siteLoadStatus = 'idle',
    siteLoadError = '',
    siteError,
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
    return <>
        <label className={`job-edit-field job-edit-field-wide${siteError ? ' error' : ''}`}><span>Site</span>
            <select value={siteId} disabled={!customerId} onChange={(event) => {
                if (event.target.value === '__new__') onAddSite?.()
                else onSiteChange(event.target.value)
            }}>
                <option value="">{customerId ? 'Select site' : 'Select a customer first'}</option>
                {customerId && onAddSite && <option value="__new__">+ Add new site</option>}
                {sites.map((item) => <option key={item.gr_siteid} value={item.gr_siteid}>{item.gr_name} — {item.gr_address}</option>)}
            </select>
            {customerId && siteLoadStatus === 'loading' && <small role="status">Loading Sites for this Customer…</small>}
            {customerId && siteLoadStatus === 'error' && <small className="job-edit-field-error" role="alert">Sites are temporarily unavailable. {siteLoadError} {onRetrySites && <button type="button" onClick={onRetrySites}>Try again</button>}</small>}
            {siteError && <small className="job-edit-field-error" role="alert">{siteError}</small>}
        </label>

        <label className="job-edit-field job-edit-field-wide"><span>Contact</span>
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
        </label>
    </>
}
