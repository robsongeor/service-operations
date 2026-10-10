import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { fetchJobCardPhoto, fetchJobCardPhotoBlob, fetchJobCardReview, fetchJobCardReviews, JobCardReviewApiError, retryJobCardNotification, updateJobCardOfficeReview } from './jobCardReviewApi'
import type { JobCardOfficeAction, JobCardReview, JobCardReviewQueueView, JobCardQueueItem, JobCardMeterApprovalInput } from './jobCardReview.types'
import { queueItemId } from './jobCardReviewQueueModel'
import { createJobCardReviewPdf, downloadJobCardReviewPdf, jobCardPdfFilename } from './jobCardReviewPdf'
import { fetchJobCardContact, type JobCardContact } from './jobCardOfficeContextApi'
import { buildJobCardArchive, saveJobCardArchive } from './jobCardPhotoDownload'
import { JOB_CARD_READ_ONLY, JOB_CARD_READ_ONLY_MESSAGE } from './jobCardReviewMode'
import { fetchJobCardExpectedReturns, type TechnicianReturn } from './jobCardReviewApi'

export function useJobCardReviews(reviewId?: string, queueView: JobCardReviewQueueView = 'submitted', jobNumber = '') {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [items, setItems] = useState<JobCardQueueItem[]>([])
    const [truncated, setTruncated] = useState(false)
    const [nextOffset, setNextOffset] = useState<number>()
    const [nextCursor, setNextCursor] = useState<string>()
    const [technicianReturns, setTechnicianReturns] = useState<TechnicianReturn[]>()
    const [returnsError, setReturnsError] = useState('')
    const [returnsBusy, setReturnsBusy] = useState(false)
    const generation = useRef(0)
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
        generation.current += 1
        void accessToken().then(async (token) => {
            if (reviewId) {
                const value = await fetchJobCardReview(token, reviewId)
                if (current) { setReview(value); setConflict(false) }
            } else {
                const value = await fetchJobCardReviews(token, queueView, 0, 100, undefined, jobNumber)
                if (current) { setItems(value.items); setTruncated(Boolean(value.truncated || value.hasMore)); setNextOffset(value.nextOffset); setNextCursor(value.nextCursor) }
            }
            if (current) setError('')
        }).catch((reason: unknown) => {
            if (current) setError(reason instanceof Error ? reason.message : 'The reviews could not be loaded.')
        }).finally(() => { if (current) setBusy(false) })
        return () => { current = false }
    }, [accessToken, queueView, reviewId, revision, jobNumber])

    useEffect(() => {
        if (reviewId) return // Never replace a reviewer’s open form or draft notes on focus.
        const update = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1) }
        window.addEventListener('focus', update)
        return () => window.removeEventListener('focus', update)
    }, [reviewId])

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
    const transition = async (action: JobCardOfficeAction | 'retryMeterSync', values: { note?: string; greentreeReference?: string; meterApproval?: JobCardMeterApprovalInput } = {}) => {
        if (JOB_CARD_READ_ONLY) { setError(JOB_CARD_READ_ONLY_MESSAGE); return }
        if (!reviewId || !review) return
        if (['resumeReview', 'recordCorrection'].includes(action) && review.officeRecoveryAvailable !== true) throw new Error('This action requires the updated Job Card backend.')
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
        if (reviewId || (nextOffset == null && !nextCursor) || busy) return
        const currentGeneration = generation.current
        setBusy(true); setError('')
        try {
            const value = await fetchJobCardReviews(await accessToken(), queueView, nextOffset ?? 0, 100, nextCursor, jobNumber)
            if (!mounted.current || generation.current !== currentGeneration) return
            setItems((current) => [...current, ...value.items.filter((item) => !current.some((existing) => queueItemId(existing) === queueItemId(item)))])
            setTruncated(Boolean(value.truncated || value.hasMore)); setNextOffset(value.nextOffset); setNextCursor(value.nextCursor)
        } catch (reason) { if (generation.current === currentGeneration) setError(reason instanceof Error ? reason.message : 'More reviews could not be loaded.') }
        finally { if (generation.current === currentGeneration) setBusy(false) }
    }
    const loadReturns = async () => {
        if (!review?.sourceJobId || review.officeRecoveryAvailable !== true || returnsBusy) return
        setReturnsBusy(true); setReturnsError('')
        try { const result = await fetchJobCardExpectedReturns(await accessToken(), review.sourceJobId); if (mounted.current) setTechnicianReturns(result.items) }
        catch (reason) { if (mounted.current) setReturnsError(reason instanceof Error ? reason.message : 'Technician returns could not be checked.') }
        finally { if (mounted.current) setReturnsBusy(false) }
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
    const downloadPhotos = async (filename: string, includeJobCard = false) => {
        if (!review || photoDownload.current) return false
        const controller = new AbortController()
        photoDownload.current = controller
        setPhotoSaving(true); setPhotoProgress(0); setPhotoFeedback('')
        try {
            const message = await saveJobCardArchive(filename, async () => {
                const jobCard = includeJobCard ? { filename: jobCardPdfFilename(review), blob: await createJobCardReviewPdf(review, controller.signal) } : undefined
                const token = review.photos.length ? await accessToken() : ''
                return buildJobCardArchive(review.photos,
                    (id) => fetchJobCardPhotoBlob(token, review.reviewId, id, controller.signal),
                    (count) => { if (mounted.current) setPhotoProgress(count) }, controller.signal, jobCard)
            }, controller.signal, includeJobCard)
            if (mounted.current) setPhotoFeedback(message)
            return true
        } catch (reason) {
            if (mounted.current) setPhotoFeedback(reason instanceof Error && reason.name === 'AbortError' ? 'Save cancelled.' : `${includeJobCard ? 'Documentation' : 'Photos'} could not be saved. Please retry; no complete archive was saved.`)
            return false
        } finally { photoDownload.current = null; if (mounted.current) setPhotoSaving(false) }
    }
    return { items, truncated, canLoadMore: nextOffset != null || Boolean(nextCursor), review, photoUrls, photoLoading, error, busy, conflict, refresh, transition, loadMore, loadPhoto, loadReturns, technicianReturns, returnsError, returnsBusy, retryNotification, pdfBusy, downloadPdf, contact, photoSaving, photoProgress, photoFeedback, downloadPhotos, readOnly: JOB_CARD_READ_ONLY }
}
