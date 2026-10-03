import { useState } from 'react'
import { deriveSiteNameFromAddress } from '../../shared/siteName'
import type { VerifiedAddressSuggestion } from '../services/addressSearchApi'
import VerifiedAddressField from './VerifiedAddressField'

export type JobSiteCreateInput = { name: string; address: string }

type Props = {
    customerName: string
    description?: string
    onCreate: (input: JobSiteCreateInput) => Promise<void>
    onCancel: () => void
}

// The existing Jobs inline Site form, shared with the Equipment location editor.
// Callers own permissions, persistence and selection; this panel only collects verified details.
export default function JobSiteCreatePanel({ customerName, description, onCreate, onCancel }: Props) {
    const [site, setSite] = useState({ name: '', address: '' })
    const [addressSelection, setAddressSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const verified = Boolean(addressSelection && addressSelection.formattedAddress === site.address)
    const create = async () => {
        if (saving) return
        if (!verified) return setError('Select a verified address from the suggestions.')
        const name = site.name.trim() || deriveSiteNameFromAddress(site.address)
        if (!name) return setError('Enter a Site name.')
        setSaving(true)
        setError('')
        try { await onCreate({ name, address: site.address.trim() }) }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Site could not be created.') }
        finally { setSaving(false) }
    }
    return <div className="job-edit-create-panel job-edit-field-wide">
        <div><h4>New site</h4><p>Create a site for <strong>{customerName}</strong>.</p>{description && <p>{description}</p>}</div>
        <label className="job-edit-field"><span>Site name</span><input autoFocus disabled={saving} value={site.name} onChange={(event) => setSite({ ...site, name: event.target.value })} /></label>
        <VerifiedAddressField value={site.address} disabled={saving} onChange={(address, selection) => {
            const previousDerived = deriveSiteNameFromAddress(site.address)
            const nextDerived = selection?.siteName || deriveSiteNameFromAddress(address)
            setAddressSelection(selection)
            setError('')
            setSite({ address, name: !site.name.trim() || site.name === previousDerived ? nextDerived : site.name })
        }} />
        {site.name && site.name === deriveSiteNameFromAddress(site.address) && <p>Site Name generated from address.</p>}
        {error && <p className="job-edit-error" role="alert">{error}</p>}
        <div className="job-edit-create-actions">
            <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
            <button type="button" className="primary" disabled={saving || !verified} onClick={() => void create()}>{saving ? 'Creating…' : 'Create site'}</button>
        </div>
    </div>
}
