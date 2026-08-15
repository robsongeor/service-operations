import { useEffect, useId, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { searchVerifiedAddresses, type VerifiedAddressSuggestion } from '../services/addressSearchApi'

type Props = {
    value: string
    onChange: (value: string, selection: VerifiedAddressSuggestion | null) => void
    autoFocus?: boolean
    compact?: boolean
    verified?: boolean
}

export default function VerifiedAddressField({ value, onChange, autoFocus, compact = false, verified = false }: Props) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const resultsId = useId()
    const [selection, setSelection] = useState<VerifiedAddressSuggestion | null>(null)
    const [suggestions, setSuggestions] = useState<VerifiedAddressSuggestion[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const query = value.trim()
        if (selection?.formattedAddress === value || (verified && query) || query.length < 3) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setLoading(true)
            setError('')
            void acquireDataverseAccessToken(instance, account)
                .then((token) => searchVerifiedAddresses(token, query, controller.signal))
                .then((results) => { setSuggestions(results); setOpen(true) })
                .catch((reason) => {
                    if (controller.signal.aborted) return
                    setSuggestions([])
                    setError(reason instanceof Error ? reason.message : 'Addresses could not be searched.')
                })
                .finally(() => { if (!controller.signal.aborted) setLoading(false) })
        }, 350)
        return () => { window.clearTimeout(timer); controller.abort() }
    }, [account, instance, selection, value, verified])

    const choose = (suggestion: VerifiedAddressSuggestion) => {
        setSelection(suggestion)
        setSuggestions([])
        setOpen(false)
        setError('')
        onChange(suggestion.formattedAddress, suggestion)
    }

    return <label className={`job-edit-field job-address-field${compact ? ' compact' : ''}`}>
        {!compact && <span>Site address</span>}
        <input
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={resultsId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Start typing a New Zealand address"
            value={value}
            onFocus={() => { if (suggestions.length) setOpen(true) }}
            onChange={(event) => {
                if (event.target.value.trim().length < 3) {
                    setSuggestions([])
                    setOpen(false)
                    setLoading(false)
                }
                setSelection(null)
                setError('')
                onChange(event.target.value, null)
            }}
            onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}
        />
        {loading && <small className="job-address-status" role="status">Searching addresses…</small>}
        {(selection || verified && value.trim()) && <small className="job-address-status verified">Verified with Geoapify</small>}
        {!compact && !loading && !selection && !verified && !error && <small className="job-address-status">Select a suggested address to verify it. Free text cannot be saved.</small>}
        {error && <small className="job-address-status error" role="alert">{error}</small>}
        {open && !loading && value.trim().length >= 3 && <div className="job-edit-results job-address-results" id={resultsId} role="listbox">
            {suggestions.map((suggestion) => <button key={suggestion.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)}>
                <strong>{suggestion.addressLine1 || suggestion.formattedAddress}</strong>
                {suggestion.addressLine1 && <small>{suggestion.addressLine2}</small>}
            </button>)}
            {suggestions.length === 0 && <span>No matching New Zealand addresses found. Refine the search.</span>}
        </div>}
    </label>
}
