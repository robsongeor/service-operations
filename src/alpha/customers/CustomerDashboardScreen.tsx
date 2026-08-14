import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import { useEquipmentManager } from '../equipment/hooks/useEquipmentManager'
import EquipmentDrawer from '../equipment/components/EquipmentDrawer'
import EquipmentDataQualityIndicator from '../equipment/components/EquipmentDataQualityIndicator'
import { compareEquipmentDataQuality } from '../equipment/dataQuality/equipmentDataQuality'
import BulkEquipmentImportDrawer from '../equipment/components/BulkEquipmentImportDrawer'
import EquipmentTransferDrawer from './EquipmentTransferDrawer'
import SiteSettingsDrawer from './SiteSettingsDrawer'
import { canUseBulkEquipmentImport } from '../equipment/utils/bulkEquipmentImport'
import { isRoadRegistered } from '../equipment/compliance/equipmentCompliance'
import { useJobs } from '../jobs/hooks/useJobs'
import JobCreateDrawer, { type JobCreateInitialValues } from '../jobs/components/JobCreateDrawer'
import JobEditDrawer from '../jobs/components/JobEditDrawer'
import JobCompletionWorkflow from '../jobs/components/JobCompletionWorkflow'
import type { Job } from '../jobs/types/job.types'
import { isOpenJob } from '../jobs/types/jobOpen'
import type { Equipment } from '../jobs/types/equipment.types'
import type { EquipmentCreateInitialValues } from '../equipment/types/equipmentManager.types'
import type { Customer } from '../jobs/types/customer.types'
import type { Site } from '../jobs/types/site.types'
import { calculateHoursRemaining, calculatePrimaryNextService, calculateServiceStatus } from '../equipment/servicePlans/servicePlanStatus'
import { SERVICE_TYPE_OPTIONS } from '../equipment/servicePlans/equipmentServicePlan.types'
import { MAINTENANCE_PROFILES } from '../equipment/servicePlans/maintenanceConfiguration'
import CustomerDrawer, { type CustomerDraft, type CustomerDrawerTab } from './CustomerDrawer'
import { customerContactsFromSiteLinks, type CustomerContact } from './customerContact.types'
import { usePurchaseOrderRecipients } from './usePurchaseOrderRecipients'
import CustomerOpenJobsTab from './CustomerOpenJobsTab'
import CustomerQuotesTab from './CustomerQuotesTab'
import SearchableSelect from '../shared/searchable-select/SearchableSelect'
import MetricStrip, { type MetricStripItem } from '../shared/metric-strip/MetricStrip'
import PageHeader from '../shared/page-header/PageHeader'
import PageSettingsButton from '../shared/settings/PageSettingsButton'
import { formatWofDateOnly, getWofDueStatus } from '../wof/utils/wofRules'
import { useSiteChecks } from '../site-checks/hooks/useSiteChecks'
import { buildSiteCheckDashboardProjection, type ReportableSiteCheckState } from '../site-checks/domain/siteCheckDashboard'
import { SITE_CHECK_FREQUENCY_OPTIONS } from '../site-checks/types/siteCheck.types'
import { currentNewZealandDateOnly } from '../shared/dates/dateOnly'
import RunSiteCheckDrawer from '../site-checks/components/RunSiteCheckDrawer'
import SiteCheckDetailsDrawer from '../site-checks/components/SiteCheckDetailsDrawer'
import type { SiteCheck } from '../site-checks/types/siteCheck.types'
import {
    getCustomerDashboardViewStateKey,
    restoreCustomerDashboardSelection,
    saveCustomerDashboardSelection,
} from './customerDashboardViewState'
import './CustomerDashboardScreen.css'

const dateFormatter = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' })
const CUSTOMER_DASHBOARD_AUTO_EXPAND_SITE_LIMIT = 2
const CUSTOMER_DASHBOARD_AUTO_EXPAND_EQUIPMENT_LIMIT = 10
type SiteEquipmentSortKey = 'fleet' | 'wofExpiry' | 'dataStatus'
type SiteEquipmentSort = { key: SiteEquipmentSortKey; direction: 'asc' | 'desc' }
type SiteCheckDashboardFilter = ReportableSiteCheckState | 'all'
const DEFAULT_SITE_EQUIPMENT_SORT: SiteEquipmentSort = { key: 'fleet', direction: 'asc' }

function display(value?: string | number | null) {
    return value == null || value === '' ? '-' : value
}

