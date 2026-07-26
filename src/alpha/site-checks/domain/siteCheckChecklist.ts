import {
    SITE_CHECK_CHECKLIST_RESPONSE_TYPES,
    type SiteCheckChecklistSnapshotCreate,
    type SiteCheckChecklistTemplate,
    type SiteCheckChecklistTemplateItem,
    type SiteCheckChecklistTemplateValidation,
    type SiteCheckChecklistTemplateResolution,
} from '../types/siteCheckChecklist.types.ts'
import {
    POWER_TYPES,
    type PowerType,
} from '../../equipment/servicePlans/maintenanceConfiguration.ts'

const RESPONSE_TYPES = new Set<number>(Object.values(SITE_CHECK_CHECKLIST_RESPONSE_TYPES))
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRANSACTION_REFERENCE_PATTERN = /^\$\d+$/

function bindReference(reference: string, entitySet: string, field: string) {
    if (TRANSACTION_REFERENCE_PATTERN.test(reference)) return reference
    if (!GUID_PATTERN.test(reference)) {
        throw new Error(`A valid ${field} reference is required for checklist snapshots.`)
    }
    return `/${entitySet}(${reference.toLowerCase()})`
}

export function resolveSiteCheckChecklistTemplate(
    powerType: PowerType | null | undefined,
): SiteCheckChecklistTemplateResolution {
    if (powerType === POWER_TYPES.ELECTRIC) {
        return {
            templateCode: 'SITE_CHECK_ELECTRIC',
            kind: 'ELECTRIC',
            defaulted: false,
            label: 'Electric checklist',
        }
    }
    const defaulted = powerType == null || powerType === POWER_TYPES.OTHER_UNKNOWN
    return {
        templateCode: 'SITE_CHECK_ICE',
        kind: 'ICE',
        defaulted,
        label: defaulted ? 'ICE checklist (defaulted)' : 'ICE checklist',
    }
}

export function validateSiteCheckChecklistTemplate(
    template: SiteCheckChecklistTemplate,
    items: readonly SiteCheckChecklistTemplateItem[],
): SiteCheckChecklistTemplateValidation {
    const errors: string[] = []
    if (!template.gr_active) errors.push('The selected checklist template is inactive.')
    if (!template.gr_templatecode.trim()) errors.push('The checklist template code is required.')
    if (!Number.isInteger(template.gr_version) || template.gr_version < 1) {
        errors.push('The checklist template version must be a positive whole number.')
    }
    if (!items.length) errors.push('The checklist template has no items.')

    const itemKeys = new Set<string>()
    const displayOrders = new Set<number>()
    items.forEach((item, index) => {
        if (item._gr_checklisttemplate_value.toLowerCase()
            !== template.gr_sitecheckchecklisttemplateid.toLowerCase()) {
            errors.push(`Checklist item ${index + 1} belongs to a different template.`)
        }
        const itemKey = item.gr_itemkey.trim().toLowerCase()
        if (!itemKey) errors.push(`Checklist item ${index + 1} has no item key.`)
        else if (itemKeys.has(itemKey)) errors.push(`Checklist item key "${item.gr_itemkey}" is duplicated.`)
        itemKeys.add(itemKey)
        if (!item.gr_groupname.trim()) errors.push(`Checklist item "${item.gr_itemkey}" has no group.`)
        if (!item.gr_prompt.trim()) errors.push(`Checklist item "${item.gr_itemkey}" has no prompt.`)
        if (!RESPONSE_TYPES.has(item.gr_responsetype)) {
            errors.push(`Checklist item "${item.gr_itemkey}" has an unsupported response type.`)
        }
        if (!Number.isInteger(item.gr_displayorder) || item.gr_displayorder < 0) {
            errors.push(`Checklist item "${item.gr_itemkey}" has an invalid display order.`)
        } else if (displayOrders.has(item.gr_displayorder)) {
            errors.push(`Checklist display order ${item.gr_displayorder} is duplicated.`)
        }
        displayOrders.add(item.gr_displayorder)
    })
    return { valid: errors.length === 0, errors }
}

export function buildSiteCheckChecklistSnapshotCreates(
    siteCheckReference: string,
    jobReference: string,
    template: SiteCheckChecklistTemplate,
    items: readonly SiteCheckChecklistTemplateItem[],
): SiteCheckChecklistSnapshotCreate[] {
    const validation = validateSiteCheckChecklistTemplate(template, items)
    if (!validation.valid) throw new Error(validation.errors.join(' '))
    const siteCheckBind = bindReference(siteCheckReference, 'gr_sitechecks', 'Site Check')
    const jobBind = bindReference(jobReference, 'gr_jobs', 'Job')
    return [...items]
        .sort((left, right) =>
            left.gr_displayorder - right.gr_displayorder
            || left.gr_itemkey.localeCompare(right.gr_itemkey))
        .map((item) => ({
            gr_name: `${template.gr_templatecode} v${template.gr_version} — ${item.gr_itemkey}`,
            gr_itemkey: item.gr_itemkey.trim(),
            gr_groupname: item.gr_groupname.trim(),
            gr_prompt: item.gr_prompt.trim(),
            gr_responsetype: item.gr_responsetype,
            gr_displayorder: item.gr_displayorder,
            gr_required: item.gr_required,
            gr_commentrequiredonnegative: item.gr_commentrequiredonnegative,
            gr_photorequiredonnegative: item.gr_photorequiredonnegative,
            'gr_SiteCheck@odata.bind': siteCheckBind,
            'gr_Job@odata.bind': jobBind,
            'gr_SourceTemplateItem@odata.bind':
                `/gr_sitecheckchecklisttemplateitems(${item.gr_sitecheckchecklisttemplateitemid.toLowerCase()})`,
        }))
}
