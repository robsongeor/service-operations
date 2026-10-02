import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { fetchHistoricalJobCardEvidence, type HistoricalJobCardEvidence } from '../services/jobsApi'

export function useHistoricalJobCards(jobId?: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const scope = `${account?.homeAccountId || ''}:${jobId || ''}`
    const [openedScope, setOpenedScope] = useState('')
    const [revision, setRevision] = useState(0)
    const [result, setResult] = useState<{ key: string; data?: HistoricalJobCardEvidence; error?: string }>()
    const open = Boolean(jobId) && openedScope === scope
    const key = `${scope}:${revision}`
    const toggle = () => setOpenedScope(open ? '' : scope)
    const retry = useCallback(() => setRevision((value) => value + 1), [])
    const visible = result?.key === key ? result : undefined
    useEffect(() => {
        if (!open || !jobId || visible) return
        let current = true
        void acquireDataverseAccessToken(instance, account)
            .then((token) => fetchHistoricalJobCardEvidence(token, jobId))
            .then((data) => { if (current) setResult({ key, data }) })
            .catch(() => { if (current) setResult({ key, error: 'Historical submissions could not be loaded completely. Please retry.' }) })
        return () => { current = false }
    }, [instance, account, jobId, open, key, visible])
    return { open, toggle, retry, data: visible?.data, error: visible?.error, busy: open && !visible }
}
