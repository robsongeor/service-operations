import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobCardPhoto, fetchJobCardPhotoBlob, fetchJobCardReview, fetchPendingJobCardReviews, markJobCardReviewed, retryJobCardNotification } from './jobCardReviewApi'
import type { JobCardReview, JobCardReviewSummary } from './jobCardReview.types'
import { downloadJobCardReviewPdf } from './jobCardReviewPdf'
import { fetchJobCardContact, type JobCardContact } from './jobCardOfficeContextApi'
import { buildJobCardPhotoArchive, saveJobCardPhotos } from './jobCardPhotoDownload'
import { JOB_CARD_READ_ONLY, JOB_CARD_READ_ONLY_MESSAGE } from './jobCardReviewMode'

export function useJobCardReviews(reviewId?: string) {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<JobCardReviewSummary[]>([])
    const [truncated, setTruncated] = useState(false)
    const [review, setReview] = useState<JobCardReview | null>(null)
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(true)
    const [revision, setRevision] = useState(0)
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
                if (current) setReview(value)
            } else {
                const value = await fetchPendingJobCardReviews(token)
                if (current) { setItems(value.items); setTruncated(value.truncated === true) }
            }
            if (current) setError('')
        }).catch((reason: unknown) => {
            if (current) setError(reason instanceof Error ? reason.message : 'The reviews could not be loaded.')
        }).finally(() => { if (current) setBusy(false) })
        return () => { current = false }
    }, [accessToken, reviewId, revision])

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
    const markReviewed = async () => {
        if (JOB_CARD_READ_ONLY) { setError(JOB_CARD_READ_ONLY_MESSAGE); return }
        if (!reviewId || !review) return
        setBusy(true)
        setError('')
        try { setReview(await markJobCardReviewed(await accessToken(), reviewId, review.etag)) }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'The review could not be completed.') }
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
    return { items, truncated, review, photoUrls, photoLoading, error, busy, refresh, markReviewed, loadPhoto, retryNotification, pdfBusy, downloadPdf, contact, photoSaving, photoProgress, photoFeedback, downloadPhotos, readOnly: JOB_CARD_READ_ONLY }
}
