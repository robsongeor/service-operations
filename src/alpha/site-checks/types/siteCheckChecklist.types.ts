export const SITE_CHECK_CHECKLIST_RESPONSE_TYPES = {
    PASS_FAIL_NOT_APPLICABLE: 122830000,
    YES_NO: 122830001,
    NUMBER: 122830002,
    TEXT: 122830003,
} as const

export type SiteCheckChecklistResponseType =
    typeof SITE_CHECK_CHECKLIST_RESPONSE_TYPES[
        keyof typeof SITE_CHECK_CHECKLIST_RESPONSE_TYPES
    ]

export const SITE_CHECK_CHECKLIST_CHOICE_ANSWERS = {
    PASS: 122830000,
    FAIL: 122830001,
    NOT_APPLICABLE: 122830002,
    YES: 122830003,
    NO: 122830004,
} as const

export type SiteCheckChecklistChoiceAnswer =
    typeof SITE_CHECK_CHECKLIST_CHOICE_ANSWERS[
        keyof typeof SITE_CHECK_CHECKLIST_CHOICE_ANSWERS
    ]

export type SiteCheckChecklistTemplate = {
    gr_sitecheckchecklisttemplateid: string
    gr_name: string
    gr_templatecode: string
    gr_version: number
    gr_active: boolean
    _gr_supersedestemplate_value?: string | null
    '@odata.etag'?: string
}

export type SiteCheckChecklistRules = {
    gr_required: boolean
    gr_commentrequiredonnegative: boolean
    gr_photorequiredonnegative: boolean
}

export type SiteCheckChecklistTemplateItem = SiteCheckChecklistRules & {
    gr_sitecheckchecklisttemplateitemid: string
    gr_name: string
    _gr_checklisttemplate_value: string
    gr_itemkey: string
    gr_groupname: string
    gr_prompt: string
    gr_responsetype: SiteCheckChecklistResponseType
    gr_displayorder: number
    '@odata.etag'?: string
}

export type SiteCheckChecklistSnapshotItem = SiteCheckChecklistRules & {
    gr_sitecheckchecklistsnapshotitemid: string
    gr_name: string
    _gr_sitecheck_value: string
    _gr_job_value: string
    _gr_sourcetemplateitem_value?: string | null
    gr_itemkey: string
    gr_groupname: string
    gr_prompt: string
    gr_responsetype: SiteCheckChecklistResponseType
    gr_displayorder: number
    '@odata.etag'?: string
}

export type SiteCheckChecklistResponse = {
    gr_sitecheckchecklistresponseid: string
    gr_name: string
    _gr_job_value: string
    _gr_snapshotitem_value: string
    _gr_technician_value: string
    gr_choiceanswer?: SiteCheckChecklistChoiceAnswer | null
    gr_numericanswer?: number | null
    gr_textanswer?: string | null
    gr_comment?: string | null
    gr_submittedon: string
    '@odata.etag'?: string
}

export type SiteCheckChecklistTemplateValidation = {
    valid: boolean
    errors: string[]
}

export type SiteCheckChecklistSnapshotCreate = {
    gr_name: string
    gr_itemkey: string
    gr_groupname: string
    gr_prompt: string
    gr_responsetype: SiteCheckChecklistResponseType
    gr_displayorder: number
    gr_required: boolean
    gr_commentrequiredonnegative: boolean
    gr_photorequiredonnegative: boolean
    'gr_SiteCheck@odata.bind': string
    'gr_Job@odata.bind': string
    'gr_SourceTemplateItem@odata.bind': string
}

export type SiteCheckChecklistTemplateKind = 'ICE' | 'ELECTRIC'

export type SiteCheckChecklistTemplateResolution = {
    templateCode: 'SITE_CHECK_ICE' | 'SITE_CHECK_ELECTRIC'
    kind: SiteCheckChecklistTemplateKind
    defaulted: boolean
    label: 'ICE checklist' | 'ICE checklist (defaulted)' | 'Electric checklist'
}
