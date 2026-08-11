import { useCallback, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount.ts'
import { acquireDataverseAccessToken } from '../../../auth/dataverseAuthentication.ts'
import { buildGreenTreeInvoiceExtraction, type GreenTreeExtractionResult } from '../domain/greenTreeInvoiceExtraction.ts'
import {
    ChargeableInvoicePreviewError,
    lookupChargeableInvoiceJob,
    importChargeableInvoicePdf,
    previewChargeableInvoicePdf,
    validateChargeableInvoicePdf,
    type ChargeableInvoicePreview,
} from '../services/chargeableInvoicePreviewApi.ts'

const MAX_BATCH_FILES = 20
const PREVIEW_WORKERS = 2

export type ChargeableInvoiceIntakeItem = {
    id: string
    file: File
    state: 'pending' | 'previewing' | 'ready' | 'blocked' | 'importing' | 'imported'
    selected: boolean
    error: string | null
    preview: ChargeableInvoicePreview | null
    extraction: GreenTreeExtractionResult | null
    importDecision: 'new' | 'revision' | 'retry' | 'skip' | null
    jobLookupValue: string
    isLookingUpJob: boolean
}

function itemId(file: File) {
    return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`
}

function newItem(file: File): ChargeableInvoiceIntakeItem {
    const validation = validateChargeableInvoicePdf(file)
    return {
        id: itemId(file),
        file,
        state: validation ? 'blocked' : 'pending',
        selected: false,
        error: validation,
        preview: null,
        extraction: null,
        importDecision: null,
        jobLookupValue: '',
        isLookingUpJob: false,
    }
}

export function useChargeableInvoiceIntake() {
    const { instance } = useMsal()
    const activeAccount = useActiveMsalAccount()
    const [items, setItems] = useState<ChargeableInvoiceIntakeItem[]>([])
    const [batchError, setBatchError] = useState('')
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [isImporting, setIsImporting] = useState(false)

    const addFiles = useCallback((files: File[]) => {
        setBatchError('')
        setItems((current) => {
            const available = Math.max(0, MAX_BATCH_FILES - current.length)
            if (files.length > available) {
                setBatchError(`A batch can contain up to ${MAX_BATCH_FILES} PDFs.`)
            }
            return [...current, ...files.slice(0, available).map(newItem)]
        })
    }, [])

    const removeItem = useCallback((id: string) => {
        setItems((current) => current.filter((item) => item.id !== id))
    }, [])

    const setSelected = useCallback((id: string, selected: boolean) => {
        setItems((current) => current.map((item) => item.id === id && item.state === 'ready'
            ? { ...item, selected }
            : item))
    }, [])

    const setImportDecision = useCallback((id: string, importDecision: ChargeableInvoiceIntakeItem['importDecision']) => {
        setItems((current) => current.map((item) => {
            if (item.id !== id || !item.preview || !item.extraction) return item
            const hasErrors = item.extraction.issues.some((issue) => issue.severity === 'error')
            const ready = !hasErrors && item.preview.match.job != null && importDecision != null && importDecision !== 'skip'
            return { ...item, importDecision, state: ready ? 'ready' : 'blocked', selected: ready, error: ready ? null : importDecision === 'skip' ? 'Skipped.' : item.error }
        }))
    }, [])

    const setJobLookupValue = useCallback((id: string, jobLookupValue: string) => {
        setItems((current) => current.map((item) => item.id === id ? { ...item, jobLookupValue } : item))
    }, [])

    const lookupJob = useCallback(async (id: string) => {
        const item = items.find((candidate) => candidate.id === id)
        if (!item?.jobLookupValue.trim()) return
        setItems((current) => current.map((candidate) => candidate.id === id ? { ...candidate, isLookingUpJob: true, error: null } : candidate))
        try {
            const token = await acquireDataverseAccessToken(instance, activeAccount)
            const match = await lookupChargeableInvoiceJob(token, item.jobLookupValue)
            setItems((current) => current.map((candidate) => {
                if (candidate.id !== id || !candidate.preview) return candidate
                const preview = { ...candidate.preview, match }
                const hasErrors = candidate.extraction?.issues.some((issue) => issue.severity === 'error') ?? true
                const canImport = match.job != null && candidate.importDecision != null && candidate.importDecision !== 'skip' && !hasErrors
                return { ...candidate, preview, isLookingUpJob: false, state: canImport ? 'ready' : 'blocked', selected: canImport,
                    error: match.job ? (canImport ? null : candidate.error) : match.reason || 'No exact Job Number match was found.' }
            }))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Job lookup could not be completed.'
            setItems((current) => current.map((candidate) => candidate.id === id
                ? { ...candidate, isLookingUpJob: false, state: 'blocked', selected: false, error: message }
                : candidate))
        }
    }, [activeAccount, instance, items])

    const previewPending = useCallback(async () => {
        const pendingIds = items.filter((item) => item.state === 'pending').map((item) => item.id)
        if (!pendingIds.length) return
        setBatchError('')
        setIsPreviewing(true)
        setItems((current) => current.map((item) => pendingIds.includes(item.id)
            ? { ...item, state: 'previewing', error: null }
            : item))
        try {
            const token = await acquireDataverseAccessToken(instance, activeAccount)
            const queue = [...pendingIds]
            let accessFailure = ''
            const worker = async () => {
                while (queue.length && !accessFailure) {
                    const id = queue.shift()
                    if (!id) return
                    const item = items.find((candidate) => candidate.id === id)
                    if (!item) continue
                    try {
                        const preview = await previewChargeableInvoicePdf(token, item.file)
                        const extraction = buildGreenTreeInvoiceExtraction(preview.candidate)
                        const blockingIssues = extraction.issues.filter((issue) => issue.severity === 'error')
                        const exactMatch = preview.match.job != null
                        const importDecision = preview.duplicate.kind === 'new' ? 'new'
                            : preview.duplicate.kind === 'retry' ? 'retry'
                                : null
                        const duplicateError = ['revision', 'conflict', 'unresolved'].includes(preview.duplicate.kind)
                            ? preview.duplicate.reason || 'Choose how to handle this existing invoice.'
                            : null
                        const error = blockingIssues.length
                            ? `${blockingIssues.length} extraction error${blockingIssues.length === 1 ? '' : 's'} must be reviewed.`
                            : !exactMatch ? preview.match.reason || 'Choose an exact Job match.' : duplicateError
                        setItems((current) => current.map((candidate) => candidate.id === id
                            ? {
                                ...candidate,
                                preview,
                                extraction,
                                importDecision,
                                state: error ? 'blocked' : 'ready',
                                selected: !error,
                                error,
                            }
                            : candidate))
                    } catch (error) {
                        const message = error instanceof Error ? error.message : 'Invoice preview could not be completed.'
                        if (error instanceof ChargeableInvoicePreviewError && (error.status === 401 || error.status === 403)) {
                            accessFailure = message
                        }
                        setItems((current) => current.map((candidate) => candidate.id === id
                            ? { ...candidate, state: 'blocked', selected: false, error: message }
                            : candidate))
                    }
                }
            }
            await Promise.all(Array.from({ length: Math.min(PREVIEW_WORKERS, pendingIds.length) }, worker))
            if (accessFailure) {
                setBatchError(accessFailure)
                setItems((current) => current.map((item) => item.state === 'previewing'
                    ? { ...item, state: 'blocked', error: accessFailure }
                    : item))
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invoice preview could not be started.'
            setBatchError(message)
            setItems((current) => current.map((item) => item.state === 'previewing'
                ? { ...item, state: 'pending', error: null }
                : item))
        } finally {
            setIsPreviewing(false)
        }
    }, [activeAccount, instance, items])

    const importSelected = useCallback(async () => {
        const selected = items.filter((item) => item.selected && item.state === 'ready')
        if (!selected.length) return
        setBatchError('')
        setIsImporting(true)
        try {
            const token = await acquireDataverseAccessToken(instance, activeAccount)
            for (const item of selected) {
                const decision = item.importDecision
                const job = item.preview?.match.job
                if (!job || !decision || decision === 'skip') continue
                setItems((current) => current.map((candidate) => candidate.id === item.id
                    ? { ...candidate, state: 'importing', selected: false, error: null }
                    : candidate))
                try {
                    await importChargeableInvoicePdf(token, item.file, decision, job)
                    setItems((current) => current.map((candidate) => candidate.id === item.id
                        ? { ...candidate, state: 'imported', selected: false, error: null }
                        : candidate))
                } catch (error) {
                    const message = error instanceof Error ? error.message : 'Invoice import could not be completed.'
                    setItems((current) => current.map((candidate) => candidate.id === item.id
                        ? { ...candidate, state: 'blocked', selected: false, error: message }
                        : candidate))
                }
            }
        } catch (error) {
            setBatchError(error instanceof Error ? error.message : 'Invoice import could not be started.')
        } finally {
            setIsImporting(false)
        }
    }, [activeAccount, instance, items])

    const summary = useMemo(() => ({
        total: items.length,
        pending: items.filter((item) => item.state === 'pending').length,
        ready: items.filter((item) => item.state === 'ready').length,
        blocked: items.filter((item) => item.state === 'blocked').length,
        selected: items.filter((item) => item.selected).length,
        imported: items.filter((item) => item.state === 'imported').length,
    }), [items])

    return {
        items,
        summary,
        batchError,
        isPreviewing,
        isImporting,
        addFiles,
        removeItem,
        setSelected,
        setImportDecision,
        setJobLookupValue,
        lookupJob,
        previewPending,
        importSelected,
    }
}
