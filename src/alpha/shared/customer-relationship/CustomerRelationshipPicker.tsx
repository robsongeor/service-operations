import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
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
    autoFocus?: boolean
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
    createPresentation?: 'modal' | 'drawer'
    createDescription?: string
    createActionLabel?: string
    searchStatus?: 'idle' | 'loading' | 'error'
    searchError?: string
    onRetrySearch?: () => void
    emptyLabel?: string
}

export default function CustomerRelationshipPicker({
    id,
    autoFocus = false,
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
    createPresentation = 'modal',
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
    const createDialogRef = useRef<HTMLElement>(null)
    const createTitleId = useId()
    const openCreate = () => {
        setDraft({ customerName: query.trim(), siteName: '', address: '' })
        setAddressSelection(null)
        setCreateError('')
        setCreating(true)
        onCreateOpenChange?.(true)
    }

    const cancelCreate = () => {
        if (isSaving) return
        setCreating(false)
        onCreateOpenChange?.(false)
        setCreateError('')
        setAddressSelection(null)
    }

    useEffect(() => {
        if (!creating) return
        const frame = requestAnimationFrame(() => createDialogRef.current?.querySelector<HTMLElement>('input, button:not([disabled])')?.focus())
        return () => cancelAnimationFrame(frame)
    }, [creating])

    const handleCreateKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancelCreate()
            return
        }
        if (event.key !== 'Tab') return
        const controls = [...(createDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
            .filter((element) => element.offsetParent !== null)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first || !last) {
            event.preventDefault()
            return
        }
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
        }
        event.stopPropagation()
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
    const createForm = <section ref={createDialogRef} className={`customer-relationship-create${createPresentation === 'drawer' ? ' drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby={createTitleId} tabIndex={-1} onKeyDown={handleCreateKeyDown} onMouseDown={(event) => event.stopPropagation()}>
        <div><h4 id={createTitleId}>New customer and site</h4><p>{createDescription}</p></div>
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
    </section>

    return <div className="customer-relationship-picker">
        <SearchableSelect
            id={id}
            autoFocus={autoFocus}
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

        {creating && (createPresentation === 'drawer'
            ? <><div className="customer-relationship-create-backdrop drawer" role="presentation" onMouseDown={cancelCreate} />{createForm}</>
            : createPortal(<div className="customer-relationship-create-backdrop" role="presentation" onMouseDown={cancelCreate}>{createForm}</div>, document.body))}
    </div>
}
