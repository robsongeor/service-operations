import type { ChecklistDraftItem } from '../domain/siteCheckChecklistAdmin.ts'
import { validateChecklistDraft } from '../domain/siteCheckChecklistAdmin.ts'
import type { SiteCheckChecklistTemplate } from '../types/siteCheckChecklist.types.ts'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`

type Options = { apiUrl?: string; fetcher?: typeof fetch; requestId?: string }
type PublicationRequest = {
    method: 'POST' | 'PATCH'
    path: string
    fields: Record<string, unknown>
    etag?: string
}

function nestedFailureStatus(body: string) {
    return [...body.matchAll(/HTTP\/1\.1\s+(\d{3})/g)]
        .map((match) => Number(match[1]))
        .find((status) => status >= 400)
}

export function buildChecklistPublicationChangeSet(
    current: SiteCheckChecklistTemplate,
    items: readonly ChecklistDraftItem[],
    requestId: string = crypto.randomUUID(),
) {
    const errors = validateChecklistDraft(items)
    if (errors.length) throw new Error(errors.join(' '))
    if (!current.gr_active || !current['@odata.etag']) {
        throw new Error('Reload the active checklist before publishing.')
    }
    const nextVersion = current.gr_version + 1
    const batchBoundary = `batch_checklist_${requestId.replaceAll('-', '')}`
    const changeBoundary = `changeset_checklist_${requestId.replaceAll('-', '')}`
    const requests: PublicationRequest[] = [
        {
            method: 'POST' as const,
            path: 'gr_sitecheckchecklisttemplates',
            fields: {
                gr_name: current.gr_name,
                gr_templatecode: current.gr_templatecode,
                gr_version: nextVersion,
                gr_active: true,
                'gr_SupersedesTemplate@odata.bind':
                    `/gr_sitecheckchecklisttemplates(${current.gr_sitecheckchecklisttemplateid})`,
            },
        },
        ...items.map((item, index) => ({
            method: 'POST' as const,
            path: 'gr_sitecheckchecklisttemplateitems',
            fields: {
                gr_name: `${current.gr_templatecode} v${nextVersion} — ${item.itemKey.trim()}`,
                'gr_ChecklistTemplate@odata.bind': '$1',
                gr_itemkey: item.itemKey.trim(),
                gr_groupname: item.groupName.trim(),
                gr_prompt: item.prompt.trim(),
                gr_responsetype: item.responseType,
                gr_displayorder: (index + 1) * 10,
                gr_required: item.required,
                gr_commentrequiredonnegative: item.commentRequiredOnNegative,
                gr_photorequiredonnegative: item.photoRequiredOnNegative,
            },
        })),
        {
            method: 'PATCH' as const,
            path: `gr_sitecheckchecklisttemplates(${current.gr_sitecheckchecklisttemplateid})`,
            fields: { gr_active: false },
            etag: current['@odata.etag'],
        },
    ]
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]
    requests.forEach((request, index) => lines.push(
        `--${changeBoundary}`,
        'Content-Type: application/http',
        'Content-Transfer-Encoding: binary',
        `Content-ID: ${index + 1}`,
        '',
        `${request.method} /api/data/v9.2/${request.path} HTTP/1.1`,
        'Accept: application/json',
        'Content-Type: application/json; type=entry',
        ...(request.etag ? [`If-Match: ${request.etag}`] : []),
        '',
        JSON.stringify(request.fields),
        '',
    ))
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')
    return {
        body: lines.join('\r\n'),
        contentType: `multipart/mixed; boundary=${batchBoundary}`,
        operationCount: requests.length,
        nextVersion,
    }
}

export async function publishChecklistVersion(
    accessToken: string,
    current: SiteCheckChecklistTemplate,
    items: readonly ChecklistDraftItem[],
    options: Options = {},
) {
    const batch = buildChecklistPublicationChangeSet(current, items, options.requestId)
    const response = await (options.fetcher ?? fetch)(`${options.apiUrl ?? DEFAULT_API_URL}/$batch`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': batch.contentType,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: batch.body,
    })
    const body = await response.text()
    const nestedFailure = nestedFailureStatus(body)
    if (!response.ok || nestedFailure) {
        if ([409, 412].includes(nestedFailure ?? response.status)) {
            throw new Error('This checklist changed before publication. Reload and review the latest version.')
        }
        if ([401, 403].includes(nestedFailure ?? response.status)) {
            throw new Error('Your account is not authorised to publish checklist versions.')
        }
        throw new Error('Dataverse rejected the checklist publication transaction.')
    }
    const successes = [...body.matchAll(/HTTP\/1\.1\s+2\d{2}/g)].length
    if (successes !== batch.operationCount) {
        throw new Error('Dataverse did not confirm every checklist publication operation.')
    }
    return batch.nextVersion
}
