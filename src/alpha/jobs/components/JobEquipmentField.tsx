import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { equipmentIdentifierSearchValues, parseAlternateFleetNumbers } from '../../equipment/identifiers/alternateFleetNumbers'
import type { Equipment } from '../types/equipment.types'
import { announceExclusiveDropdownOpen, closeWhenAnotherDropdownOpens } from '../../shared/dropdown/exclusiveDropdown'
import './JobDrawer.css'

export type NewJobEquipmentInput = {
    fleet: string
    alternateFleet?: string
    serial: string
    make?: string
    model?: string
}

export type JobEquipmentFieldProps = {
    value: string
    equipmentList: Equipment[]
    customerId?: string
    siteId?: string
    initialEquipmentDraft?: Partial<NewJobEquipmentInput>
    required?: boolean
    error?: string
    createDescription?: string
    createActionLabel?: string
    dependencyStatus?: 'idle' | 'loading' | 'ready' | 'error'
    dependencyError?: string
    onRetryDependencies?: () => void
    onChange: (equipment: Equipment | undefined) => void
    onCreateEquipment: (equipment: NewJobEquipmentInput) => Promise<string>
    onSearchEquipment?: (query: string, context: { customerId?: string; siteId?: string }, signal?: AbortSignal) => Promise<Equipment[]>
    unknownEquipmentOption?: {
        selected: boolean
        label: string
        description: string
        onChange: (selected: boolean) => void
    }
}

const normalizeSearch = (value?: string | null) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() ?? ''

const jobEquipmentLabel = (item: Equipment) => ({
    identifier: item.gr_fleet || (item.gr_serial ? `Serial ${item.gr_serial}` : 'Equipment'),
    model: [item.gr_make, item.gr_model, parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).length
        ? `Also ${parseAlternateFleetNumbers(item.gr_alternatefleetnumbers).join(' · ')}`
        : ''].filter(Boolean).join(' · '),
    location: [item.gr_Site?.gr_Customer?.gr_name, item.gr_Site?.gr_name].filter(Boolean).join(' · '),
})

