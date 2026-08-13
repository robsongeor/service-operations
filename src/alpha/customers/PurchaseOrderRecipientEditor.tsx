import { useEffect, useMemo, useState } from 'react'
import SearchableSelect from '../shared/searchable-select/SearchableSelect.tsx'
import { isValidRecipientEmail } from '../jobs/utils/technicianMailto.ts'
import type { CustomerContact } from './customerContact.types.ts'
import { recipientsForScope, resolvePurchaseOrderRecipients } from './purchaseOrderRecipientRules.ts'
import type { PurchaseOrderRecipient, PurchaseOrderRecipientSaveInput } from './purchaseOrderRecipient.types.ts'
import { validateNewPurchaseOrderContact, type NewPurchaseOrderContactInput } from './purchaseOrderContactRules.ts'

type ContactSite = { id: string; name: string }

type Props = {
    customerId: string
    siteId?: string
    contacts: CustomerContact[]
    recipients: PurchaseOrderRecipient[]
    busy: boolean
    error?: string
    sites: ContactSite[]
    onSave: (input: PurchaseOrderRecipientSaveInput, contacts: CustomerContact[]) => Promise<unknown>
    onCreateContact: (input: NewPurchaseOrderContactInput) => Promise<string>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function PurchaseOrderRecipientEditor({ customerId, siteId, contacts, recipients, busy, error, sites, onSave, onCreateContact }: Props) {
    const scopeRows = useMemo(() => recipientsForScope(recipients, customerId, siteId), [customerId, recipients, siteId])
    const inherited = useMemo(() => resolvePurchaseOrderRecipients(recipients, customerId), [customerId, recipients])
    const available = useMemo(() => contacts.filter((contact) => UUID.test(contact.id)
        && isValidRecipientEmail(contact.email)
        && (!siteId || contact.siteIds.some((id) => id.toLowerCase() === siteId.toLowerCase()))), [contacts, siteId])
    const configuredPrimary = scopeRows.find((row) => row.gr_recipientrole === 122830000)?._gr_contact_value ?? ''
    const configuredCc = useMemo(() => scopeRows.filter((row) => row.gr_recipientrole === 122830001)
        .map((row) => row._gr_contact_value), [scopeRows])
    const configuredCcSignature = configuredCc.join(',')
    const realSites = sites.filter((site) => UUID.test(site.id))
    const [override, setOverride] = useState(!siteId || scopeRows.length > 0)
    const [primary, setPrimary] = useState(configuredPrimary)
    const [cc, setCc] = useState(configuredCc)
    const [feedback, setFeedback] = useState('')
    const [createdContacts, setCreatedContacts] = useState<CustomerContact[]>([])
    const [contactPanelOpen, setContactPanelOpen] = useState(false)
    const [creatingContact, setCreatingContact] = useState(false)
    const [contactError, setContactError] = useState('')
    const [newContactRole, setNewContactRole] = useState<'primary' | 'cc'>(configuredPrimary ? 'cc' : 'primary')
    const [newContact, setNewContact] = useState({ siteId: siteId ?? '', name: '', phone: '', email: '' })

    useEffect(() => {
        // Dataverse rows can arrive after the drawer first renders; reset the draft to that authoritative scope.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverride(!siteId || scopeRows.length > 0)
        setPrimary(configuredPrimary)
        setCc(configuredCc)
    }, [configuredCc, configuredCcSignature, configuredPrimary, scopeRows.length, siteId])

    const selectableContacts = [...available, ...createdContacts.filter((created) =>
        !available.some((contact) => contact.id.toLowerCase() === created.id.toLowerCase()))]
    const options = selectableContacts.map((contact) => ({
        value: contact.id,
        label: contact.name,
        secondary: contact.email,
        searchText: `${contact.email ?? ''} ${contact.phone ?? ''}`,
    }))
    const dirty = override !== (!siteId || scopeRows.length > 0)
        || primary !== configuredPrimary || cc.join(',') !== configuredCcSignature

    const save = async () => {
        setFeedback('')
        try {
            await onSave({
                customerId,
                siteId: siteId ?? null,
                primaryContactId: override ? primary : null,
                ccContactIds: override ? cc : [],
            }, selectableContacts)
            setFeedback(siteId && !override ? 'Customer defaults restored for this Site.' : 'PO recipients saved to Dataverse.')
        } catch { /* authoritative error is rendered below */ }
    }

    const createContact = async () => {
        const input = {
            siteId: siteId ?? newContact.siteId,
            name: newContact.name.trim(),
            phone: newContact.phone.trim() || undefined,
            email: newContact.email.trim(),
        }
        setContactError('')
        try {
            validateNewPurchaseOrderContact(input)
        } catch (cause) {
            setContactError(cause instanceof Error ? cause.message : 'Check the new PO contact details.')
            return
        }
        try {
            setCreatingContact(true)
            const contactId = await onCreateContact(input)
            const created = { id: contactId, name: input.name, phone: input.phone, email: input.email, siteIds: input.siteId ? [input.siteId] : [] }
            setCreatedContacts((current) => [...current, created])
            if (newContactRole === 'primary') {
                setPrimary(contactId)
                setCc((current) => current.filter((id) => id !== contactId))
            } else {
                setCc((current) => current.includes(contactId) ? current : [...current, contactId])
            }
            setNewContact({ siteId: siteId ?? '', name: '', phone: '', email: '' })
            setContactPanelOpen(false)
            setFeedback(`${input.name} created and selected as ${newContactRole === 'primary' ? 'the Primary recipient' : 'a CC recipient'}. Save PO recipients to apply the routing.`)
        } catch (cause) {
            console.error(cause)
            setContactError('The PO contact could not be created in Dataverse. Please try again.')
        } finally {
            setCreatingContact(false)
        }
    }

    if (!customerId || customerId.startsWith('prototype-')) return <p>Save this Customer before configuring PO recipients.</p>

    return <div className="po-recipient-editor">
        {siteId && <div className="po-recipient-inheritance">
            <label><input type="radio" name={`po-scope-${siteId}`} checked={!override} disabled={busy} onChange={() => { setOverride(false); setFeedback('') }} /> Use Customer default</label>
            <label><input type="radio" name={`po-scope-${siteId}`} checked={override} disabled={busy} onChange={() => { setOverride(true); setFeedback('') }} /> Use a Site override</label>
            {!override && <p>{inherited.primary
                ? <>Emails will go to <strong>{inherited.primary.gr_Contact?.gr_name}</strong>{inherited.cc.length ? ` with ${inherited.cc.length} CC recipient${inherited.cc.length === 1 ? '' : 's'}.` : '.'}</>
                : 'No Customer default has been configured yet.'}</p>}
        </div>}
        {override && <>
            <SearchableSelect id={`po-primary-${siteId ?? customerId}`} label="Primary PO recipient" value={primary} onChange={(value) => { setPrimary(value); setCc((current) => current.filter((id) => id !== value)); setFeedback('') }} options={options} placeholder="Choose the main email recipient" searchPlaceholder="Search contacts" emptyLabel="No contacts with valid email addresses" required />
            <SearchableSelect id={`po-cc-${siteId ?? customerId}`} label="CC recipients" value="" onChange={() => undefined} multiple values={cc} onValuesChange={(values) => { setCc(values.filter((id) => id !== primary)); setFeedback('') }} options={options.filter((option) => option.value !== primary)} placeholder="Add CC contacts" searchPlaceholder="Search contacts" emptyLabel="No more contacts available" />
            {cc.length > 0 && <ul className="po-recipient-selected">{cc.map((contactId) => {
                const contact = selectableContacts.find((item) => item.id === contactId)
                return <li key={contactId}><span><strong>{contact?.name}</strong><small>{contact?.email}</small></span><button type="button" disabled={busy} onClick={() => setCc((current) => current.filter((id) => id !== contactId))}>Remove</button></li>
            })}</ul>}
            {!contactPanelOpen && <button type="button" className="po-recipient-add-contact" disabled={busy} onClick={() => {
                setContactPanelOpen(true)
                setNewContactRole(primary ? 'cc' : 'primary')
                setContactError('')
            }}>+ Add new PO contact</button>}
            {contactPanelOpen && <div className="po-recipient-create-panel">
                <div><strong>New PO contact</strong><p>Create a Contact in Dataverse and select it for this PO routing.</p></div>
                {!siteId && <label><span>Contact belongs to</span><select value={newContact.siteId} disabled={creatingContact} onChange={(event) => setNewContact((current) => ({ ...current, siteId: event.target.value }))}><option value="">Main customer</option>{realSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select><small>Choose a Site only when this contact is specific to that location.</small></label>}
                <label><span>Contact name *</span><input autoFocus value={newContact.name} disabled={creatingContact} onChange={(event) => setNewContact((current) => ({ ...current, name: event.target.value }))} /></label>
                <label><span>Email *</span><input type="email" value={newContact.email} disabled={creatingContact} onChange={(event) => setNewContact((current) => ({ ...current, email: event.target.value }))} /></label>
                <label><span>Phone</span><input type="tel" value={newContact.phone} disabled={creatingContact} onChange={(event) => setNewContact((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label><span>Use as *</span><select value={newContactRole} disabled={creatingContact} onChange={(event) => setNewContactRole(event.target.value as 'primary' | 'cc')}><option value="primary">Primary recipient</option><option value="cc">CC recipient</option></select></label>
                {contactError && <p className="site-maintenance-error" role="alert">{contactError}</p>}
                <div className="po-recipient-create-actions"><button type="button" disabled={creatingContact} onClick={() => setContactPanelOpen(false)}>Cancel</button><button type="button" className="primary" disabled={creatingContact} onClick={() => void createContact()}>{creatingContact ? 'Creating...' : 'Create and select'}</button></div>
            </div>}
        </>}
        <div className="po-recipient-actions">
            <button type="button" className="primary" disabled={busy || creatingContact || !dirty || (override && !primary)} onClick={() => void save()}>{busy ? 'Saving...' : siteId && !override ? 'Restore Customer default' : 'Save PO recipients'}</button>
            {feedback && <span role="status">{feedback}</span>}
        </div>
        {error && <p className="site-maintenance-error" role="alert">{error}</p>}
        {selectableContacts.length === 0 && !contactPanelOpen && <p>No emailed contacts exist yet. Add a new PO contact here to continue.</p>}
    </div>
}
