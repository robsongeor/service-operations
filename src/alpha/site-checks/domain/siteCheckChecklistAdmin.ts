import {
    SITE_CHECK_CHECKLIST_RESPONSE_TYPES,
    type SiteCheckChecklistResponseType,
    type SiteCheckChecklistTemplateItem,
} from '../types/siteCheckChecklist.types.ts'

export type ChecklistDraftItem = {
    clientId: string
    itemKey: string
    groupName: string
    prompt: string
    responseType: SiteCheckChecklistResponseType
    required: boolean
    commentRequiredOnNegative: boolean
    photoRequiredOnNegative: boolean
}

const supportedResponseTypes = new Set<number>(Object.values(SITE_CHECK_CHECKLIST_RESPONSE_TYPES))

export function checklistDraftItems(items: readonly SiteCheckChecklistTemplateItem[]): ChecklistDraftItem[] {
    return [...items]
        .sort((left, right) => left.gr_displayorder - right.gr_displayorder)
        .map((item) => ({
            clientId: item.gr_sitecheckchecklisttemplateitemid,
            itemKey: item.gr_itemkey,
            groupName: item.gr_groupname,
            prompt: item.gr_prompt,
            responseType: item.gr_responsetype,
            required: item.gr_required,
            commentRequiredOnNegative: item.gr_commentrequiredonnegative,
            photoRequiredOnNegative: item.gr_photorequiredonnegative,
        }))
}

export function newChecklistDraftItem(): ChecklistDraftItem {
    return {
        clientId: crypto.randomUUID(),
        itemKey: `new.${crypto.randomUUID().slice(0, 8)}`,
        groupName: 'General',
        prompt: '',
        responseType: SITE_CHECK_CHECKLIST_RESPONSE_TYPES.PASS_FAIL_NOT_APPLICABLE,
        required: true,
        commentRequiredOnNegative: true,
        photoRequiredOnNegative: false,
    }
}

export function validateChecklistDraft(items: readonly ChecklistDraftItem[]) {
    const errors: string[] = []
    if (!items.length) errors.push('Add at least one checklist question.')
    const keys = new Set<string>()
    items.forEach((item, index) => {
        const label = `Question ${index + 1}`
        const key = item.itemKey.trim().toLowerCase()
        if (!key || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(key)) {
            errors.push(`${label} needs a stable key using letters, numbers, dots, hyphens, or underscores.`)
        } else if (keys.has(key)) errors.push(`${label} has a duplicate item key.`)
        keys.add(key)
        if (!item.groupName.trim()) errors.push(`${label} needs a section.`)
        if (!item.prompt.trim()) errors.push(`${label} needs question text.`)
        if (!supportedResponseTypes.has(item.responseType)) errors.push(`${label} has an unsupported answer type.`)
        if (item.commentRequiredOnNegative
            && item.responseType !== SITE_CHECK_CHECKLIST_RESPONSE_TYPES.PASS_FAIL_NOT_APPLICABLE
            && item.responseType !== SITE_CHECK_CHECKLIST_RESPONSE_TYPES.YES_NO) {
            errors.push(`${label} cannot require a failure comment for this answer type.`)
        }
    })
    return errors
}
