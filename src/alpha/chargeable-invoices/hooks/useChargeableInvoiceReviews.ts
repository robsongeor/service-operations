import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount.ts'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication.ts'
import { deriveChargeableInvoicePrimaryQueue, type ChargeableInvoicePrimaryQueue } from '../domain/chargeableInvoiceState.ts'
import {
    downloadChargeableInvoiceDocument,
    createChargeableInvoiceCorrection,
    fetchChargeableInvoiceReviews,
    fetchChargeableInvoiceWorkspace,
    generateChargeableInvoiceApprovalPdf,
    markChargeableInvoiceDoNotProcess,
    markChargeableInvoiceReady,
    permanentlyDeleteChargeableInvoice,
    permanentlyDeleteChargeableInvoiceSupportingPhotos,
    prepareChargeableInvoicePoRequest,
    prepareChargeableInvoicePhotoRequest,
    replaceChargeableInvoiceCorrection,
    supersedeChargeableInvoiceCorrection,
    saveChargeableInvoiceRequirements,
    saveChargeableInvoicePhotoTechnician,
    saveChargeableInvoiceWaiting,
    startChargeableInvoiceReview,
    uploadChargeableInvoiceSupportingPhotos,
} from '../services/chargeableInvoiceReviewApi.ts'
import type {
    ChargeableInvoiceDocument,
    ChargeableInvoicePoRecipientDraft,
    ChargeableInvoiceReview,
    ChargeableInvoiceWaitingOn,
    ChargeableInvoiceWorkspace,
} from '../types/chargeableInvoice.types.ts'
import { CHARGEABLE_INVOICE_APPROVAL_TEMPLATE_VERSION, CHARGEABLE_INVOICE_DOCUMENT_TYPES, CHARGEABLE_INVOICE_UPLOAD_STATUSES } from '../types/chargeableInvoice.types.ts'
import { fetchQuoteLines } from '../../quotes/services/quotesApi.ts'
import type { ChargeableInvoiceRequirementsDraft } from '../domain/chargeableInvoiceState.ts'
import type { ChargeableInvoiceCorrectionDraft } from '../domain/chargeableInvoiceCorrectionDraft.ts'

