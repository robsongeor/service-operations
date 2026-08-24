import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QuoteEditorDialog from './components/QuoteEditorDialog'
import { useQuotes } from './hooks/useQuotes'
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_OPTIONS, type Quote, type QuoteInput, type QuoteLine, type QuoteStatus } from './types/quote.types'
import { DEFAULT_QUOTES_VIEW_STATE, getQuotesViewStateKey, restoreQuotesViewState, type QuotesViewState } from './types/quotesViewState.types'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import { getSignedInUserInfo } from '../../auth/signedInUser'
import JobsTableSortIcon from '../jobs/components/JobsTableSortIcon'
import './QuotesScreen.css'

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const date = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

export default function QuotesScreen() {
    const activeAccount = useActiveMsalAccount()
    const signedInUser = getSignedInUserInfo(activeAccount)
    const viewStorageKey = signedInUser ? getQuotesViewStateKey(signedInUser.storageId) : null
    const [searchParams, setSearchParams] = useSearchParams()
    const requestedNewJobId = searchParams.get('new') === '1'
        ? searchParams.get('jobId') ?? undefined
        : undefined
    const requestedQuoteId = searchParams.get('quoteId')
    const [editingQuote, setEditingQuote] = useState<Quote | null | undefined>(
        () => requestedNewJobId ? null : undefined,
    )
    const [editorRequested, setEditorRequested] = useState(Boolean(requestedNewJobId || requestedQuoteId))
    const {
        quotes,
        jobs,
        customers,
        equipment,
        pricingItems,
        staff,
        staffLoading,
        staffError,
        retryStaff,
        isLoading,
        isEditorLoading,
        isSaving,
        loadError,
        editorLoadError,
        saveError,
        reload,
        loadLines,
        loadJob,
        findJobs,
        loadCustomer,
        findCustomers,
        loadEquipment,
        findEquipment,
        save,
        deleteQuote,
        clearSaveError,
    } = useQuotes({ loadEditorSupport: editorRequested })
    const [editingLines, setEditingLines] = useState<QuoteLine[]>([])
    const [isOpening, setIsOpening] = useState(false)
    const [openError, setOpenError] = useState('')
    const [search, setSearch] = useState('')
    const [viewState, setViewState] = useState<QuotesViewState>(() => viewStorageKey
        ? restoreQuotesViewState(viewStorageKey)
        : DEFAULT_QUOTES_VIEW_STATE)
    const openedQuoteId = useRef<string | null>(null)
    const myQuotesAvailable = Boolean(signedInUser?.entraObjectId)

    const visibleQuotes = useMemo(() => {
        const query = search.trim().toLowerCase()
        const currentUserObjectId = signedInUser?.entraObjectId?.toLowerCase()
        return quotes
            .filter((quote) => viewState.tab !== 'mine' || Boolean(currentUserObjectId && quote.createdby?.azureactivedirectoryobjectid?.toLowerCase() === currentUserObjectId))
            .filter((quote) => viewState.status === 'all' || quote.gr_quotestatus === viewState.status)
            .filter((quote) => !query || [
                quote.gr_quotenumber,
                quote.gr_name,
                quote.gr_Customer?.gr_name,
                quote.gr_Equipment?.gr_fleet,
                quote.gr_Equipment?.gr_serial,
                quote.gr_Job?.gr_jobnumber,
                quote.gr_Job?.gr_Site?.gr_Customer?.gr_name,
                quote.gr_Job?.gr_Equipment?.gr_fleet,
                quote.createdby?.fullname,
            ].some((value) => value?.toLowerCase().includes(query)))
            .sort((left, right) => {
                const leftTime = left.gr_quotedate ? Date.parse(left.gr_quotedate) : Number.NaN
                const rightTime = right.gr_quotedate ? Date.parse(right.gr_quotedate) : Number.NaN
                if (Number.isNaN(leftTime)) return Number.isNaN(rightTime) ? 0 : 1
                if (Number.isNaN(rightTime)) return -1
                return viewState.dateSort === 'ascending' ? leftTime - rightTime : rightTime - leftTime
            })
    }, [quotes, search, signedInUser?.entraObjectId, viewState])
    const visibleQuoteTotal = visibleQuotes.reduce((total, quote) => total + quote.gr_total, 0)
    const selectedStatusLabel = viewState.status === 'all'
        ? 'All statuses'
        : QUOTE_STATUS_LABELS[viewState.status] ?? 'Selected status'

    useEffect(() => {
        if (!viewStorageKey) return
        try {
            sessionStorage.setItem(viewStorageKey, JSON.stringify(viewState))
        } catch {
            // Quotes remains usable when browser storage is unavailable.
        }
    }, [viewState, viewStorageKey])

    const openNew = () => {
        setSearchParams({})
        clearSaveError()
        setEditorRequested(true)
        setEditingLines([])
        setEditingQuote(null)
    }

    const openExisting = async (quote: Quote) => {
        setEditorRequested(true)
        setIsOpening(true)
        setOpenError('')
        clearSaveError()
        try {
            setEditingLines(await loadLines(quote.gr_quoteid))
            setEditingQuote(quote)
        } catch (error) {
            setOpenError(error instanceof Error ? error.message : 'Quote lines could not be loaded.')
        } finally {
            setIsOpening(false)
        }
    }

    useEffect(() => {
        if (isLoading || !requestedQuoteId || openedQuoteId.current === requestedQuoteId) return
        const requestedQuote = quotes.find((quote) => quote.gr_quoteid === requestedQuoteId)
        if (!requestedQuote) return

        openedQuoteId.current = requestedQuoteId
        let cancelled = false
        const openRequestedQuote = async () => {
            setIsOpening(true)
            setOpenError('')
            clearSaveError()
            try {
                const lines = await loadLines(requestedQuote.gr_quoteid)
                if (!cancelled) {
                    setEditingLines(lines)
                    setEditingQuote(requestedQuote)
                }
            } catch (error) {
                if (!cancelled) {
                    setOpenError(error instanceof Error ? error.message : 'Quote lines could not be loaded.')
                }
            } finally {
                if (!cancelled) setIsOpening(false)
            }
        }
        void openRequestedQuote()
        return () => { cancelled = true }
    }, [clearSaveError, isLoading, loadLines, quotes, requestedQuoteId])

    const saveQuote = async (input: QuoteInput) => {
        const saved = await save(input, editingQuote || undefined, editingLines)
        setEditingQuote(saved.quote)
        setEditingLines(saved.lines)
        openedQuoteId.current = saved.quote.gr_quoteid
        if (searchParams.size) {
            setSearchParams({})
        }
        return saved.lines
    }

    const removeQuote = async () => {
        if (!editingQuote) return
        try {
            await deleteQuote(editingQuote.gr_quoteid, editingLines)
            setEditingQuote(undefined)
            setEditingLines([])
            setEditorRequested(false)
            setSearchParams({})
        } catch {
            // The hook exposes the Dataverse message in the confirmation.
        }
    }

    return (
        <div className="quotes-page">
            <header className="quotes-page-header">
                <div>
                    <span>Sales</span>
                    <h1>Quotes</h1>
                </div>
                <button className="quote-primary-button" type="button" onClick={openNew} disabled={isLoading || Boolean(loadError)}>
                    + Create quote
                </button>
            </header>

            <section className="quotes-summary">
                <div><span>Quote register</span><h2>Customer estimates linked to jobs</h2></div>
                <div className="quotes-summary-totals">
                    <span>{visibleQuotes.length} {visibleQuotes.length === 1 ? 'quote' : 'quotes'}</span>
                    <strong><small>{selectedStatusLabel} total</small>{money.format(visibleQuoteTotal)}</strong>
                </div>
            </section>

            <div className="quotes-toolbar">
                <label>
                    <span className="sr-only">Search quotes</span>
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quote, job, customer or fleet" />
                </label>
                <div className="quotes-status-filter" aria-label="Filter quotes by status">
                    <button type="button" className={viewState.status === 'all' ? 'active' : ''} aria-pressed={viewState.status === 'all'} onClick={() => setViewState((current) => ({ ...current, status: 'all' }))}>All statuses</button>
                    {QUOTE_STATUS_OPTIONS.map((status) => <button key={status.value} type="button" className={viewState.status === status.value ? 'active' : ''} aria-pressed={viewState.status === status.value} onClick={() => setViewState((current) => ({ ...current, status: status.value as QuoteStatus }))}>{status.label}</button>)}
                </div>
            </div>

            <div className="quotes-tabs" role="tablist" aria-label="Quote ownership view">
                <button type="button" role="tab" aria-selected={viewState.tab === 'all'} className={viewState.tab === 'all' ? 'active' : ''} onClick={() => setViewState((current) => ({ ...current, tab: 'all' }))}>All Quotes</button>
                <button type="button" role="tab" aria-selected={viewState.tab === 'mine'} className={viewState.tab === 'mine' ? 'active' : ''} onClick={() => setViewState((current) => ({ ...current, tab: 'mine' }))}>My Quotes</button>
            </div>

            {openError && <p className="quotes-page-error" role="alert">{openError}</p>}

            {isLoading ? (
                <section className="quotes-data-state"><h2>Loading quotes</h2><p>Connecting to Dataverse.</p></section>
            ) : loadError ? (
                <section className="quotes-data-state quotes-data-state-error" role="alert">
                    <div><h2>Quotes could not be loaded</h2><p>{loadError}</p></div>
                    <button type="button" onClick={() => void reload()}>Try again</button>
                </section>
            ) : (
                viewState.tab === 'mine' && !myQuotesAvailable ? (
                    <section className="quotes-data-state quotes-identity-state">
                        <h2>My Quotes is not available yet</h2>
                        <p>The signed-in Entra user ID is not available, so Quotes cannot be matched safely to {signedInUser?.displayName ?? 'the signed-in user'}.</p>
                    </section>
                ) : <div className="quotes-table-shell">
                    <table className="quotes-table">
                        <colgroup>
                            <col className="quotes-customer-col" />
                            <col className="quotes-job-col" />
                            <col className="quotes-equipment-col" />
                            <col />
                            <col className="quotes-author-col" />
                            <col className="quotes-date-col" />
                            <col className="quotes-status-col" />
                            <col className="quotes-total-col" />
                        </colgroup>
                        <thead><tr><th>Customer</th><th>Job</th><th>Equipment</th><th>Quote description</th><th className="quotes-author-column">Author</th><th className="quotes-date-column" aria-sort={viewState.dateSort}><button type="button" className="quotes-sort" onClick={() => setViewState((current) => ({ ...current, dateSort: current.dateSort === 'ascending' ? 'descending' : 'ascending' }))}>Date <JobsTableSortIcon active direction={viewState.dateSort} /></button></th><th>Status</th><th className="quotes-money">Total</th></tr></thead>
                        <tbody>
                            {visibleQuotes.map((quote) => {
                                const linkedEquipment = quote.gr_Equipment || quote.gr_Job?.gr_Equipment
                                const equipmentMakeModel = [linkedEquipment?.gr_make, linkedEquipment?.gr_model].filter(Boolean).join(' ')
                                return <tr key={quote.gr_quoteid} onClick={() => void openExisting(quote)}>
                                    <td><strong>{quote.gr_Customer?.gr_name || quote.gr_Job?.gr_Site?.gr_Customer?.gr_name || quote.gr_Equipment?.gr_Site?.gr_Customer?.gr_name || '—'}</strong></td>
                                    <td><strong className="quotes-job-value" title={quote.gr_Job?.gr_jobnumber || undefined}>{quote.gr_Job?.gr_jobnumber || '—'}</strong></td>
                                    <td><strong>{linkedEquipment?.gr_fleet || '—'}</strong><small>{equipmentMakeModel || linkedEquipment?.gr_serial || ''}</small></td>
                                    <td><strong className="quote-title">{quote.gr_name || 'Untitled quote'}</strong><small>{quote.gr_quotenumber || 'Pending number'}</small></td>
                                    <td className="quotes-author-column"><strong>{quote.createdby?.fullname || 'Unknown'}</strong></td>
                                    <td className="quotes-date-column">{quote.gr_quotedate ? date.format(new Date(`${quote.gr_quotedate.slice(0, 10)}T00:00:00`)) : '—'}</td>
                                    <td><span className={`quote-status status-${quote.gr_quotestatus}`}>{QUOTE_STATUS_LABELS[quote.gr_quotestatus] ?? 'Unknown'}</span></td>
                                    <td className="quotes-money"><strong>{money.format(quote.gr_total)}</strong></td>
                                </tr>
                            })}
                        </tbody>
                    </table>
                    {visibleQuotes.length === 0 && (
                        <div className="quotes-empty"><h2>{quotes.length ? 'No matching quotes' : 'No quotes yet'}</h2><p>{quotes.length ? 'Try a different search.' : 'Create the first quote and link it to an existing job.'}</p></div>
                    )}
                </div>
            )}

            {(isOpening || (editorRequested && isEditorLoading)) && (
                <div className="quotes-opening" role="status">Loading quote editor…</div>
            )}
            {editorRequested && editorLoadError && (
                <p className="quotes-page-error" role="alert">{editorLoadError}</p>
            )}

            {editingQuote !== undefined && !isEditorLoading && !editorLoadError && (
                <QuoteEditorDialog
                    quote={editingQuote}
                    existingLines={editingLines}
                    jobs={jobs}
                    customers={customers}
                    equipment={equipment}
                    pricingItems={pricingItems}
                    staff={staff}
                    staffLoading={staffLoading}
                    staffError={staffError}
                    onRetryStaff={() => { void retryStaff().catch(() => undefined) }}
                    initialJobId={requestedNewJobId}
                    isSaving={isSaving}
                    error={saveError}
                    onClose={() => {
                        setEditingQuote(undefined)
                        setEditingLines([])
                        setEditorRequested(false)
                        setSearchParams({})
                    }}
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
            )}
        </div>
    )
}
