import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { searchCustomers } from '../jobs/services/customersApi'
import { fetchCustomerSites } from '../jobs/services/sitesApi'
import { fetchMechanics as fetchStaffDirectory } from '../mechanics/services/mechanicsApi'
import type { Customer } from '../jobs/types/customer.types'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Mechanic } from '../jobs/types/mechanic.types'
import type { Site } from '../jobs/types/site.types'
import type { SiteContact } from '../jobs/types/siteContact.types'
import { fetchSiteContactsForSite } from '../jobs/services/siteContactsApi'
import VerifiedAddressField from '../jobs/components/VerifiedAddressField'
import JobDrawerShell from '../jobs/components/JobDrawerShell'
import JobEquipmentField, { type NewJobEquipmentInput } from '../jobs/components/JobEquipmentField'
import JobSiteContactFields from '../jobs/components/JobSiteContactFields'
import SearchableSelect, { type SearchableSelectOption } from '../shared/searchable-select/SearchableSelect'
import CustomerRelationshipPicker from '../shared/customer-relationship/CustomerRelationshipPicker'
import { announceExclusiveDropdownOpen, closeWhenAnotherDropdownOpens } from '../shared/dropdown/exclusiveDropdown'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import { STAFF_DIRECTORY_QUERY_KEY } from '../shared/data/operationalCollectionKeys'
import { STANDARD_JOB_TYPE_OPTIONS, type JobType } from '../jobs/types/jobType.types'
import { JOB_DESCRIPTION_MAX_LENGTH } from '../jobs/domain/jobDescription'
import { createJobBookIntakeRow, fetchJobBookIntakeRows, fetchRecentJobBookRows, jobBookIntakeContactLookupIsAvailable, updateJobBookIntakeRow, updateManagedJobBookMarker } from './jobBookApi'
import { availableJobBooks, JOB_BOOKS, jobNumberSequence, REGIONAL_JOB_BOOK_ALLOCATION_ENABLED, type JobBookKey } from './jobBookConfig'
import { fetchJobBookEquipmentIndex } from './jobBookEquipmentIndexApi'
import {
    applyEquipmentToRow,
    createBlankJobBookRow,
    isEquipmentConfigured,
    JOB_BOOK_ENTRY_STAGES,
    setEquipmentReviewRequired,
    splitSiteAddress,
    getPromotionReadiness,
    type JobBookRow,
    type PrototypeEquipment,
} from './jobBookPrototype'
import './JobBookPrototypeScreen.css'

type JobBookFilters = {
    search: string
    date: string
    mechanic: string
    equipment: string
    customerSite: string
}

const EMPTY_FILTERS: JobBookFilters = { search: '', date: '', mechanic: '', equipment: '', customerSite: '' }

function appendUniqueRows(current: JobBookRow[], incoming: JobBookRow[]) {
    const byId = new Map(current.map((row) => [row.id, row]))
    incoming.forEach((row) => byId.set(row.id, row))
    return [...byId.values()]
}

type MachineDraft = Omit<PrototypeEquipment, 'id' | 'isLocal'>
const emptyMachineDraft: MachineDraft = {
    fleet: '', serial: '', make: '', model: '', customer: '', customerId: '', site: '', siteId: '', address: '', addressVerified: false, addressNotFoundConfirmed: false,
}

function displayDate(value: string) {
    if (!value) return '—'
    const [year, month, day] = value.split('-')
    return year && month && day ? `${day}/${month}/${year}` : value
}

function addressIsAccepted(record: Pick<JobBookRow, 'address' | 'addressVerified' | 'addressNotFoundConfirmed'>) {
    return !record.address.trim() || record.addressVerified || record.addressNotFoundConfirmed
}

function equipmentIsAccepted(record: Pick<JobBookRow, 'equipmentConfigured' | 'equipmentReviewRequired'>) {
    return record.equipmentConfigured || record.equipmentReviewRequired
}

const ADD_EQUIPMENT_VALUE = '__add-equipment-details__'

function clearEquipmentContext(row: JobBookRow, customerId = '', customer = ''): JobBookRow {
    return {
        ...row,
        equipmentId: '', fleet: '', serial: '', make: '', model: '',
        equipmentConfigured: false, equipmentReviewRequired: false,
        customerId, customer, siteId: '', site: '', contactId: '', contactName: '', address: '',
        addressVerified: false, addressNotFoundConfirmed: false,
    }
}

function applyCustomerSelection(row: JobBookRow, customerId: string, customer: string): JobBookRow {
    if (customerId === row.customerId) return row
    return clearEquipmentContext(row, customerId, customer)
}

function EquipmentPicker({
    id,
    value,
    customerId,
    equipment,
    error,
    onSelect,
    onClear,
    onAdd,
}: {
    id: string
    value: string
    customerId: string
    equipment: PrototypeEquipment[]
    error?: string
    onSelect: (equipment: PrototypeEquipment) => void
    onClear: () => void
    onAdd: () => void
}) {
    const options = useMemo<SearchableSelectOption[]>(() => [
        { value: ADD_EQUIPMENT_VALUE, label: '+ Add machine details', secondary: 'Record Equipment that is not in the picker', emphasized: true },
        ...equipment
            .filter((item) => !customerId || item.customerId === customerId)
            .map((item) => ({
                value: item.id,
                label: item.fleet || item.serial || 'Equipment without an identifier',
                secondary: [item.make, item.model, item.serial && `S/N ${item.serial}`].filter(Boolean).join(' · '),
                searchText: [item.alternateFleetNumbers, item.customer, item.site].filter(Boolean).join(' '),
            })),
    ], [customerId, equipment])

    return <SearchableSelect
        id={id}
        label="Equipment"
        required
        error={error}
        value={value}
        options={options}
        placeholder="Select Equipment"
        searchPlaceholder="Search fleet, alternate or serial"
        emptyLabel="No matching Equipment"
        resultLimit={50}
        onChange={(nextValue) => {
            if (nextValue === ADD_EQUIPMENT_VALUE) { onAdd(); return }
            if (!nextValue) { onClear(); return }
            const selected = equipment.find((item) => item.id === nextValue)
            if (selected) onSelect(selected)
        }}
    />
}

