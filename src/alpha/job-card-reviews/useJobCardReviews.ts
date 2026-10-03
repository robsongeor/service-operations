import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobCardPhoto, fetchJobCardPhotoBlob, fetchJobCardReview, fetchJobCardReviews, JobCardReviewApiError, retryJobCardNotification, updateJobCardOfficeReview } from './jobCardReviewApi'
import type { JobCardOfficeAction, JobCardReview, JobCardReviewQueueView, JobCardQueueItem } from './jobCardReview.types'
import { queueItemId } from './jobCardReviewQueueModel'
import { downloadJobCardReviewPdf } from './jobCardReviewPdf'
import { fetchJobCardContact, type JobCardContact } from './jobCardOfficeContextApi'
import { buildJobCardPhotoArchive, saveJobCardPhotos } from './jobCardPhotoDownload'
import { JOB_CARD_READ_ONLY, JOB_CARD_READ_ONLY_MESSAGE } from './jobCardReviewMode'

export function useJobCardReviews(reviewId?: string, queueView: JobCardReviewQueueView = 'submitted') {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<JobCardQueueItem[]>([])
    const [truncated, setTruncated] = useState(false)
    const [nextOffset, setNextOffset] = useState<number>()
    const [review, setReview] = useState<JobCardReview | null>(null)
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(true)
    const [revision, setRevision] = useState(0)
    const [conflict, setConflict] = useState(false)
    const [pdfBusy, setPdfBusy] = useState(false)
    const [contact, setContact] = useState<{ data?: JobCardContact | null; error?: string }>()
    const [photoSaving, setPhotoSaving] = useState(false)
    const [photoProgress, setPhotoProgress] = useState(0)
    const [photoFeedback, setPhotoFeedback] = useState('')
    const [photoLoading, setPhotoLoading] = useState<Record<string, boolean>>({})
    const photoPending = useRef(new Set<string>())
    const photoDownload = useRef<AbortController | null>(null)
    const mounted = useRef(false)
    const urls = useRef<string[]>([])
    const accessToken = useCallback(() => acquireDataverseAccessToken(instance, account), [account, instance])

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false; photoDownload.current?.abort(); urls.current.forEach(URL.revokeObjectURL); urls.current = [] }
    }, [])

    useEffect(() => {
        let current = true
        void accessToken().then(async (token) => {
            if (reviewId) {
                const value = await fetchJobCardReview(token, reviewId)
                if (current) { setReview(value); setConflict(false) }
            } else {
                const value = await fetchJobCardReviews(token, queueView)
                if (current) { setItems(value.items); setTruncated(Boolean(value.truncated || value.hasMore)); setNextOffset(value.nextOffset) }
            }
            if (current) setError('')
        }).catch((reason: unknown) => {
            if (current) setError(reason instanceof Error ? reason.message : 'The reviews could not be loaded.')
        }).finally(() => { if (current) setBusy(false) })
        return () => { current = false }
    }, [accessToken, queueView, reviewId, revision])

    const jobId = review?.sourceJobId
    useEffect(() => {
        if (!jobId) return
        let current = true
        void accessToken().then((token) => fetchJobCardContact(token, jobId))
            .then((data) => { if (current) setContact({ data }) })
            .catch(() => { if (current) setContact({ error: 'Current contact unavailable.' }) })
        return () => { current = false }
    }, [accessToken, jobId, revision])

    const refresh = () => { setBusy(true); setError(''); setRevision((value) => value + 1) }
    const transition = async (action: JobCardOfficeAction, values: { note?: string; greentreeReference?: string } = {}) => {
        if (JOB_CARD_READ_ONLY) { setError(JOB_CARD_READ_ONLY_MESSAGE); return }
        if (!reviewId || !review) return
        if (conflict) throw new Error('Refresh the review and check the latest change before retrying.')
        setBusy(true)
        setError('')
        setConflict(false)
        try { setReview(await updateJobCardOfficeReview(await accessToken(), reviewId, { action, etag: review.etag, ...values })) }
        catch (reason) {
            setConflict(reason instanceof JobCardReviewApiError && reason.status === 409)
            setError(reason instanceof Error ? reason.message : 'The review could not be updated.')
            throw reason
        }
        finally { setBusy(false) }
    }
    const loadMore = async () => {
        if (reviewId || nextOffset == null || busy) return
        setBusy(true); setError('')
        try {
            const value = await fetchJobCardReviews(await accessToken(), queueView, nextOffset)
            if (!mounted.current) return
            setItems((current) => [...current, ...value.items.filter((item) => !current.some((existing) => queueItemId(existing) === queueItemId(item)))])
            setTruncated(Boolean(value.truncated || value.hasMore)); setNextOffset(value.nextOffset)
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'More reviews could not be loaded.') }
        finally { setBusy(false) }
    }
    const loadPhoto = async (photoId: string) => {
        if (!reviewId || photoUrls[photoId] || photoPending.current.has(photoId)) return
        photoPending.current.add(photoId)
        setPhotoLoading((current) => ({ ...current, [photoId]: true }))
        try {
            const url = await fetchJobCardPhoto(await accessToken(), reviewId, photoId)
            if (!mounted.current) { URL.revokeObjectURL(url); return }
            urls.current.push(url)
            setPhotoUrls((current) => ({ ...current, [photoId]: url }))
        } catch { if (mounted.current) setError('The photo could not be loaded. Please try again.') }
        finally { photoPending.current.delete(photoId); if (mounted.current) setPhotoLoading((current) => ({ ...current, [photoId]: false })) }
    }
    const retryNotification = async () => {
        if (JOB_CARD_READ_ONLY) { setError(JOB_CARD_READ_ONLY_MESSAGE); return }
        if (!reviewId) return
        setBusy(true)
        try { setReview(await retryJobCardNotification(await accessToken(), reviewId)) }
        catch { setError('The notification could not be retried. The evidence is still saved.') }
        finally { setBusy(false) }
    }
    const downloadPdf = async () => {
        if (!review || pdfBusy) return
        setPdfBusy(true)
        try { await downloadJobCardReviewPdf(review) }
        catch { if (mounted.current) setError('The saved submission PDF could not be created. Please try again.') }
        finally { if (mounted.current) setPdfBusy(false) }
    }
    const downloadPhotos = async (filename: string) => {
        if (!review || photoDownload.current) return false
        const controller = new AbortController()
        photoDownload.current = controller
        setPhotoSaving(true); setPhotoProgress(0); setPhotoFeedback('')
        try {
            const message = await saveJobCardPhotos(filename, async () => {
                const token = await accessToken()
                return buildJobCardPhotoArchive(review.photos,
                    (id) => fetchJobCardPhotoBlob(token, review.reviewId, id, controller.signal),
                    (count) => { if (mounted.current) setPhotoProgress(count) }, controller.signal)
            }, controller.signal)
            if (mounted.current) setPhotoFeedback(message)
            return true
        } catch (reason) {
            if (mounted.current) setPhotoFeedback(reason instanceof Error && reason.name === 'AbortError' ? 'Save cancelled.' : 'Photos could not be saved. Please retry; no complete archive was saved.')
            return false
        } finally { photoDownload.current = null; if (mounted.current) setPhotoSaving(false) }
    }
    return { items, truncated, canLoadMore: nextOffset != null, review, photoUrls, photoLoading, error, busy, conflict, refresh, transition, loadMore, loadPhoto, retryNotification, pdfBusy, downloadPdf, contact, photoSaving, photoProgress, photoFeedback, downloadPhotos, readOnly: JOB_CARD_READ_ONLY }
}
