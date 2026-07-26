import {
    SITE_CHECK_CHECKLIST_CHOICE_ANSWERS,
    SITE_CHECK_CHECKLIST_RESPONSE_TYPES,
    type SiteCheckChecklistChoiceAnswer,
    type SiteCheckChecklistResponse,
    type SiteCheckChecklistResponseType,
    type SiteCheckChecklistSnapshotItem,
    type SiteCheckChecklistTemplate,
    type SiteCheckChecklistTemplateItem,
} from '../types/siteCheckChecklist.types.ts'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESPONSE_TYPES = new Set<number>(Object.values(SITE_CHECK_CHECKLIST_RESPONSE_TYPES))
const CHOICE_ANSWERS = new Set<number>(Object.values(SITE_CHECK_CHECKLIST_CHOICE_ANSWERS))

type Collection = { value?: unknown[]; '@odata.nextLink'?: unknown }
type Options = { apiUrl?: string; fetcher?: typeof fetch }

function requestHeaders(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
    }
}

function guid(value: unknown, field: string) {
    if (typeof value !== 'string' || !GUID_PATTERN.test(value)) {
        throw new Error(`Site Check checklist data is missing a valid ${field}.`)
    }
    return value
}

function optionalGuid(value: unknown, field: string) {
    return value == null || value === '' ? null : guid(value, field)
}

function text(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Site Check checklist data is missing ${field}.`)
    }
    return value
}

function number(value: unknown, field: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Site Check checklist data is missing ${field}.`)
    }
    return value
}

function responseType(value: unknown) {
    const resolved = number(value, 'response type')
    if (!RESPONSE_TYPES.has(resolved)) throw new Error('Site Check checklist data has an unsupported response type.')
    return resolved as SiteCheckChecklistResponseType
}

