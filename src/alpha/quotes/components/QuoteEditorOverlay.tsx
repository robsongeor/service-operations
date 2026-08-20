import { useEffect, useRef, useState } from 'react'
import { useActiveMsalAccount } from '../../../auth/useActiveMsalAccount'
import { getSignedInUserInfo } from '../../../auth/signedInUser'
import type { QuoteEditorRequest } from '../QuoteEditorOverlayContext'
import { useQuotes } from '../hooks/useQuotes'
import type { Quote, QuoteInput, QuoteLine } from '../types/quote.types'
import QuoteEditorDialog from './QuoteEditorDialog'
import '../QuotesScreen.css'

type Props = {
    request: QuoteEditorRequest
    onClose: () => void
}

export default function QuoteEditorOverlay({ request, onClose }: Props) {
    const account = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(account)
    const {
        focusedQuote, jobs, customers, equipment, pricingItems, staff, staffLoading, staffError, retryStaff,
        isEditorLoading, isSaving, editorLoadError, saveError, loadLines, save, deleteQuote,
        loadJob, findJobs, loadCustomer, findCustomers, loadEquipment, findEquipment,
    } = useQuotes({
        loadRegister: false,
        loadEditorSupport: true,
        quoteId: request.kind === 'existing' ? request.quoteId : undefined,
    })
    const [editingQuote, setEditingQuote] = useState<Quote | null>(null)
    const [editingLines, setEditingLines] = useState<QuoteLine[]>([])
    const [openError, setOpenError] = useState('')
    const loadedQuoteId = useRef('')

    useEffect(() => {
        if (request.kind !== 'existing' || isEditorLoading || editorLoadError || !focusedQuote || loadedQuoteId.current === request.quoteId) return
        loadedQuoteId.current = request.quoteId
        const controller = new AbortController()
        void loadLines(focusedQuote.gr_quoteid, controller.signal).then((lines) => {
            if (controller.signal.aborted) return
            setEditingQuote(focusedQuote)
            setEditingLines(lines)
        }).catch((error) => {
            if (!controller.signal.aborted) setOpenError(error instanceof Error ? error.message : 'Quote lines could not be loaded.')
        })
        return () => controller.abort()
    }, [editorLoadError, focusedQuote, isEditorLoading, loadLines, request])

    const requestedQuoteMissing = request.kind === 'existing'
        && !isEditorLoading
        && !editorLoadError
        && !focusedQuote

    if (isEditorLoading || (request.kind === 'existing' && !editingQuote && !openError && !editorLoadError && !requestedQuoteMissing)) {
        return <div className="quote-dialog-backdrop" role="presentation">
            <section className="quote-overlay-state" role="status"><strong>Loading quote…</strong><span>The current screen will remain open.</span></section>
        </div>
    }

    if (editorLoadError || openError || requestedQuoteMissing) {
        return <div className="quote-dialog-backdrop" role="presentation">
            <section className="quote-overlay-state error" role="alert">
                <strong>Quote could not be opened</strong><span>{editorLoadError || openError || 'The requested Quote could not be found. It may have been deleted or you may not have access to it.'}</span>
                <button type="button" onClick={onClose}>Close</button>
            </section>
        </div>
    }

    const saveQuote = async (input: QuoteInput) => {
        const saved = await save(input, editingQuote || undefined, editingLines)
        setEditingQuote(saved.quote)
        setEditingLines(saved.lines)
        return saved.lines
    }

    const removeQuote = async () => {
        if (!editingQuote) return
        await deleteQuote(editingQuote.gr_quoteid, editingLines)
        onClose()
    }

    return <QuoteEditorDialog
        quote={request.kind === 'new' ? editingQuote : editingQuote!}
        existingLines={editingLines}
        jobs={jobs}
        customers={customers}
        equipment={equipment}
        pricingItems={pricingItems}
        staff={staff}
        staffLoading={staffLoading}
        staffError={staffError}
        onRetryStaff={() => { void retryStaff().catch(() => undefined) }}
        initialJobId={request.kind === 'new' ? request.jobId : undefined}
        isSaving={isSaving}
        error={saveError}
        onClose={onClose}
        onSave={saveQuote}
        onDelete={removeQuote}
        authorName={editingQuote?.createdby?.fullname || signedInUser?.displayName || ''}
        authorIdentityAvailable={Boolean(editingQuote?.createdby?.systemuserid || signedInUser?.entraObjectId)}
        onLoadJob={loadJob}
        onSearchJobs={findJobs}
        onLoadCustomer={loadCustomer}
        onSearchCustomers={findCustomers}
        onLoadEquipment={loadEquipment}
        onSearchEquipment={findEquipment}
    />
}
