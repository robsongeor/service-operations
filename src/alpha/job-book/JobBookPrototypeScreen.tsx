import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { applicationAccessFromEnvironment } from '../../auth/applicationAccess'
import { searchCustomers, createCustomer, findCustomersByName } from '../jobs/services/customersApi'
import { fetchCustomerSites, createSite } from '../jobs/services/sitesApi'
import { createEquipment } from '../jobs/services/equipmentApi'
import { invalidateJobsCache } from '../jobs/services/jobsApi'
import { createEquipmentDestination } from '../equipment/services/equipmentLocationWorkflow'
import { UNIFIED_JOB_RUNTIME, UNIFIED_JOB_WALKTHROUGH } from '../jobs/domain/unifiedJobWorkflow'
import { useJobRegistration } from '../jobs/hooks/useJobRegistration'
import JobRegistrationDialog from '../jobs/components/JobRegistrationDialog'
import { fetchJobForCorrection } from '../jobs/services/jobCorrectionsApi'
import type { Job } from '../jobs/types/job.types'
import { reconcileJobBookRows } from './reconcileJobBookRows'
import { fetchMechanics as fetchStaffDirectory } from '../mechanics/services/mechanicsApi'
import type { Customer } from '../jobs/types/customer.types'
import type { Equipment } from '../jobs/types/equipment.types'
import type { Mechanic } from '../jobs/types/mechanic.types'
import type { Site } from '../jobs/types/site.types'
import type { SiteContact } from '../jobs/types/siteContact.types'
import { fetchSiteContactsForSite } from '../jobs/services/siteContactsApi'
import JobDrawerShell from '../jobs/components/JobDrawerShell'
import JobCorrectionsDrawer from '../jobs/components/JobCorrectionsDrawer'
import JobEmailComposer from '../jobs/components/JobEmailComposer'
import JobQuickActions from '../jobs/components/JobQuickActions'
import { useJobBookActions } from './useJobBookActions'
import { jobBookCopyBlockedReason, jobBookEmailBlockedReason } from './jobBookActions'
import JobEquipmentField, { type NewJobEquipmentInput } from '../jobs/components/JobEquipmentField'
import JobSiteContactFields from '../jobs/components/JobSiteContactFields'
import JobEquipmentLocation from '../jobs/components/JobEquipmentLocation'
import JobLocationSummary from '../jobs/components/JobLocationSummary'
import { isPersistedEquipmentId } from '../equipment/services/equipmentLocationWorkflow'
import JobCustomerField from '../jobs/components/JobCustomerField'
import SearchableMechanicSelect from '../jobs/components/SearchableMechanicSelect'
import { useOperationalQuery } from '../shared/data/useOperationalQuery'
import { STAFF_DIRECTORY_QUERY_KEY } from '../shared/data/operationalCollectionKeys'
import { STANDARD_JOB_TYPE_OPTIONS, type JobType } from '../jobs/types/jobType.types'
import { JOB_DESCRIPTION_MAX_LENGTH } from '../jobs/domain/jobDescription'
import { jobCreationLocationErrors } from '../jobs/domain/jobCreationLocation'
import { createJobBookIntakeRow, fetchJobBookIntakeRows, fetchJobBookIntakeRow, fetchJobBookSearchBatch, fetchRecentJobBookRows, jobBookIntakeContactLookupIsAvailable, updateJobBookIntakeRow, updateJobBookIntakeMarker, updateManagedJobBookMarker, mapManagedJobBookRow } from './jobBookApi'
import { canUpdateJobBookMarkers, isEditableJobBookIntake, jobBookVoidBlockedReason } from './jobBookEntryWorkflow'
import { useJobBookVoid } from './useJobBookVoid'
import JobBookVoidDialog from './JobBookVoidDialog'
import { availableJobBooks, JOB_BOOKS, jobNumberSequence, REGIONAL_JOB_BOOK_ALLOCATION_ENABLED, type JobBookKey } from './jobBookConfig'
import { fetchJobBookEquipmentIndex } from './jobBookEquipmentIndexApi'
import {
    applyEquipmentToRow,
    applyIntakeCustomerToRow,
    jobBookEquipmentFallback,
    jobBookLocationFieldsVisible,
    jobBookLocationSummaryVisible,
    createBlankJobBookRow,
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

function prepareJobBookRows(intakeRows: JobBookRow[], recentRows: JobBookRow[], equipment: PrototypeEquipment[]) {
    return reconcileJobBookRows(intakeRows, recentRows)
        .map((row) => {
            const sourceEquipment = equipment.find((item) => item.id.toLowerCase() === row.equipmentId.toLowerCase())
            return {
                ...row,
                make: row.make || sourceEquipment?.make || '',
                model: row.model || sourceEquipment?.model || '',
            }
        })
        .sort((a, b) => jobNumberSequence(b.jobNumber) - jobNumberSequence(a.jobNumber))
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
    if (customerId === row.customerId && customer === row.customer) return row
    if (row.equipmentReviewRequired || row.equipmentId.startsWith('prototype-')) return applyIntakeCustomerToRow(row, customerId, customer)
    return clearEquipmentContext(row, customerId, customer)
}

function CustomerPicker({ id, value, customerName, required, error, onSearchCustomers, onChange, onCreateCustomerAndSite }: {
    id: string
    required?: boolean
    error?: string
    value: string
    customerName: string
    onSearchCustomers: (query: string, signal?: AbortSignal) => Promise<Customer[]>
    onChange: (customerId: string, customerName: string) => void
    onCreateCustomerAndSite?: (input: { customerName: string; siteName: string; address: string }) => Promise<void>
}) {
    // Keep typing local; a newly selected Equipment/entry supplies its exact Customer immediately.
    const [input, setInput] = useState({ customerId: value, customerName, text: customerName })
    const searchQuery = input.customerId === value && input.customerName === customerName ? input.text : customerName
    const customers = useMemo(() => value && customerName ? [{ gr_customerid: value, gr_name: customerName }] : [], [value, customerName])
    return <JobCustomerField
        id={id}
        required={required}
        error={error}
        query={searchQuery}
        selectedId={value}
        customers={customers}
        onSearchCustomers={onSearchCustomers}
        onQueryChange={(text) => setInput({ customerId: '', customerName: '', text })}
        onClearSelection={() => onChange('', '')}
        onSelect={(selected) => {
            setInput({ customerId: selected.gr_customerid, customerName: selected.gr_name, text: selected.gr_name })
            onChange(selected.gr_customerid, selected.gr_name)
        }}
        onCreateCustomerAndSite={onCreateCustomerAndSite}
        createDescription={UNIFIED_JOB_RUNTIME ? 'Create a saved Customer and Site. These remain available if the entry is cancelled.' : 'Use this customer and site on the Job Book entry. This does not create master Dataverse records.'}
        createActionLabel="Create customer"
    />
}

function MechanicPicker({
    selectedId,
    value,
    mechanics,
    onChange,
}: {
    selectedId: string
    value: string
    mechanics: Mechanic[]
    onChange: (mechanicId: string, mechanicName: string) => void
}) {
    const [open, setOpen] = useState(false)
    return <SearchableMechanicSelect
        mechanics={mechanics}
        selectedId={selectedId}
        selectedName={value}
        isOpen={open}
        isSaving={false}
        variant="drawer"
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onSelect={(mechanicId) => onChange(mechanicId, mechanics.find((item) => item.gr_mechanicid === mechanicId)?.gr_name ?? '')}
        onSelectCustom={UNIFIED_JOB_WALKTHROUGH ? undefined : (name) => onChange('', name)}
    />
}

export default function JobBookPrototypeScreen({
    allowManagedJobNavigation = true,
    allowManagedJobMarkerUpdates = true,
}: {
    allowManagedJobNavigation?: boolean
    allowManagedJobMarkerUpdates?: boolean
}) {
    const navigate = useNavigate()
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const { canManageJobs, canCorrectJobDetails, canEmailAssignedTechnician } = applicationAccessFromEnvironment(account)
    const { canUpdateEntryMarkers: canWriteMarkers, canAssignInitialTechnician } = applicationAccessFromEnvironment(account)
    const jobBooks = useMemo(() => availableJobBooks(), [])
    const [selectedJobBookKey, setSelectedJobBookKey] = useState<JobBookKey>('auckland')
    const bookPageGeneration = useRef(0)
    const selectedJobBook = JOB_BOOKS[selectedJobBookKey]
    const regionalAllocationLocked = selectedJobBookKey !== 'auckland' && !REGIONAL_JOB_BOOK_ALLOCATION_ENABLED
    const getAccessToken = useCallback(
        () => acquireDataverseAccessToken(instance, account),
        [account, instance],
    )
    const registration = useJobRegistration(`${account?.homeAccountId}.job-book`, getAccessToken, UNIFIED_JOB_RUNTIME)
    const staffDirectoryQuery = useOperationalQuery<Mechanic[]>({
        key: STAFF_DIRECTORY_QUERY_KEY,
        enabled: Boolean(account),
        staleTimeMs: 20_000,
        cacheTimeMs: 5 * 60_000,
        queryFn: async ({ signal }) => fetchStaffDirectory(await getAccessToken(), signal),
    })
    const mechanics = staffDirectoryQuery.data ?? []
    const [recentRows, setRecentRows] = useState<JobBookRow[]>([])
    const [correctingJobId, setCorrectingJobId] = useState('')
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
    const [editingEntryLocation, setEditingEntryLocation] = useState(false)
    const [createdEntryLocation, setCreatedEntryLocation] = useState(false)
    const showEntryLocationSummary = jobBookLocationSummaryVisible(draft, Boolean(editingIntakeRow) || createdEntryLocation, editingEntryLocation)
    const showIntakeLocationFields = jobBookLocationFieldsVisible(draft, Boolean(editingIntakeRow))
    const [intakeValidationAttempted, setIntakeValidationAttempted] = useState(false)
    const requireIntakeLocation = !editingIntakeRow && draft.equipmentReviewRequired
    const intakeLocationErrors = requireIntakeLocation ? jobCreationLocationErrors({ ...draft, equipmentId: '' }) : {}
    const [intakeError, setIntakeError] = useState('')
    const [filters, setFilters] = useState<JobBookFilters>(EMPTY_FILTERS)
    const searchGeneration = useRef(0)
    const [searchRecentRows, setSearchRecentRows] = useState<JobBookRow[]>([])
    const [searchIntakeRows, setSearchIntakeRows] = useState<JobBookRow[]>([])
    const [searchRecentNextLink, setSearchRecentNextLink] = useState<string>()
    const [searchIntakeNextLink, setSearchIntakeNextLink] = useState<string>()
    const [searchReady, setSearchReady] = useState(false)
    const [searchResultKey, setSearchResultKey] = useState('')
    const [searchingRows, setSearchingRows] = useState(false)
    const [promotionRow, setPromotionRow] = useState<JobBookRow | null>(null)
    const [managingJob, setManagingJob] = useState<Job | null>(null)
    const [promotionJobType, setPromotionJobType] = useState<JobType>(STANDARD_JOB_TYPE_OPTIONS[0].value)
    const [savingIntake, setSavingIntake] = useState(false)
    const [locationPending, setLocationPending] = useState(false)
    const [locationSaving, setLocationSaving] = useState(false)
    const [savingEntryMarkers, setSavingEntryMarkers] = useState<Set<string>>(() => new Set())
    const [saveError, setSaveError] = useState('')
    const [intakeSites, setIntakeSites] = useState<Site[]>([])
    const [intakeContacts, setIntakeContacts] = useState<SiteContact[]>([])
    const [intakeSiteLoadStatus, setIntakeSiteLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [intakeSiteLoadError, setIntakeSiteLoadError] = useState('')
    const [intakeSiteLoadAttempt, setIntakeSiteLoadAttempt] = useState(0)
    const [intakeContactLoadStatus, setIntakeContactLoadStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const [intakeContactLoadError, setIntakeContactLoadError] = useState('')
    const [intakeContactLoadAttempt, setIntakeContactLoadAttempt] = useState(0)
    const [intakeContactLookupAvailable, setIntakeContactLookupAvailable] = useState(() => jobBookIntakeContactLookupIsAvailable())
    const reconcileIntakeRow = (saved: JobBookRow) => {
        setIntakeRows((current) => appendUniqueRows(current, [saved]))
        if (saved.linkedJobId) setRecentRows((current) => current.map((item) => item.linkedJobId === saved.linkedJobId ? saved : item))
        if (UNIFIED_JOB_RUNTIME) invalidateJobsCache()
    }
    const voidEntry = useJobBookVoid(getAccessToken, reconcileIntakeRow)
    const rowActions = useJobBookActions(getAccessToken, canEmailAssignedTechnician, !canManageJobs)

    const switchJobBook = (jobBookKey: JobBookKey) => {
        if (jobBookKey === selectedJobBookKey || voidEntry.busy || registration.busy || savingIntake) return
        bookPageGeneration.current++
        pageLoadInProgressRef.current = false
        setLoadingMoreRows(false)
        voidEntry.close()
        rowActions.close()
        setRecentRows([])
        setIntakeRows([])
        setRecentNextLink(undefined)
        setIntakeNextLink(undefined)
        setFilters(EMPTY_FILTERS)
        searchGeneration.current++
        setSearchRecentRows([])
        setSearchIntakeRows([])
        setSearchRecentNextLink(undefined)
        setSearchIntakeNextLink(undefined)
        setSearchReady(false)
        setSearchResultKey('')
        setSearchingRows(false)
        setDraft(createBlankJobBookRow(0, jobBookKey))
        setEditingEntryLocation(false)
        setCreatedEntryLocation(false)
        setPromotionRow(null)
        setCorrectingJobId('')
        setIntakeDrawerOpen(false)
        setEditingIntakeRow(null)
        setSaveError('')
        setPageLoadError('')
        setSelectedJobBookKey(jobBookKey)
    }

    const searchJobBookCustomers = useCallback(async (query: string, signal?: AbortSignal) => (
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
        const customerId = draft.customerId
        if (!intakeDrawerOpen || !showIntakeLocationFields || !customerId || customerId.startsWith('prototype-')) return
        if (showEntryLocationSummary) return
        if (!editingIntakeRow && isPersistedEquipmentId(draft.equipmentId)) return
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
    }, [draft.customerId, draft.equipmentId, editingIntakeRow, getAccessToken, intakeDrawerOpen, intakeSiteLoadAttempt, showIntakeLocationFields, showEntryLocationSummary])

    useEffect(() => {
        const siteId = draft.siteId
        if (!intakeDrawerOpen || !showIntakeLocationFields || !intakeContactLookupAvailable || !siteId || siteId.startsWith('prototype-')) return
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
    }, [draft.siteId, getAccessToken, intakeContactLoadAttempt, intakeContactLookupAvailable, intakeDrawerOpen, showIntakeLocationFields])

    const allRows = useMemo(() => prepareJobBookRows(intakeRows, recentRows, equipment), [equipment, intakeRows, recentRows])
    const searchRows = useMemo(() => prepareJobBookRows(searchIntakeRows, searchRecentRows, equipment), [equipment, searchIntakeRows, searchRecentRows])
    const filtersActive = Object.values(filters).some(Boolean)
    const activeFilterCount = Object.values(filters).filter(Boolean).length
    const searchFilterKey = JSON.stringify(filters)
    const searchCurrent = searchReady && searchResultKey === searchFilterKey

    useEffect(() => {
        const generation = ++searchGeneration.current
        if (!filtersActive || !account) return
        const controller = new AbortController()
        const timer = window.setTimeout(() => {
            setSearchReady(false)
            setPageLoadError('')
            setSearchingRows(true)
            void getAccessToken()
                .then((token) => fetchJobBookSearchBatch(token, selectedJobBook, filters, undefined, controller.signal))
                .then((batch) => {
                    if (controller.signal.aborted || generation !== searchGeneration.current) return
                    setSearchRecentRows(batch.recentRecords)
                    setSearchIntakeRows(batch.intakeRecords)
                    setSearchRecentNextLink(batch.recentNextLink)
                    setSearchIntakeNextLink(batch.intakeNextLink)
                    setSearchResultKey(searchFilterKey)
                    setSearchReady(true)
                })
                .catch((error) => {
                    if (controller.signal.aborted || generation !== searchGeneration.current || (error instanceof DOMException && error.name === 'AbortError')) return
                    setPageLoadError(error instanceof Error ? error.message : 'The Job Book search could not be completed.')
                })
                .finally(() => {
                    if (generation === searchGeneration.current) setSearchingRows(false)
                })
        }, 350)
        return () => {
            window.clearTimeout(timer)
            controller.abort()
        }
    }, [account, filters, filtersActive, getAccessToken, searchFilterKey, selectedJobBook])

    const displayedRows = useMemo(() => {
        const includes = (values: Array<string | undefined>, term: string) => !term.trim()
            || values.some((value) => value?.toLocaleLowerCase('en-NZ').includes(term.trim().toLocaleLowerCase('en-NZ')))
        const sourceRows = filtersActive && searchCurrent ? searchRows : allRows
        return sourceRows.filter((row) => {
            if (filters.date && row.date !== filters.date) return false
            if (!includes([row.mechanicName], filters.mechanic)) return false
            if (!includes([row.fleet, row.serial, row.make, row.model], filters.equipment)) return false
            if (!includes([row.customer, row.site, row.address], filters.customerSite)) return false
            return includes([
                row.jobNumber, displayDate(row.date), row.mechanicName, row.fleet, row.serial,
                row.make, row.model, row.customer, row.site, row.address, row.description, row.customerPo, row.entryStage, row.voidReason,
            ], filters.search)
        })
    }, [allRows, filters, filtersActive, searchCurrent, searchRows])
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
    const locationEquipment = !editingIntakeRow && isPersistedEquipmentId(draft.equipmentId)
        ? sharedEquipmentList.find((item) => item.gr_equipmentid === draft.equipmentId) : undefined
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
    const hasMoreRows = filtersActive
        ? searchCurrent && Boolean(searchRecentNextLink || searchIntakeNextLink)
        : Boolean(recentNextLink || intakeNextLink)
    const loadMoreRows = useCallback(async () => {
        if (!account || pageLoadInProgressRef.current) return
        if (filtersActive) {
            if (!searchCurrent || (!searchRecentNextLink && !searchIntakeNextLink)) return
            const generation = searchGeneration.current
            pageLoadInProgressRef.current = true
            setLoadingMoreRows(true)
            setPageLoadError('')
            try {
                const batch = await fetchJobBookSearchBatch(await getAccessToken(), selectedJobBook, filters, {
                    recentNextLink: searchRecentNextLink,
                    intakeNextLink: searchIntakeNextLink,
                })
                if (generation !== searchGeneration.current) return
                setSearchRecentRows((current) => appendUniqueRows(current, batch.recentRecords))
                setSearchIntakeRows((current) => appendUniqueRows(current, batch.intakeRecords))
                setSearchRecentNextLink(batch.recentNextLink)
                setSearchIntakeNextLink(batch.intakeNextLink)
            } catch (error) {
                if (generation === searchGeneration.current) setPageLoadError(error instanceof Error ? error.message : 'More matching Job Book entries could not be loaded.')
            } finally {
                pageLoadInProgressRef.current = false
                if (generation === searchGeneration.current) setLoadingMoreRows(false)
            }
            return
        }
        if (!recentNextLink && !intakeNextLink) return
        const generation = bookPageGeneration.current
        pageLoadInProgressRef.current = true
        setLoadingMoreRows(true)
        setPageLoadError('')
        try {
            const token = await getAccessToken()
            const [jobPage, intakePage] = await Promise.all([
                recentNextLink ? fetchRecentJobBookRows(token, selectedJobBook, recentNextLink) : Promise.resolve(undefined),
                intakeNextLink ? fetchJobBookIntakeRows(token, selectedJobBook, intakeNextLink) : Promise.resolve(undefined),
            ])
            if (generation !== bookPageGeneration.current) return
            if (jobPage) {
                setRecentRows((current) => appendUniqueRows(current, jobPage.records))
                setRecentNextLink(jobPage.nextLink)
            }
            if (intakePage) {
                setIntakeRows((current) => appendUniqueRows(current, intakePage.records))
                setIntakeNextLink(intakePage.nextLink)
            }
        } catch (error) {
            if (generation === bookPageGeneration.current) setPageLoadError(error instanceof Error ? error.message : 'More Job Book entries could not be loaded.')
        } finally {
            if (generation === bookPageGeneration.current) {
                pageLoadInProgressRef.current = false
                setLoadingMoreRows(false)
            }
        }
    }, [account, filters, filtersActive, getAccessToken, intakeNextLink, recentNextLink, searchCurrent, searchIntakeNextLink, searchRecentNextLink, selectedJobBook])

    useEffect(() => {
        const sentinel = infiniteScrollSentinelRef.current
        if (!sentinel || !hasMoreRows || filtersActive) return
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) void loadMoreRows()
        }, { rootMargin: '500px 0px' })
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [filtersActive, hasMoreRows, loadMoreRows])
    const finishRegistration = async (result: { book: JobBookKey; ledgerId: string; jobNumber: string }) => {
        const saved = await fetchJobBookIntakeRow(await getAccessToken(), { jobBookKey: result.book, intakeRecordId: result.ledgerId })
        if (result.book === selectedJobBookKey) reconcileIntakeRow(saved)
        registration.complete()
        setIntakeDrawerOpen(false)
        setSaveError('')
        setIntakeError('')
    }
    const resumeRegistration = async () => {
        const result = await registration.submit()
        if (result) {
            try { await finishRegistration(result) }
            catch { setSaveError(`Job ${result.jobNumber} was saved, but its details could not be loaded. Resume the same request to recover it.`) }
        }
    }
    const submitPrototypeJob = async () => {
        if (savingIntake || registration.busy || registration.pending) return
        setIntakeValidationAttempted(true)
        if (!equipmentIsAccepted(draft)) {
            setIntakeError('Select Equipment or add the machine details before saving.')
            return
        }
        if (!draft.description.trim()) {
            setIntakeError('Enter a description of the job before saving.')
            return
        }
        const locationError = intakeLocationErrors.customer || intakeLocationErrors.site || intakeLocationErrors.address
        if (locationError) {
            setIntakeError(locationError)
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
                const saved = await updateJobBookIntakeRow(token, draft, !canAssignInitialTechnician)
                setIntakeRows((current) => current.map((item) => item.intakeRecordId === saved.intakeRecordId ? saved : item))
            } else if (UNIFIED_JOB_RUNTIME) {
                if (!isPersistedEquipmentId(draft.siteId) || (!draft.equipmentReviewRequired && !isPersistedEquipmentId(draft.equipmentId))) throw new Error('Select saved Equipment and Site records. Snapshot-only entries need reconciliation, not another number.')
                const result = await registration.submit({ kind: 'register', requestId: crypto.randomUUID(), book: selectedJobBookKey,
                    description: draft.description, orderNumber: draft.customerPo, siteId: draft.siteId,
                    equipmentId: draft.equipmentId || undefined, equipmentUnknown: draft.equipmentReviewRequired,
                    contactId: draft.contactId || undefined, mechanicId: canAssignInitialTechnician ? draft.mechanicId || undefined : undefined })
                if (!result) return
                await finishRegistration(result)
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
        setEditingEntryLocation(false)
        setCreatedEntryLocation(false)
        setEditingIntakeRow(null)
        setIntakeError('')
        setIntakeValidationAttempted(false)
        setDraft(createBlankJobBookRow(0, selectedJobBookKey))
        setIntakeDrawerOpen(true)
    }
    const openManageJob = (row: JobBookRow) => {
        if (!canManageJobs || (!isEditableJobBookIntake(row) && !row.registeredLedgerId)) return
        if (UNIFIED_JOB_RUNTIME && row.registeredLedgerId) {
            void getAccessToken().then((token) => fetchJobForCorrection(token, row.linkedJobId)).then(setManagingJob).catch((cause) => setSaveError(cause instanceof Error ? cause.message : 'Job could not be loaded.'))
            return
        }
        setPromotionRow(row)
    }
    const openIntakeEntryEditor = (row: JobBookRow) => {
        if (!isEditableJobBookIntake(row)) return
        setEditingEntryLocation(false)
        setEditingIntakeRow(row)
        setCreatedEntryLocation(false)
        setIntakeError('')
        setIntakeValidationAttempted(false)
        setDraft({ ...row })
        setIntakeDrawerOpen(true)
    }
    const createLocalIntakeEquipment = async (input: NewJobEquipmentInput) => {
        const persist = UNIFIED_JOB_RUNTIME && !editingIntakeRow
        const id = persist ? await createEquipment(await getAccessToken(), input) : `prototype-${crypto.randomUUID()}`
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
            isLocal: !persist,
        }
        setEquipment((current) => [record, ...current])
        return id
    }
    const selectIntakeEquipment = (item: Equipment | undefined) => {
        setEditingEntryLocation(false)
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
    const updateRowField = async (row: JobBookRow, field: 'entered' | 'timecloudEntered', value: boolean) => {
        if (!canWriteMarkers || !canUpdateJobBookMarkers(row, allowManagedJobMarkerUpdates) || voidEntry.row?.id === row.id) return
        const isEntryMarker = field === 'entered' || field === 'timecloudEntered'
        if (isEntryMarker && savingEntryMarkers.has(row.id)) return
        if (isEntryMarker) setSavingEntryMarkers((current) => new Set(current).add(row.id))
        try {
            if (row.intakeRecordId && !row.registeredLedgerId) {
                setSaveError('')
                try { reconcileIntakeRow(await updateJobBookIntakeMarker(await getAccessToken(), row, field, value)) }
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
                    setIntakeRows((current) => current.map((item) => item.linkedJobId === row.linkedJobId ? { ...item, ...saved } : item))
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
    const promotionReadiness = promotionRow ? getPromotionReadiness(promotionRow) : null

    return <main className="job-book-screen">
        <header className="job-book-header">
            <div>
                <span className="job-book-eyebrow">JOB BOOK</span>
                <h1>{selectedJobBook.label} Job Book</h1>
                <p>View {selectedJobBook.label} managed Jobs and Intake entries in one separate register.</p>
            </div>
            <div className="job-book-header-summary" aria-label="Job Book status">
                <span>{filtersActive
                    ? searchingRows ? 'Searching all Job Book entries…' : `${displayedRows.length} matching`
                    : `${displayedRows.length} shown · ${allRows.length} loaded`}</span>
                <span>{equipment.length.toLocaleString()} equipment</span>
                {loading && <span>Refreshing…</span>}
                {loadError && <span className="job-book-error" title={loadError}>Load warning</span>}
                {staffDirectoryQuery.data === undefined && (staffDirectoryQuery.status === 'initial' || staffDirectoryQuery.status === 'loading') && <span>Loading Staff…</span>}
                {staffDirectoryQuery.data === undefined && staffDirectoryQuery.error && <button type="button" className="job-book-inline-retry" title={staffDirectoryQuery.error.message} onClick={() => void staffDirectoryQuery.refetch().catch(() => undefined)}>Retry Staff</button>}
                <span className="job-book-local-badge">LEGACY VIEW</span>
                <button type="button" className="job-book-new-entry-button" disabled={regionalAllocationLocked || Boolean(registration.pending)} title={regionalAllocationLocked ? 'Available after this regional Job Book is migrated and seeded.' : undefined} onClick={openNewIntakeEntry}>+ New entry</button>
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
        {UNIFIED_JOB_RUNTIME && registration.pending && <div className="job-book-cutover-notice" role="status">An entry save needs confirmation. Its original request is retained; do not create another entry. <button type="button" disabled={registration.busy} onClick={() => void resumeRegistration()}>Resume saved request</button></div>}
        {registration.error && <p className="job-book-save-error" role="alert">{registration.error}</p>}
        {voidEntry.notice && <p className="job-book-action-notice" role="status">{voidEntry.notice}</p>}

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

        <section className="job-book-grid-wrap" aria-label={`${selectedJobBook.label} Job Book`} aria-busy={searchingRows}>
            <table className="job-book-grid">
                <thead><tr>
                    <th className="job-number-column">Job Number</th><th className="date-column">Date</th><th className="mechanic-column">Mechanic</th>
                    <th>Equipment</th><th>Customer</th><th className="description-column">Description of the Job</th>
                    <th className="address-column">Site Address</th><th>Customer PO #</th><th className="gt-entry-column">GT Entry</th><th className="timecloud-entry-column">Timecloud Entry</th><th>Actions</th>
                </tr></thead>
                <tbody>{displayedRows.map((row) => {
                    const canEditIntake = isEditableJobBookIntake(row)
                    const canUpdateEntryMarkers = canWriteMarkers && canUpdateJobBookMarkers(row, allowManagedJobMarkerUpdates)
                    const isVoid = row.entryStage === JOB_BOOK_ENTRY_STAGES.VOID
                    const voidBlocked = jobBookVoidBlockedReason(row)
                    const markerBusy = savingEntryMarkers.has(row.id) || voidEntry.row?.id === row.id
                    return <tr key={row.id} className={isVoid ? 'job-book-void-row' : row.equipmentReviewRequired ? 'equipment-unconfigured' : undefined}>
                        <td className="job-number-column"><span className="job-book-number-value"><strong>{row.jobNumber}</strong>{isVoid && <span className="job-book-void-badge">VOID</span>}{row.entryStage === JOB_BOOK_ENTRY_STAGES.PROMOTED && <span className="job-book-managed-indicator" title="Managed Job" aria-label="Managed Job">✓</span>}</span></td>
                        <td className="date-column"><span className="job-book-readonly-date" aria-label="Job creation date">{displayDate(row.date)}</span></td>
                        <td className="mechanic-column"><span className="job-book-table-value">{row.mechanicName || '—'}</span></td>
                        <td>{row.equipmentReviewRequired
                            ? canEditIntake
                                ? <button type="button" className="job-book-unconfigured-link" aria-label={`Edit equipment for Job Book ${row.jobNumber}`} onClick={() => openIntakeEntryEditor(row)}><strong>Equipment not configured</strong><small>Edit entry to set equipment</small></button>
                                : <span className="job-book-table-value"><strong>Equipment not configured</strong></span>
                            : <span className="job-book-table-value job-book-equipment-value"><strong>{row.fleet || row.serial || '—'}</strong>{(row.make || row.model) && <small>{[row.make, row.model].filter(Boolean).join(' ')}</small>}</span>}</td>
                        <td><span className="job-book-table-value job-book-customer-value"><strong>{row.customer || '—'}</strong>{row.site && <small>{row.site}</small>}</span></td>
                        <td><span className="job-book-table-value description">{row.description || '—'}</span>{isVoid && <span className="job-book-void-reason"><strong>Void reason:</strong> {row.voidReason || 'No reason recorded on this historical entry.'}</span>}</td>
                        <td>{row.address
                            ? <span className="job-book-table-value job-book-address-value"><strong>{splitSiteAddress(row.address).street}</strong>{splitSiteAddress(row.address).locality && <small>{splitSiteAddress(row.address).locality}</small>}</span>
                            : <span className="job-book-table-value">—</span>}</td>
                        <td><span className="job-book-table-value">{row.customerPo || '—'}</span></td>
                        <td className="gt-entry-column">{canUpdateEntryMarkers || isVoid || !canWriteMarkers ? <label className={`job-book-table-check ${row.entered ? 'complete' : ''}`}><input type="checkbox" aria-label={`GT Entry completed for Job ${row.jobNumber}`} disabled={!canUpdateEntryMarkers || isVoid || markerBusy} checked={row.entered} onChange={(event) => void updateRowField(row, 'entered', event.target.checked)} />{savingEntryMarkers.has(row.id) ? <span>Saving</span> : row.entered ? <span>Done</span> : null}</label> : <span className="job-book-status-pill">Unavailable</span>}</td>
                        <td className="timecloud-entry-column">{canUpdateEntryMarkers || isVoid || !canWriteMarkers ? <label className={`job-book-table-check ${row.timecloudEntered ? 'complete' : ''}`}><input type="checkbox" aria-label={`Timecloud Entry completed for Job ${row.jobNumber}`} disabled={!canUpdateEntryMarkers || isVoid || markerBusy} checked={row.timecloudEntered} onChange={(event) => void updateRowField(row, 'timecloudEntered', event.target.checked)} />{savingEntryMarkers.has(row.id) ? <span>Saving</span> : row.timecloudEntered ? <span>Done</span> : null}</label> : <span className="job-book-status-pill">Unavailable</span>}</td>
                        <td><div className="job-book-row-actions">{canEditIntake
                            ? <button type="button" className="job-quick-action job-quick-action-edit" onClick={() => openIntakeEntryEditor(row)}>Edit entry</button>
                            : isVoid
                                ? <span className="job-book-status-pill">Read-only</span>
                            : allowManagedJobNavigation && row.linkedJobId && !UNIFIED_JOB_WALKTHROUGH
                                ? <button type="button" className="job-quick-action job-quick-action-edit" onClick={() => navigate(`/jobs?jobId=${encodeURIComponent(row.linkedJobId)}`)}>Open Job</button>
                                : canCorrectJobDetails && row.linkedJobId
                                    ? <button type="button" className="job-quick-action job-quick-action-edit" onClick={() => setCorrectingJobId(row.linkedJobId)} disabled={markerBusy}>Edit entry</button>
                                    : <span className="job-book-status-pill">{row.linkedJobId ? 'Managed Job' : 'Read-only'}</span>}
                        {!isVoid && <JobQuickActions
                            onCopy={() => void rowActions.copy(row)} copyBlockedReason={jobBookCopyBlockedReason(row)}
                            onEmail={canEmailAssignedTechnician ? () => { void rowActions.openEmail(row) } : undefined}
                            emailBlockedReason={jobBookEmailBlockedReason(row, canEmailAssignedTechnician)}
                            emailDelivery={rowActions.emailDeliveryStates[row.linkedJobId]}
                            emailBusy={Boolean(rowActions.loadingJobId)}
                        />}
                        {(canEditIntake || (row.registeredLedgerId && !isVoid)) && <>
                            {canManageJobs && row.coordinatorManaged !== true && <button type="button" className="job-quick-action job-quick-action-edit" onClick={() => openManageJob(row)}>Manage job</button>}
                            <button type="button" className="job-quick-action job-book-void-action" aria-label="Mark as void" disabled={Boolean(voidBlocked) || markerBusy || loading} title={voidBlocked || 'Mark as void — keep this allocated number with a required reason.'} onClick={() => voidEntry.open(row)}>
                                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></svg>
                            </button>
                        </>}</div></td>
                    </tr>
                })}</tbody>
            </table>
        </section>
        {(rowActions.feedback || rowActions.loadingJobId) && <div className="job-book-action-feedback" role={rowActions.feedback?.error ? 'alert' : 'status'}>
            <span>{rowActions.loadingJobId ? 'Loading the latest Job and assigned technician…' : rowActions.feedback?.message}</span>
            {rowActions.feedback && <button type="button" aria-label="Dismiss action message" onClick={rowActions.dismissFeedback}>×</button>}
        </div>}
        {canEmailAssignedTechnician && rowActions.emailJob && <JobEmailComposer key={rowActions.emailJob.gr_jobid} job={rowActions.emailJob} assignedRecipientOnly={!canManageJobs} onCancel={rowActions.close} onSend={rowActions.send} />}
        <div ref={infiniteScrollSentinelRef} className="job-book-page-loader" aria-live="polite">
            {pageLoadError && <span className="job-book-page-error" role="alert">{pageLoadError}</span>}
            {searchingRows
                ? <span>Searching up to 100 matching entries…</span>
                : hasMoreRows
                ? <button type="button" onClick={() => void loadMoreRows()} disabled={loadingMoreRows}>
                    {loadingMoreRows ? 'Loading more entries…' : filtersActive ? 'Load more results' : 'Scroll for more entries'}
                </button>
                : filtersActive && searchCurrent
                    ? <span>{displayedRows.length ? 'All matching entries loaded' : 'No matching entries found'}</span>
                    : !loading && allRows.length > 0 && <span>All available entries loaded</span>}
        </div>
        </section>

        {voidEntry.row && <JobBookVoidDialog key={voidEntry.row.id} row={voidEntry.row} busy={voidEntry.busy} error={voidEntry.error} needsReload={voidEntry.needsReload} onCancel={voidEntry.close} onSubmit={(reason) => void voidEntry.submit(reason)} onReload={() => void voidEntry.reload()} />}
        {canManageJobs && managingJob && <JobRegistrationDialog job={managingJob} mode="manage" getAccessToken={getAccessToken} onClose={() => setManagingJob(null)} onSaved={async () => {
            const ledger = intakeRows.find((row) => row.linkedJobId === managingJob.gr_jobid)
            if (ledger) reconcileIntakeRow(await fetchJobBookIntakeRow(await getAccessToken(), ledger))
        }} />}

        {intakeDrawerOpen && <JobDrawerShell
            eyebrow={`${selectedJobBook.label} Job Book`}
            title={`${editingIntakeRow ? 'Edit' : 'Add'} ${selectedJobBook.label} Job Book entry`}
            className="job-book-intake-drawer"
            busy={savingIntake || locationSaving}
            onClose={closeIntakeDrawer}
            footer={<>
                <span className={intakeError ? 'job-book-intake-save-error' : undefined} role={intakeError ? 'alert' : undefined}>{intakeError || (locationPending ? 'Save or cancel the equipment location change first.' : editingIntakeRow ? `Editing Job Book ${draft.jobNumber}.` : 'A Job number will be assigned after saving.')}</span>
                <div className="job-book-intake-footer-actions">
                    <button type="button" onClick={closeIntakeDrawer} disabled={savingIntake || locationSaving}>Cancel</button>
                    <button type="button" className="primary" onClick={() => void (registration.pending ? resumeRegistration() : submitPrototypeJob())} disabled={savingIntake || registration.busy || locationPending || locationSaving}>{savingIntake || registration.busy ? 'Saving…' : registration.pending ? 'Resume saved request' : editingIntakeRow ? 'Save changes' : 'Add to Job Book'}</button>
                </div>
            </>}
        >
            <div className="job-book-intake-meta"><div><span>Job number</span><strong>{editingIntakeRow ? draft.jobNumber : 'Assigned after saving'}</strong></div><div><span>Entry date</span><strong>{displayDate(draft.date)}</strong></div></div>
            <fieldset className="job-book-intake-section job-create-fields" disabled={savingIntake || locationSaving || Boolean(registration.pending)}>
                <div className="job-book-intake-section-heading"><h3>Equipment and location</h3><p>Selecting Equipment fills its Customer, Site and address.</p></div>
                <JobEquipmentField
                    showSelectedLocation={!locationEquipment && !editingIntakeRow}
                    value={draft.equipmentId}
                    equipmentList={sharedEquipmentList}
                    selectedEquipmentFallback={jobBookEquipmentFallback(draft)}
                    customerId={draft.customerId}
                    siteId={draft.siteId}
                    required
                    error={intakeValidationAttempted && !equipmentIsAccepted(draft) ? 'Select Equipment or add new equipment.' : undefined}
                    createDescription={UNIFIED_JOB_RUNTIME && !editingIntakeRow ? 'Create saved Equipment. Its location can then be linked below.' : 'Add the machine details to this Job Book entry. This does not create Equipment in Dataverse.'}
                    createActionLabel={UNIFIED_JOB_RUNTIME && !editingIntakeRow ? 'Create equipment' : 'Use equipment details'}
                    onCreateEquipment={createLocalIntakeEquipment}
                    onChange={selectIntakeEquipment}
                    unknownEquipmentOption={{
                        selected: draft.equipmentReviewRequired,
                        label: 'Equipment not known yet',
                        description: 'Save now and match or add the Equipment later.',
                        onChange: (selected) => { setEditingEntryLocation(false); setDraft((current) => setEquipmentReviewRequired(current, selected)) },
                    }}
                />
                {showIntakeLocationFields && <>
                {locationEquipment ? <JobEquipmentLocation key={locationEquipment.gr_equipmentid}
                    equipment={locationEquipment} onPendingChange={setLocationPending} onSavingChange={setLocationSaving}
                    onLocationChange={(row) => {
                        const site = row.gr_Site
                        const customer = site?.gr_Customer
                        setEquipment((current) => current.map((item) => item.id !== row.gr_equipmentid ? item : {
                            ...item, customerId: customer?.gr_customerid ?? '', customer: customer?.gr_name ?? '',
                            siteId: site?.gr_siteid ?? '', site: site?.gr_name ?? '', address: site?.gr_address ?? '',
                            addressVerified: Boolean(site?.gr_address), addressNotFoundConfirmed: false,
                        }))
                        setDraft((current) => current.equipmentId !== row.gr_equipmentid ? current : {
                            ...current, customerId: customer?.gr_customerid ?? '', customer: customer?.gr_name ?? '',
                            siteId: site?.gr_siteid ?? '', site: site?.gr_name ?? '', address: site?.gr_address ?? '',
                            addressVerified: Boolean(site?.gr_address), addressNotFoundConfirmed: false,
                            contactId: current.siteId === site?.gr_siteid ? current.contactId : '',
                            contactName: current.siteId === site?.gr_siteid ? current.contactName : '',
                        })
                    }} /> : showEntryLocationSummary ? <section className="job-equipment-location job-edit-field-wide" aria-label="Entry location">
                    <JobLocationSummary customer={draft.customer} site={draft.site} address={draft.address}
                        onEdit={() => setEditingEntryLocation(true)} />
                </section> : <div className="job-edit-field-wide">
                {editingEntryLocation && <p className="job-book-entry-location-note">Changes here are saved with this entry. The equipment’s current location is unchanged.</p>}
                <CustomerPicker id="job-book-drawer-customer" value={draft.customerId} customerName={draft.customer}
                    required={requireIntakeLocation}
                    error={intakeValidationAttempted ? intakeLocationErrors.customer : undefined}
                    onSearchCustomers={searchJobBookCustomers}
                    onChange={(customerId, customerName) => {
                        setIntakeSites([])
                        setIntakeContacts([])
                        setDraft((current) => applyCustomerSelection(current, customerId, customerName))
                    }}
                    onCreateCustomerAndSite={async ({ customerName, siteName, address }) => {
                        if (UNIFIED_JOB_RUNTIME && !editingIntakeRow) {
                            const token = await getAccessToken()
                            const { customer, site } = await createEquipmentDestination({ customerName, siteName, address }, true, {
                                findCustomers: (name) => findCustomersByName(token, name), createCustomer: (input) => createCustomer(token, input),
                                rememberCustomer: (customer) => setDraft((current) => applyIntakeCustomerToRow(current, customer.gr_customerid, customer.gr_name)),
                                readSites: (id) => fetchCustomerSites(token, id), createSite: (input) => createSite(token, input),
                            })
                            setDraft((current) => ({ ...current, customerId: customer.gr_customerid, customer: customer.gr_name, siteId: site.gr_siteid, site: site.gr_name, address: site.gr_address, addressVerified: true }))
                            setCreatedEntryLocation(true); setEditingEntryLocation(false)
                            return
                        }
                        setIntakeError('')
                        setIntakeSites([])
                        setIntakeContacts([])
                        setDraft((current) => ({
                            ...applyCustomerSelection(current, `prototype-customer-${crypto.randomUUID()}`, customerName),
                            siteId: `prototype-site-${crypto.randomUUID()}`,
                            site: siteName,
                            address,
                            addressVerified: true,
                            addressNotFoundConfirmed: false,
                        }))
                        setCreatedEntryLocation(true)
                        setEditingEntryLocation(false)
                    }} /></div>}
                <JobSiteContactFields
                    showSite={!locationEquipment && !showEntryLocationSummary}
                    locationRequired={requireIntakeLocation}
                    address={draft.address}
                    addressError={intakeValidationAttempted ? intakeLocationErrors.address : undefined}
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
                    siteError={intakeValidationAttempted ? intakeLocationErrors.site || (draft.customerId && !draft.siteId ? 'Select a Site for this Customer.' : undefined) : undefined}
                    onSiteChange={selectIntakeSite}
                    onContactChange={selectIntakeContact}
                    onRetrySites={() => setIntakeSiteLoadAttempt((current) => current + 1)}
                    onRetryContacts={() => setIntakeContactLoadAttempt((current) => current + 1)}
                />
                </>}
            </fieldset>
            <fieldset className="job-book-intake-section" disabled={savingIntake || Boolean(registration.pending)}>
                <div className="job-book-intake-section-heading"><h3>Job details</h3><p>Record what is required and who should attend.</p></div>
                <label className={`job-book-intake-field${intakeValidationAttempted && !draft.description.trim() ? ' error' : ''}`}><span>Description of the job <span className="job-book-required-mark">*</span></span><textarea required maxLength={JOB_DESCRIPTION_MAX_LENGTH} aria-label="Job description (required)" placeholder="Describe the fault or work required" rows={4} value={draft.description} onChange={(event) => { setIntakeError(''); setDraft((current) => ({ ...current, description: event.target.value })) }} />
                    {intakeValidationAttempted && !draft.description.trim() && <small className="job-book-intake-field-error">Enter a description of the job.</small>}</label>
                {canAssignInitialTechnician ? <div className="job-edit-field job-edit-field-wide"><span>Mechanic</span><MechanicPicker key={draft.id} selectedId={draft.mechanicId} value={draft.mechanicName} mechanics={mechanics}
                    onChange={(mechanicId, mechanicName) => setDraft((current) => ({ ...current, mechanicId, mechanicName }))} /></div> : <div className="job-edit-field"><span>Technician</span><span>{draft.mechanicName || 'Not assigned'}</span></div>}
                <label className="job-book-intake-field"><span>Customer PO <small>(optional)</small></span><input aria-label="Customer purchase order" placeholder="Enter a PO number if supplied" value={draft.customerPo} onChange={(event) => setDraft((current) => ({ ...current, customerPo: event.target.value }))} /></label>
            </fieldset>
        </JobDrawerShell>}

        {canCorrectJobDetails && correctingJobId && <JobCorrectionsDrawer key={correctingJobId} jobId={correctingJobId} jobBookLabel={selectedJobBook.label} mechanics={mechanics} canAssignTechnician={canAssignInitialTechnician}
            onCreateCustomer={async (input) => createCustomer(await getAccessToken(), input)}
            onCreateSite={async (input) => createSite(await getAccessToken(), input)}
            onCreateEquipment={async (input) => createEquipment(await getAccessToken(), input)}
            getAccessToken={getAccessToken} onClose={() => setCorrectingJobId('')} onSaved={(job) => {
            const saved = mapManagedJobBookRow(job, selectedJobBook)
            setRecentRows((current) => current.map((row) => row.linkedJobId === job.gr_jobid ? { ...row, ...saved } : row))
            setIntakeRows((current) => current.map((row) => row.linkedJobId === job.gr_jobid ? { ...row, ...saved, intakeRecordId: row.intakeRecordId } : row))
        }} />}
        {canManageJobs && promotionRow && promotionReadiness && <div className="job-book-dialog-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPromotionRow(null)
        }}>
            <section className="job-book-dialog job-book-promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-dialog-title">
                <header><div><span className="job-book-eyebrow">SERVICE COORDINATION</span><h2 id="promotion-dialog-title">Manage job {promotionRow.jobNumber}</h2></div><button type="button" aria-label="Close" onClick={() => setPromotionRow(null)}>×</button></header>
                <p className="job-book-dialog-note">Review this entry before creating a managed Job for scheduling and technician allocation. It will keep the allocated job number and link back to this Intake entry.</p>
                <div className="job-book-promotion-summary">
                    <div><span>Equipment</span><strong>{promotionRow.fleet || promotionRow.serial || 'Unconfigured'}</strong></div>
                    <div><span>Customer / Site</span><strong>{[promotionRow.customer, promotionRow.site].filter(Boolean).join(' · ') || 'Not set'}</strong></div>
                    <div><span>Description</span><strong>{promotionRow.description}</strong></div>
                </div>
                <label className="job-book-promotion-type">Managed Job type<select value={promotionJobType} onChange={(event) => setPromotionJobType(Number(event.target.value) as JobType)}>{STANDARD_JOB_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                {!promotionReadiness.ready && <div className="job-book-promotion-warning"><strong>Review required before creating a managed Job</strong><ul>{promotionReadiness.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>}
                <div className="job-book-promotion-rule"><strong>Managed Job creation is not available yet.</strong><span>This entry is saved in the Job Book. Creating a managed Job remains disabled until the server-side handoff is connected.</span></div>
                <footer>
                    <button type="button" className="job-book-secondary" onClick={() => setPromotionRow(null)}>Close</button>
                    <button type="button" className="job-book-primary" disabled title="Managed Job creation from Intake is not enabled yet.">Create managed Job</button>
                </footer>
            </section>
        </div>}

    </main>
}