function mapTemplate(value: unknown): SiteCheckChecklistTemplate {
    const row = value as Record<string, unknown>
    return {
        gr_sitecheckchecklisttemplateid: guid(row.gr_sitecheckchecklisttemplateid, 'Template ID'),
        gr_name: text(row.gr_name, 'Template name'),
        gr_templatecode: text(row.gr_templatecode, 'Template code'),
        gr_version: number(row.gr_version, 'Template version'),
        gr_active: Boolean(row.gr_active),
        _gr_supersedestemplate_value: optionalGuid(
            row._gr_supersedestemplate_value,
            'superseded Template',
        ),
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function mapRules(row: Record<string, unknown>) {
    return {
        gr_required: Boolean(row.gr_required),
        gr_commentrequiredonnegative: Boolean(row.gr_commentrequiredonnegative),
        gr_photorequiredonnegative: Boolean(row.gr_photorequiredonnegative),
    }
}

function mapTemplateItem(value: unknown): SiteCheckChecklistTemplateItem {
    const row = value as Record<string, unknown>
    return {
        ...mapRules(row),
        gr_sitecheckchecklisttemplateitemid: guid(
            row.gr_sitecheckchecklisttemplateitemid,
            'Template Item ID',
        ),
        gr_name: text(row.gr_name, 'Template Item name'),
        _gr_checklisttemplate_value: guid(row._gr_checklisttemplate_value, 'parent Template'),
        gr_itemkey: text(row.gr_itemkey, 'item key'),
        gr_groupname: text(row.gr_groupname, 'group name'),
        gr_prompt: text(row.gr_prompt, 'prompt'),
        gr_responsetype: responseType(row.gr_responsetype),
        gr_displayorder: number(row.gr_displayorder, 'display order'),
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function mapSnapshotItem(value: unknown): SiteCheckChecklistSnapshotItem {
    const row = value as Record<string, unknown>
    return {
        ...mapRules(row),
        gr_sitecheckchecklistsnapshotitemid: guid(
            row.gr_sitecheckchecklistsnapshotitemid,
            'Snapshot Item ID',
        ),
        gr_name: text(row.gr_name, 'Snapshot Item name'),
        _gr_sitecheck_value: guid(row._gr_sitecheck_value, 'parent Site Check'),
        _gr_job_value: guid(row._gr_job_value, 'parent Job'),
        _gr_sourcetemplateitem_value: optionalGuid(
            row._gr_sourcetemplateitem_value,
            'source Template Item',
        ),
        gr_itemkey: text(row.gr_itemkey, 'item key'),
        gr_groupname: text(row.gr_groupname, 'group name'),
        gr_prompt: text(row.gr_prompt, 'prompt'),
        gr_responsetype: responseType(row.gr_responsetype),
        gr_displayorder: number(row.gr_displayorder, 'display order'),
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

function mapResponse(value: unknown): SiteCheckChecklistResponse {
    const row = value as Record<string, unknown>
    const choice = row.gr_choiceanswer == null ? null : number(row.gr_choiceanswer, 'choice answer')
    if (choice != null && !CHOICE_ANSWERS.has(choice)) {
        throw new Error('Site Check checklist data has an unsupported choice answer.')
    }
    return {
        gr_sitecheckchecklistresponseid: guid(
            row.gr_sitecheckchecklistresponseid,
            'Response ID',
        ),
        gr_name: text(row.gr_name, 'Response name'),
        _gr_job_value: guid(row._gr_job_value, 'Response Job'),
        _gr_snapshotitem_value: guid(row._gr_snapshotitem_value, 'Response Snapshot Item'),
        _gr_technician_value: guid(row._gr_technician_value, 'Response technician'),
        gr_choiceanswer: choice as SiteCheckChecklistChoiceAnswer | null,
        gr_numericanswer: row.gr_numericanswer == null
            ? null
            : number(row.gr_numericanswer, 'numeric answer'),
        gr_textanswer: typeof row.gr_textanswer === 'string' ? row.gr_textanswer : null,
        gr_comment: typeof row.gr_comment === 'string' ? row.gr_comment : null,
        gr_submittedon: text(row.gr_submittedon, 'submitted date'),
        '@odata.etag': typeof row['@odata.etag'] === 'string' ? row['@odata.etag'] : undefined,
    }
}

async function readAll<T>(
    accessToken: string,
    initialUrl: string,
    fallback: string,
    mapper: (value: unknown) => T,
    options: Options,
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const fetcher = options.fetcher ?? fetch
    let url: string | undefined = initialUrl
    const records: T[] = []
    while (url) {
        if (!url.startsWith(apiUrl)) throw new Error('The checklist continuation link is invalid.')
        const response = await fetcher(url, {
            cache: 'no-store',
            headers: requestHeaders(accessToken),
        })
        if (!response.ok) throw new Error(fallback)
        const body = await response.json() as Collection
        if (!Array.isArray(body.value)) throw new Error(fallback)
        records.push(...body.value.map(mapper))
        const next = body['@odata.nextLink']
        url = typeof next === 'string' ? next : undefined
    }
    return records
}

export async function fetchSiteCheckChecklistTemplate(
    accessToken: string,
    templateId: string,
    options: Options = {},
) {
    const id = guid(templateId, 'Template ID').toLowerCase()
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const response = await (options.fetcher ?? fetch)(
        `${apiUrl}/gr_sitecheckchecklisttemplates(${id})`
        + '?$select=gr_sitecheckchecklisttemplateid,gr_name,gr_templatecode,gr_version,gr_active,_gr_supersedestemplate_value',
        { cache: 'no-store', headers: requestHeaders(accessToken) },
    )
    if (!response.ok) throw new Error('The selected Site Check checklist template could not be loaded.')
    return mapTemplate(await response.json())
}

export async function fetchActiveSiteCheckChecklistTemplates(
    accessToken: string,
    templateCodes: readonly string[],
    options: Options = {},
) {
    const codes = [...new Set(templateCodes.map((code) => code.trim()))]
    if (!codes.length) return []
    if (codes.some((code) => !/^SITE_CHECK_[A-Z_]+$/.test(code))) {
        throw new Error('A valid Site Check checklist template code is required.')
    }
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const filters = codes.map((code) => `gr_templatecode eq '${code}'`).join(' or ')
    const select = [
        'gr_sitecheckchecklisttemplateid', 'gr_name', 'gr_templatecode',
        'gr_version', 'gr_active', '_gr_supersedestemplate_value',
    ].join(',')
    const templates = await readAll(
        accessToken,
        `${apiUrl}/gr_sitecheckchecklisttemplates?$select=${select}`
        + `&$filter=gr_active eq true and (${filters})`
        + '&$orderby=gr_templatecode asc,gr_version desc',
        'The Site Check checklist templates could not be loaded.',
        mapTemplate,
        options,
    )
    for (const code of codes) {
        if (templates.filter((template) => template.gr_templatecode === code).length !== 1) {
            throw new Error(`Exactly one active ${code} checklist template is required.`)
        }
    }
    return templates
}

export function fetchSiteCheckChecklistTemplateItems(
    accessToken: string,
    templateId: string,
    options: Options = {},
) {
    const id = guid(templateId, 'Template ID').toLowerCase()
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const select = [
        'gr_sitecheckchecklisttemplateitemid', 'gr_name', '_gr_checklisttemplate_value',
        'gr_itemkey', 'gr_groupname', 'gr_prompt', 'gr_responsetype', 'gr_displayorder',
        'gr_required', 'gr_commentrequiredonnegative', 'gr_photorequiredonnegative',
    ].join(',')
    return readAll(
        accessToken,
        `${apiUrl}/gr_sitecheckchecklisttemplateitems?$select=${select}`
        + `&$filter=_gr_checklisttemplate_value eq ${id}&$orderby=gr_displayorder asc,gr_itemkey asc`,
        'The Site Check checklist items could not be loaded.',
        mapTemplateItem,
        options,
    )
}

export function fetchSiteCheckChecklistSnapshotItems(
    accessToken: string,
    siteCheckId: string,
    options: Options = {},
) {
    const id = guid(siteCheckId, 'Site Check ID').toLowerCase()
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const select = [
        'gr_sitecheckchecklistsnapshotitemid', 'gr_name', '_gr_sitecheck_value', '_gr_job_value',
        '_gr_sourcetemplateitem_value', 'gr_itemkey', 'gr_groupname', 'gr_prompt',
        'gr_responsetype', 'gr_displayorder', 'gr_required',
        'gr_commentrequiredonnegative', 'gr_photorequiredonnegative',
    ].join(',')
    return readAll(
        accessToken,
        `${apiUrl}/gr_sitecheckchecklistsnapshotitems?$select=${select}`
        + `&$filter=_gr_sitecheck_value eq ${id}&$orderby=gr_displayorder asc,gr_itemkey asc`,
        'The Site Check checklist snapshot could not be loaded.',
        mapSnapshotItem,
        options,
    )
}

export function fetchSiteCheckChecklistResponses(
    accessToken: string,
    jobIds: readonly string[],
    options: Options = {},
) {
    const ids = [...new Set(jobIds.map((id) => guid(id, 'Job ID').toLowerCase()))]
    if (!ids.length) return Promise.resolve([])
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const select = [
        'gr_sitecheckchecklistresponseid', 'gr_name', '_gr_job_value',
        '_gr_snapshotitem_value', '_gr_technician_value', 'gr_choiceanswer',
        'gr_numericanswer', 'gr_textanswer', 'gr_comment', 'gr_submittedon',
    ].join(',')
    const filter = ids.map((id) => `_gr_job_value eq ${id}`).join(' or ')
    return readAll(
        accessToken,
        `${apiUrl}/gr_sitecheckchecklistresponses?$select=${select}`
        + `&$filter=${filter}&$orderby=gr_submittedon asc`,
        'The Site Check checklist responses could not be loaded.',
        mapResponse,
        options,
    )
}
