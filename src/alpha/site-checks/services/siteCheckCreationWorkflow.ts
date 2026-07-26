import {
    isEquipmentSiteCheckAvailability,
    resolveEquipmentSiteCheckAvailability,
    type EquipmentSiteCheckAvailability,
} from '../../equipment/types/equipmentSiteCheckAvailability.types.ts'
import {
    calculateSiteCheckProgress,
    filterSiteCheckEquipment,
    siteCheckUnavailableEquipment,
} from '../domain/siteCheckCalculations.ts'
import {
    resolveSiteCheckChecklistTemplate,
    validateSiteCheckChecklistTemplate,
} from '../domain/siteCheckChecklist.ts'
import type { SiteCheck, SiteCheckSchedule } from '../types/siteCheck.types.ts'
import {
    fetchActiveSiteCheckChecklistTemplates,
    fetchSiteCheckChecklistTemplateItems,
} from './siteCheckChecklistApi.ts'
import {
    executeSiteCheckCreation,
    type SiteCheckCreationEquipment,
} from './siteCheckCreationApi.ts'
import {
    fetchSiteCheckByRequestKey,
    fetchSiteCheckJobs,
    fetchSiteCheckScheduleEquipment,
    fetchSiteCheckSchedulesForSites,
} from './siteChecksApi.ts'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MechanicPreflight = {
    gr_mechanicid: string
    gr_name: string
    statecode: number
}

export type StartSiteCheckWorkflowInput = {
    siteId: string
    siteName: string
    technicianId: string
    requestKey: string
    startedOn: string
    availabilityOverrides?: readonly {
        equipmentId: string
        availability: EquipmentSiteCheckAvailability
    }[]
}

type WorkflowDependencies = {
    fetchSchedules?: typeof fetchSiteCheckSchedulesForSites
    fetchEquipment?: typeof fetchSiteCheckEquipmentForSite
    fetchMechanic?: typeof fetchSiteCheckMechanic
    fetchScheduleEquipment?: typeof fetchSiteCheckScheduleEquipment
    executeCreation?: typeof executeSiteCheckCreation
    fetchByRequestKey?: typeof fetchSiteCheckByRequestKey
    fetchJobs?: typeof fetchSiteCheckJobs
    fetchChecklistTemplates?: typeof fetchActiveSiteCheckChecklistTemplates
    fetchChecklistItems?: typeof fetchSiteCheckChecklistTemplateItems
}

function headers(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
    }
}

