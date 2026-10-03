import { useEffect, useId, useRef, useState } from 'react'
import { deriveSiteNameFromAddress } from '../siteName'
import VerifiedAddressField from '../../jobs/components/VerifiedAddressField'
import type { VerifiedAddressSuggestion } from '../../jobs/services/addressSearchApi'
import { announceExclusiveDropdownOpen, closeWhenAnotherDropdownOpens } from '../dropdown/exclusiveDropdown'
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
    const resultsId = useId()
    const rootRef = useRef<HTMLDivElement>(null)
    const [open, setOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [createError, setCreateError] = useState('')
    const [draft, setDraft] = useState({ customerName: '', siteName: '', address: '' })
    const [addressSelection, setAddressSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const setDropdownOpen = (nextOpen: boolean) => {
        if (nextOpen) announceExclusiveDropdownOpen(resultsId)
        setOpen(nextOpen)
        onOpenChange?.(nextOpen)
    }

    useEffect(() => {
        if (!open) return
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false)
                onOpenChange?.(false)
            }
        }
        document.addEventListener('mousedown', closeOnOutsideClick, true)
        return () => document.removeEventListener('mousedown', closeOnOutsideClick, true)
    }, [onOpenChange, open])

    useEffect(() => closeWhenAnotherDropdownOpens(resultsId, () => {
        setOpen(false)
        onOpenChange?.(false)
    }), [onOpenChange, resultsId])

    const openCreate = () => {
        setDraft({ customerName: query.trim(), siteName: '', address: '' })
        setAddressSelection(null)
        setCreateError('')
        setCreating(true)
        onCreateOpenChange?.(true)
        setDropdownOpen(false)
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

    return <div className="customer-relationship-picker" ref={rootRef}>
        <label className="customer-relationship-search" htmlFor={id}>
            <span>Customer{required && ' *'}</span>
            <input
                id={id}
                role="combobox"
                aria-required={required || undefined}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                aria-expanded={open}
                aria-controls={resultsId}
                aria-autocomplete="list"
                autoComplete="off"
                placeholder="Search customers"
                value={query}
                onFocus={() => setDropdownOpen(true)}
                onChange={(event) => {
                    onQueryChange(event.target.value)
                    onClearSelection()
                    setDropdownOpen(true)
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') setDropdownOpen(false)
                    if (event.key === 'Enter' && options[0]) {
                        event.preventDefault()
                        onSelect(options[0].id)
                        setDropdownOpen(false)
                    }
                }}
            />
            {open && <div className="customer-relationship-results" id={resultsId} role="listbox">
                {onCreateCustomerAndSite && <button type="button" className="customer-relationship-add" onMouseDown={(event) => event.preventDefault()} onClick={openCreate}>+ Add new customer</button>}
                {options.map((option) => <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={option.id === selectedId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => { onSelect(option.id); setDropdownOpen(false) }}
                >
                    <strong>{option.label}</strong>
                    {option.secondary && <small>{option.secondary}</small>}
                </button>)}
                {searchStatus === 'loading' && <span>Searching customers…</span>}
                {searchStatus === 'error' && <span>{searchError}</span>}
                {searchStatus === 'error' && onRetrySearch && <button type="button" onClick={onRetrySearch}>Retry customer search</button>}
                {searchStatus !== 'loading' && searchStatus !== 'error' && options.length === 0 && <span>{emptyLabel}</span>}
            </div>}
        </label>
        {error && <small className="customer-relationship-error" id={`${id}-error`} role="alert">{error}</small>}

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
