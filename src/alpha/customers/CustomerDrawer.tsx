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

type Props = {
    mode: 'create' | 'edit'
    initialValue?: CustomerDraft
    onClose: () => void
    onSave: (value: CustomerDraft) => void
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

export default function CustomerDrawer({ mode, initialValue, onClose, onSave }: Props) {
    const [draft, setDraft] = useState<CustomerDraft>(() => initialValue ?? emptyCustomer())
    const [activeTab, setActiveTab] = useState<'info' | 'sites'>('info')
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

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const name = draft.name.trim()
        const accountsEmail = draft.accountsEmail.trim()
        const nextErrors = {
            customerName: name ? undefined : 'Enter a Customer name.',
            accountsEmail: accountsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountsEmail)
                ? 'Enter a valid accounts email address.'
                : undefined,
            siteRequirement: mode === 'create' && draft.sites.length === 0
                ? 'Add the first Site before creating this Customer.'
                : undefined,
            siteNames: Object.fromEntries(draft.sites
                .filter((site) => !site.name.trim())
                .map((site) => [site.id, 'Enter a Site name or remove this Site.'])),
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

        onSave({
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
        })
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
        onClose={onClose}
        footer={<>
            <div className="customer-drawer-footer-note">
                {firstError
                    ? <span className="customer-drawer-error" role="alert">{firstError}</span>
                    : <span>Prototype only — changes are not saved to Dataverse.</span>}
            </div>
            <div className="customer-drawer-footer-actions">
                <button type="button" onClick={onClose}>Cancel</button>
                <button className="primary" type="submit" form="customer-drawer-form">
                    {mode === 'create' ? 'Create Customer' : 'Save changes'}
                </button>
            </div>
        </>}
    >
        <form id="customer-drawer-form" onSubmit={submit}>
            <div className="customer-drawer-notice">
                <strong>UI prototype</strong>
                <span>Customer and site changes exist only until this page is refreshed.</span>
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
                                <button type="button" onClick={() => removeSiteFromPrototype(site.id)}>Remove</button>
                            </header>
                            <div className="customer-drawer-fields">
                                <label>Site name<input aria-invalid={Boolean(errors.siteNames[site.id])} value={site.name} onChange={(event) => updateSite(site.id, 'name', event.target.value)} />{errors.siteNames[site.id] && <span className="customer-drawer-field-error" role="alert">{errors.siteNames[site.id]}</span>}</label>
                                <label>Address<input value={site.address} onChange={(event) => updateSite(site.id, 'address', event.target.value)} /></label>
                                <label className="wide">Operating hours<textarea rows={3} placeholder="e.g. Monday–Friday, 7:00 am–5:00 pm" value={site.operatingHours} onChange={(event) => updateSite(site.id, 'operatingHours', event.target.value)} /></label>
                            </div>
                        </article>)}
                    </div>
                )}
            </EditDrawerSection></div>}
        </form>
    </EditDrawerShell>
}