function CustomerPicker({ id, value, customerName, equipment, site, onSearchCustomers, onChange, onCreateCustomerAndSite }: {
    id: string
    value: string
    customerName: string
    equipment: PrototypeEquipment[]
    site: string
    onSearchCustomers: (query: string, signal: AbortSignal) => Promise<Customer[]>
    onChange: (customerId: string, customerName: string) => void
    onCreateCustomerAndSite?: (input: { customerName: string; siteName: string; address: string }) => Promise<void>
}) {
    const [remoteCustomers, setRemoteCustomers] = useState<Customer[]>([])
    const [searchQuery, setSearchQuery] = useState(customerName)
    const [searchAttempt, setSearchAttempt] = useState(0)
    const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')

    useEffect(() => {
        if (!value || !customerName) return
        const timer = window.setTimeout(() => setSearchQuery(customerName), 0)
        return () => window.clearTimeout(timer)
    }, [customerName, value])

    useEffect(() => {
        if (searchAttempt === 0) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setSearchStatus('loading')
            void onSearchCustomers(searchQuery, controller.signal)
                .then((rows) => {
                    if (controller.signal.aborted) return
                    setRemoteCustomers(rows)
                    setSearchStatus('idle')
                })
                .catch((error) => {
                    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                    setSearchStatus('error')
                })
        }, 250)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [onSearchCustomers, searchAttempt, searchQuery])

    const options = useMemo<SearchableSelectOption[]>(() => {
        const byId = new Map<string, SearchableSelectOption>()
        remoteCustomers.forEach((customer) => byId.set(customer.gr_customerid, {
            value: customer.gr_customerid,
            label: customer.gr_name,
        }))
        equipment.forEach((item) => {
            if (item.customerId && item.customer && !byId.has(item.customerId)) byId.set(item.customerId, {
                value: item.customerId,
                label: item.customer,
            })
        })
        if (customerName) byId.set(value || '__saved-customer-text__', {
            value: value || '__saved-customer-text__',
            label: customerName,
            secondary: value ? 'Currently linked Customer' : 'Saved customer text; choose a Customer to link it',
        })
        return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
    }, [customerName, equipment, remoteCustomers, value])

    return <div className="job-book-customer-editor">
        <CustomerRelationshipPicker
            id={id}
            query={searchQuery}
            selectedId={value}
            options={options.map((option) => ({ id: option.value, label: option.label, secondary: option.secondary }))}
            onQueryChange={(query) => {
                setSearchQuery(query)
                setSearchAttempt((current) => current + 1)
            }}
            onClearSelection={() => onChange('', '')}
            onSelect={(nextValue) => {
                const selected = options.find((option) => option.value === nextValue)
                setSearchQuery(selected?.label ?? '')
                onChange(nextValue === '__saved-customer-text__' ? '' : nextValue, selected?.label ?? '')
            }}
            onCreateCustomerAndSite={onCreateCustomerAndSite}
            createDescription="Use this customer and site on the Job Book entry. This does not create master Dataverse records."
            createActionLabel="Use customer and site"
            searchStatus={searchStatus}
            searchError="Customer search failed."
            emptyLabel="No matching Customers"
        />
        {searchStatus === 'error' && <button type="button" className="job-book-inline-retry" onClick={() => setSearchAttempt((current) => current + 1)}>Retry Customer search</button>}
        {site && <small>{site}</small>}
    </div>
}

function MechanicPicker({
    value,
    mechanics,
    onChange,
}: {
    value: string
    mechanics: Mechanic[]
    onChange: (mechanicId: string, mechanicName: string) => void
}) {
    const [query, setQuery] = useState(value)
    const [open, setOpen] = useState(false)
    const dropdownId = useId()
    const rootRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', close, true)
        return () => document.removeEventListener('mousedown', close, true)
    }, [])
    useEffect(() => closeWhenAnotherDropdownOpens(dropdownId, () => setOpen(false)), [dropdownId])
    const openDropdown = () => {
        announceExclusiveDropdownOpen(dropdownId)
        setOpen(true)
    }
    const search = query.trim().toLocaleLowerCase('en-NZ')
    const results = mechanics
        .filter((item) => !search || `${item.gr_name} ${item.gr_email ?? ''}`.toLocaleLowerCase('en-NZ').includes(search))
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
        .slice(0, 20)
    const choose = (id: string, name: string) => {
        setQuery(name)
        onChange(id, name)
        setOpen(false)
    }
    const customName = query.trim()

    return <div className="job-book-mechanic-picker" ref={rootRef}>
        <input
            type="search"
            aria-label="Mechanic or custom entry"
            placeholder="Search staff or type custom"
            value={query}
            onFocus={openDropdown}
            onChange={(event) => { setQuery(event.target.value); openDropdown() }}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && customName) {
                    event.preventDefault()
                    choose('', customName)
                }
                if (event.key === 'Escape') setOpen(false)
            }}
        />
        {open && <div className="job-book-mechanic-menu">
            {customName && <button type="button" className="job-book-custom-mechanic" onClick={() => choose('', customName)}>
                <strong>Use “{customName}”</strong><small>Custom entry, for example outwork</small>
            </button>}
            {results.map((item) => <button type="button" key={item.gr_mechanicid} onClick={() => choose(item.gr_mechanicid, item.gr_name)}>
                <strong>{item.gr_name}</strong><small>{item.gr_email || 'Staff member'}</small>
            </button>)}
            {!results.length && !customName && <p>Start typing to find staff</p>}
        </div>}
    </div>
}

