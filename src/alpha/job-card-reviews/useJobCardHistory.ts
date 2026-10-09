import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobCardHistory, withdrawJobCard } from './jobCardReviewApi'
import type { JobCardHistory } from './jobCardReview.types'

export function useJobCardHistory(jobId?: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [revision, setRevision] = useState(0)
    const [result, setResult] = useState<{ key: string; data?: JobCardHistory; error?: string }>()
    const [withdrawingId, setWithdrawingId] = useState('')
    const key = `${account?.homeAccountId || ''}:${jobId || ''}:${revision}`
    const refresh = useCallback(() => setRevision((value) => value + 1), [])

    useEffect(() => {
        if (!jobId) return
        let current = true
        void acquireDataverseAccessToken(instance, account)
            .then((token) => fetchJobCardHistory(token, jobId))
            .then((data) => { if (current) setResult({ key, data }) })
            .catch((reason: unknown) => {
                if (current) setResult({ key, error: reason instanceof Error ? reason.message : 'Job Card history could not be loaded.' })
            })
        return () => { current = false }
    }, [instance, account, jobId, key])

    const visible = result?.key === key ? result : undefined
    const withdraw = useCallback(async (reviewId: string, etag: string, reason: string) => {
        setWithdrawingId(reviewId)
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            const result = await withdrawJobCard(token, reviewId, etag, reason)
            refresh()
            if (result.operationalStatusWarning) throw new Error(result.operationalStatusWarning)
        } finally { setWithdrawingId('') }
    }, [instance, account, refresh])
    return { data: visible?.data, error: visible?.error, busy: Boolean(jobId) && !visible, refresh, withdraw, withdrawingId }
}
