import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount.ts'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication.ts'
import type { CustomerContact } from './customerContact.types.ts'
import { fetchPurchaseOrderRecipients, savePurchaseOrderRecipients } from './purchaseOrderRecipientApi.ts'
import type { PurchaseOrderRecipient, PurchaseOrderRecipientSaveInput } from './purchaseOrderRecipient.types.ts'

export function usePurchaseOrderRecipients(customerId?: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [recipients, setRecipients] = useState<PurchaseOrderRecipient[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    const reload = useCallback(async () => {
        if (!account || !customerId || customerId.startsWith('prototype-')) {
            setRecipients([])
            return
        }
        setIsLoading(true)
        setError('')
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            setRecipients(await fetchPurchaseOrderRecipients(token, customerId))
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'PO recipient settings could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [account, customerId, instance])

    useEffect(() => {
        const pending = window.setTimeout(() => { void reload() }, 0)
        return () => window.clearTimeout(pending)
    }, [reload])

    const save = useCallback(async (input: PurchaseOrderRecipientSaveInput, contacts: CustomerContact[]) => {
        if (!account) throw new Error('Sign in before saving PO recipient settings.')
        setIsSaving(true)
        setError('')
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            await savePurchaseOrderRecipients(token, recipients, input, contacts)
            const refreshed = await fetchPurchaseOrderRecipients(token, input.customerId)
            setRecipients(refreshed)
            return refreshed
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'PO recipient settings could not be saved.'
            setError(message)
            throw cause instanceof Error ? cause : new Error(message)
        } finally {
            setIsSaving(false)
        }
    }, [account, instance, recipients])

    return { recipients, isLoading, isSaving, error, reload, save }
}
