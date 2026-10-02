import { useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication'
import { fetchQuoteLines, fetchQuotesForJob } from '../services/quotesApi'
import type { Quote, QuoteLine } from '../types/quote.types'

/** Mount only while the read-only drawer is open; remount on Job/account changes. */
export function useJobQuotes(jobId: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [result, setResult] = useState<{ items?: Quote[]; error?: string }>()
    const [revision, setRevision] = useState(0)
    const [lineResults, setLineResults] = useState<Record<string, { data?: QuoteLine[]; error?: string }>>({})
    const alive = useRef(false)
    const pending = useRef(new Set<string>())
    useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
    useEffect(() => {
        let current = true
        void acquireDataverseAccessToken(instance, account).then((token) => fetchQuotesForJob(token, jobId))
            .then((items) => { if (current) setResult({ items }) })
            .catch(() => { if (current) setResult({ error: 'Associated quotes could not be loaded. Please retry.' }) })
        return () => { current = false }
    }, [instance, account, jobId, revision])
    const loadLines = async (quoteId: string) => {
        if (!result?.items?.some((quote) => quote.gr_quoteid === quoteId) || pending.current.has(quoteId) || lineResults[quoteId]?.data) return
        pending.current.add(quoteId)
        setLineResults((current) => ({ ...current, [quoteId]: {} }))
        try {
            const data = await fetchQuoteLines(await acquireDataverseAccessToken(instance, account), quoteId)
            if (alive.current) setLineResults((current) => ({ ...current, [quoteId]: { data } }))
        } catch { if (alive.current) setLineResults((current) => ({ ...current, [quoteId]: { error: 'Quote lines could not be loaded.' } })) }
        finally { pending.current.delete(quoteId) }
    }
    return { result, lineResults, loadLines, retry: () => { setResult(undefined); setRevision((value) => value + 1) } }
}