export async function fetchSiteCheckEquipmentForSite(
    accessToken: string,
    siteId: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
): Promise<SiteCheckCreationEquipment[]> {
    if (!GUID_PATTERN.test(siteId)) throw new Error('A valid Site ID is required.')
    const query = [
        '$select=gr_equipmentid,gr_fleet,gr_serial,gr_make,gr_model,statecode,gr_ownershiptype,gr_powertype,gr_sitecheckavailability',
        `$filter=_gr_site_value eq ${siteId}`,
        '$orderby=gr_fleet asc',
    ].join('&')
    const response = await (options.fetcher ?? fetch)(
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_equipments?${query}`,
        { cache: 'no-store', headers: headers(accessToken) },
    )
    if (!response.ok) throw new Error('Site Equipment could not be loaded for Site Check creation.')
    const rows = (await response.json() as { value?: SiteCheckCreationEquipment[] }).value
    if (!Array.isArray(rows)) throw new Error('Site Equipment returned invalid data.')
    return rows
}

export async function fetchSiteCheckMechanic(
    accessToken: string,
    mechanicId: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
): Promise<MechanicPreflight | null> {
    if (!GUID_PATTERN.test(mechanicId)) throw new Error('A valid technician ID is required.')
    const response = await (options.fetcher ?? fetch)(
        `${options.apiUrl ?? DEFAULT_API_URL}/gr_mechanics(${mechanicId})?$select=gr_mechanicid,gr_name,statecode`,
        { cache: 'no-store', headers: headers(accessToken) },
    )
    if (response.status === 404) return null
    if (!response.ok) throw new Error('The selected technician could not be validated.')
    return await response.json() as MechanicPreflight
}

async function reconcileCreation(
    accessToken: string,
    input: StartSiteCheckWorkflowInput,
    dependencies: Required<Pick<WorkflowDependencies, 'fetchSchedules' | 'fetchByRequestKey' | 'fetchJobs'>>,
    known?: { schedule?: SiteCheckSchedule; occurrence?: SiteCheck | null },
) {
    const [schedule, occurrence] = await Promise.all([
        known?.schedule
            ? Promise.resolve(known.schedule)
            : dependencies.fetchSchedules(accessToken, [input.siteId]).then((rows) => rows[0]),
        known && 'occurrence' in known
            ? Promise.resolve(known.occurrence)
            : dependencies.fetchByRequestKey(accessToken, input.requestKey),
    ])
    if (!occurrence) {
        if (schedule?._gr_activesitecheck_value) {
            throw new Error('Another manager started a Site Check for this Site.')
        }
        return null
    }
    if (!schedule || schedule._gr_activesitecheck_value?.toLowerCase() !== occurrence.gr_sitecheckid.toLowerCase()) {
        throw new Error('Site Check creation needs data-integrity review before retrying.')
    }
    const jobs = await dependencies.fetchJobs(accessToken, [occurrence.gr_sitecheckid])
    const progress = calculateSiteCheckProgress(jobs, occurrence.gr_expectedjobcount)
    if (progress.hasIntegrityMismatch) {
        throw new Error('Site Check creation needs data-integrity review before retrying.')
    }
    return occurrence
}

export async function startSiteCheckWorkflow(
    accessToken: string,
    input: StartSiteCheckWorkflowInput,
    dependencies: WorkflowDependencies = {},
): Promise<SiteCheck> {
    const fetchSchedules = dependencies.fetchSchedules ?? fetchSiteCheckSchedulesForSites
    const fetchEquipment = dependencies.fetchEquipment ?? fetchSiteCheckEquipmentForSite
    const fetchMechanic = dependencies.fetchMechanic ?? fetchSiteCheckMechanic
    const fetchScheduleEquipment =
        dependencies.fetchScheduleEquipment ?? fetchSiteCheckScheduleEquipment
    const executeCreation = dependencies.executeCreation ?? executeSiteCheckCreation
    const fetchByRequestKey = dependencies.fetchByRequestKey ?? fetchSiteCheckByRequestKey
    const fetchJobs = dependencies.fetchJobs ?? fetchSiteCheckJobs
    const fetchChecklistTemplates =
        dependencies.fetchChecklistTemplates ?? fetchActiveSiteCheckChecklistTemplates
    const fetchChecklistItems =
        dependencies.fetchChecklistItems ?? fetchSiteCheckChecklistTemplateItems
    const reconciliation = { fetchSchedules, fetchByRequestKey, fetchJobs }

    const replay = await fetchByRequestKey(accessToken, input.requestKey)
    if (replay) {
        const schedules = await fetchSchedules(accessToken, [input.siteId])
        const reconciled = await reconcileCreation(accessToken, input, reconciliation, {
            schedule: schedules[0],
            occurrence: replay,
        })
        if (reconciled) return reconciled
    }

    const schedules = await fetchSchedules(accessToken, [input.siteId])
    const schedule = schedules[0]
    if (!schedule) throw new Error('A Site Check Schedule is required.')
    if (schedule._gr_activesitecheck_value) {
        throw new Error('Another Site Check is already in progress for this Site.')
    }
    const [equipment, mechanic, selections] = await Promise.all([
        fetchEquipment(accessToken, input.siteId),
        fetchMechanic(accessToken, input.technicianId),
        fetchScheduleEquipment(accessToken, [schedule.gr_sitecheckscheduleid]),
    ])
    if (!mechanic || mechanic.statecode === 1) {
        throw new Error('Select an active technician.')
    }
    const overrides = new Map(
        (input.availabilityOverrides ?? []).map((override) => {
            if (!GUID_PATTERN.test(override.equipmentId)
                || !isEquipmentSiteCheckAvailability(override.availability)) {
                throw new Error('Equipment availability changes are invalid.')
            }
            return [override.equipmentId.toLowerCase(), override.availability] as const
        }),
    )
    const reviewedEquipment = equipment.map((item) => ({
        ...item,
        gr_sitecheckavailability: overrides.get(item.gr_equipmentid.toLowerCase())
            ?? item.gr_sitecheckavailability,
    }))
    const includedEquipment = filterSiteCheckEquipment(
        reviewedEquipment,
        schedule.gr_equipmentscope,
        selections.map((selection) => selection._gr_equipment_value),
    )
    const excludedEquipment = siteCheckUnavailableEquipment(
        reviewedEquipment,
        schedule.gr_equipmentscope,
        selections.map((selection) => selection._gr_equipment_value),
    )
    const scopedIds = new Set([...includedEquipment, ...excludedEquipment]
        .map((item) => item.gr_equipmentid.toLowerCase()))
    if ([...overrides.keys()].some((id) => !scopedIds.has(id))) {
        throw new Error('Equipment availability changed outside the current Site Check scope.')
    }
    const authoritativeById = new Map(
        equipment.map((item) => [item.gr_equipmentid.toLowerCase(), item] as const),
    )
    const availabilityUpdates = [...overrides].flatMap(([id, availability]) => {
        const authoritative = authoritativeById.get(id)
        if (!authoritative
            || resolveEquipmentSiteCheckAvailability(authoritative.gr_sitecheckavailability)
                === availability) return []
        return [{ equipment: authoritative, availability }]
    })
    if (!includedEquipment.length) throw new Error('This Site has no applicable Equipment.')
    const resolutions = includedEquipment.map((item) =>
        resolveSiteCheckChecklistTemplate(item.gr_powertype))
    const templateCodes = [...new Set(resolutions.map((resolution) => resolution.templateCode))]
    const templates = await fetchChecklistTemplates(accessToken, templateCodes)
    const templateByCode = new Map(
        templates.map((template) => [template.gr_templatecode, template] as const),
    )
    const templateItems = new Map(await Promise.all(templates.map(async (template) => {
        const items = await fetchChecklistItems(
            accessToken,
            template.gr_sitecheckchecklisttemplateid,
        )
        const validation = validateSiteCheckChecklistTemplate(template, items)
        if (!validation.valid) throw new Error(validation.errors.join(' '))
        return [template.gr_templatecode, items] as const
    })))
    const checklists = includedEquipment.map((item, index) => {
        const code = resolutions[index].templateCode
        const template = templateByCode.get(code)
        const items = templateItems.get(code)
        if (!template || !items) {
            throw new Error(`The active ${code} checklist template is unavailable.`)
        }
        return { equipmentId: item.gr_equipmentid, template, items }
    })

    try {
        await executeCreation(accessToken, {
            schedule,
            siteName: input.siteName,
            technicianId: mechanic.gr_mechanicid,
            equipment: includedEquipment,
            checklists,
            excludedEquipment,
            availabilityUpdates,
            requestKey: input.requestKey,
            startedOn: input.startedOn,
        })
    } catch (error) {
        const reconciled = await reconcileCreation(accessToken, input, reconciliation)
        if (reconciled) return reconciled
        throw error
    }

    const reconciled = await reconcileCreation(accessToken, input, reconciliation)
    if (!reconciled) throw new Error('Site Check creation could not be confirmed. Retry with the same request.')
    return reconciled
}