export default function JobBookPrototypeScreen({ allowManagedJobNavigation = true }: { allowManagedJobNavigation?: boolean }) {
    const navigate = useNavigate()
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const jobBooks = useMemo(() => availableJobBooks(), [])
    const [selectedJobBookKey, setSelectedJobBookKey] = useState<JobBookKey>('auckland')
    const selectedJobBook = JOB_BOOKS[selectedJobBookKey]
    const regionalAllocationLocked = selectedJobBookKey !== 'auckland' && !REGIONAL_JOB_BOOK_ALLOCATION_ENABLED
    const getAccessToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const staffDirectoryQuery = useOperationalQuery<Mechanic[]>({
        key: STAFF_DIRECTORY_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: 20_000,
        cacheTimeMs: 5 * 60_000,
        queryFn: async ({ signal }) => fetchStaffDirectory(await getAccessToken(), signal),
    })
    const mechanics = staffDirectoryQuery.data ?? []
    const [recentRows, setRecentRows] = useState<JobBookRow[]>([])
    const [intakeRows, setIntakeRows] = useState<JobBookRow[]>([])
    const [recentNextLink, setRecentNextLink] = useState<string>()
    const [intakeNextLink, setIntakeNextLink] = useState<string>()
    const [loadingMoreRows, setLoadingMoreRows] = useState(false)
    const [pageLoadError, setPageLoadError] = useState('')
    const pageLoadInProgressRef = useRef(false)
    const infiniteScrollSentinelRef = useRef<HTMLDivElement>(null)
    const [draft, setDraft] = useState<JobBookRow>(() => createBlankJobBookRow(0))
    const [equipment, setEquipment] = useState<PrototypeEquipment[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [intakeDrawerOpen, setIntakeDrawerOpen] = useState(false)
    const [editingIntakeRow, setEditingIntakeRow] = useState<JobBookRow | null>(null)
    const [intakeValidationAttempted, setIntakeValidationAttempted] = useState(false)
    const [intakeError, setIntakeError] = useState('')
    const [machineDialogOpen, setMachineDialogOpen] = useState(false)
    const [machineTarget, setMachineTarget] = useState<'draft' | 'edit'>('draft')
    const [editingRow, setEditingRow] = useState<JobBookRow | null>(null)
    const [machineDraft, setMachineDraft] = useState<MachineDraft>(emptyMachineDraft)
    const [machineWarning, setMachineWarning] = useState('')
    const [keepEquipmentUnconfigured, setKeepEquipmentUnconfigured] = useState(false)
    const [filters, setFilters] = useState<JobBookFilters>(EMPTY_FILTERS)
    const [promotionRow, setPromotionRow] = useState<JobBookRow | null>(null)
    const [promotionJobType, setPromotionJobType] = useState<JobType>(STANDARD_JOB_TYPE_OPTIONS[0].value)
    const [savingIntake, setSavingIntake] = useState(false)
    const [savingEntryMarkers, setSavingEntryMarkers] = useState<Set<string>>(() => new Set())
    const [saveError, setSaveError] = useState('')
    const [machineCustomerResults, setMachineCustomerResults] = useState<Customer[]>([])
    const [machineCustomerSearch, setMachineCustomerSearch] = useState('')
    const [machineCustomerSearchAttempt, setMachineCustomerSearchAttempt] = useState(0)
    const [machineCustomerSearchStatus, setMachineCustomerSearchStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [machineSites, setMachineSites] = useState<Site[]>([])
    const [machineSiteLoadAttempt, setMachineSiteLoadAttempt] = useState(0)
    const [machineSiteLoadStatus, setMachineSiteLoadStatus] = useState<'idle' | 'loading' | 'error'>('idle')
    const [intakeSites, setIntakeSites] = useState<Site[]>([])
    const [intakeContacts, setIntakeContacts] = useState<SiteContact[]>([])
    const [intakeSiteLoadStatus, setIntakeSiteLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [intakeSiteLoadError, setIntakeSiteLoadError] = useState('')
    const [intakeSiteLoadAttempt, setIntakeSiteLoadAttempt] = useState(0)
    const [intakeContactLoadStatus, setIntakeContactLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [intakeContactLoadError, setIntakeContactLoadError] = useState('')
    const [intakeContactLoadAttempt, setIntakeContactLoadAttempt] = useState(0)
    const [intakeContactLookupAvailable, setIntakeContactLookupAvailable] = useState(() => jobBookIntakeContactLookupIsAvailable())

    const switchJobBook = (jobBookKey: JobBookKey) => {
        if (jobBookKey === selectedJobBookKey) return
        setRecentRows([])
        setIntakeRows([])
        setRecentNextLink(undefined)
        setIntakeNextLink(undefined)
        setFilters(EMPTY_FILTERS)
        setDraft(createBlankJobBookRow(0, jobBookKey))
        setEditingRow(null)
        setPromotionRow(null)
        setIntakeDrawerOpen(false)
        setEditingIntakeRow(null)
        setSaveError('')
        setPageLoadError('')
        setSelectedJobBookKey(jobBookKey)
    }

    const searchJobBookCustomers = useCallback(async (query: string, signal: AbortSignal) => (
        searchCustomers(await getAccessToken(), query, signal)
    ), [getAccessToken])

    useEffect(() => {
        if (!account) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            setLoadError('')
            try {
                const token = await acquireDataverseAccessToken(instance, account)
                const [equipmentRows, jobPage, intakePage] = await Promise.all([
                    fetchJobBookEquipmentIndex(token, {
                        useDeviceCache: true,
                        onDeviceSnapshot: (cached) => {
                            if (!cancelled) setEquipment((current) => [
                                ...cached,
                                ...current.filter((item) => item.isLocal),
                            ])
                        },
                        onBackgroundRefresh: (fresh) => {
                            if (!cancelled) setEquipment((current) => [
                                ...fresh,
                                ...current.filter((item) => item.isLocal),
                            ])
                        },
                    }),
                    fetchRecentJobBookRows(token, selectedJobBook),
                    fetchJobBookIntakeRows(token, selectedJobBook),
                ])
                if (!cancelled) {
                    setEquipment((current) => [
                        ...equipmentRows,
                        ...current.filter((item) => item.isLocal),
                    ])
                    setRecentRows(jobPage.records)
                    setIntakeRows(intakePage.records)
                    setRecentNextLink(jobPage.nextLink)
                    setIntakeNextLink(intakePage.nextLink)
                    setIntakeContactLookupAvailable(jobBookIntakeContactLookupIsAvailable())
                }
            } catch (error) {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Reference data could not be loaded.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void load()
        return () => { cancelled = true }
    }, [account, instance, selectedJobBook])

    useEffect(() => {
        if (!machineDialogOpen || machineCustomerSearchAttempt === 0 || machineCustomerSearch.trim().length < 2) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setMachineCustomerSearchStatus('loading')
            void searchJobBookCustomers(machineCustomerSearch, controller.signal)
                .then((rows) => {
                    if (controller.signal.aborted) return
                    setMachineCustomerResults(rows)
                    setMachineCustomerSearchStatus('idle')
                })
                .catch((error) => {
                    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                    setMachineCustomerSearchStatus('error')
                })
        }, 250)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [machineCustomerSearch, machineCustomerSearchAttempt, machineDialogOpen, searchJobBookCustomers])

    useEffect(() => {
        if (!machineDialogOpen || !machineDraft.customerId) return
        const customerId = machineDraft.customerId
        const controller = new AbortController()
        void getAccessToken()
            .then((token) => fetchCustomerSites(token, customerId, controller.signal))
            .then((rows) => {
                if (controller.signal.aborted) return
                setMachineSites(rows)
                setMachineSiteLoadStatus('idle')
            })
            .catch((error) => {
                if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                setMachineSiteLoadStatus('error')
            })
        return () => controller.abort()
    }, [getAccessToken, machineDialogOpen, machineDraft.customerId, machineSiteLoadAttempt])

    useEffect(() => {
        const customerId = draft.customerId
        if (!intakeDrawerOpen || !customerId || customerId.startsWith('prototype-')) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIntakeSiteLoadStatus('loading')
            setIntakeSiteLoadError('')
            void getAccessToken()
                .then((token) => fetchCustomerSites(token, customerId, controller.signal))
                .then((rows) => {
                    if (controller.signal.aborted) return
                    setIntakeSites(rows)
                    setIntakeSiteLoadStatus('ready')
                })
                .catch((error) => {
                    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                    setIntakeSiteLoadError(error instanceof Error ? error.message : 'Sites could not be loaded.')
                    setIntakeSiteLoadStatus('error')
                })
        }, 0)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [draft.customerId, getAccessToken, intakeDrawerOpen, intakeSiteLoadAttempt])

    useEffect(() => {
        const siteId = draft.siteId
        if (!intakeDrawerOpen || !intakeContactLookupAvailable || !siteId || siteId.startsWith('prototype-')) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setIntakeContactLoadStatus('loading')
            setIntakeContactLoadError('')
            void getAccessToken()
                .then((token) => fetchSiteContactsForSite(token, siteId, controller.signal))
                .then((rows) => {
                    if (controller.signal.aborted) return
                    setIntakeContacts(rows)
                    setIntakeContactLoadStatus('ready')
                })
                .catch((error) => {
                    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
                    setIntakeContactLoadError(error instanceof Error ? error.message : 'Contacts could not be loaded.')
                    setIntakeContactLoadStatus('error')
                })
        }, 0)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [draft.siteId, getAccessToken, intakeContactLoadAttempt, intakeContactLookupAvailable, intakeDrawerOpen])

    const allRows = useMemo(() => [...intakeRows, ...recentRows]
        .map((row) => {
            const sourceEquipment = equipment.find((item) => item.id.toLowerCase() === row.equipmentId.toLowerCase())
            return {
                ...row,
                make: row.make || sourceEquipment?.make || '',
                model: row.model || sourceEquipment?.model || '',
            }
        })
        .sort((a, b) => jobNumberSequence(b.jobNumber) - jobNumberSequence(a.jobNumber)), [equipment, intakeRows, recentRows])
    const displayedRows = useMemo(() => {
        const includes = (values: Array<string | undefined>, term: string) => !term.trim()
            || values.some((value) => value?.toLocaleLowerCase('en-NZ').includes(term.trim().toLocaleLowerCase('en-NZ')))
        return allRows.filter((row) => {
            if (filters.date && row.date !== filters.date) return false
            if (!includes([row.mechanicName], filters.mechanic)) return false
            if (!includes([row.fleet, row.serial, row.make, row.model], filters.equipment)) return false
            if (!includes([row.customer, row.site, row.address], filters.customerSite)) return false
            return includes([
                row.jobNumber, displayDate(row.date), row.mechanicName, row.fleet, row.serial,
                row.make, row.model, row.customer, row.site, row.address, row.description, row.customerPo,
            ], filters.search)
        })
    }, [allRows, filters])
    const sharedEquipmentList = useMemo<Equipment[]>(() => equipment.map((item) => ({
        gr_equipmentid: item.id,
        gr_fleet: item.fleet || null,
        gr_alternatefleetnumbers: item.alternateFleetNumbers || null,
        gr_serial: item.serial || null,
        gr_make: item.make || null,
        gr_model: item.model || null,
        gr_Site: item.siteId || item.site ? {
            gr_siteid: item.siteId,
            gr_name: item.site,
            gr_address: item.address,
            gr_Customer: item.customerId || item.customer ? { gr_customerid: item.customerId, gr_name: item.customer } : undefined,
        } : undefined,
    })), [equipment])
    const intakeSiteOptions = useMemo<Site[]>(() => {
        if (!draft.siteId || intakeSites.some((site) => site.gr_siteid === draft.siteId)) return intakeSites
        return [{
            gr_siteid: draft.siteId,
            gr_name: draft.site || 'Selected site',
            gr_address: draft.address,
        }, ...intakeSites]
    }, [draft.address, draft.site, draft.siteId, intakeSites])
    const intakeContactOptions = useMemo<SiteContact[]>(() => {
        if (!draft.contactId || intakeContacts.some((link) => link.gr_Contact?.gr_contactid === draft.contactId)) return intakeContacts
        return [{
            gr_sitecontactid: `selected-${draft.contactId}`,
            gr_Contact: { gr_contactid: draft.contactId, gr_name: draft.contactName || 'Selected contact' },
        }, ...intakeContacts]
    }, [draft.contactId, draft.contactName, intakeContacts])
    const mechanicFilterOptions = useMemo(() => [...new Set(allRows.map((row) => row.mechanicName.trim()).filter(Boolean))].sort(), [allRows])
    const customerSiteFilterOptions = useMemo(() => [...new Set(allRows.flatMap((row) => [row.customer.trim(), row.site.trim()]).filter(Boolean))].sort(), [allRows])
    const filtersActive = Object.values(filters).some(Boolean)
    const activeFilterCount = Object.values(filters).filter(Boolean).length
    const hasMoreRows = Boolean(recentNextLink || intakeNextLink)
    const loadMoreRows = useCallback(async () => {
        if (!account || pageLoadInProgressRef.current || (!recentNextLink && !intakeNextLink)) return
        pageLoadInProgressRef.current = true
        setLoadingMoreRows(true)
        setPageLoadError('')
        try {
            const token = await getAccessToken()
            const [jobPage, intakePage] = await Promise.all([
                recentNextLink ? fetchRecentJobBookRows(token, selectedJobBook, recentNextLink) : Promise.resolve(undefined),
                intakeNextLink ? fetchJobBookIntakeRows(token, selectedJobBook, intakeNextLink) : Promise.resolve(undefined),
            ])
            if (jobPage) {
                setRecentRows((current) => appendUniqueRows(current, jobPage.records))
                setRecentNextLink(jobPage.nextLink)
            }
            if (intakePage) {
                setIntakeRows((current) => appendUniqueRows(current, intakePage.records))
                setIntakeNextLink(intakePage.nextLink)
            }
        } catch (error) {
            setPageLoadError(error instanceof Error ? error.message : 'More Job Book entries could not be loaded.')
        } finally {
            pageLoadInProgressRef.current = false
            setLoadingMoreRows(false)
        }
    }, [account, getAccessToken, intakeNextLink, recentNextLink, selectedJobBook])

    useEffect(() => {
        const sentinel = infiniteScrollSentinelRef.current
        if (!sentinel || !hasMoreRows || filtersActive) return
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) void loadMoreRows()
        }, { rootMargin: '500px 0px' })
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [filtersActive, hasMoreRows, loadMoreRows])
    const openMachineDialog = (target: 'draft' | 'edit' = 'draft', sourceOverride?: JobBookRow) => {
        const source = sourceOverride ?? (target === 'edit' && editingRow ? editingRow : draft)
        setMachineTarget(target)
        setMachineDialogOpen(true)
        setMachineDraft({
            fleet: source.fleet, serial: source.serial, make: source.make, model: source.model,
            customer: source.customer, customerId: source.customerId, site: source.site, siteId: source.siteId, address: source.address, addressVerified: source.addressVerified,
            addressNotFoundConfirmed: source.addressNotFoundConfirmed,
        })
        setMachineWarning('')
        setKeepEquipmentUnconfigured(source.equipmentReviewRequired)
        setMachineCustomerSearch(source.customer)
        setMachineCustomerResults(source.customerId && source.customer ? [{ gr_customerid: source.customerId, gr_name: source.customer }] : [])
        setMachineCustomerSearchStatus('idle')
        setMachineCustomerSearchAttempt(source.customer.trim().length >= 2 ? 1 : 0)
        setMachineSites([])
        setMachineSiteLoadStatus(source.customerId ? 'loading' : 'idle')
    }
    const saveMachine = () => {
        const configured = isEquipmentConfigured(machineDraft)
        if (!configured && !keepEquipmentUnconfigured) {
            setMachineWarning('Enter a fleet number or serial number before saving.')
            return
        }
        if (!addressIsAccepted(machineDraft)) {
            setMachineWarning('Select a verified address or confirm that the address was not found.')
            return
        }
        const record: PrototypeEquipment = {
            ...machineDraft,
            id: `prototype-${crypto.randomUUID()}`,
            isLocal: true,
        }
        if (configured) setEquipment((current) => [record, ...current])
        const applyRecord = (row: JobBookRow) => ({
            ...applyEquipmentToRow(row, record),
            equipmentReviewRequired: !configured && keepEquipmentUnconfigured,
        })
        if (machineTarget === 'edit') setEditingRow((current) => current ? applyRecord(current) : current)
        else setDraft((current) => applyRecord(current))
        setMachineDialogOpen(false)
        setMachineDraft(emptyMachineDraft)
        setMachineWarning('')
        setKeepEquipmentUnconfigured(false)
    }
    const submitPrototypeJob = async () => {
        setIntakeValidationAttempted(true)
        if (!equipmentIsAccepted(draft)) {
            setIntakeError('Select Equipment or add the machine details before saving.')
            return
        }
        if (!draft.description.trim()) {
            setIntakeError('Enter a description of the job before saving.')
            return
        }
        if (draft.customerId && !draft.siteId) {
            setIntakeError('Select a Site for the chosen Customer before saving.')
            return
        }
        if (!addressIsAccepted(draft)) {
            setIntakeError('Select a verified address or confirm that the address was not found.')
            return
        }
        if (!account) return
        setSavingIntake(true)
        setIntakeError('')
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            if (editingIntakeRow) {
                const saved = await updateJobBookIntakeRow(token, draft)
                setIntakeRows((current) => current.map((item) => item.intakeRecordId === saved.intakeRecordId ? saved : item))
            } else {
                const created = await createJobBookIntakeRow(token, draft)
                setIntakeRows((current) => [created, ...current])
            }
            setDraft(createBlankJobBookRow(0, selectedJobBookKey))
            setEditingIntakeRow(null)
            setIntakeValidationAttempted(false)
            setIntakeDrawerOpen(false)
        } catch (error) {
            setIntakeError(error instanceof Error ? error.message : 'The Intake entry could not be saved.')
        } finally {
            setSavingIntake(false)
        }
    }
    const closeIntakeDrawer = () => {
        if (savingIntake) return
        setIntakeDrawerOpen(false)
        setEditingIntakeRow(null)
        setIntakeValidationAttempted(false)
        setIntakeError('')
    }
    const openNewIntakeEntry = () => {
        setEditingIntakeRow(null)
        setIntakeError('')
        setIntakeValidationAttempted(false)
        setDraft(createBlankJobBookRow(0, selectedJobBookKey))
        setIntakeDrawerOpen(true)
    }
    const openIntakeEntryEditor = (row: JobBookRow) => {
        if (row.entryStage !== JOB_BOOK_ENTRY_STAGES.INTAKE || !row.intakeRecordId) return
        setEditingIntakeRow(row)
        setIntakeError('')
        setIntakeValidationAttempted(false)
        setDraft({ ...row })
        setIntakeDrawerOpen(true)
    }
    const createLocalIntakeEquipment = async (input: NewJobEquipmentInput) => {
        const id = `prototype-${crypto.randomUUID()}`
        const record: PrototypeEquipment = {
            id,
            fleet: input.fleet,
            alternateFleetNumbers: input.alternateFleet ?? '',
            serial: input.serial,
            make: input.make ?? '',
            model: input.model ?? '',
            customer: draft.customer,
            customerId: draft.customerId,
            site: draft.site,
            siteId: draft.siteId,
            address: draft.address,
            addressVerified: draft.addressVerified,
            addressNotFoundConfirmed: draft.addressNotFoundConfirmed,
            isLocal: true,
        }
        setEquipment((current) => [record, ...current])
        return id
    }
    const selectIntakeEquipment = (item: Equipment | undefined) => {
        setIntakeError('')
        setIntakeSites([])
        setIntakeContacts([])
        if (!item) {
            setDraft((current) => clearEquipmentContext(current, current.customerId, current.customer))
            return
        }
        const source = equipment.find((candidate) => candidate.id === item.gr_equipmentid)
        const selected: PrototypeEquipment = source ?? {
            id: item.gr_equipmentid,
            fleet: item.gr_fleet ?? '',
            alternateFleetNumbers: item.gr_alternatefleetnumbers ?? '',
            serial: item.gr_serial ?? '',
            make: item.gr_make ?? '',
            model: item.gr_model ?? '',
            customer: item.gr_Site?.gr_Customer?.gr_name ?? draft.customer,
            customerId: item.gr_Site?.gr_Customer?.gr_customerid ?? draft.customerId,
            site: item.gr_Site?.gr_name ?? draft.site,
            siteId: item.gr_Site?.gr_siteid ?? draft.siteId,
            address: item.gr_Site?.gr_address ?? draft.address,
            addressVerified: Boolean(item.gr_Site?.gr_address) || draft.addressVerified,
            addressNotFoundConfirmed: draft.addressNotFoundConfirmed,
            isLocal: true,
        }
        setDraft((current) => applyEquipmentToRow(current, selected))
    }
    const selectIntakeSite = (siteId: string) => {
        const selected = intakeSiteOptions.find((site) => site.gr_siteid === siteId)
        setIntakeError('')
        setIntakeContacts([])
        setDraft((current) => ({
            ...current,
            siteId,
            site: selected?.gr_name ?? '',
            address: selected?.gr_address ?? '',
            addressVerified: Boolean(selected?.gr_address),
            addressNotFoundConfirmed: false,
            contactId: '',
            contactName: '',
        }))
    }
    const selectIntakeContact = (contactId: string) => {
        const selected = intakeContactOptions.find((link) => link.gr_Contact?.gr_contactid === contactId)
        setIntakeError('')
        setDraft((current) => ({
            ...current,
            contactId,
            contactName: selected?.gr_Contact?.gr_name ?? '',
        }))
    }
    const persistIntakeRow = async (row: JobBookRow) => {
        if (!account) throw new Error('Sign in before saving Intake changes.')
        const token = await acquireDataverseAccessToken(instance, account)
        const saved = await updateJobBookIntakeRow(token, row)
        setIntakeRows((current) => current.map((item) => item.intakeRecordId === saved.intakeRecordId ? saved : item))
        return saved
    }
    const updateRowField = async <K extends 'entered' | 'timecloudEntered' | 'customerPo'>(row: JobBookRow, field: K, value: JobBookRow[K]) => {
        const updated = { ...row, [field]: value }
        const isEntryMarker = field === 'entered' || field === 'timecloudEntered'
        if (isEntryMarker && savingEntryMarkers.has(row.id)) return
        if (isEntryMarker) setSavingEntryMarkers((current) => new Set(current).add(row.id))
        try {
            if (row.intakeRecordId) {
                setSaveError('')
                try { await persistIntakeRow(updated) }
                catch (error) { setSaveError(error instanceof Error ? error.message : 'The Intake changes were not saved.') }
                return
            }
            if (row.entrySource === 'dataverse-job' && (field === 'entered' || field === 'timecloudEntered')) {
                if (!account) { setSaveError('Sign in before saving Job entry markers.'); return }
                setSaveError('')
                try {
                    const token = await acquireDataverseAccessToken(instance, account)
                    const saved = await updateManagedJobBookMarker(token, row, field, value as boolean)
                    setRecentRows((current) => current.map((item) => item.linkedJobId === row.linkedJobId ? { ...item, ...saved } : item))
                } catch (error) {
                    setSaveError(error instanceof Error ? error.message : 'The Job entry marker was not saved.')
                }
                return
            }
            setSaveError('This row is no longer backed by Dataverse. Reload the page before editing it.')
        } finally {
            if (isEntryMarker) setSavingEntryMarkers((current) => {
                const next = new Set(current)
                next.delete(row.id)
                return next
            })
        }
    }
    const saveEditedRow = async () => {
        if (!editingRow || !editingRow.description.trim() || !addressIsAccepted(editingRow) || !equipmentIsAccepted(editingRow)) return
        if (editingRow.intakeRecordId) {
            setSaveError('')
            try { await persistIntakeRow(editingRow); setEditingRow(null) }
            catch (error) { setSaveError(error instanceof Error ? error.message : 'The Intake changes were not saved.') }
            return
        }
        setSaveError('This row is no longer backed by Dataverse. Reload the page before editing it.')
    }
    const chooseSite = (siteName: string) => {
        const site = machineSites.find((item) => item.gr_name === siteName)
        setMachineDraft((current) => ({
            ...current,
            site: siteName,
            customer: site?.gr_Customer?.gr_name ?? current.customer,
            customerId: site?.gr_Customer?.gr_customerid ?? current.customerId,
            siteId: site?.gr_siteid ?? '',
            address: site?.gr_address ?? current.address,
            addressVerified: Boolean(site?.gr_address ?? current.address),
            addressNotFoundConfirmed: false,
        }))
    }
    const promotionReadiness = promotionRow ? getPromotionReadiness(promotionRow) : null

    return <main className="job-book-screen">
        <header className="job-book-header">
            <div>
                <span className="job-book-eyebrow">LEGACY JOB BOOK</span>
                <h1>{selectedJobBook.label} Job Book</h1>
                <p>View {selectedJobBook.label} managed Jobs and Intake entries in one separate register.</p>
            </div>
            <div className="job-book-header-summary" aria-label="Job Book status">
                <span>{displayedRows.length} shown · {allRows.length} loaded</span>
                <span>{equipment.length.toLocaleString()} equipment</span>
                {loading && <span>Refreshing…</span>}
                {loadError && <span className="job-book-error" title={loadError}>Load warning</span>}
                {staffDirectoryQuery.data === undefined && (staffDirectoryQuery.status === 'initial' || staffDirectoryQuery.status === 'loading') && <span>Loading Staff…</span>}
                {staffDirectoryQuery.data === undefined && staffDirectoryQuery.error && <button type="button" className="job-book-inline-retry" title={staffDirectoryQuery.error.message} onClick={() => void staffDirectoryQuery.refetch().catch(() => undefined)}>Retry Staff</button>}
                <span className="job-book-local-badge">LEGACY VIEW</span>
                <button type="button" className="job-book-new-entry-button" disabled={regionalAllocationLocked} title={regionalAllocationLocked ? 'Available after this regional Job Book is migrated and seeded.' : undefined} onClick={openNewIntakeEntry}>+ New entry</button>
            </div>
        </header>

        <section className="job-book-workspace">
        {jobBooks.length > 1 && <nav className="job-book-region-tabs" aria-label="Job Books">
            {jobBooks.map((book) => <button type="button" key={book.key} className={selectedJobBookKey === book.key ? 'active' : undefined} aria-current={selectedJobBookKey === book.key ? 'page' : undefined} onClick={() => switchJobBook(book.key)}>
                <strong>{book.label}</strong><span>{book.prefix || 'Numbers only'}</span>
            </button>)}
        </nav>}
        {regionalAllocationLocked && <p className="job-book-cutover-notice" role="status"><strong>{selectedJobBook.label} allocation is protected.</strong> Existing entries can be reviewed after migration; new numbers remain disabled until the final seed is verified.</p>}
        {saveError && <p className="job-book-save-error" role="alert">{saveError}</p>}

        <details className="job-book-filter-panel">
            <summary><span>Filters</span>{activeFilterCount > 0 && <strong>{activeFilterCount} active</strong>}</summary>
            <section className="job-book-filterbar" aria-label="Filter Job Book entries">
                <label className="job-book-filter-search"><span>Search all columns</span><input type="search" placeholder="Job number, description, PO, address…" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} /></label>
                <label><span>Date</span><input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} /></label>
                <label><span>Mechanic</span><input type="search" list="job-book-filter-mechanics" placeholder="Search mechanic" value={filters.mechanic} onChange={(event) => setFilters((current) => ({ ...current, mechanic: event.target.value }))} /></label>
                <label><span>Equipment</span><input type="search" placeholder="Fleet, serial, make or model" value={filters.equipment} onChange={(event) => setFilters((current) => ({ ...current, equipment: event.target.value }))} /></label>
                <label><span>Customer / Site</span><input type="search" list="job-book-filter-customer-sites" placeholder="Search customer or site" value={filters.customerSite} onChange={(event) => setFilters((current) => ({ ...current, customerSite: event.target.value }))} /></label>
                <button type="button" disabled={!filtersActive} onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
                <datalist id="job-book-filter-mechanics">{mechanicFilterOptions.map((value) => <option key={value} value={value} />)}</datalist>
                <datalist id="job-book-filter-customer-sites">{customerSiteFilterOptions.map((value) => <option key={value} value={value} />)}</datalist>
            </section>
        </details>

        <section className="job-book-grid-wrap" aria-label={`${selectedJobBook.label} Job Book`}>
            <table className="job-book-grid">
                <thead><tr>
                    <th className="job-number-column">Job Number</th><th className="date-column">Date</th><th className="mechanic-column">Mechanic</th>
                    <th>Equipment</th><th>Customer</th><th className="description-column">Description of the Job</th>
                    <th className="address-column">Site Address</th><th>Customer PO #</th><th className="gt-entry-column">GT Entry</th><th className="timecloud-entry-column">Timecloud Entry</th><th>Actions</th>
                </tr></thead>
                <tbody>{displayedRows.map((row) => {
                    const isEditing = editingRow?.id === row.id
                    const shown = isEditing ? editingRow : row
                    const canSaveEdit = Boolean(shown.description.trim()) && addressIsAccepted(shown) && equipmentIsAccepted(shown)
                    const isIntake = shown.entryStage === JOB_BOOK_ENTRY_STAGES.INTAKE
                    const canUpdateEntryMarkers = Boolean(row.intakeRecordId) || row.entrySource === 'dataverse-job'
                    return <tr key={row.id} className={`${shown.equipmentReviewRequired ? 'equipment-unconfigured ' : ''}${isEditing ? 'job-book-row-editing' : ''}`.trim() || undefined}>
                        <td className="job-number-column"><span className="job-book-number-value"><strong>{shown.jobNumber}</strong>{shown.entryStage === JOB_BOOK_ENTRY_STAGES.PROMOTED && <span className="job-book-managed-indicator" title="Managed Job" aria-label="Managed Job">✓</span>}</span></td>
                        <td className="date-column"><span className="job-book-readonly-date" aria-label="Job creation date">{displayDate(shown.date)}</span></td>
                        <td className="mechanic-column">{isEditing
                            ? <MechanicPicker key={`${shown.id}-${shown.mechanicId}-${shown.mechanicName}`} value={shown.mechanicName} mechanics={mechanics}
                                onChange={(mechanicId, mechanicName) => setEditingRow((current) => current ? { ...current, mechanicId, mechanicName } : current)} />
                            : <span className="job-book-table-value">{shown.mechanicName || '—'}</span>}</td>
                        <td className={isEditing ? `fleet-cell${!equipmentIsAccepted(shown) ? ' job-book-required-missing' : ''}` : undefined}>{isEditing
                            ? shown.equipmentReviewRequired
                                ? <button type="button" className="job-book-unconfigured-link" onClick={() => openMachineDialog('edit')}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                                : <EquipmentPicker id={`job-book-edit-equipment-${shown.id}`} key={`${shown.id}-${shown.equipmentId}`} value={shown.equipmentId} customerId={shown.customerId} equipment={equipment}
                                    onSelect={(item) => setEditingRow((current) => current ? applyEquipmentToRow(current, item) : current)} onClear={() => setEditingRow((current) => current ? clearEquipmentContext(current, current.customerId, current.customer) : current)} onAdd={() => openMachineDialog('edit')} />
                            : shown.equipmentReviewRequired
                                ? <button type="button" className="job-book-unconfigured-link" onClick={() => { setEditingRow(row); openMachineDialog('edit', row) }}><strong>Equipment not configured</strong><small>Click to add Fleet or Serial</small></button>
                                : <span className="job-book-table-value job-book-equipment-value"><strong>{shown.fleet || shown.serial || '—'}</strong>{(shown.make || shown.model) && <small>{[shown.make, shown.model].filter(Boolean).join(' ')}</small>}</span>}</td>
                        <td>{isEditing
                            ? <CustomerPicker id={`job-book-edit-customer-${shown.id}`} value={shown.customerId} customerName={shown.customer} equipment={equipment} site={shown.site}
                                onSearchCustomers={searchJobBookCustomers} onChange={(customerId, customerName) => setEditingRow((current) => current ? applyCustomerSelection(current, customerId, customerName) : current)} />
                            : <span className="job-book-table-value job-book-customer-value"><strong>{shown.customer || '—'}</strong>{shown.site && <small>{shown.site}</small>}</span>}</td>
                        <td className={isEditing && !shown.description.trim() ? 'job-book-required-missing' : undefined}>{isEditing
                            ? <textarea required maxLength={JOB_DESCRIPTION_MAX_LENGTH} aria-label={`Description for Job ${shown.jobNumber} (required)`} placeholder="Required" rows={2} value={shown.description} onChange={(event) => setEditingRow((current) => current ? { ...current, description: event.target.value } : current)} />
                            : <span className="job-book-table-value description">{shown.description || '—'}</span>}</td>
                        <td className={isEditing ? 'job-book-address-cell' : undefined}>{isEditing
                            ? <div className="job-book-address-editor"><VerifiedAddressField compact verified={shown.addressVerified} value={shown.address}
                                onChange={(address, selection) => setEditingRow((current) => current ? { ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false } : current)} />
                                {shown.address.trim() && !shown.addressVerified && <label className="job-book-address-confirm"><input type="checkbox" checked={shown.addressNotFoundConfirmed} onChange={(event) => setEditingRow((current) => current ? { ...current, addressNotFoundConfirmed: event.target.checked } : current)} /><span>Address<br />not found</span></label>}</div>
                            : shown.address
                                ? <span className="job-book-table-value job-book-address-value"><strong>{splitSiteAddress(shown.address).street}</strong>{splitSiteAddress(shown.address).locality && <small>{splitSiteAddress(shown.address).locality}</small>}</span>
                                : <span className="job-book-table-value">—</span>}</td>
                        <td>{isIntake && isEditing
                            ? <input className="job-book-table-edit" aria-label={`Customer PO for Job ${shown.jobNumber}`} value={shown.customerPo} placeholder="Add PO number" onChange={(event) => setEditingRow((current) => current ? { ...current, customerPo: event.target.value } : current)} />
                            : <span className="job-book-table-value">{row.customerPo || '—'}</span>}</td>
                        <td className="gt-entry-column">{canUpdateEntryMarkers ? <label className={`job-book-table-check ${row.entered ? 'complete' : ''}`}><input type="checkbox" aria-label={`GT Entry completed for Job ${row.jobNumber}`} disabled={savingEntryMarkers.has(row.id)} checked={row.entered} onChange={(event) => void updateRowField(row, 'entered', event.target.checked)} />{savingEntryMarkers.has(row.id) ? <span>Saving</span> : row.entered ? <span>Done</span> : null}</label> : <span className="job-book-status-pill">Unavailable</span>}</td>
                        <td className="timecloud-entry-column">{canUpdateEntryMarkers ? <label className={`job-book-table-check ${row.timecloudEntered ? 'complete' : ''}`}><input type="checkbox" aria-label={`Timecloud Entry completed for Job ${row.jobNumber}`} disabled={savingEntryMarkers.has(row.id)} checked={row.timecloudEntered} onChange={(event) => void updateRowField(row, 'timecloudEntered', event.target.checked)} />{savingEntryMarkers.has(row.id) ? <span>Saving</span> : row.timecloudEntered ? <span>Done</span> : null}</label> : <span className="job-book-status-pill">Unavailable</span>}</td>
                        <td>{isEditing
                            ? <div className="job-book-row-actions"><button type="button" className="save" disabled={!canSaveEdit} title={!equipmentIsAccepted(shown) ? 'Select Equipment or explicitly keep it as unconfigured.' : !shown.description.trim() ? 'Enter a Job description before saving.' : !addressIsAccepted(shown) ? 'Select a verified address or confirm it was not found.' : undefined} onClick={() => void saveEditedRow()}>Save changes</button><button type="button" onClick={() => setEditingRow(null)}>Cancel</button></div>
                            : isIntake
                                ? <div className="job-book-row-actions"><button type="button" className="save" onClick={() => setPromotionRow(row)}>Prepare promotion</button><button type="button" onClick={() => openIntakeEntryEditor(row)}>Edit entry</button></div>
                                : allowManagedJobNavigation
                                    ? <button type="button" className="job-book-edit-row" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(shown.linkedJobId)}`)}>Open Job</button>
                                    : <span className="job-book-status-pill">Managed Job</span>}</td>
                    </tr>
                })}</tbody>
            </table>
        </section>
        <div ref={infiniteScrollSentinelRef} className="job-book-page-loader" aria-live="polite">
            {pageLoadError && <span className="job-book-page-error" role="alert">{pageLoadError}</span>}
            {hasMoreRows
                ? <button type="button" onClick={() => void loadMoreRows()} disabled={loadingMoreRows}>
                    {loadingMoreRows ? 'Loading more entries…' : filtersActive ? 'Load more entries to continue searching' : 'Scroll for more entries'}
                </button>
                : !loading && allRows.length > 0 && <span>All available entries loaded</span>}
        </div>
        </section>

        {intakeDrawerOpen && <JobDrawerShell
            eyebrow={`${selectedJobBook.label} Job Book`}
            title={`${editingIntakeRow ? 'Edit' : 'Add'} ${selectedJobBook.label} Job Book entry`}
            className="job-book-intake-drawer"
            busy={savingIntake}
            onClose={closeIntakeDrawer}
            footer={<>
                <span className={intakeError ? 'job-book-intake-save-error' : undefined} role={intakeError ? 'alert' : undefined}>{intakeError || (editingIntakeRow ? `Editing Job Book ${draft.jobNumber}.` : 'A Job number will be assigned after saving.')}</span>
                <div className="job-book-intake-footer-actions">
                    <button type="button" onClick={closeIntakeDrawer} disabled={savingIntake}>Cancel</button>
                    <button type="button" className="primary" onClick={() => void submitPrototypeJob()} disabled={savingIntake}>{savingIntake ? 'Saving…' : editingIntakeRow ? 'Save changes' : 'Add to Job Book'}</button>
                </div>
            </>}
        >
            <div className="job-book-intake-meta"><div><span>Job number</span><strong>{editingIntakeRow ? draft.jobNumber : 'Assigned after saving'}</strong></div><div><span>Entry date</span><strong>{displayDate(draft.date)}</strong></div></div>
            <section className="job-book-intake-section">
                <div className="job-book-intake-section-heading"><h3>Equipment and location</h3><p>Selecting Equipment fills its Customer, Site and address.</p></div>
                <JobEquipmentField
                    value={draft.equipmentId}
                    equipmentList={sharedEquipmentList}
                    customerId={draft.customerId}
                    siteId={draft.siteId}
                    required
                    error={intakeValidationAttempted && !equipmentIsAccepted(draft) ? 'Select Equipment or add new equipment.' : undefined}
                    createDescription="Add the machine details to this Job Book entry. This does not create Equipment in Dataverse."
                    createActionLabel="Use equipment details"
                    onCreateEquipment={createLocalIntakeEquipment}
                    onChange={selectIntakeEquipment}
                    unknownEquipmentOption={{
                        selected: draft.equipmentReviewRequired,
                        label: 'Equipment not known yet',
                        description: 'Save now and match or add the Equipment later.',
                        onChange: (selected) => setDraft((current) => setEquipmentReviewRequired(current, selected)),
                    }}
                />
                <div className="job-book-intake-field"><CustomerPicker id="job-book-drawer-customer" value={draft.customerId} customerName={draft.customer} equipment={equipment} site={draft.site}
                    onSearchCustomers={searchJobBookCustomers}
                    onChange={(customerId, customerName) => {
                        setIntakeSites([])
                        setIntakeContacts([])
                        setDraft((current) => applyCustomerSelection(current, customerId, customerName))
                    }}
                    onCreateCustomerAndSite={async ({ customerName, siteName, address }) => {
                        setIntakeError('')
                        setIntakeSites([])
                        setIntakeContacts([])
                        setDraft((current) => ({
                            ...clearEquipmentContext(current, `prototype-customer-${crypto.randomUUID()}`, customerName),
                            siteId: `prototype-site-${crypto.randomUUID()}`,
                            site: siteName,
                            address,
                            addressVerified: true,
                            addressNotFoundConfirmed: false,
                        }))
                    }} /></div>
                <JobSiteContactFields
                    customerId={draft.customerId}
                    siteId={draft.siteId}
                    contactId={draft.contactId}
                    sites={intakeSiteOptions}
                    contacts={intakeContactOptions}
                    siteLoadStatus={intakeSiteLoadStatus}
                    siteLoadError={intakeSiteLoadError}
                    contactLoadStatus={intakeContactLoadStatus}
                    contactLoadError={intakeContactLoadError}
                    contactDisabledReason={!intakeContactLookupAvailable ? 'Contact setup is pending in Dataverse' : undefined}
                    siteError={intakeValidationAttempted && Boolean(draft.customerId) && !draft.siteId ? 'Select a Site for this Customer.' : undefined}
                    onSiteChange={selectIntakeSite}
                    onContactChange={selectIntakeContact}
                    onRetrySites={() => setIntakeSiteLoadAttempt((current) => current + 1)}
                    onRetryContacts={() => setIntakeContactLoadAttempt((current) => current + 1)}
                />
            </section>
            <section className="job-book-intake-section">
                <div className="job-book-intake-section-heading"><h3>Job details</h3><p>Record what is required and who should attend.</p></div>
                <label className={`job-book-intake-field${intakeValidationAttempted && !draft.description.trim() ? ' error' : ''}`}><span>Description of the job <span className="job-book-required-mark">*</span></span><textarea required maxLength={JOB_DESCRIPTION_MAX_LENGTH} aria-label="Job description (required)" placeholder="Describe the fault or work required" rows={4} value={draft.description} onChange={(event) => { setIntakeError(''); setDraft((current) => ({ ...current, description: event.target.value })) }} />
                    {intakeValidationAttempted && !draft.description.trim() && <small className="job-book-intake-field-error">Enter a description of the job.</small>}</label>
                <div className="job-book-intake-field"><span className="job-book-field-label">Mechanic</span><MechanicPicker key={`${draft.id}-${draft.mechanicId}-${draft.mechanicName}`} value={draft.mechanicName} mechanics={mechanics}
                    onChange={(mechanicId, mechanicName) => setDraft((current) => ({ ...current, mechanicId, mechanicName }))} /></div>
                <label className="job-book-intake-field"><span>Customer PO <small>(optional)</small></span><input aria-label="Customer purchase order" placeholder="Enter a PO number if supplied" value={draft.customerPo} onChange={(event) => setDraft((current) => ({ ...current, customerPo: event.target.value }))} /></label>
            </section>
        </JobDrawerShell>}

        {promotionRow && promotionReadiness && <div className="job-book-dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPromotionRow(null)
        }}>
            <section className="job-book-dialog job-book-promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-dialog-title">
                <header><div><span className="job-book-eyebrow">REVIEWED HANDOFF</span><h2 id="promotion-dialog-title">Prepare Job {promotionRow.jobNumber}</h2></div><button type="button" aria-label="Close" onClick={() => setPromotionRow(null)}>×</button></header>
                <p className="job-book-dialog-note">Promotion will create one managed Job using this allocated number, link it back to this Intake entry, and then mark the entry Promoted.</p>
                <div className="job-book-promotion-summary">
                    <div><span>Equipment</span><strong>{promotionRow.fleet || promotionRow.serial || 'Unconfigured'}</strong></div>
                    <div><span>Customer / Site</span><strong>{[promotionRow.customer, promotionRow.site].filter(Boolean).join(' · ') || 'Not set'}</strong></div>
                    <div><span>Description</span><strong>{promotionRow.description}</strong></div>
                </div>
                <label className="job-book-promotion-type">Managed Job type<select value={promotionJobType} onChange={(event) => setPromotionJobType(Number(event.target.value) as JobType)}>{STANDARD_JOB_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                {!promotionReadiness.ready && <div className="job-book-promotion-warning"><strong>Review required before promotion</strong><ul>{promotionReadiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
                <div className="job-book-promotion-rule"><strong>Promotion stops here safely.</strong><span>The Intake entry is already live in Dataverse. No managed Job will be created until the atomic promotion operation is connected.</span></div>
                <footer>
                    <button type="button" className="job-book-secondary" onClick={() => setPromotionRow(null)}>Close</button>
                    <button type="button" className="job-book-primary" disabled title="Dataverse promotion is not enabled in this prototype.">Create managed Job</button>
                </footer>
            </section>
        </div>}

        {machineDialogOpen && <div className="job-book-dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMachineDialogOpen(false)
        }}>
            <section className="job-book-dialog" role="dialog" aria-modal="true" aria-labelledby="machine-dialog-title">
                <header><div><span className="job-book-eyebrow">LEGACY JOB BOOK MACHINE</span><h2 id="machine-dialog-title">Add machine details</h2></div><button type="button" aria-label="Close" onClick={() => setMachineDialogOpen(false)}>×</button></header>
                <p className="job-book-dialog-note">This only fills the Job Book row. It will not create Equipment, a Customer, or a Site in Dataverse.</p>
                <div className="job-book-form-grid">
                    <label>Fleet number<input autoFocus value={machineDraft.fleet} onChange={(event) => setMachineDraft((current) => ({ ...current, fleet: event.target.value }))} /></label>
                    <label>Serial number<input value={machineDraft.serial} onChange={(event) => setMachineDraft((current) => ({ ...current, serial: event.target.value }))} /></label>
                    <label>Make<input value={machineDraft.make} onChange={(event) => setMachineDraft((current) => ({ ...current, make: event.target.value }))} /></label>
                    <label>Model<input value={machineDraft.model} onChange={(event) => setMachineDraft((current) => ({ ...current, model: event.target.value }))} /></label>
                    <label>Customer<input list="job-book-customers" value={machineDraft.customer} onChange={(event) => {
                        const customer = event.target.value
                        const linked = machineCustomerResults.find((item) => item.gr_name.localeCompare(customer, undefined, { sensitivity: 'accent' }) === 0)
                        setMachineCustomerSearch(customer)
                        setMachineCustomerSearchAttempt((current) => current + 1)
                        setMachineSites([])
                        setMachineSiteLoadStatus(linked ? 'loading' : 'idle')
                        setMachineDraft((current) => ({ ...current, customer, customerId: linked?.gr_customerid ?? '', site: '', siteId: '' }))
                    }} />{machineCustomerSearchStatus === 'loading' && <small>Searching Customers…</small>}{machineCustomerSearchStatus === 'error' && <button type="button" className="job-book-inline-retry" onClick={() => setMachineCustomerSearchAttempt((current) => current + 1)}>Retry Customer search</button>}</label>
                    <label>Site<input list="job-book-sites" disabled={!machineDraft.customerId || machineSiteLoadStatus === 'loading'} value={machineDraft.site} onChange={(event) => chooseSite(event.target.value)} />{machineSiteLoadStatus === 'loading' && <small>Loading this Customer’s Sites…</small>}{machineSiteLoadStatus === 'error' && <button type="button" className="job-book-inline-retry" onClick={() => { setMachineSiteLoadStatus('loading'); setMachineSiteLoadAttempt((current) => current + 1) }}>Retry Sites</button>}</label>
                    <div className="full-width"><VerifiedAddressField verified={machineDraft.addressVerified} value={machineDraft.address}
                        onChange={(address, selection) => setMachineDraft((current) => ({ ...current, address, addressVerified: Boolean(selection), addressNotFoundConfirmed: false }))} />
                        {machineDraft.address.trim() && !machineDraft.addressVerified && <label className="job-book-address-confirm dialog"><input type="checkbox" checked={machineDraft.addressNotFoundConfirmed} onChange={(event) => setMachineDraft((current) => ({ ...current, addressNotFoundConfirmed: event.target.checked }))} /><span>Address<br />not found</span></label>}</div>
                </div>
                <datalist id="job-book-customers">{machineCustomerResults.map((item) => <option key={item.gr_customerid} value={item.gr_name} />)}</datalist>
                <datalist id="job-book-sites">{machineSites.map((item) => <option key={item.gr_siteid} value={item.gr_name} />)}</datalist>
                {!isEquipmentConfigured(machineDraft) && <label className="job-book-keep-unconfigured"><input type="checkbox" checked={keepEquipmentUnconfigured} onChange={(event) => setKeepEquipmentUnconfigured(event.target.checked)} /><span><strong>Keep as unconfigured for now</strong><small>The Job row will be highlighted until a Fleet or Serial Number is added.</small></span></label>}
                {machineWarning && <p className="job-book-dialog-error">{machineWarning}</p>}
                <footer>
                    <button type="button" className="job-book-secondary" onClick={() => setMachineDialogOpen(false)}>Cancel</button>
                    <button type="button" className="job-book-primary" disabled={(!isEquipmentConfigured(machineDraft) && !keepEquipmentUnconfigured) || !addressIsAccepted(machineDraft)} onClick={saveMachine}>Save</button>
                </footer>
            </section>
        </div>}
    </main>
}
