import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobCardPhoto, fetchJobCardReview, fetchPendingJobCardReviews, markJobCardReviewed, retryJobCardNotification } from './jobCardReviewApi'
import type { JobCardReview, JobCardReviewSummary } from './jobCardReview.types'

export function useJobCardReviews(reviewId?: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<JobCardReviewSummary[]>([])
    const [review, setReview] = useState<JobCardReview | null>(null)
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(true)
    const [revision, setRevision] = useState(0)
    const mounted = useRef(false)
    const urls = useRef<string[]>([])
    const accessToken = useCallback(() => acquireDataverseAccessToken(instance, account), [account, instance])

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false; urls.current.forEach(URL.revokeObjectURL); urls.current = [] }
    }, [])

    useEffect(() => {
        let current = true
        void accessToken().then(async (token) => {
            if (reviewId) {
                const value = await fetchJobCardReview(token, reviewId)
                if (current) setReview(value)
            } else {
                const value = await fetchPendingJobCardReviews(token)
                if (current) setItems(value)
            }
            if (current) setError('')
        }).catch((reason: unknown) => {
            if (current) setError(reason instanceof Error ? reason.message : 'The reviews could not be loaded.')
        }).finally(() => { if (current) setBusy(false) })
        return () => { current = false }
    }, [accessToken, reviewId, revision])

    const refresh = () => { setBusy(true); setError(''); setRevision((value) => value + 1) }
    const markReviewed = async () => {
        if (!reviewId || !review) return
        setBusy(true)
        setError('')
        try { setReview(await markJobCardReviewed(await accessToken(), reviewId, review.etag)) }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'The review could not be completed.') }
        finally { setBusy(false) }
    }
    const loadPhoto = async (photoId: string) => {
        if (!reviewId || photoUrls[photoId]) return
        try {
            const url = await fetchJobCardPhoto(await accessToken(), reviewId, photoId)
            if (!mounted.current) { URL.revokeObjectURL(url); return }
            urls.current.push(url)
            setPhotoUrls((current) => ({ ...current, [photoId]: url }))
        } catch { if (mounted.current) setError('The photo could not be loaded. Please try again.') }
    }
    const retryNotification = async () => {
        if (!reviewId) return
        setBusy(true)
        try { setReview(await retryJobCardNotification(await accessToken(), reviewId)) }
        catch { setError('The notification could not be retried. The evidence is still saved.') }
        finally { setBusy(false) }
    }
    return { items, review, photoUrls, error, busy, refresh, markReviewed, loadPhoto, retryNotification }
}
