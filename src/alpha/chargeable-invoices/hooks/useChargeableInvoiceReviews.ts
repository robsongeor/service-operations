import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount.ts'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication.ts'
import { deriveChargeableInvoicePrimaryQueue, type ChargeableInvoicePrimaryQueue } from '../domain/chargeableInvoiceState.ts'
import {
    downloadChargeableInvoiceDocument,
    fetchChargeableInvoiceReviews,
    fetchChargeableInvoiceWorkspace,
    markChargeableInvoiceDoNotProcess,
    markChargeableInvoiceReady,
    saveChargeableInvoiceRequirements,
    saveChargeableInvoiceWaiting,
    startChargeableInvoiceReview,
} from '../services/chargeableInvoiceReviewApi.ts'
import type {
    ChargeableInvoiceDocument,
    ChargeableInvoiceReview,
    ChargeableInvoiceWaitingOn,
    ChargeableInvoiceWorkspace,
} from '../types/chargeableInvoice.types.ts'
import type { ChargeableInvoiceRequirementsDraft } from '../domain/chargeableInvoiceState.ts'

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
            link.download = document.gr_filename?.trim() || document.gr_name || 'invoice-document.pdf'
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
        } catch { /* loadDocument exposes the safe error */ }
    }, [loadDocument])

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
        loadDocument, downloadDocument, saveRequirements, markReady, markDoNotProcess,
    }
}