export default function JobEquipmentField({
    value,
    equipmentList,
    customerId,
    siteId,
    initialEquipmentDraft,
    required = false,
    error = '',
    createDescription,
    createActionLabel = 'Create equipment',
    dependencyStatus = 'idle',
    dependencyError = '',
    onRetryDependencies,
    onChange,
    onCreateEquipment,
    onSearchEquipment,
    unknownEquipmentOption,
}: JobEquipmentFieldProps) {
    const resultsId = useId()
    const rootRef = useRef<HTMLDivElement>(null)
    const initialEquipment = {
        fleet: initialEquipmentDraft?.fleet?.trim() ?? '',
        alternateFleet: initialEquipmentDraft?.alternateFleet?.trim() ?? '',
        serial: initialEquipmentDraft?.serial?.trim() ?? '',
        make: initialEquipmentDraft?.make?.trim() ?? '',
        model: initialEquipmentDraft?.model?.trim() ?? '',
    }
    const selectedFromList = equipmentList.find((item) => item.gr_equipmentid === value)
    const [createdSelection, setCreatedSelection] = useState<Equipment | undefined>()
    const selectedEquipment = selectedFromList ?? (createdSelection?.gr_equipmentid === value ? createdSelection : undefined)
    const hasExactInitialFleetMatch = Boolean(initialEquipment.fleet) && equipmentList.some((item) => normalizeSearch(item.gr_fleet) === normalizeSearch(initialEquipment.fleet))
    const hasExactInitialSerialMatch = Boolean(initialEquipment.serial) && equipmentList.some((item) => normalizeSearch(item.gr_serial) === normalizeSearch(initialEquipment.serial))
    const initialSearch = hasExactInitialFleetMatch ? initialEquipment.fleet : hasExactInitialSerialMatch ? initialEquipment.serial : initialEquipment.fleet || initialEquipment.serial
    const shouldOpenInitialEquipmentCreate = Boolean(initialSearch) && !hasExactInitialFleetMatch && !hasExactInitialSerialMatch && !value
    const [showCreatePanel, setShowCreatePanel] = useState(shouldOpenInitialEquipmentCreate)
    const effectiveCreateDescription = createDescription ?? (initialSearch
        ? 'Prefilled from the invoice. Confirm the details before creating and selecting this equipment.'
        : 'Create and select equipment for this job.')
    const [equipment, setEquipment] = useState(initialEquipment)
    const [equipmentSearch, setEquipmentSearch] = useState(() => selectedEquipment ? jobEquipmentLabel(selectedEquipment).identifier : initialSearch)
    const [searchOpen, setSearchOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)
    const [remoteResults, setRemoteResults] = useState<Equipment[]>([])
    const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [isCreating, setIsCreating] = useState(false)
    const [createError, setCreateError] = useState('')
    const remoteQueryActive = equipmentSearch.trim().length >= 2

    const results = useMemo(() => {
        const query = normalizeSearch(equipmentSearch)
        const records = new Map(equipmentList.map((item) => [item.gr_equipmentid.toLowerCase(), item]))
        if (remoteQueryActive) remoteResults.forEach((item) => records.set(item.gr_equipmentid.toLowerCase(), item))
        return [...records.values()].map((item) => {
            const identifiers = equipmentIdentifierSearchValues(item).map(normalizeSearch)
            const details = [item.gr_make, item.gr_model, item.gr_Site?.gr_Customer?.gr_name, item.gr_Site?.gr_name, item.gr_Site?.gr_address].map(normalizeSearch)
            if (!query) {
                const score = item.gr_Site?.gr_siteid === siteId ? 0 : item.gr_Site?.gr_Customer?.gr_customerid === customerId ? 1 : 2
                return { item, score }
            }
            return { item, score: identifiers.some((entry) => entry.includes(query)) ? 0 : details.some((entry) => entry.includes(query)) ? 1 : 2 }
        }).filter(({ score }) => !query || score < 2)
            .sort((a, b) => a.score - b.score || jobEquipmentLabel(a.item).identifier.localeCompare(jobEquipmentLabel(b.item).identifier))
            .slice(0, 5)
            .map(({ item }) => item)
    }, [customerId, equipmentList, equipmentSearch, remoteQueryActive, remoteResults, siteId])

    useEffect(() => {
        if (!searchOpen || !onSearchEquipment) return
        const query = equipmentSearch.trim()
        if (query.length < 2) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setSearchStatus('loading')
            void onSearchEquipment(query, { customerId: customerId || undefined, siteId: siteId || undefined }, controller.signal)
                .then((rows) => {
                    if (!controller.signal.aborted) {
                        setRemoteResults(rows)
                        setSearchStatus('idle')
                    }
                })
                .catch((caught) => {
                    if (!controller.signal.aborted && !(caught instanceof DOMException && caught.name === 'AbortError')) setSearchStatus('error')
                })
        }, 250)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [customerId, equipmentSearch, onSearchEquipment, searchOpen, siteId])

    useEffect(() => {
        if (!searchOpen) return
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setSearchOpen(false)
        }
        document.addEventListener('mousedown', closeOnOutsideClick, true)
        return () => document.removeEventListener('mousedown', closeOnOutsideClick, true)
    }, [searchOpen])

    useEffect(() => closeWhenAnotherDropdownOpens(resultsId, () => setSearchOpen(false)), [resultsId])

    const openSearch = () => {
        announceExclusiveDropdownOpen(resultsId)
        setSearchOpen(true)
    }

    const select = (item: Equipment) => {
        setEquipmentSearch(jobEquipmentLabel(item).identifier)
        setSearchOpen(false)
        setShowCreatePanel(false)
        unknownEquipmentOption?.onChange(false)
        onChange(item)
    }

    const clear = () => {
        setEquipmentSearch('')
        setSearchOpen(false)
        setCreatedSelection(undefined)
        onChange(undefined)
    }

    const createEquipment = async () => {
        if (!equipment.fleet.trim() && !equipment.alternateFleet.trim() && !equipment.serial.trim()) {
            setCreateError('Enter a primary fleet, alternate fleet, or serial number.')
            return
        }
        try {
            setIsCreating(true)
            setCreateError('')
            const input: NewJobEquipmentInput = {
                fleet: equipment.fleet.trim(),
                alternateFleet: equipment.alternateFleet.trim() || undefined,
                serial: equipment.serial.trim(),
                make: equipment.make.trim() || undefined,
                model: equipment.model.trim() || undefined,
            }
            const equipmentId = await onCreateEquipment(input)
            const created: Equipment = {
                gr_equipmentid: equipmentId,
                gr_fleet: input.fleet || null,
                gr_alternatefleetnumbers: input.alternateFleet || null,
                gr_serial: input.serial || null,
                gr_make: input.make || null,
                gr_model: input.model || null,
            }
            setCreatedSelection(created)
            setEquipmentSearch(jobEquipmentLabel(created).identifier)
            setEquipment({ fleet: '', alternateFleet: '', serial: '', make: '', model: '' })
            setShowCreatePanel(false)
            onChange(created)
        } catch (caught) {
            console.error(caught)
            setCreateError('Equipment could not be created.')
        } finally {
            setIsCreating(false)
        }
    }

    return <div className="job-equipment-field" ref={rootRef}>
        <label className={`job-edit-field job-edit-field-wide job-edit-combobox${error ? ' error' : ''}`}>
            <span>Equipment{required && <span aria-hidden="true"> *</span>}</span>
            {selectedEquipment
                ? <div className="job-equipment-selected"><div><strong>{jobEquipmentLabel(selectedEquipment).identifier}</strong>{jobEquipmentLabel(selectedEquipment).model && <small>{jobEquipmentLabel(selectedEquipment).model}</small>}{jobEquipmentLabel(selectedEquipment).location && <small>{jobEquipmentLabel(selectedEquipment).location}</small>}</div><button type="button" aria-label="Change selected equipment" onClick={clear}>Change</button></div>
                : unknownEquipmentOption?.selected
                    ? <div className="job-equipment-selected unknown"><div><strong>{unknownEquipmentOption.label}</strong><small>{unknownEquipmentOption.description}</small></div><button type="button" aria-label="Change unknown equipment selection" onClick={() => { unknownEquipmentOption.onChange(false); openSearch() }}>Change</button></div>
                : <><input role="combobox" aria-expanded={searchOpen} aria-controls={resultsId} aria-invalid={Boolean(error)} autoComplete="off" placeholder="Search primary or alternate fleet, serial, make or model..." value={equipmentSearch} onFocus={openSearch} onChange={(event) => { setEquipmentSearch(event.target.value); openSearch(); setActiveIndex(0) }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, results.length - 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) } if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); select(results[activeIndex]) } if (event.key === 'Escape') setSearchOpen(false) }} />{searchOpen && <div className="job-edit-results job-equipment-results" id={resultsId} role="listbox">{unknownEquipmentOption ? <button type="button" role="option" aria-selected="false" className="job-edit-add-result job-equipment-unknown-option" onClick={() => { setEquipmentSearch(''); setSearchOpen(false); setShowCreatePanel(false); unknownEquipmentOption.onChange(true) }}><strong>{unknownEquipmentOption.label}</strong><small>{unknownEquipmentOption.description}</small></button> : <button type="button" className="job-edit-add-result" onClick={clear}>No Equipment</button>}<button type="button" className="job-edit-add-result" onClick={() => { setEquipment((current) => ({ ...current, fleet: equipmentSearch.trim() })); setSearchOpen(false); setCreateError(''); setShowCreatePanel(true) }}>+ Add new equipment</button>{results.map((item, index) => { const label = jobEquipmentLabel(item); return <button key={item.gr_equipmentid} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : ''} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(item)}><strong>{label.identifier}</strong>{label.model && <small>{label.model}</small>}{label.location && <small>{label.location}</small>}</button> })}{remoteQueryActive && searchStatus === 'loading' && <span>Searching Equipment…</span>}{remoteQueryActive && searchStatus === 'error' && <span>Equipment search is temporarily unavailable.</span>}{searchStatus !== 'loading' && equipmentSearch.trim() && results.length === 0 && <span>No Equipment found for &quot;{equipmentSearch.trim()}&quot;</span>}</div>}</>}
            {value && dependencyStatus === 'loading' && <small role="status">Refreshing selected Equipment details…</small>}
            {value && dependencyStatus === 'error' && <small className="job-edit-field-error" role="alert">Selected Equipment details are temporarily unavailable. {dependencyError} {onRetryDependencies && <button type="button" onClick={onRetryDependencies}>Try again</button>}</small>}
            {error && <small className="job-edit-field-error" role="alert">{error}</small>}
        </label>
        {showCreatePanel && <div className="job-edit-create-panel job-edit-field-wide">
            <div><h4>New equipment</h4><p>{effectiveCreateDescription}</p></div>
            <label className="job-edit-field"><span>Fleet number</span><input autoFocus value={equipment.fleet} onChange={(event) => setEquipment({ ...equipment, fleet: event.target.value })} /></label>
            <label className="job-edit-field"><span>Alternate fleet number</span><input value={equipment.alternateFleet} onChange={(event) => setEquipment({ ...equipment, alternateFleet: event.target.value })} /></label>
            <label className="job-edit-field"><span>Serial number</span><input value={equipment.serial} onChange={(event) => setEquipment({ ...equipment, serial: event.target.value })} /></label>
            <label className="job-edit-field"><span>Make</span><input value={equipment.make} onChange={(event) => setEquipment({ ...equipment, make: event.target.value })} /></label>
            <label className="job-edit-field"><span>Model</span><input value={equipment.model} onChange={(event) => setEquipment({ ...equipment, model: event.target.value })} /></label>
            {createError && <p className="job-edit-error" role="alert">{createError}</p>}
            <div className="job-edit-create-actions"><button type="button" onClick={() => setShowCreatePanel(false)} disabled={isCreating}>Cancel</button><button type="button" className="primary" onClick={() => void createEquipment()} disabled={isCreating}>{isCreating ? 'Saving...' : createActionLabel}</button></div>
        </div>}
    </div>
}
