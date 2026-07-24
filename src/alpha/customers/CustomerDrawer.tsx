import { type FormEvent, useState } from 'react'
import EditDrawerSection from '../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../shared/drawer/EditDrawerShell'
import './CustomerDrawer.css'

export type CustomerSiteDraft = {
    id: string
    name: string
    address: string
    operatingHours: string
}

export type CustomerDraft = {
    name: string
    accountsContact: string
    accountsPhone: string
    accountsEmail: string
    purchaseOrderRequirements: string
    notes: string
    sites: CustomerSiteDraft[]
}

export type CustomerDrawerTab = 'info' | 'sites'

type Props = {
    mode: 'create' | 'edit'
    initialValue?: CustomerDraft
    initialTab?: CustomerDrawerTab
    initialSiteId?: string
    onClose: () => void
    onSave: (value: CustomerDraft) => Promise<CustomerDraft>
}

const newSite = (): CustomerSiteDraft => ({
    id: `prototype-site-${crypto.randomUUID()}`,
    name: '',
    address: '',
    operatingHours: '',
})

const emptyCustomer = (): CustomerDraft => ({
    name: '',
    accountsContact: '',
    accountsPhone: '',
    accountsEmail: '',
    purchaseOrderRequirements: '',
    notes: '',
    sites: [newSite()],
})