export default function CustomerDashboardScreen() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const activeAccount = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(activeAccount)
    const viewStorageKey = signedInUser ? getCustomerDashboardViewStateKey(signedInUser.storageId) : null
    const bulkImportAllowed = canUseBulkEquipmentImport(signedInUser)
    const {
        equipment,
        customers,
        sites,
        jobs: equipmentJobs,
        servicePlans,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        clearSaveError,
        updateSites,
        updateSiteMaintenanceSettings,
        transferEquipment,
        updateEquipment,
        createEquipment: createDashboardEquipment,
        createCustomer: createDashboardCustomer,
        createSite: createDashboardSite,
        saveEquipmentMaintenanceHistory,
        deleteEquipment,
    } = useEquipmentManager()
    const {
        jobs: operationalJobs,
        equipmentList: jobEquipmentList,
        mechanics,
        sites: jobSites,
        customers: jobCustomers,
        siteContacts,
        servicePlans: jobServicePlans,
        scheduleOptions,
        jobQuotes,
        jobAssignments,
        officeUpdates,
        createJob,
        createCustomer: createJobCustomer,
        createSite: createJobSite,
        createContactForSite,
        createEquipment: createJobEquipment,
        createScheduleOption,
        updateScheduleOption,
        deleteScheduleOption,
        updateJob,
        deleteJob,
        updateJobCardStatus,
        sendPrimaryJobEmail,
        sendAssignmentJobEmail,
        createJobAssignment,
        deleteJobAssignment,
        createJobOfficeUpdate,
        updateJobOfficeAttention,
        completionRequest,
        isCompletingJob,
        completionError,
        completeStandardJob,
        completeServiceJob,
        completeWofJob,
        setupEquipmentMaintenance,
        cancelJobCompletion,
        isLoading: isJobsLoading,
        loadError: jobsLoadError,
        fetchJobs,
    } = useJobs()

    const [selectedCustomerId, setSelectedCustomerId] = useState(() => viewStorageKey
        ? restoreCustomerDashboardSelection(viewStorageKey)
        : '')
    const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null)
    const [creatingEquipmentInitialValues, setCreatingEquipmentInitialValues] = useState<EquipmentCreateInitialValues | null>(null)
    const [bulkImportSite, setBulkImportSite] = useState<Site | null>(null)
    const [bulkImportSuccess, setBulkImportSuccess] = useState('')
    const [transferSite, setTransferSite] = useState<Site | null>(null)
    const [siteSettingsSite, setSiteSettingsSite] = useState<Site | null>(null)
    const [transferSuccess, setTransferSuccess] = useState('')
    const [expandedSitesByCustomer, setExpandedSitesByCustomer] = useState<Record<string, Record<string, boolean>>>({})
    const [equipmentSortBySite, setEquipmentSortBySite] = useState<Record<string, SiteEquipmentSort>>({})
    const [creatingJobInitialValues, setCreatingJobInitialValues] = useState<JobCreateInitialValues | null>(null)
    const [editingJob, setEditingJob] = useState<Job | null>(null)
    const [activeTab, setActiveTab] = useState<'sites' | 'open-jobs' | 'quotes' | 'contacts' | 'info'>('sites')
    const [customerDrawerMode, setCustomerDrawerMode] = useState<'create' | 'edit' | null>(null)
    const [customerDrawerInitialTab, setCustomerDrawerInitialTab] = useState<CustomerDrawerTab>('info')
    const [editingSiteId, setEditingSiteId] = useState('')
    const [siteSuccess, setSiteSuccess] = useState('')
    const [localCustomers, setLocalCustomers] = useState<Customer[]>([])
    const [customerDrafts, setCustomerDrafts] = useState<Record<string, CustomerDraft>>({})
    const [siteCheckFilter, setSiteCheckFilter] = useState<SiteCheckDashboardFilter>('all')
    const [runSiteCheckSite, setRunSiteCheckSite] = useState<Site | null>(null)
    const [siteCheckDetails, setSiteCheckDetails] = useState<{
        site: Site
        check?: SiteCheck | null
        tab: 'summary' | 'jobs' | 'history'
    } | null>(null)
    const siteCheckNestedTriggerRef = useRef<HTMLButtonElement | null>(null)
    const siteCheckDetailsTriggerRef = useRef<HTMLButtonElement | null>(null)
    const siteSettingsTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
    const sitesHeadingRef = useRef<HTMLHeadingElement>(null)

    useEffect(() => {
        if (!viewStorageKey) return
        saveCustomerDashboardSelection(viewStorageKey, selectedCustomerId)
    }, [selectedCustomerId, viewStorageKey])

    useEffect(() => {
        const customerId = searchParams.get('customerId')
        const siteId = searchParams.get('siteId')
        if (!customerId || !customers.some((customer) => customer.gr_customerid.toLowerCase() === customerId.toLowerCase())) return
        const timer = window.setTimeout(() => {
            setSelectedCustomerId(customerId)
            setActiveTab('sites')
            if (siteId) {
                setExpandedSitesByCustomer((current) => ({
                    ...current,
                    [customerId]: { ...current[customerId], [siteId]: true },
                }))
            }
            const next = new URLSearchParams(searchParams)
            next.delete('customerId')
            next.delete('siteId')
            setSearchParams(next, { replace: true })
            window.setTimeout(() => sitesHeadingRef.current?.focus(), 0)
        }, 0)
        return () => window.clearTimeout(timer)
    }, [customers, searchParams, setSearchParams])

    const allCustomers = useMemo(() => [...customers, ...localCustomers].map((customer) => ({
        ...customer,
        gr_name: customerDrafts[customer.gr_customerid]?.name ?? customer.gr_name,
    })), [customerDrafts, customers, localCustomers])

    const allSites = useMemo(() => {
        const customersWithDrafts = new Set(Object.keys(customerDrafts))
        const unchangedSites = sites.filter((site) => !site.gr_Customer?.gr_customerid || !customersWithDrafts.has(site.gr_Customer.gr_customerid))
        const draftSites: Site[] = Object.entries(customerDrafts).flatMap(([customerId, draft]) => draft.sites.map((site) => ({
            gr_siteid: site.id,
            gr_name: site.name,
            gr_address: site.address,
            gr_defaultmaintenanceprofile: null,
            gr_Customer: { gr_customerid: customerId, gr_name: draft.name },
        })))
        return [...unchangedSites, ...draftSites]
    }, [customerDrafts, sites])

    const customerOptions = useMemo(() => {
        return allCustomers
            .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
            .map((customer) => ({ value: customer.gr_customerid, label: customer.gr_name }))
    }, [allCustomers])

    const selectedCustomer = allCustomers.find((customer) => customer.gr_customerid === selectedCustomerId)
    useEffect(() => {
        if (!viewStorageKey || isLoading || loadError || !selectedCustomerId || selectedCustomer) return
        saveCustomerDashboardSelection(viewStorageKey, '')
    }, [isLoading, loadError, selectedCustomer, selectedCustomerId, viewStorageKey])
    const poRecipients = usePurchaseOrderRecipients(selectedCustomer?.gr_customerid)
    const customerSites = allSites
        .filter((site) => site.gr_Customer?.gr_customerid === selectedCustomerId)
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
    const persistedCustomerSiteIds = customerSites
        .filter((site) => !site.gr_siteid.startsWith('prototype-site-'))
        .map((site) => site.gr_siteid)
    const siteChecks = useSiteChecks(persistedCustomerSiteIds)
    const siteCheckDashboard = buildSiteCheckDashboardProjection({
        schedules: siteChecks.schedules,
        siteChecks: siteChecks.siteChecks,
        jobs: siteChecks.jobs,
        today: currentNewZealandDateOnly(),
    })
    const siteCheckEnabledSiteIds = siteChecks.schedules
        .filter((schedule) => schedule.gr_enabled)
        .map((schedule) => schedule._gr_site_value)
    const siteCheckBySite = new Map(siteCheckDashboard.items.map((item) => [item.siteId, item]))
    const visibleCustomerSites = siteCheckFilter === 'all'
        ? customerSites
        : customerSites.filter((site) =>
            siteCheckBySite.get(site.gr_siteid.toLowerCase())?.state === siteCheckFilter)
    const applySiteCheckFilter = (filter: ReportableSiteCheckState) => {
        const nextFilter = siteCheckFilter === filter ? 'all' : filter
        setActiveTab('sites')
        setSiteCheckFilter(nextFilter)
        if (nextFilter !== 'all') {
            const matchingSiteIds = customerSites
                .filter((site) => siteCheckBySite.get(site.gr_siteid.toLowerCase())?.state === nextFilter)
                .map((site) => site.gr_siteid)
            setExpandedSitesByCustomer((current) => ({
                ...current,
                [selectedCustomerId]: {
                    ...current[selectedCustomerId],
                    ...Object.fromEntries(matchingSiteIds.map((siteId) => [siteId, true])),
                },
            }))
        }
        window.setTimeout(() => sitesHeadingRef.current?.focus(), 0)
    }
    const selectedCustomerDraft = customerDrafts[selectedCustomerId]
    const customerContacts: CustomerContact[] = [
        ...(selectedCustomerDraft?.accountsContact ? [{
            id: `prototype-accounts-${selectedCustomerId}`,
            name: selectedCustomerDraft.accountsContact,
            phone: selectedCustomerDraft.accountsPhone || undefined,
            email: selectedCustomerDraft.accountsEmail || undefined,
            role: 'Accounts',
            siteIds: [],
            isPrimary: true,
        }] : []),
        ...customerContactsFromSiteLinks(siteContacts, new Set(customerSites.map((site) => site.gr_siteid))),
        ...poRecipients.recipients.flatMap((recipient) => recipient.gr_Contact ? [{
            id: recipient.gr_Contact.gr_contactid,
            name: recipient.gr_Contact.gr_name,
            phone: recipient.gr_Contact.gr_phone ?? undefined,
            email: recipient.gr_Contact.gr_email ?? undefined,
            siteIds: recipient._gr_site_value ? [recipient._gr_site_value] : [],
        }] : []),
    ].filter((contact, index, all) => all.findIndex((candidate) => candidate.id.toLowerCase() === contact.id.toLowerCase()) === index)
    const customerEquipment = equipment.filter((item) =>
        item.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const selectedCustomerSiteState = expandedSitesByCustomer[selectedCustomerId] ?? {}
    const siteIsExpanded = (siteId: string) => selectedCustomerSiteState[siteId] ?? false
    const setSiteExpanded = (siteId: string, expanded: boolean) => {
        if (!selectedCustomerId) return
        setExpandedSitesByCustomer((current) => ({
            ...current,
            [selectedCustomerId]: {
                ...current[selectedCustomerId],
                [siteId]: expanded,
            },
        }))
    }
    const setAllSitesExpanded = (expanded: boolean) => {
        if (!selectedCustomerId) return
        setExpandedSitesByCustomer((current) => ({
            ...current,
            [selectedCustomerId]: Object.fromEntries(customerSites.map((site) => [site.gr_siteid, expanded])),
        }))
    }
    const initialiseCustomerSiteState = (customerId: string) => {
        if (!customerId) return
        setExpandedSitesByCustomer((current) => {
            if (current[customerId]) return current
            const nextSites = allSites.filter((site) => site.gr_Customer?.gr_customerid === customerId)
            const nextEquipment = equipment.filter((item) =>
                item.gr_Site?.gr_Customer?.gr_customerid === customerId,
            )
            const expandByDefault = nextSites.length <= CUSTOMER_DASHBOARD_AUTO_EXPAND_SITE_LIMIT
                && nextEquipment.length <= CUSTOMER_DASHBOARD_AUTO_EXPAND_EQUIPMENT_LIMIT
            return {
                ...current,
                [customerId]: Object.fromEntries(nextSites.map((site) => [site.gr_siteid, expandByDefault])),
            }
        })
    }
    const customerJobs = operationalJobs.filter((job) =>
        job.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const openJobs = customerJobs.filter(isOpenJob)
    const customerQuotes = jobQuotes.filter((quote) =>
        quote.gr_Job?.gr_Site?.gr_Customer?.gr_customerid === selectedCustomerId,
    )
    const lastJob = [...customerJobs].sort((a, b) => b.createdon.localeCompare(a.createdon))[0]

    const maintenanceCounts = customerEquipment.reduce((counts, item) => {
        const plans = servicePlans.filter((plan) =>
            plan._gr_equipment_value?.toLowerCase() === item.gr_equipmentid.toLowerCase(),
        )
        const primary = calculatePrimaryNextService(plans, item)
        const status = primary ? calculateServiceStatus(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours, primary.gr_nextduedate) : null
        if (status === 'Due Soon') counts.dueSoon += 1
        if (status === 'Overdue' || status === 'Due') counts.overdue += 1
        return counts
    }, { dueSoon: 0, overdue: 0 })
    const roadComplianceCounts = customerEquipment.filter(isRoadRegistered).reduce((counts, item) => {
        const status = getWofDueStatus(true, item.gr_currentwofexpiry)
        if (status === 'expired') counts.expired += 1
        else if (status === 'due-soon') counts.dueSoon += 1
        else if (status === 'current') counts.current += 1
        return counts
    }, { current: 0, dueSoon: 0, expired: 0 })

    const summaryMetrics: MetricStripItem[] = [
        { label: 'Sites', value: customerSites.length },
        { label: 'Equipment', value: customerEquipment.length },
        { label: 'Open Jobs', value: openJobs.length },
        {
            label: 'Checks Up to date',
            value: siteCheckDashboard.summary['up-to-date'],
            active: siteCheckFilter === 'up-to-date',
            onActivate: () => applySiteCheckFilter('up-to-date'),
        },
        {
            label: 'Checks Due',
            value: siteCheckDashboard.summary.due,
            tone: 'warning',
            active: siteCheckFilter === 'due',
            onActivate: () => applySiteCheckFilter('due'),
        },
        {
            label: 'Checks Overdue',
            value: siteCheckDashboard.summary.overdue,
            tone: 'danger',
            active: siteCheckFilter === 'overdue',
            onActivate: () => applySiteCheckFilter('overdue'),
        },
        {
            label: 'Checks In progress',
            value: siteCheckDashboard.summary['in-progress'],
            active: siteCheckFilter === 'in-progress',
            onActivate: () => applySiteCheckFilter('in-progress'),
        },
        { label: 'Services Due Soon', value: maintenanceCounts.dueSoon, tone: 'warning' },
        { label: 'Overdue Services', value: maintenanceCounts.overdue, tone: 'danger' },
        { label: 'WOF Current', value: roadComplianceCounts.current },
        { label: 'WOF Due Soon', value: roadComplianceCounts.dueSoon, tone: 'warning' },
        { label: 'WOF Expired', value: roadComplianceCounts.expired, tone: 'danger' },
        { label: 'Last Job Date', value: lastJob ? dateFormatter.format(new Date(lastJob.createdon)) : '-' },
    ]

    const equipmentForSite = (site: Site) => {
        const sort = equipmentSortBySite[site.gr_siteid] ?? DEFAULT_SITE_EQUIPMENT_SORT
        return customerEquipment
            .filter((item) => item.gr_Site?.gr_siteid === site.gr_siteid)
            .sort((left, right) => {
                if (sort.key === 'dataStatus') {
                    const plansFor = (item: Equipment) => servicePlans.filter((plan) =>
                        plan._gr_equipment_value?.toLowerCase() === item.gr_equipmentid.toLowerCase(),
                    )
                    return compareEquipmentDataQuality(left, plansFor(left), right, plansFor(right), sort.direction)
                }
                const leftValue = sort.key === 'fleet' ? left.gr_fleet : left.gr_currentwofexpiry
                const rightValue = sort.key === 'fleet' ? right.gr_fleet : right.gr_currentwofexpiry
                const leftEmpty = !leftValue
                const rightEmpty = !rightValue
                if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1
                if (leftEmpty && rightEmpty) return 0
                const comparison = sort.key === 'fleet'
                    ? leftValue!.localeCompare(rightValue!, undefined, { numeric: true, sensitivity: 'base' })
                    : leftValue!.localeCompare(rightValue!)
                return comparison * (sort.direction === 'asc' ? 1 : -1)
            })
    }

    const changeEquipmentSort = (siteId: string, key: SiteEquipmentSortKey) => {
        setEquipmentSortBySite((current) => {
            const existing = current[siteId] ?? DEFAULT_SITE_EQUIPMENT_SORT
            return {
                ...current,
                [siteId]: {
                    key,
                    direction: existing.key === key && existing.direction === 'asc' ? 'desc' : 'asc',
                },
            }
        })
    }

    const initialJobValuesForCustomer = (customer: Customer): JobCreateInitialValues => {
        const onlySite = customerSites.length === 1 ? customerSites[0] : undefined
        return { customerId: customer.gr_customerid, siteId: onlySite?.gr_siteid ?? '' }
    }

    const initialJobValuesForEquipment = (record: Equipment): JobCreateInitialValues => ({
        equipmentId: record.gr_equipmentid,
        siteId: record.gr_Site?.gr_siteid ?? '',
        customerId: record.gr_Site?.gr_Customer?.gr_customerid ?? selectedCustomerId,
    })

    const customerDrawerInitialValue = selectedCustomer ? customerDrafts[selectedCustomer.gr_customerid] ?? {
        name: selectedCustomer.gr_name,
        accountsContact: '',
        accountsPhone: '',
        accountsEmail: '',
        purchaseOrderRequirements: '',
        notes: '',
        sites: customerSites.map((site) => ({
            id: site.gr_siteid,
            name: site.gr_name,
            address: site.gr_address,
            operatingHours: '',
        })),
    } : undefined

    const saveCustomerDraft = async (draft: CustomerDraft) => {
        if (customerDrawerMode === 'create') {
            const customerId = `prototype-customer-${crypto.randomUUID()}`
            setLocalCustomers((current) => [...current, { gr_customerid: customerId, gr_name: draft.name }])
            setCustomerDrafts((current) => ({ ...current, [customerId]: draft }))
            setExpandedSitesByCustomer((current) => ({
                ...current,
                [customerId]: Object.fromEntries(draft.sites.map((site) => [site.id, true])),
            }))
            setSelectedCustomerId(customerId)
            setActiveTab('sites')
            setCustomerDrawerMode(null)
            return draft
        } else if (selectedCustomer) {
            const existingSites = new Map(sites.map((site) => [site.gr_siteid, site]))
            const siteUpdates = draft.sites
                .filter((site) => existingSites.has(site.id))
                .filter((site) => {
                    const current = existingSites.get(site.id)!
                    return site.name.trim() !== current.gr_name.trim()
                        || site.address.trim() !== (current.gr_address ?? '').trim()
                })
                .map((site) => ({
                    siteId: site.id,
                    input: { name: site.name, address: site.address },
                }))
            const newSiteDrafts = draft.sites.filter((site) => site.id.startsWith('prototype-site-'))
            const [, createdSites] = await Promise.all([
                updateSites(siteUpdates),
                Promise.all(newSiteDrafts.map((site) => createDashboardSite({
                    customerId: selectedCustomer.gr_customerid,
                    name: site.name,
                    address: site.address,
                }, selectedCustomer))),
            ])
            const createdSitesByPrototypeId = new Map(newSiteDrafts.map((site, index) => [site.id, createdSites[index]]))
            const persistedDraft = {
                ...draft,
                sites: draft.sites.map((site) => {
                    const created = createdSitesByPrototypeId.get(site.id)
                    return created ? {
                        ...site,
                        id: created.gr_siteid,
                        name: created.gr_name,
                        address: created.gr_address ?? '',
                    } : site
                }),
            }
            setCustomerDrafts((current) => ({ ...current, [selectedCustomer.gr_customerid]: persistedDraft }))
            if (createdSites.length > 0) {
                setExpandedSitesByCustomer((current) => ({
                    ...current,
                    [selectedCustomer.gr_customerid]: {
                        ...current[selectedCustomer.gr_customerid],
                        ...Object.fromEntries(createdSites.map((site) => [site.gr_siteid, true])),
                    },
                }))
            }
            return persistedDraft
        }
        throw new Error('Select a Customer before saving Site changes.')
    }

    return <main className="customer-dashboard-page">
        <PageHeader
            eyebrow="Customers"
            title="Customer Dashboard"
            subtitle="Manage customer sites, equipment, jobs, and service activity from one workspace."
            actions={<div className="customer-dashboard-header-actions">
                <SearchableSelect
                    id="customer-dashboard-customer"
                    label="Customer"
                    value={selectedCustomer?.gr_customerid ?? ''}
                    options={customerOptions}
                    onChange={(customerId) => { initialiseCustomerSiteState(customerId); setSelectedCustomerId(customerId); setActiveTab('sites'); setSiteSuccess('') }}
                    autoFocus
                    placeholder="Select a customer"
                    searchPlaceholder="Search customers"
                    emptyLabel="No matching customers"
                />
                <button className="page-header-primary-action" type="button" onClick={() => setCustomerDrawerMode('create')}>+ Create Customer</button>
            </div>}
        />

        {isLoading ? <section className="customer-dashboard-state">Loading customer data...</section> : loadError ? (
            <section className="customer-dashboard-state error">
                <div><strong>Customer dashboard could not be loaded.</strong><p>{loadError}</p></div>
                <button type="button" onClick={() => void reload()}>Try again</button>
            </section>
        ) : !selectedCustomer ? (
            <section className="customer-dashboard-empty">
                <strong>Select a Customer</strong>
                <p>Choose a customer above to view sites, equipment, jobs, and the dashboard foundation for future service history and reporting.</p>
            </section>
        ) : <>
            {(bulkImportSuccess || transferSuccess || siteSuccess) && <div className="customer-dashboard-success" role="status">{siteSuccess || transferSuccess || bulkImportSuccess}</div>}
            <section className="customer-dashboard-header">
                <div>
                    <span>Customer account</span>
                    <h2>{selectedCustomer.gr_name}</h2>
                </div>
                <div className="customer-dashboard-actions">
                    <button
                        type="button"
                        disabled={selectedCustomer.gr_customerid.startsWith('prototype-customer-')}
                        title={selectedCustomer.gr_customerid.startsWith('prototype-customer-') ? 'Save this Customer to Dataverse before creating Jobs.' : undefined}
                        onClick={() => setCreatingJobInitialValues(initialJobValuesForCustomer(selectedCustomer))}
                    >Create Job</button>
                    <button type="button" onClick={() => { setCustomerDrawerInitialTab('sites'); setCustomerDrawerMode('edit') }}>Add Site</button>
                    <button type="button" onClick={() => { setCustomerDrawerInitialTab('info'); setCustomerDrawerMode('edit') }}>Edit Customer</button>
                </div>
            </section>

            <MetricStrip items={summaryMetrics} ariaLabel="Customer summary" />

            <nav className="customer-dashboard-tabs" aria-label="Customer sections" role="tablist">
                <button type="button" role="tab" aria-selected={activeTab === 'sites'} className={activeTab === 'sites' ? 'active' : ''} onClick={() => setActiveTab('sites')}>Sites <span>{customerSites.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'open-jobs'} className={activeTab === 'open-jobs' ? 'active' : ''} onClick={() => setActiveTab('open-jobs')}>Open Jobs <span>{openJobs.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'quotes'} className={activeTab === 'quotes' ? 'active' : ''} onClick={() => setActiveTab('quotes')}>Quotes <span>{customerQuotes.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'contacts'} className={activeTab === 'contacts' ? 'active' : ''} onClick={() => setActiveTab('contacts')}>Contacts <span>{customerContacts.length}</span></button>
                <button type="button" role="tab" aria-selected={activeTab === 'info'} className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>Info</button>
            </nav>

            {activeTab === 'sites' ? <section className="customer-dashboard-content" role="tabpanel">
                <div className="customer-section-heading">
                    <div>
                        <span>Current section</span>
                        <h3 ref={sitesHeadingRef} tabIndex={-1}>Sites and Equipment</h3>
                    </div>
                    <div className="customer-site-expand-actions">
                        {customerSites.length > 1 && <>
                            <button type="button" onClick={() => setAllSitesExpanded(true)}>Expand all</button>
                            <button type="button" onClick={() => setAllSitesExpanded(false)}>Collapse all</button>
                        </>}
                        <small>Future sections: Overview, Jobs, Service History, Contacts, Documents, Audit Reporting</small>
                    </div>
                </div>

                <div className="customer-site-check-feedback" aria-live="polite">
                    {siteChecks.isLoading
                        ? 'Loading Site Check status…'
                        : siteChecks.loadError
                            ? `Site Check status is unavailable. ${siteChecks.loadError}`
                            : siteCheckFilter !== 'all'
                                ? <span>Showing {visibleCustomerSites.length} {siteCheckFilter.replaceAll('-', ' ')} Site{visibleCustomerSites.length === 1 ? '' : 's'}. <button type="button" onClick={() => setSiteCheckFilter('all')}>Clear filter</button></span>
                                : siteCheckDashboard.invalidCount > 0
                                    ? `${siteCheckDashboard.invalidCount} enabled Site Check Schedule${siteCheckDashboard.invalidCount === 1 ? ' is' : 's are'} incomplete and excluded from the summary.`
                                    : ''}
                </div>

                {customerSites.length === 0 ? <div className="customer-dashboard-empty compact">No sites have been recorded for this customer yet.</div>
                    : visibleCustomerSites.length === 0 ? <div className="customer-dashboard-empty compact">No Sites match this Site Check filter.</div>
                        : visibleCustomerSites.map((site) => {
                    const rows = equipmentForSite(site)
                    const equipmentSort = equipmentSortBySite[site.gr_siteid] ?? DEFAULT_SITE_EQUIPMENT_SORT
                    const operatingHours = customerDrafts[selectedCustomer.gr_customerid]?.sites.find((item) => item.id === site.gr_siteid)?.operatingHours
                    const expanded = siteIsExpanded(site.gr_siteid)
                    const equipmentRegionId = `customer-site-equipment-${site.gr_siteid}`
                    const siteCheck = siteCheckBySite.get(site.gr_siteid.toLowerCase())
                    const frequency = SITE_CHECK_FREQUENCY_OPTIONS.find(
                        (option) => option.value === siteCheck?.schedule.gr_frequency,
                    )?.label
                    const technician = siteCheck?.activeSiteCheck
                        ? mechanics.find((item) =>
                            item.gr_mechanicid.toLowerCase()
                            === siteCheck.activeSiteCheck?._gr_assignedtechnician_value.toLowerCase())
                        : undefined
                    return <article className="customer-site-card" key={site.gr_siteid}>
                        <header onClick={() => setSiteExpanded(site.gr_siteid, !expanded)}>
                            <button
                                type="button"
                                className="customer-site-header-toggle"
                                aria-expanded={expanded}
                                aria-controls={equipmentRegionId}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    setSiteExpanded(site.gr_siteid, !expanded)
                                }}
                            >
                                <span className="customer-site-chevron" aria-hidden="true">
                                    <svg viewBox="0 0 20 20"><path d="m7 4 6 6-6 6" /></svg>
                                </span>
                                <span className="customer-site-heading"><span><strong>{site.gr_name || 'Unnamed Site'}</strong><small>{site.gr_address || 'No address recorded'}</small></span></span>
                                <span className="customer-site-header-summary">
                                    <span><small>Operating hours</small><strong>{operatingHours || 'Not recorded'}</strong></span>
                                    {siteCheck?.schedule.gr_enabled && <span className="customer-site-check-summary" data-state={siteCheck.state}>
                                        <small>Site Check</small>
                                        <strong>{siteCheck.state === 'in-progress'
                                            ? `${siteCheck.progress?.completed ?? 0}/${siteCheck.progress?.total ?? 0} complete`
                                            : siteCheck.state === 'invalid'
                                                ? 'Schedule incomplete'
                                                : siteCheck.state.replaceAll('-', ' ')}</strong>
                                        <small>{siteCheck.state === 'in-progress'
                                            ? `${technician?.gr_name ?? 'Technician unavailable'} · ${siteCheck.progress?.remaining ?? 0} remaining`
                                            : `${frequency ?? 'Frequency unavailable'} · ${formatWofDateOnly(siteCheck.schedule.gr_nextduedate) || 'No due date'}`}</small>
                                    </span>}
                                    <span>{rows.length} Equipment</span>
                                </span>
                            </button>
                            <div className="customer-site-meta" onClick={(event) => event.stopPropagation()}>
                                {(siteCheck?.state === 'due' || siteCheck?.state === 'overdue') && <button
                                    type="button"
                                    onClick={() => {
                                        siteChecks.clearStartError()
                                        setRunSiteCheckSite(site)
                                    }}
                                >
                                    Run Site Check
                                </button>}
                                {siteCheck?.schedule.gr_enabled && <button
                                    type="button"
                                    onClick={(event) => {
                                        siteCheckDetailsTriggerRef.current = event.currentTarget
                                        setSiteCheckDetails({
                                            site,
                                            check: siteCheck.activeSiteCheck,
                                            tab: siteCheck.state === 'in-progress'
                                                && siteCheck.activeSiteCheck
                                                ? 'summary'
                                                : 'history',
                                        })
                                    }}
                                >
                                    {siteCheck.state === 'in-progress' && siteCheck.activeSiteCheck
                                        ? 'View Current Site Check'
                                        : 'Site Check History'}
                                </button>}
                                <button
                                    type="button"
                                    disabled={site.gr_siteid.startsWith('prototype-site-') || selectedCustomer.gr_customerid.startsWith('prototype-customer-')}
                                    title={site.gr_siteid.startsWith('prototype-site-') ? 'Save this Site to Dataverse before creating Equipment.' : 'Create Equipment at this Site'}
                                    onClick={() => {
                                        clearSaveError()
                                        setSiteExpanded(site.gr_siteid, true)
                                        setCreatingEquipmentInitialValues({
                                            customerId: selectedCustomer.gr_customerid,
                                            customerName: selectedCustomer.gr_name,
                                            siteId: site.gr_siteid,
                                            siteName: site.gr_name,
                                            maintenanceProfile: site.gr_defaultmaintenanceprofile ?? MAINTENANCE_PROFILES.STANDARD,
                                        })
                                    }}
                                >
                                    New Equipment
                                </button>
                                {!site.gr_siteid.startsWith('prototype-site-')
                                    && !selectedCustomer.gr_customerid.startsWith('prototype-customer-')
                                    && <PageSettingsButton
                                        ref={(element) => {
                                            siteSettingsTriggerRefs.current[site.gr_siteid] = element
                                        }}
                                        title="Site settings"
                                        ariaLabel={`Site settings for ${site.gr_name}`}
                                        onClick={() => {
                                            clearSaveError()
                                            setSiteSuccess('')
                                            setSiteSettingsSite(site)
                                        }}
                                    />}
                                {!site.gr_siteid.startsWith('prototype-site-')
                                    && !selectedCustomer.gr_customerid.startsWith('prototype-customer-')
                                    && <button
                                        type="button"
                                        title={`Transfer existing Equipment to ${site.gr_name}`}
                                        onClick={() => {
                                            clearSaveError()
                                            setTransferSuccess('')
                                            setTransferSite(site)
                                        }}
                                    >
                                        Transfer Equipment
                                    </button>}
                            </div>
                        </header>
                        <div className="customer-equipment-table-wrap" id={equipmentRegionId} hidden={!expanded}>
                            <table className="customer-equipment-table">
                                <thead><tr>
                                    <th aria-sort={equipmentSort.key === 'fleet' ? (equipmentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <button type="button" className="customer-equipment-sort" onClick={() => changeEquipmentSort(site.gr_siteid, 'fleet')}>Fleet Number <span aria-hidden="true">{equipmentSort.key === 'fleet' ? (equipmentSort.direction === 'asc' ? '↑' : '↓') : ''}</span></button>
                                    </th>
                                    <th>Make</th><th>Model</th><th>Registration</th>
                                    <th aria-sort={equipmentSort.key === 'wofExpiry' ? (equipmentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <button type="button" className="customer-equipment-sort" onClick={() => changeEquipmentSort(site.gr_siteid, 'wofExpiry')}>WOF Expiry <span aria-hidden="true">{equipmentSort.key === 'wofExpiry' ? (equipmentSort.direction === 'asc' ? '↑' : '↓') : ''}</span></button>
                                    </th>
                                    <th>Last Known Hour Meter</th><th>Next Service</th><th>Maintenance Status</th>
                                    <th className="customer-equipment-data-quality-heading" aria-sort={equipmentSort.key === 'dataStatus' ? (equipmentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <button type="button" className="customer-equipment-sort" onClick={() => changeEquipmentSort(site.gr_siteid, 'dataStatus')} aria-label="Sort by Data status">
                                            <span className="customer-visually-hidden">Data status</span>
                                            <span aria-hidden="true">{equipmentSort.key === 'dataStatus' ? (equipmentSort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                </tr></thead>
                                <tbody>
                                    {rows.length === 0 ? <tr><td colSpan={9}>No equipment recorded for this site.</td></tr> : rows.map((item) => {
                                        const plans = servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === item.gr_equipmentid.toLowerCase())
                                        const primary = calculatePrimaryNextService(plans, item)
                                        const remaining = primary ? calculateHoursRemaining(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours) : null
                                        const status = primary ? calculateServiceStatus(item.gr_currenthourmeter ?? 0, primary.gr_nextduehours) : null
                                        const serviceLabel = primary ? SERVICE_TYPE_OPTIONS.find((option) => option.value === primary.gr_servicetype)?.label : null
                                        return <tr key={item.gr_equipmentid} tabIndex={0} onClick={() => { clearSaveError(); setEditingEquipment(item) }} onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault()
                                                clearSaveError()
                                                setEditingEquipment(item)
                                            }
                                        }}>
                                            <td><strong>{display(item.gr_fleet)}</strong></td>
                                            <td>{display(item.gr_make)}</td>
                                            <td>{display(item.gr_model)}</td>
                                            <td>{display(item.gr_registrationnumber)}</td>
                                            <td>{display(formatWofDateOnly(item.gr_currentwofexpiry))}</td>
                                            <td>{display(item.gr_currenthourmeter)}
                                                {item.gr_currenthourmeterrecordeddate && <small>Recorded {formatWofDateOnly(item.gr_currenthourmeterrecordeddate)}</small>}
                                            </td>
                                            <td>{primary ? `${serviceLabel} @ ${primary.gr_nextduehours}` : 'Not Configured'}{remaining != null && <small>{Math.abs(remaining)} hrs {remaining < 0 ? 'overdue' : 'remaining'}</small>}</td>
                                            <td><span className={`customer-maintenance-status status-${status?.toLowerCase().replace(' ', '-') ?? 'unknown'}`}>{status ?? 'Unknown'}</span></td>
                                            <td className="customer-equipment-data-quality"><EquipmentDataQualityIndicator equipment={item} servicePlans={plans} /></td>
                                        </tr>
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </article>
                })}
            </section> : activeTab === 'open-jobs' ? <CustomerOpenJobsTab
                jobs={openJobs}
                officeUpdates={officeUpdates}
                isLoading={isJobsLoading}
                error={jobsLoadError}
                onOpenJob={setEditingJob}
            /> : activeTab === 'quotes' ? <CustomerQuotesTab
                quotes={customerQuotes}
                sites={customerSites}
                isLoading={isJobsLoading}
                error={jobsLoadError}
                onOpenQuote={(quote) => navigate(`/quotes?quoteId=${encodeURIComponent(quote.gr_quoteid)}`)}
            /> : activeTab === 'contacts' ? <section className="customer-contacts-panel" role="tabpanel">
                <header>
                    <div><span>Customer contacts</span><h3>Contacts</h3></div>
                    <button type="button" disabled title="Contact editing will be added in a future prototype iteration.">+ Add Contact</button>
                </header>
                {customerContacts.length === 0 ? <div className="customer-contacts-empty">
                    <strong>No contacts have been added for this Customer.</strong>
                    <p>Customer-wide and Site-linked contacts will appear here.</p>
                    <button type="button" disabled>Add Contact</button>
                </div> : <div className="customer-contact-list">
                    {customerContacts.map((contact) => {
                        const linkedSites = contact.siteIds
                            .map((siteId) => customerSites.find((site) => site.gr_siteid === siteId))
                            .filter((site): site is Site => Boolean(site))
                        const visibleSites = linkedSites.slice(0, 3)
                        const additionalSiteCount = linkedSites.length - visibleSites.length
                        return <article key={contact.id}>
                            <div className="customer-contact-identity">
                                <div><strong>{contact.name}</strong>{contact.isPrimary && <span>Primary</span>}</div>
                                {contact.role && <small>{contact.role}</small>}
                            </div>
                            <div className="customer-contact-details">
                                {contact.phone && <span>{contact.phone}</span>}
                                {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
                                {!contact.phone && !contact.email && <span className="muted">No contact details recorded</span>}
                            </div>
                            <div className="customer-contact-sites">
                                {linkedSites.length === 0 ? <span className="customer-wide">Customer-wide</span> : <>
                                    {visibleSites.map((site) => <span key={site.gr_siteid}>{site.gr_name || 'Unnamed Site'}</span>)}
                                    {additionalSiteCount > 0 && <span>+{additionalSiteCount} more</span>}
                                </>}
                            </div>
                        </article>
                    })}
                </div>}
            </section> : <section className="customer-info-panel" role="tabpanel">
                <header>
                    <div><span>Customer information</span><h3>{selectedCustomer.gr_name}</h3></div>
                    <button type="button" onClick={() => { setCustomerDrawerInitialTab('info'); setCustomerDrawerMode('edit') }}>Edit information</button>
                </header>
                <dl className="customer-info-summary">
                    <div><dt>Name</dt><dd>{selectedCustomer.gr_name}</dd></div>
                    <div><dt>Accounts Contact</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.accountsContact || 'Not recorded'}</dd></div>
                    <div><dt>Accounts Phone</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.accountsPhone || 'Not recorded'}</dd></div>
                    <div><dt>Accounts Email</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.accountsEmail || 'Not recorded'}</dd></div>
                    <div><dt>Purchase Order Requirements</dt><dd>{customerDrafts[selectedCustomer.gr_customerid]?.purchaseOrderRequirements || 'Not recorded'}</dd></div>
                    <div><dt>Site Count</dt><dd>{customerSites.length} {customerSites.length === 1 ? 'Site' : 'Sites'}</dd></div>
                    <div><dt>Contact Count</dt><dd>{customerContacts.length} {customerContacts.length === 1 ? 'Contact' : 'Contacts'}</dd></div>
                </dl>
                <div className="customer-info-notes">
                    <div className="customer-section-heading"><div><span>Long-term information</span><h3>Customer Notes</h3></div></div>
                    <p>{customerDrafts[selectedCustomer.gr_customerid]?.notes || 'No Customer notes have been recorded.'}</p>
                </div>
                {!customerDrafts[selectedCustomer.gr_customerid] && <p className="customer-info-prototype-note">Customer information is currently a local prototype and is not loaded from Dataverse.</p>}
            </section>}
        </>}

        {siteCheckDetails && selectedCustomer && <SiteCheckDetailsDrawer
            key={`${siteCheckDetails.site.gr_siteid}-${siteCheckDetails.check?.gr_sitecheckid ?? 'history'}`}
            customerName={selectedCustomer.gr_name}
            siteName={siteCheckDetails.site.gr_name}
            siteAddress={siteCheckDetails.site.gr_address}
            siteId={siteCheckDetails.site.gr_siteid}
            initialSiteCheck={siteCheckDetails.check}
            initialTab={siteCheckDetails.tab}
            technicianName={(id) => mechanics.find(
                (mechanic) => mechanic.gr_mechanicid.toLowerCase() === id.toLowerCase(),
            )?.gr_name ?? 'Technician unavailable'}
            loadHistoryPage={siteChecks.loadHistoryPage}
            loadJobsPage={siteChecks.loadDetailJobsPage}
            loadAllJobs={siteChecks.loadAllDetailJobs}
            loadAllEquipmentExclusions={siteChecks.loadAllEquipmentExclusions}
            allocateJobNumbers={siteChecks.allocateJobNumbers}
            prepareAssignmentEmail={siteChecks.prepareAssignmentEmail}
            onDelete={async (check) => {
                await siteChecks.deleteOccurrence(check)
                await fetchJobs()
                const trigger = siteCheckDetailsTriggerRef.current
                siteCheckNestedTriggerRef.current = null
                siteCheckDetailsTriggerRef.current = null
                setSiteCheckDetails(null)
                window.setTimeout(() => trigger?.focus(), 0)
            }}
            onOpenJob={(jobId, trigger) => {
                const job = operationalJobs.find((item) => item.gr_jobid.toLowerCase() === jobId.toLowerCase())
                if (!job) return
                siteCheckNestedTriggerRef.current = trigger
                setEditingJob(job)
            }}
            onOpenEquipment={(equipmentId, trigger) => {
                const record = equipment.find((item) => item.gr_equipmentid.toLowerCase() === equipmentId.toLowerCase())
                if (!record) return
                siteCheckNestedTriggerRef.current = trigger
                setEditingEquipment(record)
            }}
            onClose={() => {
                const trigger = siteCheckDetailsTriggerRef.current
                siteCheckNestedTriggerRef.current = null
                siteCheckDetailsTriggerRef.current = null
                setSiteCheckDetails(null)
                window.setTimeout(() => trigger?.focus(), 0)
            }}
        />}

        {editingEquipment && <EquipmentDrawer
            mode="edit"
            equipment={editingEquipment}
            equipmentList={equipment}
            servicePlans={servicePlans.filter((plan) => plan._gr_equipment_value?.toLowerCase() === editingEquipment.gr_equipmentid.toLowerCase())}
            customers={customers}
            sites={sites}
            jobs={equipmentJobs}
            isSaving={isSaving}
            saveError={saveError}
            siteCheckEnabledSiteIds={siteCheckEnabledSiteIds}
            onClose={() => {
                const trigger = siteCheckNestedTriggerRef.current
                siteCheckNestedTriggerRef.current = null
                setEditingEquipment(null)
                window.setTimeout(() => trigger?.focus(), 0)
            }}
            onSave={async (input) => { const updated = await updateEquipment(editingEquipment, input); setEditingEquipment(updated) }}
            onSaveMaintenanceHistory={async (plans, input) => { const updated = await saveEquipmentMaintenanceHistory(editingEquipment, plans, input); setEditingEquipment(updated.equipment) }}
            onCreateJob={(record) => { setEditingEquipment(null); setCreatingJobInitialValues(initialJobValuesForEquipment(record)) }}
            onDelete={async () => { await deleteEquipment(editingEquipment.gr_equipmentid); setEditingEquipment(null) }}
        />}

        {creatingEquipmentInitialValues && <EquipmentDrawer
            mode="create"
            initialValues={creatingEquipmentInitialValues}
            equipmentList={equipment}
            customers={customers}
            sites={sites}
            jobs={equipmentJobs}
            isSaving={isSaving}
            saveError={saveError}
            siteCheckEnabledSiteIds={siteCheckEnabledSiteIds}
            onClose={() => setCreatingEquipmentInitialValues(null)}
            onCreateCustomer={createDashboardCustomer}
            onCreateSite={createDashboardSite}
            onCreate={async (input, resolvedSite) => {
                await createDashboardEquipment(input, resolvedSite)
                setCreatingEquipmentInitialValues(null)
            }}
        />}

        {bulkImportSite && bulkImportAllowed && selectedCustomer && <BulkEquipmentImportDrawer
            key={bulkImportSite.gr_siteid}
            user={signedInUser}
            customerId={selectedCustomer.gr_customerid}
            customerName={selectedCustomer.gr_name}
            siteId={bulkImportSite.gr_siteid}
            siteName={bulkImportSite.gr_name}
            sites={sites}
            equipment={equipment}
            onCreate={(input) => createDashboardEquipment(input, bulkImportSite)}
            onComplete={(createdCount) => {
                setBulkImportSuccess(`${createdCount} Equipment record${createdCount === 1 ? '' : 's'} added to ${bulkImportSite.gr_name}.`)
                setBulkImportSite(null)
            }}
            onClose={() => setBulkImportSite(null)}
        />}

        {transferSite && selectedCustomer && <EquipmentTransferDrawer
            key={transferSite.gr_siteid}
            customer={selectedCustomer}
            site={transferSite}
            equipment={equipment}
            busy={isSaving}
            onTransfer={transferEquipment}
            onComplete={(transferredCount) => {
                setSiteExpanded(transferSite.gr_siteid, true)
                setTransferSuccess(`${transferredCount} Equipment record${transferredCount === 1 ? '' : 's'} transferred to ${transferSite.gr_name}.`)
                setTransferSite(null)
            }}
            onClose={() => setTransferSite(null)}
        />}

        {siteSettingsSite && selectedCustomer && <SiteSettingsDrawer
            key={`${siteSettingsSite.gr_siteid}-${siteChecks.isLoading
                ? 'loading'
                : siteChecks.schedules[0]?.gr_sitecheckscheduleid ?? 'new'}`}
            site={siteSettingsSite}
            equipment={equipmentForSite(siteSettingsSite)}
            busy={isSaving || siteChecks.isSaving}
            error={saveError}
            bulkImportAllowed={bulkImportAllowed}
            siteCheckSchedule={siteChecks.schedules.find((schedule) =>
                schedule._gr_site_value.toLowerCase() === siteSettingsSite.gr_siteid.toLowerCase()
            )}
            siteCheckSelectedEquipmentIds={siteChecks.scheduleEquipment
                .filter((selection) => selection._gr_sitecheckschedule_value.toLowerCase()
                    === siteChecks.schedules.find((schedule) =>
                        schedule._gr_site_value.toLowerCase()
                        === siteSettingsSite.gr_siteid.toLowerCase()
                    )?.gr_sitecheckscheduleid.toLowerCase())
                .map((selection) => selection._gr_equipment_value)}
            siteChecksLoading={siteChecks.isLoading}
            siteChecksSaving={siteChecks.isSaving}
            siteChecksError={siteChecks.loadError || siteChecks.saveError}
            onSaveDetails={(name, address) => updateSites([{
                siteId: siteSettingsSite.gr_siteid,
                input: { name, address },
            }])}
            onSaveSettings={(profile, equipmentIds) => updateSiteMaintenanceSettings(siteSettingsSite, profile, equipmentIds)}
            onSaveSiteChecks={async (input) => { await siteChecks.saveSchedule(input) }}
            onDetailsComplete={(name) => {
                setSiteSuccess(`${name} updated successfully.`)
            }}
            onSettingsComplete={() => {
                const trigger = siteSettingsTriggerRefs.current[siteSettingsSite.gr_siteid]
                setSiteSuccess(`${siteSettingsSite.gr_name} maintenance settings updated.`)
                setSiteSettingsSite(null)
                window.setTimeout(() => trigger?.focus(), 0)
            }}
            onOpenBulkImport={() => {
                setSiteExpanded(siteSettingsSite.gr_siteid, true)
                setBulkImportSuccess('')
                setBulkImportSite(siteSettingsSite)
                setSiteSettingsSite(null)
            }}
            onClose={() => {
                const trigger = siteSettingsTriggerRefs.current[siteSettingsSite.gr_siteid]
                setSiteSettingsSite(null)
                window.setTimeout(() => trigger?.focus(), 0)
            }}
            customerId={selectedCustomer.gr_customerid}
            contacts={customerContacts}
            poRecipients={poRecipients.recipients}
            poRecipientsBusy={poRecipients.isLoading || poRecipients.isSaving}
            poRecipientsError={poRecipients.error}
            onSavePoRecipients={poRecipients.save}
            onCreateContact={createContactForSite}
        />}

        {runSiteCheckSite && selectedCustomer && <RunSiteCheckDrawer
            key={runSiteCheckSite.gr_siteid}
            customerName={selectedCustomer.gr_name}
            siteName={runSiteCheckSite.gr_name}
            siteId={runSiteCheckSite.gr_siteid}
            schedule={siteChecks.schedules.find((schedule) =>
                schedule._gr_site_value.toLowerCase() === runSiteCheckSite.gr_siteid.toLowerCase()
            )}
            equipment={equipmentForSite(runSiteCheckSite)}
            selectedEquipmentIds={siteChecks.scheduleEquipment
                .filter((selection) => selection._gr_sitecheckschedule_value.toLowerCase()
                    === siteChecks.schedules.find((schedule) =>
                        schedule._gr_site_value.toLowerCase()
                        === runSiteCheckSite.gr_siteid.toLowerCase()
                    )?.gr_sitecheckscheduleid.toLowerCase())
                .map((selection) => selection._gr_equipment_value)}
            mechanics={mechanics}
            busy={siteChecks.isStarting}
            error={siteChecks.startError}
            onStart={siteChecks.startSiteCheck}
            onComplete={(created) => {
                setSiteSuccess(`${created.gr_name} started successfully.`)
                setSiteCheckDetails({ site: runSiteCheckSite, check: created, tab: 'jobs' })
                setRunSiteCheckSite(null)
            }}
            onClose={() => {
                if (!siteChecks.isStarting) setRunSiteCheckSite(null)
            }}
        />}

        {creatingJobInitialValues && <JobCreateDrawer
            mechanics={mechanics}
            equipmentList={jobEquipmentList}
            sites={jobSites}
            customers={jobCustomers}
            siteContacts={siteContacts}
            servicePlans={jobServicePlans}
            initialValues={creatingJobInitialValues}
            onCreateCustomer={createJobCustomer}
            onCreateSite={createJobSite}
            onCreateContact={createContactForSite}
            onCreateEquipment={createJobEquipment}
            onCreateJob={async (input) => {
                const jobId = await createJob(input)
                await reload()
                return jobId
            }}
            onCreateScheduleOption={createScheduleOption}
            onClose={() => setCreatingJobInitialValues(null)}
        />}

        {editingJob && <JobEditDrawer
            job={editingJob}
            mechanics={mechanics}
            equipmentList={jobEquipmentList}
            sites={jobSites}
            customers={jobCustomers}
            siteContacts={siteContacts}
            servicePlans={jobServicePlans}
            onCreateCustomer={createJobCustomer}
            onCreateSite={createJobSite}
            onCreateContact={createContactForSite}
            onCreateEquipment={createJobEquipment}
            onSave={updateJob}
            onDelete={deleteJob}
            scheduleOptions={scheduleOptions}
            onCreateScheduleOption={createScheduleOption}
            onUpdateScheduleOption={updateScheduleOption}
            onDeleteScheduleOption={deleteScheduleOption}
            quotes={jobQuotes.filter((quote) => quote._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
            assignments={jobAssignments.filter((assignment) => assignment._gr_job_value?.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
            onCreateQuote={(jobId) => { setEditingJob(null); navigate(`/quotes?new=1&jobId=${encodeURIComponent(jobId)}`) }}
            onOpenQuote={(quoteId) => { setEditingJob(null); navigate(`/quotes?quoteId=${encodeURIComponent(quoteId)}`) }}
            onJobCardStatusChange={updateJobCardStatus}
            onCreateAssignment={createJobAssignment}
            onSendPrimary={sendPrimaryJobEmail}
            onSendAssignment={sendAssignmentJobEmail}
            onDeleteAssignment={deleteJobAssignment}
            officeUpdates={officeUpdates.filter((update) => update.jobId.toLowerCase() === editingJob.gr_jobid.toLowerCase())}
            onCreateOfficeUpdate={createJobOfficeUpdate}
            onSaveOfficeAttention={updateJobOfficeAttention}
            onClose={() => {
                const trigger = siteCheckNestedTriggerRef.current
                siteCheckNestedTriggerRef.current = null
                setEditingJob(null)
                window.setTimeout(() => trigger?.focus(), 0)
            }}
        />}

        <JobCompletionWorkflow
            key={completionRequest?.job.gr_jobid ?? 'no-completion'}
            request={completionRequest}
            equipment={jobEquipmentList}
            jobs={operationalJobs}
            servicePlans={jobServicePlans}
            isCompleting={isCompletingJob}
            error={completionError}
            onCancel={cancelJobCompletion}
            onSetupMaintenance={setupEquipmentMaintenance}
            onCompleteStandard={completeStandardJob}
            onCompleteService={completeServiceJob}
            onCompleteWof={completeWofJob}
        />

        {customerDrawerMode && <CustomerDrawer
            key={`${customerDrawerMode}-${selectedCustomerId}-${editingSiteId}`}
            mode={customerDrawerMode}
            initialTab={customerDrawerInitialTab}
            initialSiteId={editingSiteId || undefined}
            initialValue={customerDrawerMode === 'edit' ? customerDrawerInitialValue : undefined}
            customerId={selectedCustomer?.gr_customerid}
            contacts={customerContacts}
            poRecipients={poRecipients.recipients}
            poRecipientsBusy={poRecipients.isLoading || poRecipients.isSaving}
            poRecipientsError={poRecipients.error}
            onSavePoRecipients={poRecipients.save}
            onCreateContact={createContactForSite}
            onClose={() => { setCustomerDrawerMode(null); setEditingSiteId('') }}
            onSave={async (draft) => {
                const savedDraft = await saveCustomerDraft(draft)
                if (editingSiteId) {
                    setCustomerDrawerMode(null)
                    setEditingSiteId('')
                    setSiteSuccess('Site updated successfully.')
                }
                return savedDraft
            }}
        />}
    </main>
}
