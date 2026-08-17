import { useRef, useState, type FormEvent } from 'react'
import type { Equipment } from '../../jobs/types/equipment.types'
import type { Customer } from '../../jobs/types/customer.types'
import type { Job } from '../../jobs/types/job.types'
import type { Site } from '../../jobs/types/site.types'
import { getJobCardStatus, JOB_CARD_STATUS_OPTIONS } from '../../jobs/types/jobCardStatus.types'
import { getJobTypeLabel } from '../../jobs/types/jobType.types'
import { JOB_STATUS_OPTIONS } from '../../jobs/types/jobStatus.types'
import EditDrawerConfirmation from '../../shared/drawer/EditDrawerConfirmation'
import EditDrawerFormDialog from '../../shared/drawer/EditDrawerFormDialog'
import EditDrawerSection from '../../shared/drawer/EditDrawerSection'
import EditDrawerShell from '../../shared/drawer/EditDrawerShell'
import FormSwitch from '../../shared/form-switch/FormSwitch'
import type { EquipmentServicePlan } from '../servicePlans/equipmentServicePlan.types'
import { SERVICE_TYPES, SERVICE_TYPE_OPTIONS, type PlannedServiceType } from '../servicePlans/equipmentServicePlan.types'
import type { MaintenanceHistoryInput } from '../servicePlans/servicePlanApi'
import { calculateForecastAdjustedServicePlan, calculateHoursRemaining } from '../servicePlans/servicePlanStatus'
import { resolveEffectiveServicePlans } from '../servicePlans/servicePlanCalculations'
import { normalizeEquipmentInput, toEquipmentDateOnlyValue, type EquipmentCreateInitialValues, type EquipmentUpdateInput } from '../types/equipmentManager.types'
import { classifyEquipmentIdentifier, deriveSiteNameFromAddress, normalizeCustomerName, parseSpreadsheetRow, type IdentifierClassification, type SpreadsheetRow } from '../utils/equipmentCreateHelpers'
import SearchableSelect, { type SearchableSelectOption } from '../../shared/searchable-select/SearchableSelect'
import { formatMaintenanceInterval, MAINTENANCE_PROFILES, POWER_TYPES, resolveMaintenanceConfiguration, SERVICE_PROGRAMMES, type MaintenanceProfile, type PowerType, type ServiceProgramme } from '../servicePlans/maintenanceConfiguration'
import { calculateEquipmentUsageForecast, resolveLatestHourMeterReading } from '../servicePlans/equipmentUsageForecast'
import {
    EQUIPMENT_COMPLIANCE_STATUSES,
    getEquipmentComplianceStatus,
} from '../compliance/equipmentCompliance'
import { currentNewZealandDateOnly } from '../../shared/dates/dateOnly'
import {
    EQUIPMENT_OWNERSHIP_OPTIONS,
    type EquipmentOwnershipType,
} from '../types/equipmentOwnership.types'
import {
    EQUIPMENT_SITE_CHECK_AVAILABILITIES,
    EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS,
    type EquipmentSiteCheckAvailability,
} from '../types/equipmentSiteCheckAvailability.types'
import { HOUR_METER_READING_TYPES } from '../hourMeter/hourMeterReading.types'
import {
    equipmentIdentifierSearchValues,
    parseAlternateFleetNumbers,
    preservePreviousFleetNumber,
} from '../identifiers/alternateFleetNumbers'
import '../EquipmentScreen.css'

type SharedProps = {
    customers: Customer[]
    sites: Site[]
    equipmentList: Equipment[]
    jobs: Job[]
    isSaving: boolean
    saveError: string
    onClose: () => void
    siteCheckEnabledSiteIds?: readonly string[]
}

type CreateProps = SharedProps & {
    mode: 'create'
    initialValues?: EquipmentCreateInitialValues
    onCreate: (input: EquipmentUpdateInput, resolvedSite?: Site) => Promise<void>
    onCreateCustomer: (input: { name: string }) => Promise<Customer>
    onCreateSite: (input: { customerId: string; name: string; address?: string }, customer?: Customer) => Promise<Site>
}

type EditProps = SharedProps & {
    mode: 'edit'
    equipment: Equipment
    servicePlans: EquipmentServicePlan[]
    onSave: (input: EquipmentUpdateInput, resolvedSite?: Site) => Promise<void>
    onSaveMaintenanceHistory: (plans: EquipmentServicePlan[], input: MaintenanceHistoryInput) => Promise<void>
    onCreateJob?: (equipment: Equipment) => void
    onOpenJob?: (job: Job) => void
    isJobHistoryLoading?: boolean
    jobHistoryError?: string
    onRetryJobHistory?: () => void
    onDelete: () => Promise<void>
    onCreateCustomer?: (input: { name: string }) => Promise<Customer>
    onCreateSite?: (input: { customerId: string; name: string; address?: string }, customer?: Customer) => Promise<Site>
}

type Props = CreateProps | EditProps
type EquipmentDrawerTab = 'details' | 'maintenance' | 'history'
type MaintenanceHistoryForm = {
    currentHourMeter: string
    readingRecordedDate: string
    plans: Record<PlannedServiceType, { lastCompletedDate: string; lastCompletedHours: string }>
}
type CustomerMode = 'none' | 'existing' | 'new'
type SiteMode = 'none' | 'existing' | 'new'

const siteOptionLabel = (site: Site) => site.gr_name || 'Unnamed site'

const formatDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(date)
}