export function useChargeableInvoiceReviews() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [reviews, setReviews] = useState<ChargeableInvoiceReview[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [workspace, setWorkspace] = useState<ChargeableInvoiceWorkspace | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [workspaceError, setWorkspaceError] = useState('')

    const accessToken = useCallback(() => acquireDataverseAccessToken(instance, account), [account, instance])

    const refresh = useCallback(async () => {
        setIsLoading(true)
        setLoadError('')
        try {
            setReviews(await fetchChargeableInvoiceReviews(await accessToken()))
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : 'Chargeable Invoice Reviews could not be loaded.')
        } finally {
            setIsLoading(false)
        }
    }, [accessToken])

    useEffect(() => {
        const timer = window.setTimeout(() => void refresh(), 0)
        return () => window.clearTimeout(timer)
    }, [refresh])

    const openReview = useCallback(async (reviewId: string) => {
        setSelectedId(reviewId)
        setWorkspace(null)
        setWorkspaceError('')
        setIsLoadingWorkspace(true)
        try {
            setWorkspace(await fetchChargeableInvoiceWorkspace(await accessToken(), reviewId))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The invoice review workspace could not be loaded.')
        } finally {
            setIsLoadingWorkspace(false)
        }
    }, [accessToken])

    const closeReview = useCallback(() => {
        setSelectedId(null)
        setWorkspace(null)
        setWorkspaceError('')
    }, [])

    const applyWorkspace = useCallback((next: ChargeableInvoiceWorkspace) => {
        setWorkspace(next)
        setReviews((current) => current.map((review) => review.gr_chargeableinvoicereviewid === next.review.gr_chargeableinvoicereviewid
            ? next.review
            : review))
    }, [])

    const startReview = useCallback(async () => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await startChargeableInvoiceReview(await accessToken(), workspace.review))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The invoice review could not be started.')
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const saveWaiting = useCallback(async (waitingOn: ChargeableInvoiceWaitingOn | null, note: string) => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await saveChargeableInvoiceWaiting(await accessToken(), workspace.review, waitingOn, note))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The Waiting state could not be saved.')
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const saveRequirements = useCallback(async (draft: ChargeableInvoiceRequirementsDraft) => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await saveChargeableInvoiceRequirements(await accessToken(), workspace.review, draft))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'PO and photo decisions could not be saved.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const markReady = useCallback(async () => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await markChargeableInvoiceReady(await accessToken(), workspace.review))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The review could not be marked Ready to Process.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const markDoNotProcess = useCallback(async (reason: string) => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await markChargeableInvoiceDoNotProcess(await accessToken(), workspace.review, reason))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The review could not be marked Do Not Process.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const deleteReview = useCallback(async () => {
        if (!workspace) throw new Error('The invoice review workspace is unavailable.')
        setIsSaving(true)
        setWorkspaceError('')
        try {
            await permanentlyDeleteChargeableInvoice(await accessToken(), workspace)
            const deletedId = workspace.review.gr_chargeableinvoicereviewid
            setReviews((current) => current.filter((review) => review.gr_chargeableinvoicereviewid !== deletedId))
            setSelectedId(null)
            setWorkspace(null)
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The invoice package could not be permanently deleted.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, workspace])

    const addCorrection = useCallback(async (draft: ChargeableInvoiceCorrectionDraft) => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await createChargeableInvoiceCorrection(await accessToken(), workspace, draft))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The invoice correction could not be added.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const replaceCorrection = useCallback(async (correctionId: string, draft: ChargeableInvoiceCorrectionDraft) => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await replaceChargeableInvoiceCorrection(await accessToken(), workspace, correctionId, draft))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The invoice correction could not be edited.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const supersedeCorrection = useCallback(async (correctionId: string) => {
        if (!workspace) return
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await supersedeChargeableInvoiceCorrection(await accessToken(), workspace, correctionId))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The invoice correction could not be withdrawn.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const preparePhotoRequest = useCallback(async (technicianId: string) => {
        if (!workspace) throw new Error('The invoice review workspace is unavailable.')
        const technician = workspace.technicians.find((item) => item.gr_mechanicid === technicianId)
        if (!technician) throw new Error('Choose an active technician.')
        setIsSaving(true)
        setWorkspaceError('')
        try {
            const token = await accessToken()
            const selectedWorkspace = workspace.review._gr_photorequesttechnician_value?.toLowerCase() === technicianId.toLowerCase()
                ? workspace
                : await saveChargeableInvoicePhotoTechnician(token, workspace, technician)
            const prepared = await prepareChargeableInvoicePhotoRequest(token, selectedWorkspace)
            applyWorkspace(prepared.workspace)
            return prepared.mailto
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The photo request could not be prepared.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const preparePoRequest = useCallback(async (draft: ChargeableInvoicePoRecipientDraft) => {
        if (!workspace) throw new Error('The invoice review workspace is unavailable.')
        setIsSaving(true)
        setWorkspaceError('')
        try {
            const prepared = await prepareChargeableInvoicePoRequest(await accessToken(), workspace, draft)
            applyWorkspace(prepared.workspace)
            return prepared.mailto
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The PO request could not be prepared.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const uploadPhotos = useCallback(async (files: File[], technicianId: string) => {
        if (!workspace) throw new Error('The invoice review workspace is unavailable.')
        const technician = workspace.technicians.find((item) => item.gr_mechanicid === technicianId)
        if (!technician) throw new Error('Choose an active technician.')
        setIsSaving(true)
        setWorkspaceError('')
        try {
            const token = await accessToken()
            const selectedWorkspace = workspace.review._gr_photorequesttechnician_value?.toLowerCase() === technicianId.toLowerCase()
                ? workspace
                : await saveChargeableInvoicePhotoTechnician(token, workspace, technician)
            applyWorkspace(await uploadChargeableInvoiceSupportingPhotos(token, selectedWorkspace, files))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The supporting photos could not be uploaded.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const deletePhotos = useCallback(async (documentIds: string[]) => {
        if (!workspace) throw new Error('The invoice review workspace is unavailable.')
        setIsSaving(true)
        setWorkspaceError('')
        try {
            applyWorkspace(await permanentlyDeleteChargeableInvoiceSupportingPhotos(await accessToken(), workspace, documentIds))
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The supporting photos could not be deleted.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const generateApprovalPdf = useCallback(async () => {
        if (!workspace) throw new Error('The invoice review workspace is unavailable.')
        setIsSaving(true)
        setWorkspaceError('')
        try {
            const next = await generateChargeableInvoiceApprovalPdf(await accessToken(), workspace)
            applyWorkspace(next)
            const currentRevisionId = next.review._gr_currentrevision_value?.toLowerCase()
            const document = next.documents
                .filter((candidate) => candidate.gr_documenttype === CHARGEABLE_INVOICE_DOCUMENT_TYPES.APPROVAL_PDF
                    && candidate.gr_uploadstatus === CHARGEABLE_INVOICE_UPLOAD_STATUSES.COMPLETE
                    && candidate.gr_templateversion === CHARGEABLE_INVOICE_APPROVAL_TEMPLATE_VERSION
                    && candidate._gr_revision_value?.toLowerCase() === currentRevisionId)
                .sort((left, right) => (Date.parse(right.createdon || '') || 0) - (Date.parse(left.createdon || '') || 0))[0]
            if (!document) throw new Error('The amended invoice was generated but could not be loaded. Refresh the review and retry.')
            return document
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The approval PDF could not be generated.')
            throw error
        } finally {
            setIsSaving(false)
        }
    }, [accessToken, applyWorkspace, workspace])

    const loadDocument = useCallback(async (document: ChargeableInvoiceDocument) => {
        setWorkspaceError('')
        try {
            return await downloadChargeableInvoiceDocument(await accessToken(), document)
        } catch (error) {
            setWorkspaceError(error instanceof Error ? error.message : 'The document could not be loaded.')
            throw error
        }
    }, [accessToken])

    const downloadDocument = useCallback(async (document: ChargeableInvoiceDocument) => {
        try {
            const blob = await loadDocument(document)
            const objectUrl = URL.createObjectURL(blob)
            const link = window.document.createElement('a')
            link.href = objectUrl
            const sourceName = document.gr_filename?.trim() || document.gr_name?.trim() || 'amended-invoice.pdf'
            link.download = sourceName.toLowerCase().endsWith('.pdf') ? sourceName : `${sourceName}.pdf`
            link.style.display = 'none'
            window.document.body.appendChild(link)
            try {
                link.click()
            } finally {
                link.remove()
                window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
            }
        } catch (error) {
            throw error instanceof Error ? error : new Error('The amended invoice PDF could not be saved.')
        }
    }, [loadDocument])

    const loadQuoteLines = useCallback(async (quoteId: string) => {
        return fetchQuoteLines(await accessToken(), quoteId)
    }, [accessToken])

    const counts = useMemo(() => {
        const result: Record<ChargeableInvoicePrimaryQueue, number> = {
            new: 0, 'in-progress': 0, waiting: 0, 'ready-to-process': 0, history: 0,
        }
        reviews.forEach((review) => { result[deriveChargeableInvoicePrimaryQueue(review)] += 1 })
        return result
    }, [reviews])

    return {
        reviews, counts, selectedId, workspace, isLoading, isLoadingWorkspace, isSaving,
        loadError, workspaceError, refresh, openReview, closeReview, startReview, saveWaiting,
        loadDocument, downloadDocument, loadQuoteLines, saveRequirements, markReady, markDoNotProcess, deleteReview, addCorrection, replaceCorrection, supersedeCorrection,
        preparePhotoRequest, preparePoRequest, uploadPhotos, deletePhotos, generateApprovalPdf,
    }
}