export default function CustomerDrawer({ mode, initialValue, initialTab = 'info', initialSiteId, onClose, onSave }: Props) {
    const [savedDraft, setSavedDraft] = useState<CustomerDraft>(() => initialValue ?? emptyCustomer())
    const [draft, setDraft] = useState<CustomerDraft>(savedDraft)
    const [activeTab, setActiveTab] = useState<CustomerDrawerTab>(initialTab)
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saveSuccess, setSaveSuccess] = useState('')
    const [errors, setErrors] = useState<{
        customerName?: string
        accountsEmail?: string
        siteRequirement?: string
        siteNames: Record<string, string>
    }>({ siteNames: {} })

    const updateSite = (id: string, field: keyof Omit<CustomerSiteDraft, 'id'>, value: string) => {
        setDraft((current) => ({
            ...current,
            sites: current.sites.map((site) => site.id === id ? { ...site, [field]: value } : site),
        }))
        if (field === 'name' && errors.siteNames[id]) {
            setErrors((current) => ({
                ...current,
                siteNames: { ...current.siteNames, [id]: '' },
            }))
        }
    }

    const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)

    const requestClose = () => {
        if (isSaving) return
        if (isDirty && !window.confirm('Discard unsaved Customer and Site changes?')) return
        onClose()
    }

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (isSaving || !isDirty) return
        const name = draft.name.trim()
        const accountsEmail = draft.accountsEmail.trim()
        const normalizedSiteNames = draft.sites.map((site) => site.name.trim().replace(/\s+/g, ' ').toLowerCase())
        const nextErrors = {
            customerName: name ? undefined : 'Enter a Customer name.',
            accountsEmail: accountsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountsEmail)
                ? 'Enter a valid accounts email address.'
                : undefined,
            siteRequirement: mode === 'create' && draft.sites.length === 0
                ? 'Add the first Site before creating this Customer.'
                : undefined,
            siteNames: Object.fromEntries(draft.sites.flatMap((site, index) => {
                if (!site.name.trim()) return [[site.id, 'Enter a Site name or remove this Site.']]
                const duplicate = normalizedSiteNames.some((name, otherIndex) =>
                    otherIndex !== index && name === normalizedSiteNames[index],
                )
                return duplicate ? [[site.id, 'A Site with this name already exists for this Customer.']] : []
            })),
        }
        setErrors(nextErrors)

        if (nextErrors.customerName || nextErrors.accountsEmail) {
            setActiveTab('info')
            return
        }
        if (nextErrors.siteRequirement || Object.keys(nextErrors.siteNames).length > 0) {
            setActiveTab('sites')
            return
        }

        const value = {
            name,
            accountsContact: draft.accountsContact.trim(),
            accountsPhone: draft.accountsPhone.trim(),
            accountsEmail: draft.accountsEmail.trim(),
            purchaseOrderRequirements: draft.purchaseOrderRequirements.trim(),
            notes: draft.notes.trim(),
            sites: draft.sites.map((site) => ({
                ...site,
                name: site.name.trim(),
                address: site.address.trim(),
                operatingHours: site.operatingHours.trim(),
            })),
        }

        setIsSaving(true)
        setSaveError('')
        setSaveSuccess('')
        try {
            const savedValue = await onSave(value)
            setDraft(savedValue)
            setSavedDraft(savedValue)
            setSaveSuccess('Site changes saved to Dataverse.')
        } catch (caught) {
            setSaveError(caught instanceof Error ? caught.message : 'Site changes could not be saved. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    const removeSiteFromPrototype = (siteId: string) => {
        // Replace this local removal with an Archive Site workflow when Dataverse is introduced.
        setDraft((current) => ({ ...current, sites: current.sites.filter((site) => site.id !== siteId) }))
        setErrors((current) => ({ ...current, siteNames: Object.fromEntries(Object.entries(current.siteNames).filter(([id]) => id !== siteId)) }))
    }

    const firstError = errors.customerName || errors.accountsEmail || errors.siteRequirement || Object.values(errors.siteNames).find(Boolean)

    return <EditDrawerShell
        eyebrow={mode === 'create' ? 'Customer workspace' : 'Customer account'}
        title={mode === 'create' ? 'New Customer' : draft.name || 'Edit Customer'}
        busy={isSaving}
        onClose={requestClose}
        footer={<>
            <div className="customer-drawer-footer-note">
                {saveError
                    ? <span className="customer-drawer-error" role="alert">{saveError}</span>
                    : firstError
                    ? <span className="customer-drawer-error" role="alert">{firstError}</span>
                    : saveSuccess && !isDirty
                    ? <span className="customer-drawer-success" role="status">{saveSuccess}</span>
                    : <span>{mode === 'edit' ? 'Site name and address changes save to Dataverse.' : 'New Customer creation remains a prototype.'}</span>}
            </div>
            <div className="customer-drawer-footer-actions">
                <button type="button" onClick={requestClose} disabled={isSaving}>Cancel</button>
                <button className="primary" type="submit" form="customer-drawer-form" disabled={isSaving || !isDirty}>
                    {isSaving ? 'Saving...' : mode === 'create' ? 'Create Customer' : 'Save changes'}
                </button>
            </div>
        </>}
    >
        <form id="customer-drawer-form" onSubmit={submit}>
            <div className="customer-drawer-notice">
                <strong>{mode === 'edit' ? 'Site editing' : 'UI prototype'}</strong>
                <span>{mode === 'edit' ? 'Existing Site name and address changes are saved to Dataverse. Customer information remains page-only.' : 'Customer and Site creation changes exist only until this page is refreshed.'}</span>
            </div>

            <nav className="customer-drawer-tabs" aria-label="Customer drawer sections" role="tablist">
                <button type="button" role="tab" aria-selected={activeTab === 'info'} className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>Info</button>
                <button type="button" role="tab" aria-selected={activeTab === 'sites'} className={activeTab === 'sites' ? 'active' : ''} onClick={() => setActiveTab('sites')}>Sites <span>{draft.sites.length}</span></button>
            </nav>

            {activeTab === 'info' && <div className="customer-drawer-tab-panel" role="tabpanel"><EditDrawerSection title="Customer information" meta={<span>{draft.sites.length} {draft.sites.length === 1 ? 'Site' : 'Sites'}</span>}>
                <div className="customer-drawer-fields">
                    <label>
                        Customer name
                        <input autoFocus value={draft.name} onChange={(event) => {
                            setDraft({ ...draft, name: event.target.value })
                            if (errors.customerName) setErrors({ ...errors, customerName: undefined })
                        }} />
                        {errors.customerName && <span className="customer-drawer-field-error" role="alert">{errors.customerName}</span>}
                    </label>
                    <label>Accounts contact<input value={draft.accountsContact} onChange={(event) => setDraft({ ...draft, accountsContact: event.target.value })} /></label>
                    <label>Accounts phone<input type="tel" value={draft.accountsPhone} onChange={(event) => setDraft({ ...draft, accountsPhone: event.target.value })} /></label>
                    <label>Accounts email<input type="email" aria-invalid={Boolean(errors.accountsEmail)} value={draft.accountsEmail} onChange={(event) => {
                        setDraft({ ...draft, accountsEmail: event.target.value })
                        if (errors.accountsEmail) setErrors({ ...errors, accountsEmail: undefined })
                    }} />{errors.accountsEmail && <span className="customer-drawer-field-error" role="alert">{errors.accountsEmail}</span>}</label>
                    <label className="wide">Preferred purchase order requirements<textarea rows={3} value={draft.purchaseOrderRequirements} onChange={(event) => setDraft({ ...draft, purchaseOrderRequirements: event.target.value })} /></label>
                    <label className="wide">Customer notes<textarea rows={5} placeholder="Long-term information that applies to this Customer" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
                </div>
            </EditDrawerSection></div>}

            {activeTab === 'sites' && <div className="customer-drawer-tab-panel" role="tabpanel"><EditDrawerSection
                title="Sites"
                meta={<button className="customer-drawer-add-site" type="button" onClick={() => {
                    setDraft({ ...draft, sites: [...draft.sites, newSite()] })
                    if (errors.siteRequirement) setErrors({ ...errors, siteRequirement: undefined })
                }}>+ Add site</button>}
            >
                {mode === 'create' && <p className={errors.siteRequirement ? 'customer-drawer-site-requirement error' : 'customer-drawer-site-requirement'}>At least one Site is required to create a Customer.</p>}
                {errors.siteRequirement && <p className="customer-drawer-field-error" role="alert">{errors.siteRequirement}</p>}
                {draft.sites.length === 0 ? (
                    <div className="customer-drawer-empty">No sites added yet.</div>
                ) : (
                    <div className="customer-drawer-sites">
                        {draft.sites.map((site, index) => <article key={site.id}>
                            <header>
                                <strong>Site {index + 1}</strong>
                                {(mode === 'create' || site.id.startsWith('prototype-site-')) && <button type="button" onClick={() => removeSiteFromPrototype(site.id)}>Remove</button>}
                            </header>
                            <div className="customer-drawer-fields">
                                <label>Site name<input autoFocus={site.id === initialSiteId} aria-invalid={Boolean(errors.siteNames[site.id])} value={site.name} onChange={(event) => updateSite(site.id, 'name', event.target.value)} />{errors.siteNames[site.id] && <span className="customer-drawer-field-error" role="alert">{errors.siteNames[site.id]}</span>}</label>
                                <label>Address<input value={site.address} onChange={(event) => updateSite(site.id, 'address', event.target.value)} /></label>
                                {mode === 'create' && <label className="wide">Operating hours<textarea rows={3} placeholder="e.g. Monday–Friday, 7:00 am–5:00 pm" value={site.operatingHours} onChange={(event) => updateSite(site.id, 'operatingHours', event.target.value)} /></label>}
                            </div>
                        </article>)}
                    </div>
                )}
            </EditDrawerSection></div>}
        </form>
    </EditDrawerShell>
}