export default function EquipmentDrawer(props: Props) {
    const { customers, sites, jobs, isSaving, saveError, onClose } = props
    const isCreate = props.mode === 'create'
    const equipment = isCreate ? undefined : props.equipment
    const canCreateRelationships = Boolean(props.onCreateCustomer && props.onCreateSite)
    const initialValues = isCreate ? props.initialValues : undefined
    const initialSite = isCreate && initialValues?.siteId
        ? sites.find((site) => site.gr_siteid === initialValues.siteId)
        : undefined
    const initialCustomer = initialSite?.gr_Customer
        ?? (initialValues?.customerId
            ? customers.find((customer) => customer.gr_customerid === initialValues.customerId)
            : undefined)
    const [form, setForm] = useState<EquipmentUpdateInput>({
        fleet: equipment?.gr_fleet ?? initialValues?.fleet ?? '',
        alternateFleetNumbers: equipment?.gr_alternatefleetnumbers ?? initialValues?.alternateFleetNumbers ?? '',
        make: equipment?.gr_make ?? initialValues?.make ?? '',
        model: equipment?.gr_model ?? initialValues?.model ?? '',
        serial: equipment?.gr_serial ?? initialValues?.serial ?? '',
        siteId: equipment?.gr_Site?.gr_siteid ?? initialValues?.siteId ?? '',
        registrationNumber: equipment?.gr_registrationnumber ?? initialValues?.registrationNumber ?? '',
        complianceStatus: equipment
            ? getEquipmentComplianceStatus(equipment)
            : initialValues?.complianceStatus
                ?? (initialValues?.wofRequired || initialValues?.registrationNumber
                    ? EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
                    : EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD),
        wofRequired: equipment ? getEquipmentComplianceStatus(equipment) === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED : initialValues?.wofRequired ?? false,
        currentWofExpiry: toEquipmentDateOnlyValue(equipment?.gr_currentwofexpiry ?? initialValues?.currentWofExpiry),
        regoExpiry: toEquipmentDateOnlyValue(equipment?.gr_regoexpiry ?? initialValues?.regoExpiry),
        powerType: equipment?.gr_powertype ?? initialValues?.powerType ?? POWER_TYPES.OTHER_UNKNOWN,
        serviceProgramme: equipment?.gr_serviceprogramme ?? initialValues?.serviceProgramme ?? SERVICE_PROGRAMMES.ICE_STANDARD,
        maintenanceProfile: equipment?.gr_maintenanceprofile
            ?? initialValues?.maintenanceProfile
            ?? initialSite?.gr_defaultmaintenanceprofile
            ?? MAINTENANCE_PROFILES.STANDARD,
        ownershipType: equipment?.gr_ownershiptype ?? initialValues?.ownershipType ?? null,
        siteCheckAvailability: equipment?.gr_sitecheckavailability
            ?? initialValues?.siteCheckAvailability
            ?? null,
        customAEnabled: equipment?.gr_customaenabled ?? initialValues?.customAEnabled ?? true,
        customBEnabled: equipment?.gr_custombenabled ?? initialValues?.customBEnabled ?? false,
        customCEnabled: equipment?.gr_customcenabled ?? initialValues?.customCEnabled ?? true,
        customAIntervalDays: String(equipment?.gr_customaintervaldays ?? initialValues?.customAIntervalDays ?? ''),
        customBIntervalDays: String(equipment?.gr_custombintervaldays ?? initialValues?.customBIntervalDays ?? ''),
        customCIntervalDays: String(equipment?.gr_customcintervaldays ?? initialValues?.customCIntervalDays ?? ''),
    })
    const maintenanceProfileTouched = useRef(false)
    const [customerId, setCustomerId] = useState(equipment?.gr_Site?.gr_Customer?.gr_customerid ?? initialCustomer?.gr_customerid ?? '')
    const [customerMode, setCustomerMode] = useState<CustomerMode>(equipment?.gr_Site?.gr_Customer || initialCustomer ? 'existing' : 'none')
    const [siteMode, setSiteMode] = useState<SiteMode>(equipment?.gr_Site || initialSite ? 'existing' : 'none')
    const [customerQuery, setCustomerQuery] = useState(equipment?.gr_Site?.gr_Customer?.gr_name ?? initialCustomer?.gr_name ?? initialValues?.customerName ?? '')
    const [, setSiteQuery] = useState(equipment?.gr_Site?.gr_name ?? initialSite?.gr_name ?? initialValues?.siteName ?? '')
    const [formError, setFormError] = useState('')
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteError, setDeleteError] = useState('')
    const [relatedError, setRelatedError] = useState('')
    const [newSite, setNewSite] = useState({ name: '', address: '' })
    const [spreadsheetOpen, setSpreadsheetOpen] = useState(false)
    const [spreadsheetText, setSpreadsheetText] = useState('')
    const [spreadsheetError, setSpreadsheetError] = useState('')
    const [spreadsheetWarnings, setSpreadsheetWarnings] = useState<string[]>([])
    const [parsedSpreadsheetRow, setParsedSpreadsheetRow] = useState<SpreadsheetRow | null>(null)
    const [identifierClassification, setIdentifierClassification] = useState<IdentifierClassification | null>(null)
    const [spreadsheetApplyNote, setSpreadsheetApplyNote] = useState('')
    const [sourceContextOpen, setSourceContextOpen] = useState(true)
    const [isReadingClipboard, setIsReadingClipboard] = useState(false)
    const manualPasteRef = useRef<HTMLTextAreaElement>(null)
    const equipmentFormRef = useRef<HTMLFormElement>(null)
    const programmeChangeConfirmedRef = useRef(false)
    const [activeTab, setActiveTab] = useState<EquipmentDrawerTab>('details')
    const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false)
    const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceHistoryForm>(() => ({
        currentHourMeter: String(equipment?.gr_currenthourmeter ?? 0),
        readingRecordedDate: equipment?.gr_currenthourmeterrecordeddate?.slice(0, 10) ?? currentNewZealandDateOnly(),
        plans: {
            [SERVICE_TYPES.A]: { lastCompletedDate: '', lastCompletedHours: '' },
            [SERVICE_TYPES.B]: { lastCompletedDate: '', lastCompletedHours: '' },
            [SERVICE_TYPES.C]: { lastCompletedDate: '', lastCompletedHours: '' },
        },
    }))
    const [maintenanceError, setMaintenanceError] = useState('')
    const [showDeregisterConfirm, setShowDeregisterConfirm] = useState(false)
    const [complianceError, setComplianceError] = useState('')
    const [isComplianceSaving, setIsComplianceSaving] = useState(false)
    const [showProgrammeChangeConfirm, setShowProgrammeChangeConfirm] = useState(false)

    const history = equipment
        ? jobs
            .filter((job) => job.gr_Equipment?.gr_equipmentid.toLowerCase() === equipment.gr_equipmentid.toLowerCase())
            .sort((a, b) => b.createdon.localeCompare(a.createdon))
        : []
    const usageForecast = equipment ? calculateEquipmentUsageForecast(equipment, history) : null
    const latestHourMeterReading = equipment ? resolveLatestHourMeterReading(equipment, history) : null
    const selectedCustomer = customers.find((customer) => customer.gr_customerid === customerId)
    const siteChecksEnabled = Boolean(form.siteId) && Boolean(
        props.siteCheckEnabledSiteIds?.some((id) => id.toLowerCase() === form.siteId.toLowerCase()),
    )
    const visibleSites = sites
        .filter((site) => site.gr_Customer?.gr_customerid === customerId)
        .sort((a, b) => siteOptionLabel(a).localeCompare(siteOptionLabel(b)))
    const siteOptions: SearchableSelectOption[] = visibleSites.map((site) => ({
        value: site.gr_siteid,
        label: siteOptionLabel(site),
        secondary: site.gr_address || selectedCustomer?.gr_name,
        searchText: [site.gr_address, selectedCustomer?.gr_name].filter(Boolean).join(' '),
    }))
    const customerOptions: SearchableSelectOption[] = [...customers]
        .sort((a, b) => a.gr_name.localeCompare(b.gr_name))
        .map((customer) => {
            const siteCount = sites.filter((site) => site.gr_Customer?.gr_customerid === customer.gr_customerid).length
            return {
                value: customer.gr_customerid,
                label: customer.gr_name,
                secondary: `${siteCount} ${siteCount === 1 ? 'site' : 'sites'}`,
            }
        })
    const normalizedCustomerQuery = normalizeCustomerName(customerQuery)
    const exactCustomerMatch = normalizedCustomerQuery
        ? customers.find((customer) => normalizeCustomerName(customer.gr_name) === normalizedCustomerQuery)
        : undefined
    const derivedSiteName = deriveSiteNameFromAddress(newSite.address)
    const effectiveNewSiteName = newSite.name.trim() || derivedSiteName
    const matchingSiteAddress = newSite.address.trim()
        ? visibleSites.find((site) => site.gr_address && normalizeCustomerName(site.gr_address) === normalizeCustomerName(newSite.address))
        : undefined
    const proposedIdentifiers = [form.fleet, form.serial]
        .map(normalizeCustomerName)
        .filter(Boolean)
    const matchingEquipment = proposedIdentifiers.length
        ? props.equipmentList.find((item) => equipmentIdentifierSearchValues(item)
            .some((value) => proposedIdentifiers.includes(normalizeCustomerName(value))))
        : undefined
    const busy = isSaving || isDeleting || isComplianceSaving
    const equipmentName = equipment ? [equipment.gr_fleet, equipment.gr_make, equipment.gr_model].filter(Boolean).join(' - ') || 'this equipment' : ''
    const plans = isCreate ? [] : resolveEffectiveServicePlans(props.servicePlans, equipment)
    const maintenanceConfiguration = resolveMaintenanceConfiguration(equipment)
    const tabs: Array<{ id: EquipmentDrawerTab; label: string; count?: number }> = [
        { id: 'details', label: 'Details' },
        { id: 'maintenance', label: 'Maintenance' },
        { id: 'history', label: 'Job History', count: props.mode === 'edit' && props.isJobHistoryLoading ? undefined : history.length },
    ]

    const openMaintenanceDialog = () => {
        if (isCreate) return
        setMaintenanceForm({
            currentHourMeter: String(latestHourMeterReading?.hours ?? 0),
            readingRecordedDate: latestHourMeterReading?.date ?? currentNewZealandDateOnly(),
            plans: {
                [SERVICE_TYPES.A]: {
                    lastCompletedDate: plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.A)?.gr_lastcompleteddate?.slice(0, 10) ?? '',
                    lastCompletedHours: String(plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.A)?.gr_lastcompletedhours ?? ''),
                },
                [SERVICE_TYPES.B]: {
                    lastCompletedDate: plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.B)?.gr_lastcompleteddate?.slice(0, 10) ?? '',
                    lastCompletedHours: String(plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.B)?.gr_lastcompletedhours ?? ''),
                },
                [SERVICE_TYPES.C]: {
                    lastCompletedDate: plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.C)?.gr_lastcompleteddate?.slice(0, 10) ?? '',
                    lastCompletedHours: String(plans.find((plan) => plan.gr_servicetype === SERVICE_TYPES.C)?.gr_lastcompletedhours ?? ''),
                },
            },
        })
        setMaintenanceError('')
        setMaintenanceDialogOpen(true)
    }

    const updateMaintenancePlanField = (serviceType: PlannedServiceType, field: 'lastCompletedDate' | 'lastCompletedHours', value: string) => {
        setMaintenanceForm((current) => ({
            ...current,
            plans: {
                ...current.plans,
                [serviceType]: { ...current.plans[serviceType], [field]: value },
            },
        }))
        if (maintenanceError) setMaintenanceError('')
    }

    const saveMaintenanceHistory = async () => {
        if (isCreate) return
        const currentHourMeter = Number(maintenanceForm.currentHourMeter)
        if (!Number.isFinite(currentHourMeter) || currentHourMeter < 0) {
            setMaintenanceError('Last Known Hour Meter cannot be negative.')
            return
        }
        if (!maintenanceForm.readingRecordedDate) {
            setMaintenanceError('Reading recorded date is required.')
            return
        }

        const today = currentNewZealandDateOnly()
        if (maintenanceForm.readingRecordedDate > today) {
            setMaintenanceError('Reading recorded date cannot be in the future.')
            return
        }
        const nextPlans: MaintenanceHistoryInput['plans'] = []
        for (const serviceType of maintenanceConfiguration.activeServiceTypes) {
            const values = maintenanceForm.plans[serviceType]
            const hours = values.lastCompletedHours === '' ? null : Number(values.lastCompletedHours)
            if (hours != null && (!Number.isFinite(hours) || hours < 0)) {
                setMaintenanceError('Last Completed Hours cannot be negative.')
                return
            }
            if (values.lastCompletedDate && values.lastCompletedDate > today) {
                setMaintenanceError('Last Completed Date cannot be in the future.')
                return
            }
            if (hours != null && currentHourMeter < hours) {
                setMaintenanceError('Last Known Hour Meter cannot be less than any entered Last Completed Hours.')
                return
            }
            nextPlans.push({
                serviceType,
                lastCompletedDate: values.lastCompletedDate || null,
                lastCompletedHours: hours,
            })
        }

        try {
            setMaintenanceError('')
            await props.onSaveMaintenanceHistory(plans, {
                currentHourMeter,
                readingRecordedDate: maintenanceForm.readingRecordedDate,
                plans: nextPlans,
            })
            setMaintenanceDialogOpen(false)
        } catch (error) {
            setMaintenanceError(error instanceof Error ? error.message : 'Maintenance history could not be saved.')
        }
    }

    const clearSpreadsheetSource = () => {
        setSpreadsheetOpen(false)
        setSpreadsheetText('')
        setSpreadsheetError('')
        setSpreadsheetWarnings([])
        setParsedSpreadsheetRow(null)
        setIdentifierClassification(null)
        setSpreadsheetApplyNote('')
        setSourceContextOpen(true)
    }

    const parsePastedSpreadsheetRow = (text = spreadsheetText) => {
        const result = parseSpreadsheetRow(text)
        if (!result.ok) {
            setSpreadsheetError(result.error)
            setParsedSpreadsheetRow(null)
            setIdentifierClassification(null)
            return
        }
        const classification = classifyEquipmentIdentifier(result.row.identifier)
        setSpreadsheetError('')
        setSpreadsheetWarnings([...result.warnings, classification.warning].filter((warning): warning is string => Boolean(warning)))
        setParsedSpreadsheetRow(result.row)
        setIdentifierClassification(classification)
        setSpreadsheetApplyNote('')
        return { row: result.row, classification }
    }

    const applySpreadsheetRow = (row = parsedSpreadsheetRow, classification = identifierClassification, automatic = false) => {
        if (!row || !classification) return false
        const skipped: string[] = []
        const nextForm = { ...form }
        if (!form.model.trim() && row.model) nextForm.model = row.model
        else if (row.model && form.model !== row.model) skipped.push('Model')
        if (classification.kind === 'fleet' && classification.value) {
            if (!form.fleet.trim()) nextForm.fleet = classification.value
            else if (form.fleet !== classification.value) skipped.push('Fleet Number')
        }
        if (classification.kind === 'serial' && classification.value) {
            if (!form.serial.trim()) nextForm.serial = classification.value
            else if (form.serial !== classification.value) skipped.push('Serial Number')
        }
        setForm(nextForm)

        let requiresReview = classification.kind === 'unresolved' || classification.kind === 'missing'
        const pastedCustomer = row.customer
        if (pastedCustomer && !customerQuery.trim()) {
            const normalized = normalizeCustomerName(pastedCustomer)
            const exact = customers.filter((customer) => normalizeCustomerName(customer.gr_name) === normalized)
            const possible = customers.filter((customer) => {
                const name = normalizeCustomerName(customer.gr_name)
                return name.includes(normalized) || normalized.includes(name)
            })
            setCustomerQuery(pastedCustomer)
            setSiteQuery('')
            updateField('siteId', '')
            if (exact.length === 1) {
                const customer = exact[0]
                const addressMatches = row.address
                    ? sites.filter((site) => site.gr_Customer?.gr_customerid === customer.gr_customerid && site.gr_address && normalizeCustomerName(site.gr_address) === normalizeCustomerName(row.address))
                    : []
                setCustomerId(customer.gr_customerid)
                setCustomerMode('existing')
                if (addressMatches.length === 1) {
                    setSiteMode('existing')
                    setSiteQuery(addressMatches[0].gr_name)
                    updateField('siteId', addressMatches[0].gr_siteid)
                } else {
                    setSiteMode('new')
                    setNewSite({ name: deriveSiteNameFromAddress(row.address), address: row.address })
                    requiresReview ||= addressMatches.length > 1
                }
            } else {
                setCustomerId('')
                setCustomerMode('new')
                setSiteMode('new')
                setNewSite({ name: deriveSiteNameFromAddress(row.address), address: row.address })
                requiresReview ||= possible.length > 0
            }
        } else if (pastedCustomer && customerQuery !== pastedCustomer) skipped.push('Customer')
        if (row.address && newSite.address.trim()) {
            if (newSite.address !== row.address) skipped.push('Address')
        } else if (row.address && customerQuery.trim()) {
            setNewSite({ name: deriveSiteNameFromAddress(row.address), address: row.address })
            setSiteMode('new')
        }
        const duplicate = [nextForm.fleet, nextForm.serial].filter(Boolean).map(normalizeCustomerName)
            .some((identifier) => props.equipmentList.some((item) => equipmentIdentifierSearchValues(item)
                .some((value) => normalizeCustomerName(value) === identifier)))
        requiresReview ||= duplicate
        if (classification.kind === 'unresolved') skipped.push('Identifier (requires manual selection)')
        setSpreadsheetApplyNote(duplicate ? 'Equipment with this Fleet Number or Serial Number already exists. Resolve the duplicate before creating Equipment.' : skipped.length ? `Spreadsheet row applied. Kept existing values for: ${skipped.join(', ')}.` : 'Spreadsheet row applied. Review the details before creating Equipment.')
        setSpreadsheetOpen(!automatic || requiresReview)
        setSourceContextOpen(true)
        return !requiresReview
    }

    const handleQuickPaste = async () => {
        setIsReadingClipboard(true)
        setSpreadsheetError('')
        try {
            const text = await navigator.clipboard.readText()
            if (!text.trim()) throw new Error('Clipboard is empty.')
            setSpreadsheetText(text)
            const parsed = parsePastedSpreadsheetRow(text)
            if (!parsed) { setSpreadsheetOpen(true); return }
            const applied = applySpreadsheetRow(parsed.row, parsed.classification, true)
            if (!applied) setSpreadsheetOpen(true)
        } catch (error) {
            setSpreadsheetOpen(true)
            setSpreadsheetError(error instanceof Error && error.message === 'Clipboard is empty.' ? error.message : 'Clipboard access was unavailable. Paste the spreadsheet row here manually.')
            window.setTimeout(() => manualPasteRef.current?.focus(), 0)
        } finally {
            setIsReadingClipboard(false)
        }
    }

    const save = async (event: FormEvent) => {
        event.preventDefault()
        let trimmed: EquipmentUpdateInput
        try {
            trimmed = normalizeEquipmentInput(form)
            if (equipment) {
                trimmed = {
                    ...trimmed,
                    alternateFleetNumbers: preservePreviousFleetNumber(
                        trimmed.alternateFleetNumbers ?? '',
                        equipment.gr_fleet,
                        trimmed.fleet,
                    ),
                }
            }
            setForm(trimmed)
        } catch (error) {
            setFormError(error instanceof Error ? error.message : 'Check the Equipment details and try again.')
            return
        }
        if (isCreate && !trimmed.fleet && !trimmed.serial) {
            setFormError('Enter either a fleet number or serial number.')
            return
        }
        const wasRoadRegistered = equipment
            ? getEquipmentComplianceStatus(equipment) === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
            : false
        if (trimmed.complianceStatus === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
            && !trimmed.registrationNumber
            && (isCreate || !wasRoadRegistered)) {
            setFormError('On-road equipment requires a Registration Number.')
            return
        }
        if (isCreate && matchingEquipment) {
            setFormError(`Equipment ${matchingEquipment.gr_fleet || matchingEquipment.gr_serial || ''} already exists. Change the Fleet Number or Serial Number before creating Equipment.`)
            return
        }
        if (isCreate && customerMode === 'none') {
            setRelatedError('Select an existing Customer or enter a new Customer name.')
            return
        }
        if (customerMode === 'new' && !customerQuery.trim()) {
            setRelatedError('Enter a Customer name.')
            return
        }
        if (customerMode !== 'none' && siteMode === 'none') {
            setRelatedError('Select an existing Site or enter a new Site.')
            return
        }
        if (siteMode === 'new' && !effectiveNewSiteName) {
            setRelatedError('Enter a Site Name, or an Address that can be used to generate one.')
            return
        }
        if (siteMode === 'existing' && !visibleSites.some((site) => site.gr_siteid === trimmed.siteId)) {
            setRelatedError('Select a Site belonging to the selected Customer.')
            return
        }
        const originalProgramme = equipment?.gr_serviceprogramme ?? SERVICE_PROGRAMMES.ICE_STANDARD
        if (!isCreate && history.length > 0 && trimmed.serviceProgramme !== originalProgramme && !programmeChangeConfirmedRef.current) {
            setShowProgrammeChangeConfirm(true)
            return
        }
        try {
            setFormError('')
            setRelatedError('')
            let createdRelatedRecords = false
            let resolvedSite = sites.find((site) => site.gr_siteid === trimmed.siteId)
            if (customerMode !== 'none') {
                let resolvedCustomer = selectedCustomer
                if (customerMode === 'new') {
                    if (!props.onCreateCustomer) throw new Error('Customer creation is not available from this Equipment view.')
                    const duplicate = customers.find((customer) => normalizeCustomerName(customer.gr_name) === normalizeCustomerName(customerQuery))
                    resolvedCustomer = duplicate ?? await props.onCreateCustomer({ name: customerQuery.trim() })
                    createdRelatedRecords = !duplicate
                    setCustomerId(resolvedCustomer.gr_customerid)
                    setCustomerMode('existing')
                    setCustomerQuery(resolvedCustomer.gr_name)
                }
                if (!resolvedCustomer) throw new Error('The selected Customer could not be found.')

                if (siteMode === 'new') {
                    if (!props.onCreateSite) throw new Error('Site creation is not available from this Equipment view.')
                    const duplicateSite = sites.find((site) =>
                        site.gr_Customer?.gr_customerid === resolvedCustomer?.gr_customerid
                        && normalizeCustomerName(site.gr_name) === normalizeCustomerName(effectiveNewSiteName)
                    )
                    if (duplicateSite) {
                        setRelatedError('A Site with this name already exists for this Customer. Select the existing Site or change the new Site details.')
                        return
                    }
                    resolvedSite = await props.onCreateSite({
                        customerId: resolvedCustomer.gr_customerid,
                        name: effectiveNewSiteName,
                        address: newSite.address.trim() || undefined,
                    }, resolvedCustomer)
                    createdRelatedRecords = true
                    updateField('siteId', resolvedSite.gr_siteid)
                    setSiteMode('existing')
                    setSiteQuery(resolvedSite.gr_name)
                }
                if (!resolvedSite) throw new Error('The selected Site could not be found.')
                trimmed = { ...trimmed, siteId: resolvedSite.gr_siteid }
            } else {
                trimmed = { ...trimmed, siteId: '' }
                resolvedSite = undefined
            }
            try {
                if (isCreate) {
                    await props.onCreate(trimmed, resolvedSite)
                    clearSpreadsheetSource()
                } else {
                    await props.onSave(trimmed, resolvedSite)
                    programmeChangeConfirmedRef.current = false
                }
            } catch (error) {
                if (createdRelatedRecords) {
                    throw new Error(`The Customer and Site were created, but Equipment could not be ${isCreate ? 'created' : 'saved'}. ${error instanceof Error ? error.message : 'Please review the form and try again.'}`, { cause: error })
                }
                throw error
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : `Equipment could not be ${isCreate ? 'created' : 'saved'}. Please try again.`)
        }
    }

    const deleteRecord = async () => {
        if (isCreate) return
        try {
            setIsDeleting(true)
            setDeleteError('')
            await props.onDelete()
            setShowDeleteConfirm(false)
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : 'The equipment could not be deleted. Please try again.')
        } finally {
            setIsDeleting(false)
        }
    }

    const deregisterEquipment = async () => {
        if (isCreate) return
        try {
            setIsComplianceSaving(true)
            setComplianceError('')
            const next = normalizeEquipmentInput({
                ...form,
                complianceStatus: EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD,
                registrationNumber: '',
                regoExpiry: '',
                currentWofExpiry: '',
            })
            await props.onSave(next)
            setForm(next)
            setShowDeregisterConfirm(false)
        } catch (error) {
            setComplianceError(error instanceof Error ? error.message : 'The equipment could not be de-registered.')
        } finally {
            setIsComplianceSaving(false)
        }
    }

    const close = () => {
        if (!busy) {
            setShowDeleteConfirm(false)
            clearSpreadsheetSource()
            onClose()
        }
    }

    const updateField = (field: keyof EquipmentUpdateInput, value: string | boolean | number | null) => {
        setForm((current) => ({ ...current, [field]: value }))
        if (formError) setFormError('')
    }

    const selectExistingCustomer = (customer: Customer) => {
        const retainSpreadsheetSite = Boolean(parsedSpreadsheetRow && newSite.address.trim())
        const customerSites = sites.filter((site) => site.gr_Customer?.gr_customerid === customer.gr_customerid)
        const compatibleSite = customerSites.find((site) => site.gr_siteid === form.siteId)
        const selectedSite = compatibleSite ?? (customerSites.length === 1 ? customerSites[0] : undefined)
        setCustomerId(customer.gr_customerid)
        setForm((current) => ({
            ...current,
            siteId: selectedSite?.gr_siteid ?? '',
            ...(!maintenanceProfileTouched.current && selectedSite?.gr_defaultmaintenanceprofile != null
                ? { maintenanceProfile: selectedSite.gr_defaultmaintenanceprofile }
                : {}),
        }))
        setCustomerMode('existing')
        setSiteMode(selectedSite ? 'existing' : retainSpreadsheetSite ? 'new' : 'none')
        setCustomerQuery(customer.gr_name)
        setSiteQuery(selectedSite?.gr_name ?? '')
        if (!retainSpreadsheetSite) setNewSite({ name: '', address: '' })
        setRelatedError('')
    }

    return <>
        <EditDrawerShell
            eyebrow={isCreate ? 'Equipment manager' : 'Equipment workspace'}
            title={isCreate ? 'New Equipment' : equipment?.gr_fleet || 'Equipment details'}
            busy={busy}
            onClose={close}
            headerAction={!isCreate && props.onCreateJob && <button type="button" className="equipment-create-job-button" onClick={() => props.onCreateJob?.(props.equipment)} disabled={busy}>Create Job</button>}
            footer={<>
                <div className="equipment-footer-leading">
                    {!isCreate && <div className="equipment-delete-control" tabIndex={history.length > 0 ? 0 : undefined}>
                        <button type="button" className="equipment-delete-button" disabled={busy || history.length > 0} aria-describedby={history.length > 0 ? 'equipment-delete-explanation' : undefined} onClick={() => { setDeleteError(''); setShowDeleteConfirm(true) }}>Delete equipment</button>
                        {history.length > 0 && <span id="equipment-delete-explanation" className="equipment-delete-tooltip" role="tooltip">This Equipment cannot be deleted because it has linked Job history. Historical records must be preserved.</span>}
                    </div>}
                    {formError || saveError
                        ? <span className="equipment-footer-error" role="alert">{formError || saveError}</span>
                        : !isCreate && history.length === 0 && <span>Save to update this equipment in Dataverse.</span>}
                </div>
                <div className="equipment-footer-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary" type="submit" form="equipment-edit-form" disabled={busy}>{isSaving ? (isCreate ? 'Creating...' : 'Saving...') : isCreate ? 'Create Equipment' : 'Save changes'}</button></div>
            </>}
        >
            <form ref={equipmentFormRef} id="equipment-edit-form" onSubmit={(event) => void save(event)}>
                {isCreate && <div className="equipment-spreadsheet-tools">
                    <button type="button" className="equipment-spreadsheet-toggle" disabled={isReadingClipboard} onClick={() => void handleQuickPaste()}>{isReadingClipboard ? 'Reading clipboard...' : 'Paste from spreadsheet'}</button>
                    {spreadsheetOpen && <section className="equipment-spreadsheet-panel">
                        <strong>Paste spreadsheet row</strong>
                        <p>Copy one complete row from Excel and paste it here.</p>
                        <textarea ref={manualPasteRef} value={spreadsheetText} onChange={(event) => { setSpreadsheetText(event.target.value); setSpreadsheetError('') }} placeholder="Paste one tab-separated spreadsheet row" rows={4} />
                        {spreadsheetError && <p className="equipment-related-error" role="alert">{spreadsheetError}</p>}
                        <div className="equipment-spreadsheet-actions"><button type="button" onClick={() => parsePastedSpreadsheetRow()}>Parse Row</button><button type="button" onClick={() => { setSpreadsheetOpen(false); setSpreadsheetError('') }}>Cancel</button></div>
                    </section>}
                    {parsedSpreadsheetRow && <section className="equipment-spreadsheet-preview">
                        <strong>Parsed spreadsheet row</strong>
                        <dl><div><dt>Job Number</dt><dd>{parsedSpreadsheetRow.jobNumber || '-'}</dd></div><div><dt>Model</dt><dd>{parsedSpreadsheetRow.model || '-'}</dd></div><div><dt>Identifier</dt><dd>{parsedSpreadsheetRow.identifier || '-'}</dd></div><div><dt>Customer</dt><dd>{parsedSpreadsheetRow.customer || '-'}</dd></div><div><dt>Address</dt><dd>{parsedSpreadsheetRow.address || '-'}</dd></div><div><dt>Contact</dt><dd>{parsedSpreadsheetRow.contactDetails || '-'}</dd></div><div><dt>Description</dt><dd>{parsedSpreadsheetRow.description || '-'}</dd></div></dl>
                        {spreadsheetWarnings.length > 0 && <div className="equipment-spreadsheet-warnings"><strong>Warnings</strong>{spreadsheetWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
                        <div className="equipment-spreadsheet-actions"><button type="button" className="primary" onClick={() => applySpreadsheetRow()}>Apply to Equipment</button><button type="button" onClick={clearSpreadsheetSource}>Clear</button></div>
                    </section>}
                    {spreadsheetApplyNote && <p className="equipment-spreadsheet-apply-note" role="status">{spreadsheetApplyNote}</p>}
                    {matchingEquipment && <div className="equipment-equipment-duplicate-warning" role="alert">Equipment {matchingEquipment.gr_fleet || matchingEquipment.gr_serial} already exists. Change the identifier before creating Equipment.</div>}
                </div>}
                {!isCreate && <nav className="equipment-edit-tabs" aria-label="Equipment sections">
                    {tabs.map((tab) => <button
                        key={tab.id}
                        type="button"
                        className={activeTab === tab.id ? 'active' : ''}
                        aria-selected={activeTab === tab.id}
                        role="tab"
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                        {tab.count != null && tab.count > 0 && <span>{tab.count}</span>}
                    </button>)}
                </nav>}

                <div className="equipment-edit-tab-panel" role="tabpanel">
                    {(isCreate || activeTab === 'details') && <EditDrawerSection title={isCreate ? 'Equipment details' : 'Current master record'} meta={!isCreate && <span className={equipment?.statecode === 0 ? 'equipment-state active' : 'equipment-state'}>{equipment?.statecode === 0 ? 'Active' : 'Inactive'}</span>}>
                        {!isCreate && <p className="equipment-state-note">State is read-only until Equipment status reason values are confirmed.</p>}
                        <div className="equipment-form-grid">
                            <label>Primary Fleet Number<input value={form.fleet} onChange={(event) => updateField('fleet', event.target.value)} /></label>
                            <label>Serial number<input value={form.serial} onChange={(event) => updateField('serial', event.target.value)} /></label>
                            <label className="equipment-alternate-fleet-field">
                                Alternate Fleet Numbers
                                <textarea
                                    value={form.alternateFleetNumbers ?? ''}
                                    rows={2}
                                    placeholder="One per line, for example FN2123 or SITE-01"
                                    onChange={(event) => updateField('alternateFleetNumbers', event.target.value)}
                                />
                                <small>
                                    Searchable former, customer, or Site-specific codes. Changing the primary Fleet Number automatically keeps its previous value here.
                                    {parseAlternateFleetNumbers(form.alternateFleetNumbers).length > 0 && ` ${parseAlternateFleetNumbers(form.alternateFleetNumbers).length} recorded.`}
                                </small>
                            </label>
                            <label>Make<input value={form.make} onChange={(event) => updateField('make', event.target.value)} /></label>
                            <label>Model<input value={form.model} onChange={(event) => updateField('model', event.target.value)} /></label>
                            <label>
                                Equipment Ownership
                                <select
                                    value={form.ownershipType ?? ''}
                                    onChange={(event) => updateField(
                                        'ownershipType',
                                        event.target.value
                                            ? Number(event.target.value) as EquipmentOwnershipType
                                            : null,
                                    )}
                                >
                                    <option value="">Not classified</option>
                                    {EQUIPMENT_OWNERSHIP_OPTIONS.map((option) =>
                                        <option key={option.value} value={option.value}>{option.label}</option>,
                                    )}
                                </select>
                            </label>
                            {siteChecksEnabled && <label>
                                Site Check Availability
                                <select
                                    value={form.siteCheckAvailability ?? ''}
                                    onChange={(event) => updateField(
                                        'siteCheckAvailability',
                                        event.target.value
                                            ? Number(event.target.value) as EquipmentSiteCheckAvailability
                                            : null,
                                    )}
                                >
                                    <option value="">Available at Site</option>
                                    {EQUIPMENT_SITE_CHECK_AVAILABILITY_OPTIONS
                                        .filter((option) =>
                                            option.value !== EQUIPMENT_SITE_CHECK_AVAILABILITIES.AVAILABLE_AT_SITE)
                                        .map((option) => <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>)}
                                </select>
                            </label>}
                            {isCreate && <><label>Power Type<select value={form.powerType} onChange={(event) => {
                                const powerType = Number(event.target.value) as PowerType
                                setForm((current) => ({ ...current, powerType, serviceProgramme: current.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM ? current.serviceProgramme : powerType === POWER_TYPES.ELECTRIC ? SERVICE_PROGRAMMES.ELECTRIC_STANDARD : SERVICE_PROGRAMMES.ICE_STANDARD }))
                            }}><option value={POWER_TYPES.ICE}>ICE</option><option value={POWER_TYPES.ELECTRIC}>Electric</option><option value={POWER_TYPES.OTHER_UNKNOWN}>Other / Unknown</option></select></label><label>Service Programme<select value={form.serviceProgramme} onChange={(event) => updateField('serviceProgramme', Number(event.target.value) as ServiceProgramme)}><option value={SERVICE_PROGRAMMES.ICE_STANDARD}>ICE Standard — A/B/C</option><option value={SERVICE_PROGRAMMES.ELECTRIC_STANDARD}>Electric Standard — A/C</option><option value={SERVICE_PROGRAMMES.CUSTOM}>Custom</option></select></label><label>Default Maintenance Profile<select value={form.maintenanceProfile} onChange={(event) => { maintenanceProfileTouched.current = true; updateField('maintenanceProfile', Number(event.target.value) as MaintenanceProfile) }}><option value={MAINTENANCE_PROFILES.HIGH_USAGE}>High Usage</option><option value={MAINTENANCE_PROFILES.STANDARD}>Standard</option><option value={MAINTENANCE_PROFILES.LOW_USAGE}>Low Usage</option><option value={MAINTENANCE_PROFILES.CUSTOM}>Custom</option></select></label></>}
                            {isCreate && form.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM && <>{([['A', 'customAEnabled'], ['B', 'customBEnabled'], ['C', 'customCEnabled']] as const).map(([label, field]) => <label className="equipment-wof-required" key={field}><input type="checkbox" checked={form[field]} onChange={(event) => updateField(field, event.target.checked)} /> {label} Service enabled</label>)}</>}
                            {isCreate && form.maintenanceProfile === MAINTENANCE_PROFILES.CUSTOM && <>{form.customAEnabled && <label>Custom A interval (days)<input type="number" min="1" value={form.customAIntervalDays} onChange={(event) => updateField('customAIntervalDays', event.target.value)} /></label>}{form.customBEnabled && form.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM && <label>Custom B interval (days)<input type="number" min="1" value={form.customBIntervalDays} onChange={(event) => updateField('customBIntervalDays', event.target.value)} /></label>}{form.customCEnabled && <label>Custom C interval (days)<input type="number" min="1" value={form.customCIntervalDays} onChange={(event) => updateField('customCIntervalDays', event.target.value)} /></label>}</>}
                            <div className="equipment-relationship-fields">
                                <SearchableSelect
                                    id="equipment-customer"
                                    label="Customer"
                                    value={customerMode === 'existing' ? customerId : ''}
                                    options={customerOptions}
                                    onChange={(nextCustomerId) => {
                                        const customer = customers.find((candidate) => candidate.gr_customerid === nextCustomerId)
                                        if (customer) {
                                            selectExistingCustomer(customer)
                                            return
                                        }
                                        setCustomerId('')
                                        setCustomerMode('none')
                                        setCustomerQuery('')
                                        updateField('siteId', '')
                                        setSiteMode('none')
                                        setSiteQuery('')
                                        setNewSite({ name: '', address: '' })
                                        setRelatedError('')
                                    }}
                                    placeholder="Select a customer"
                                    searchPlaceholder="Search customers"
                                    emptyLabel="No matching customers"
                                />
                                {canCreateRelationships && customerMode !== 'new' && <button className="equipment-autocomplete-create" type="button" onClick={() => {
                                    if (customerMode === 'existing') setCustomerQuery('')
                                    setCustomerMode('new')
                                    setCustomerId('')
                                    updateField('siteId', '')
                                    setSiteMode('new')
                                    setSiteQuery('')
                                    setNewSite({ name: '', address: '' })
                                    setRelatedError('')
                                }}>+ Add new customer</button>}
                                {customerMode === 'new' && <label>New Customer Name<input value={customerQuery} placeholder="Enter customer name" onChange={(event) => { setCustomerQuery(event.target.value); setRelatedError('') }} /></label>}
                                {exactCustomerMatch && customerMode === 'new' && <div className="equipment-customer-duplicate-warning" role="alert"><p>A Customer with this name already exists. Select the existing Customer.</p><button type="button" onClick={() => selectExistingCustomer(exactCustomerMatch)}>Select {exactCustomerMatch.gr_name}</button></div>}

                                {siteMode !== 'new' && <SearchableSelect
                                    id="equipment-site"
                                    label="Site"
                                    value={form.siteId}
                                    options={siteOptions}
                                    onChange={(siteId) => {
                                        const site = visibleSites.find((candidate) => candidate.gr_siteid === siteId)
                                        setForm((current) => ({
                                            ...current,
                                            siteId,
                                            ...(!maintenanceProfileTouched.current && site?.gr_defaultmaintenanceprofile != null
                                                ? { maintenanceProfile: site.gr_defaultmaintenanceprofile }
                                                : {}),
                                        }))
                                        setSiteMode(site ? 'existing' : 'none')
                                        setSiteQuery(site?.gr_name ?? '')
                                        setRelatedError('')
                                    }}
                                    placeholder={selectedCustomer ? 'No Site selected' : 'Select a customer first'}
                                    searchPlaceholder="Search Site name, address or Customer"
                                    emptyLabel={selectedCustomer ? 'No matching Sites' : 'Select a customer before choosing a Site.'}
                                    disabled={!selectedCustomer}
                                />}
                                {canCreateRelationships && selectedCustomer && siteMode !== 'new' && <button className="equipment-autocomplete-create" type="button" onClick={() => { updateField('siteId', ''); setSiteMode('new'); setNewSite({ name: '', address: '' }); setRelatedError('') }}>+ Add new site</button>}
                                {canCreateRelationships && customerMode === 'new' && siteMode !== 'new' && <button className="equipment-autocomplete-create" type="button" onClick={() => { setSiteMode('new'); setNewSite({ name: '', address: '' }) }}>+ Add first site</button>}
                                {siteMode === 'new' && <div className="equipment-inline-site-fields"><label>Site Name<input value={newSite.name} onChange={(event) => { setNewSite((current) => ({ ...current, name: event.target.value })); setRelatedError('') }} /></label><label>Address<input value={newSite.address} onChange={(event) => { const address = event.target.value; setNewSite((current) => ({ ...current, address, name: current.name.trim() || deriveSiteNameFromAddress(address) })); setRelatedError('') }} /></label>{derivedSiteName && newSite.name === derivedSiteName && <p>Site Name generated from address.</p>}{matchingSiteAddress && <p>Possible existing Site at this address: <button type="button" onClick={() => { updateField('siteId', matchingSiteAddress.gr_siteid); setSiteMode('existing'); setSiteQuery(matchingSiteAddress.gr_name); setRelatedError('') }}>{matchingSiteAddress.gr_name}</button></p>}</div>}
                                {relatedError && <p className="equipment-related-error" role="alert">{relatedError}</p>}
                            </div>
                        </div>
                    </EditDrawerSection>}

                    {(isCreate || activeTab === 'details') && <EditDrawerSection
                        title="Road compliance"
                        meta={<FormSwitch
                            label="Road use"
                            checked={form.complianceStatus === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED}
                            disabled={busy}
                            onChange={(onRoad) => {
                                if (onRoad) {
                                    updateField('complianceStatus', EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED)
                                    return
                                }
                                const wasRoadRegistered = !isCreate
                                    && equipment
                                    && getEquipmentComplianceStatus(equipment) === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED
                                if (wasRoadRegistered && form.complianceStatus === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED) {
                                    setComplianceError('')
                                    setShowDeregisterConfirm(true)
                                } else {
                                    updateField('complianceStatus', EQUIPMENT_COMPLIANCE_STATUSES.OFF_ROAD)
                                }
                            }}
                        />}
                    >
                        {form.complianceStatus === EQUIPMENT_COMPLIANCE_STATUSES.ROAD_REGISTERED && <div className="equipment-form-grid">
                                <label>Registration Number<input value={form.registrationNumber} onChange={(event) => updateField('registrationNumber', event.target.value)} /></label>
                                <label>REGO Expiry<input type="date" value={form.regoExpiry} onChange={(event) => updateField('regoExpiry', event.target.value)} /></label>
                                <label>Current WOF Expiry<input type="date" value={form.currentWofExpiry} onChange={(event) => updateField('currentWofExpiry', event.target.value)} /></label>
                        </div>}
                    </EditDrawerSection>}

                    {isCreate && parsedSpreadsheetRow && <details className="equipment-spreadsheet-source" open={sourceContextOpen} onToggle={(event) => setSourceContextOpen(event.currentTarget.open)}><summary>Spreadsheet source</summary><dl><div><dt>Job Number</dt><dd>{parsedSpreadsheetRow.jobNumber || '-'}</dd></div><div><dt>Date</dt><dd>{parsedSpreadsheetRow.date || '-'}</dd></div><div><dt>Mechanic</dt><dd>{parsedSpreadsheetRow.mechanic || '-'}</dd></div><div><dt>Description</dt><dd>{parsedSpreadsheetRow.description || '-'}</dd></div><div><dt>Contact details</dt><dd>{parsedSpreadsheetRow.contactDetails || '-'}</dd></div><div><dt>Status</dt><dd>{parsedSpreadsheetRow.status || '-'}</dd></div><div><dt>Comments</dt><dd>{parsedSpreadsheetRow.comments || '-'}</dd></div><div><dt>Order number</dt><dd>{parsedSpreadsheetRow.orderNumber || '-'}</dd></div><div><dt>in so</dt><dd>{parsedSpreadsheetRow.inSo || '-'}</dd></div></dl></details>}

                    {!isCreate && activeTab === 'maintenance' && <EditDrawerSection title="Maintenance">
                        <div className="equipment-form-grid">
                            <label>Power Type<select value={form.powerType} onChange={(event) => {
                                const powerType = Number(event.target.value) as PowerType
                                setForm((current) => ({ ...current, powerType, serviceProgramme: current.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM ? current.serviceProgramme : powerType === POWER_TYPES.ELECTRIC ? SERVICE_PROGRAMMES.ELECTRIC_STANDARD : SERVICE_PROGRAMMES.ICE_STANDARD }))
                            }}><option value={POWER_TYPES.ICE}>ICE</option><option value={POWER_TYPES.ELECTRIC}>Electric</option><option value={POWER_TYPES.OTHER_UNKNOWN}>Other / Unknown</option></select></label>
                            <label>Service Programme<select value={form.serviceProgramme} onChange={(event) => updateField('serviceProgramme', Number(event.target.value) as ServiceProgramme)}><option value={SERVICE_PROGRAMMES.ICE_STANDARD}>ICE Standard — A/B/C</option><option value={SERVICE_PROGRAMMES.ELECTRIC_STANDARD}>Electric Standard — A/C</option><option value={SERVICE_PROGRAMMES.CUSTOM}>Custom</option></select></label>
                            <label>Default Maintenance Profile<select value={form.maintenanceProfile} onChange={(event) => updateField('maintenanceProfile', Number(event.target.value) as MaintenanceProfile)}><option value={MAINTENANCE_PROFILES.HIGH_USAGE}>High Usage</option><option value={MAINTENANCE_PROFILES.STANDARD}>Standard</option><option value={MAINTENANCE_PROFILES.LOW_USAGE}>Low Usage</option><option value={MAINTENANCE_PROFILES.CUSTOM}>Custom</option></select></label>
                        </div>
                        {form.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM && <div className="equipment-form-grid">{([['A', 'customAEnabled'], ['B', 'customBEnabled'], ['C', 'customCEnabled']] as const).map(([label, field]) => <label className="equipment-wof-required" key={field}><input type="checkbox" checked={form[field]} onChange={(event) => updateField(field, event.target.checked)} /> {label} Service enabled</label>)}</div>}
                        {form.maintenanceProfile === MAINTENANCE_PROFILES.CUSTOM && <div className="equipment-form-grid">
                            {form.customAEnabled && <label>Custom A interval (days)<input type="number" min="1" value={form.customAIntervalDays} onChange={(event) => updateField('customAIntervalDays', event.target.value)} /></label>}
                            {form.customBEnabled && form.serviceProgramme === SERVICE_PROGRAMMES.CUSTOM && <label>Custom B interval (days)<input type="number" min="1" value={form.customBIntervalDays} onChange={(event) => updateField('customBIntervalDays', event.target.value)} /></label>}
                            {form.customCEnabled && <label>Custom C interval (days)<input type="number" min="1" value={form.customCIntervalDays} onChange={(event) => updateField('customCIntervalDays', event.target.value)} /></label>}
                        </div>}
                        <div className="equipment-maintenance-plans">
                            <article className="equipment-hour-meter-card">
                                <div className="equipment-hour-meter-heading">
                                    <strong>Last Known Hour Meter</strong>
                                </div>
                                {!latestHourMeterReading
                                    ? <p className="equipment-hour-meter-empty">No hour-meter reading recorded</p>
                                    : <div className="equipment-hour-meter-reading">
                                        <strong>{latestHourMeterReading.hours.toLocaleString('en-NZ')} <small>h</small></strong>
                                        <span>Recorded {formatDate(latestHourMeterReading.date)}{latestHourMeterReading.source === 'job' ? ' from latest Job' : ''}</span>
                                    </div>}
                            </article>
                            {usageForecast && <details className="equipment-usage-forecast-card">
                                <summary className="equipment-usage-forecast-heading">
                                    <span><strong>Average Machine Usage</strong><small>{usageForecast.averageHoursPerDay == null ? 'Not enough reliable history' : `${usageForecast.averageHoursPerDay.toFixed(1)} h per day`}</small></span>
                                    <span className={`confidence-${usageForecast.confidence.toLowerCase()}`}>{usageForecast.confidenceScore}% {usageForecast.confidence} confidence</span>
                                </summary>
                                <div className="equipment-usage-forecast-details">
                                    <p className="equipment-usage-confidence-summary"><strong>Why this confidence:</strong> {usageForecast.confidenceSummary}</p>
                                    {usageForecast.averageHoursPerDay == null
                                        ? null
                                        : <dl>
                                            <div><dt>Per Day</dt><dd>{usageForecast.averageHoursPerDay.toFixed(1)} h</dd></div>
                                            <div><dt>Per Week</dt><dd>{usageForecast.averageHoursPerWeek!.toFixed(1)} h</dd></div>
                                            <div><dt>Per Month</dt><dd>{usageForecast.averageHoursPerMonth!.toFixed(0)} h</dd></div>
                                            <div><dt>Evidence</dt><dd>{usageForecast.readingCount} readings / {usageForecast.spanDays} days</dd></div>
                                            <div><dt>Estimated</dt><dd>{usageForecast.estimatedCount}</dd></div>
                                            <div><dt>Ignored anomalies</dt><dd>{usageForecast.anomalyCount}</dd></div>
                                            <div><dt>Detected resets</dt><dd>{usageForecast.resetCount}</dd></div>
                                            <div><dt>Latest Reading</dt><dd>{usageForecast.latestReadingDate ? formatDate(usageForecast.latestReadingDate) : '-'}</dd></div>
                                        </dl>}
                                    <p className="equipment-usage-confidence-note">Confidence reflects reading count, history span, recency, and usage consistency across all completed Job types.</p>
                                    {usageForecast.readings.some((reading) => reading.assessment !== 'Accepted') && <div className="equipment-usage-signals" aria-label="Hour meter reading signals">
                                        <strong>Reading signals</strong>
                                        {usageForecast.readings.filter((reading) => reading.assessment !== 'Accepted').slice(-6).map((reading) => {
                                            const sourceJob = history.find((job) => job.gr_jobid === reading.id)
                                            return <div key={`${reading.id}-${reading.date}-${reading.hours}`}>
                                                <span>{sourceJob?.gr_jobnumber || (reading.id === 'equipment-current' ? 'Current Equipment reading' : 'Job')}</span>
                                                <span>{formatDate(reading.date)} · {reading.hours.toLocaleString('en-NZ')} h</span>
                                                <em className={`signal-${reading.assessment.toLowerCase().replaceAll(' ', '-')}`}>{reading.assessment}</em>
                                            </div>
                                        })}
                                    </div>}
                                </div>
                            </details>}
                            <div className="equipment-maintenance-service-heading">
                                <div>
                                    <strong>Service history and due dates</strong>
                                    <span>Saved service baselines and completed Service Jobs</span>
                                </div>
                                <button type="button" onClick={openMaintenanceDialog} disabled={busy}>Set historical baseline</button>
                            </div>
                            <p className="equipment-historical-baseline-note">Use the historical baseline only when earlier maintenance is not represented by Jobs in this app.</p>
                            {maintenanceConfiguration.activeServiceTypes.map((serviceType) => {
                                const plan = plans.find((item) => item.gr_servicetype === serviceType)
                                const serviceLevel = maintenanceConfiguration.serviceLevels[serviceType]!
                                const currentHours = latestHourMeterReading?.hours ?? 0
                                const remaining = plan ? calculateHoursRemaining(currentHours, plan.gr_nextduehours) : null
                                const projection = plan
                                    ? calculateForecastAdjustedServicePlan(plan, { ...equipment, gr_currenthourmeter: currentHours }, usageForecast, currentNewZealandDateOnly())
                                    : null
                                const adjustedInterval = projection?.adjustedInterval ?? null
                                const estimatedHourDueDate = projection?.estimatedHourDueDate ?? null
                                const suggestedService = projection?.suggestedService ?? null
                                const status = projection?.status ?? null
                                const nextDueLabel = suggestedService ? formatDate(suggestedService.date) : 'Not configured'
                                const nextServiceBasis = suggestedService?.basis === 'hours'
                                    ? `Projected hours · ${usageForecast?.confidenceScore ?? 0}% confidence`
                                    : suggestedService?.basis === 'both'
                                        ? 'Calendar and projected hours align'
                                        : suggestedService ? `Calendar due ${formatDate(suggestedService.date)}` : 'No due date available'
                                const nextDueStatus = suggestedService?.isOverdue
                                    ? `Overdue — book now · ${nextServiceBasis}`
                                    : suggestedService?.isDueToday ? `Due today · ${nextServiceBasis}` : nextServiceBasis
                                const intervalLabel = adjustedInterval?.label ?? formatMaintenanceInterval(serviceLevel.timeInterval)
                                const intervalBasis = adjustedInterval?.source === 'usage'
                                    ? `Usage estimate · ${usageForecast?.confidenceScore ?? 0}% confidence`
                                    : 'Default profile fallback · usage confidence below 40% or forecast unavailable'
                                const lastCompletedSummary = plan?.gr_LastCompletedJob?.gr_jobnumber
                                    ? `Job ${plan.gr_LastCompletedJob.gr_jobnumber} · ${plan.gr_lastcompletedhours != null ? `${plan.gr_lastcompletedhours.toLocaleString('en-NZ')} hours` : 'hours not recorded'}`
                                    : 'No completed Job linked'
                                return <details className="equipment-service-plan-card" key={serviceType}>
                                    <summary>
                                        <div className="equipment-service-plan-heading">
                                            <div><strong>{SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label}</strong><span className="equipment-service-plan-interval">{intervalLabel}</span></div>
                                            <span className={`equipment-maintenance-status status-${status?.toLowerCase().replace(' ', '-') ?? 'unknown'}`}>{status ?? 'Not Configured'}</span>
                                        </div>
                                        <div className="equipment-service-plan-glance">
                                            <div><span>Last completed</span><strong>{plan?.gr_lastcompleteddate ? formatDate(plan.gr_lastcompleteddate) : 'Not recorded'}</strong><small>{lastCompletedSummary}</small></div>
                                            <div><span>Next due by</span><strong>{nextDueLabel}</strong><small>{nextDueStatus}</small></div>
                                        </div>
                                    </summary>
                                    <div className="equipment-service-plan-details">
                                        <p className="equipment-service-plan-interval-detail">Interval: <strong>{intervalLabel}</strong> <span>{intervalBasis}</span></p>
                                        <dl>
                                            <div><dt>Due Hour</dt><dd>{plan?.gr_nextduehours ?? '-'}</dd></div>
                                            <div><dt>Stored Due Date</dt><dd>{plan?.gr_nextduedate ? formatDate(plan.gr_nextduedate) : '-'}</dd></div>
                                            <div><dt>Hours Remaining</dt><dd>{remaining == null ? '-' : remaining < 0 ? `${Math.abs(remaining)} overdue` : remaining}</dd></div>
                                            <div><dt>Projected Hour Date</dt><dd>{estimatedHourDueDate ? formatDate(estimatedHourDueDate) : '-'}</dd></div>
                                            <div><dt>Last Completed Date</dt><dd>{plan?.gr_lastcompleteddate ? formatDate(plan.gr_lastcompleteddate) : '-'}</dd></div>
                                            <div><dt>Last Completed Hours</dt><dd>{plan?.gr_lastcompletedhours ?? '-'}</dd></div>
                                            <div><dt>Last Completed Job</dt><dd>{plan?.gr_LastCompletedJob?.gr_jobnumber || '-'}</dd></div>
                                        </dl>
                                    </div>
                                </details>
                            })}
                        </div>
                    </EditDrawerSection>}

                    {!isCreate && activeTab === 'history' && <EditDrawerSection title="Job History" meta={<span className="equipment-history-count">{props.isJobHistoryLoading ? 'Loading…' : `${history.length} ${history.length === 1 ? 'job' : 'jobs'}`}</span>}>
                        <p className="equipment-history-note">Historical rows use each Job's recorded Site and are not changed when this Equipment moves.</p>
                        {props.isJobHistoryLoading
                            ? <div className="equipment-history-empty" role="status">Loading linked Jobs…</div>
                            : props.jobHistoryError
                                ? <div className="equipment-history-empty" role="alert"><p>{props.jobHistoryError}</p>{props.onRetryJobHistory && <button type="button" onClick={props.onRetryJobHistory}>Try again</button>}</div>
                                : history.length === 0 ? <div className="equipment-history-empty">No linked jobs found.</div> : <div className="equipment-history-list">{history.map((job) => <article
                            key={job.gr_jobid}
                            className={!isCreate && props.onOpenJob ? 'equipment-history-card-clickable' : undefined}
                            role={!isCreate && props.onOpenJob ? 'button' : undefined}
                            tabIndex={!isCreate && props.onOpenJob ? 0 : undefined}
                            aria-label={!isCreate && props.onOpenJob ? `Open Job ${job.gr_jobnumber || 'without a Job Number'}` : undefined}
                            onClick={!isCreate && props.onOpenJob ? () => props.onOpenJob?.(job) : undefined}
                            onKeyDown={!isCreate && props.onOpenJob ? (event) => {
                                if (event.key !== 'Enter' && event.key !== ' ') return
                                event.preventDefault()
                                props.onOpenJob?.(job)
                            } : undefined}
                        >
                            <div className="equipment-history-title">
                                <div><strong>{job.gr_jobnumber || 'Job number not set'}</strong><span title={job.gr_description || 'No description'}>{job.gr_description || 'No description'}</span></div>
                                <time dateTime={job.createdon}>Created {formatDate(job.createdon)}</time>
                            </div>
                            <div className="equipment-history-meta"><span>{getJobTypeLabel(job.gr_jobtype)}</span><span className="equipment-history-status" data-status={job.gr_status}>{JOB_STATUS_OPTIONS.find((option) => option.value === job.gr_status)?.label ?? 'Status not set'}</span><span>{JOB_CARD_STATUS_OPTIONS.find((option) => option.value === getJobCardStatus(job.gr_jobcardstatus))?.label}</span></div>
                            <dl>
                                <div><dt>Completed Date</dt><dd>{job.gr_completeddate ? formatDate(job.gr_completeddate) : 'Not completed'}</dd></div>
                                <div><dt>Hours Recorded</dt><dd>{job.gr_hourmeter == null ? 'Not recorded' : `${job.gr_hourmeter.toLocaleString('en-NZ')} hours${job.gr_hourmeterreadingtype === HOUR_METER_READING_TYPES.ESTIMATED ? ' · Estimated' : ''}`}</dd></div>
                                <div><dt>Job Site</dt><dd>{job.gr_Site?.gr_name || 'No Site recorded'}</dd></div>
                                <div><dt>Mechanic</dt><dd>{job.gr_Mechanic?.gr_name || 'Unassigned'}</dd></div>
                            </dl>
                        </article>)}</div>}
                    </EditDrawerSection>}
                </div>
            </form>
        </EditDrawerShell>

        {!isCreate && showDeleteConfirm && <EditDrawerConfirmation
            eyebrow="Delete equipment"
            title={`Delete equipment "${equipmentName}"?`}
            message="This action cannot be undone."
            error={deleteError}
            isBusy={isDeleting}
            confirmLabel={isDeleting ? 'Deleting...' : 'Delete equipment'}
            onCancel={() => setShowDeleteConfirm(false)}
            onConfirm={() => void deleteRecord()}
        />}

        {!isCreate && showProgrammeChangeConfirm && <EditDrawerConfirmation
            eyebrow="Service programme"
            title="Change this Equipment's service programme?"
            message="Current plan applicability will be recalculated. Inactive service-plan history and all historical Service Jobs will be retained; no completion will be invented."
            isBusy={isSaving}
            confirmLabel="Change programme"
            onCancel={() => setShowProgrammeChangeConfirm(false)}
            onConfirm={() => {
                programmeChangeConfirmedRef.current = true
                setShowProgrammeChangeConfirm(false)
                window.setTimeout(() => equipmentFormRef.current?.requestSubmit(), 0)
            }}
        />}

        {!isCreate && showDeregisterConfirm && <EditDrawerConfirmation
            eyebrow="Road compliance"
            title="De-register this equipment?"
            message={<>Its registration number, REGO expiry, and WOF expiry will be cleared, and it will be removed from road-compliance monitoring. Jobs and WOF inspection history will be retained.</>}
            error={complianceError}
            isBusy={isComplianceSaving}
            confirmLabel={isComplianceSaving ? 'Saving...' : 'De-register equipment'}
            onCancel={() => { setShowDeregisterConfirm(false); setComplianceError('') }}
            onConfirm={() => void deregisterEquipment()}
        />}

        {!isCreate && maintenanceDialogOpen && <EditDrawerFormDialog
            eyebrow="Historical setup"
            title="Set Historical Service Baseline"
            error={maintenanceError}
            isBusy={busy}
            submitLabel={isSaving ? 'Saving...' : 'Save baseline'}
            onCancel={() => { if (!busy) setMaintenanceDialogOpen(false) }}
            onSubmit={() => void saveMaintenanceHistory()}
        >
            <p className="edit-form-dialog-context">Use this only for maintenance completed before its Jobs were recorded in this app. Future completed Service Jobs update service history automatically.</p>
            {latestHourMeterReading?.source === 'job'
                ? <p className="equipment-maintenance-job-meter-note">The Last Known Hour Meter comes from the latest completed Job and is not replaced by this historical baseline.</p>
                : <fieldset className="equipment-maintenance-history-group hour-meter">
                <legend>Last Known Hour Meter</legend>
                <label>Fallback Hour Meter<input type="number" min="0" value={maintenanceForm.currentHourMeter} onChange={(event) => { setMaintenanceForm((current) => ({ ...current, currentHourMeter: event.target.value })); setMaintenanceError('') }} /></label>
                <label>Reading recorded date<input type="date" required value={maintenanceForm.readingRecordedDate} onChange={(event) => { setMaintenanceForm((current) => ({ ...current, readingRecordedDate: event.target.value })); setMaintenanceError('') }} /></label>
                </fieldset>}
            {maintenanceConfiguration.activeServiceTypes.map((serviceType) => {
                const label = SERVICE_TYPE_OPTIONS.find((option) => option.value === serviceType)?.label
                return <fieldset className="equipment-maintenance-history-group" key={serviceType}>
                    <legend>{label}</legend>
                    <label>Last Completed Date<input type="date" value={maintenanceForm.plans[serviceType].lastCompletedDate} onChange={(event) => updateMaintenancePlanField(serviceType, 'lastCompletedDate', event.target.value)} /></label>
                    <label>Last Completed Hours<input type="number" min="0" value={maintenanceForm.plans[serviceType].lastCompletedHours} onChange={(event) => updateMaintenancePlanField(serviceType, 'lastCompletedHours', event.target.value)} /></label>
                </fieldset>
            })}
        </EditDrawerFormDialog>}
    </>
}
