import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount.ts'
import {
    checklistDraftItems,
    type ChecklistDraftItem,
} from '../domain/siteCheckChecklistAdmin.ts'
import {
    fetchActiveSiteCheckChecklistTemplates,
    fetchSiteCheckChecklistTemplateItems,
} from '../services/siteCheckChecklistApi.ts'
import { publishChecklistVersion } from '../services/siteCheckChecklistAdminApi.ts'
import type {
    SiteCheckChecklistTemplate,
    SiteCheckChecklistTemplateItem,
} from '../types/siteCheckChecklist.types.ts'

const CODES = ['SITE_CHECK_ICE', 'SITE_CHECK_ELECTRIC'] as const

export type ChecklistAdminDefinition = {
    template: SiteCheckChecklistTemplate
    sourceItems: SiteCheckChecklistTemplateItem[]
    draftItems: ChecklistDraftItem[]
}

export function useChecklistAdmin() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [definitions, setDefinitions] = useState<ChecklistAdminDefinition[]>([])
    const [loading, setLoading] = useState(true)
    const [publishingCode, setPublishingCode] = useState('')
    const [error, setError] = useState('')

    const token = useCallback(async () => {
        if (!account) throw new Error('No active Microsoft account is available.')
        return (await instance.acquireTokenSilent({
            account,
            scopes: [`${import.meta.env.VITE_DATAVERSE_URL}/user_impersonation`],
        })).accessToken
    }, [account, instance])

    const refresh = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const accessToken = await token()
            const templates = await fetchActiveSiteCheckChecklistTemplates(accessToken, CODES)
            const itemSets = await Promise.all(templates.map((template) =>
                fetchSiteCheckChecklistTemplateItems(
                    accessToken,
                    template.gr_sitecheckchecklisttemplateid,
                )))
            setDefinitions(templates.map((template, index) => ({
                template,
                sourceItems: itemSets[index],
                draftItems: checklistDraftItems(itemSets[index]),
            })))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Checklist definitions could not be loaded.')
        } finally {
            setLoading(false)
        }
    }, [token])

    useEffect(() => {
        void Promise.resolve().then(refresh)
    }, [refresh])

    const updateDraft = (code: string, draftItems: ChecklistDraftItem[]) => {
        setDefinitions((current) => current.map((definition) =>
            definition.template.gr_templatecode === code
                ? { ...definition, draftItems }
                : definition))
    }

    const publish = async (definition: ChecklistAdminDefinition) => {
        setPublishingCode(definition.template.gr_templatecode)
        setError('')
        try {
            const accessToken = await token()
            await publishChecklistVersion(accessToken, definition.template, definition.draftItems)
            await refresh()
            return true
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The checklist version could not be published.')
            return false
        } finally {
            setPublishingCode('')
        }
    }

    return { definitions, loading, error, publishingCode, refresh, updateDraft, publish }
}
