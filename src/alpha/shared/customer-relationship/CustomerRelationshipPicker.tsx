import { useState } from 'react'
import { deriveSiteNameFromAddress } from '../siteName'
import VerifiedAddressField from '../../jobs/components/VerifiedAddressField'
import type { VerifiedAddressSuggestion } from '../../jobs/services/addressSearchApi'
import SearchableSelect from '../searchable-select/SearchableSelect'
import './CustomerRelationshipPicker.css'

export type CustomerRelationshipOption = {
    id: string
    label: string
    secondary?: string
}

type Props = {
    id: string
    required?: boolean
    error?: string
    query: string
    selectedId?: string
    options: CustomerRelationshipOption[]
    onQueryChange: (query: string) => void
    onClearSelection: () => void
    onSelect: (id: string) => void
    onOpenChange?: (open: boolean) => void
    onCreateCustomerAndSite?: (input: { customerName: string; siteName: string; address: string }) => Promise<void>
    onCreateOpenChange?: (open: boolean) => void
    createDescription?: string
    createActionLabel?: string
    searchStatus?: 'idle' | 'loading' | 'error'
    searchError?: string
    onRetrySearch?: () => void
    emptyLabel?: string
}

export default function CustomerRelationshipPicker({
    id,
    required = false,
    error,
    query,
    selectedId = '',
    options,
    onQueryChange,
    onClearSelection,
    onSelect,
    onOpenChange,
    onCreateCustomerAndSite,
    onCreateOpenChange,
    createDescription = 'Create both records together and select them.',
    createActionLabel = 'Create customer and site',
    searchStatus = 'idle',
    searchError = 'Customer search is temporarily unavailable.',
    onRetrySearch,
    emptyLabel = 'No customers found',
}: Props) {
    const [creating, setCreating] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [createError, setCreateError] = useState('')
    const [draft, setDraft] = useState({ customerName: '', siteName: '', address: '' })
    const [addressSelection, setAddressSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const openCreate = () => {
        setDraft({ customerName: query.trim(), siteName: '', address: '' })
        setAddressSelection(null)
        setCreateError('')
        setCreating(true)
        onCreateOpenChange?.(true)
    }

    const cancelCreate = () => {
        setCreating(false)
        onCreateOpenChange?.(false)
        setCreateError('')
        setAddressSelection(null)
    }

    const create = async () => {
        const customerName = draft.customerName.trim()
        const siteName = draft.siteName.trim() || deriveSiteNameFromAddress(draft.address)
        if (!customerName) return setCreateError('Enter a customer name.')
        if (!addressSelection || addressSelection.formattedAddress !== draft.address) {
            return setCreateError('Select a verified address from the suggestions.')
        }
        if (!siteName) return setCreateError('Enter a Site Name, or an Address that can be used to generate one.')
        if (!onCreateCustomerAndSite) return
        try {
            setIsSaving(true)
            setCreateError('')
            await onCreateCustomerAndSite({ customerName, siteName, address: draft.address })
            onQueryChange(customerName)
            setDraft({ customerName: '', siteName: '', address: '' })
            setAddressSelection(null)
            setCreating(false)
            onCreateOpenChange?.(false)
        } catch (error) {
            setCreateError(error instanceof Error ? error.message : 'The customer or site could not be created.')
        } finally {
            setIsSaving(false)
        }
    }

    const selectedOption = options.find((option) => option.id === selectedId)

    return <div className="customer-relationship-picker">
        <SearchableSelect
            id={id}
            label="Customer"
            required={required}
            error={error}
            value={selectedId}
            options={options.map((option) => ({ value: option.id, label: option.label, secondary: option.secondary }))}
            onChange={(nextId) => {
                if (!nextId) {
                    onClearSelection()
                    onQueryChange('')
                    return
                }
                const option = options.find((candidate) => candidate.id === nextId)
                onSelect(nextId)
                if (option) onQueryChange(option.label)
            }}
            placeholder="No customer selected"
            searchPlaceholder="Search customers"
            emptyLabel={emptyLabel}
            isSearching={searchStatus === 'loading'}
            searchError={searchStatus === 'error' ? searchError : ''}
            onRetrySearch={onRetrySearch}
            onSearchChange={(nextQuery) => {
                onQueryChange(nextQuery)
                if (nextQuery && selectedId) onClearSelection()
            }}
            onOpenChange={(nextOpen) => {
                onOpenChange?.(nextOpen)
                if (!nextOpen && selectedOption) onQueryChange(selectedOption.label)
            }}
            menuAction={onCreateCustomerAndSite ? { label: '+ Add new customer', onSelect: openCreate } : undefined}
        />

        {creating && <section className="customer-relationship-create">
            <div><h4>New customer and site</h4><p>{createDescription}</p></div>
            <label><span>Customer name</span><input autoFocus value={draft.customerName} onChange={(event) => setDraft((current) => ({ ...current, customerName: event.target.value }))} /></label>
            <label><span>Site name</span><input value={draft.siteName} onChange={(event) => setDraft((current) => ({ ...current, siteName: event.target.value }))} /></label>
            <VerifiedAddressField value={draft.address} onChange={(address, selection) => {
                const previousDerived = deriveSiteNameFromAddress(draft.address)
                const nextDerived = selection?.siteName || deriveSiteNameFromAddress(address)
                setAddressSelection(selection)
                setCreateError('')
                setDraft((current) => ({
                    ...current,
                    address,
                    siteName: !current.siteName.trim() || current.siteName === previousDerived ? nextDerived : current.siteName,
                }))
            }} />
            {draft.siteName && draft.siteName === deriveSiteNameFromAddress(draft.address) && <p>Site Name generated from address.</p>}
            {createError && <p className="customer-relationship-error" role="alert">{createError}</p>}
            <div className="customer-relationship-actions">
                <button type="button" onClick={cancelCreate} disabled={isSaving}>Cancel</button>
                <button type="button" className="primary" onClick={() => void create()} disabled={isSaving || !addressSelection || addressSelection.formattedAddress !== draft.address}>{isSaving ? 'Saving…' : createActionLabel}</button>
            </div>
        </section>}
    </div>
}
