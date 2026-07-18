import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QuoteEditorDialog from './components/QuoteEditorDialog'
import { useQuotes } from './hooks/useQuotes'
import { QUOTE_STATUS_LABELS, type Quote, type QuoteInput, type QuoteLine } from './types/quote.types'
import './QuotesScreen.css'

const money = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' })
const date = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

export default function QuotesScreen() {
    const [searchParams, setSearchParams] = useSearchParams()
    const requestedNewJobId = searchParams.get('new') === '1'
        ? searchParams.get('jobId') ?? undefined
        : undefined
    const requestedQuoteId = searchParams.get('quoteId')
    const {
        quotes,
        jobs,
        pricingItems,
        isLoading,
        isSaving,
        loadError,
        saveError,
        reload,
        loadLines,
        save,
        clearSaveError,
    } = useQuotes()
    const [editingQuote, setEditingQuote] = useState<Quote | null | undefined>(
        () => requestedNewJobId ? null : undefined,
    )
    const [editingLines, setEditingLines] = useState<QuoteLine[]>([])
    const [isOpening, setIsOpening] = useState(false)
    const [openError, setOpenError] = useState('')
    const [search, setSearch] = useState('')
    const openedQuoteId = useRef<string | null>(null)

    const visibleQuotes = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return quotes
        return quotes.filter((quote) => [
            quote.gr_quotenumber,
            quote.gr_name,
            quote.gr_Job?.gr_jobnumber,
            quote.gr_Job?.gr_Site?.gr_Customer?.gr_name,
            quote.gr_Job?.gr_Equipment?.gr_fleet,
        ].some((value) => value?.toLowerCase().includes(query)))
    }, [quotes, search])

    const openNew = () => {
        setSearchParams({})
        clearSaveError()
        setEditingLines([])
        setEditingQuote(null)
    }

    const openExisting = async (quote: Quote) => {
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
        try {
            await save(input, editingQuote || undefined, editingLines)
            setEditingQuote(undefined)
            setEditingLines([])
            setSearchParams({})
        } catch {
            // The hook exposes the Dataverse message in the editor.
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
                <span>{quotes.length} quotes</span>
            </section>

            <div className="quotes-toolbar">
                <label>
                    <span className="sr-only">Search quotes</span>
                    <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search quote, job, customer or fleet" />
                </label>
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
                <div className="quotes-table-shell">
                    <table className="quotes-table">
                        <thead><tr><th>Quote</th><th>Job / customer</th><th>Date</th><th>Status</th><th>Revision</th><th className="quotes-money">Total</th></tr></thead>
                        <tbody>
                            {visibleQuotes.map((quote) => (
                                <tr key={quote.gr_quoteid} onClick={() => void openExisting(quote)}>
                                    <td><strong>{quote.gr_quotenumber || 'Pending number'}</strong><small>{quote.gr_name}</small></td>
                                    <td><strong>{quote.gr_Job?.gr_jobnumber || 'Unknown job'}</strong><small>{quote.gr_Job?.gr_Site?.gr_Customer?.gr_name || quote.gr_Job?.gr_Equipment?.gr_fleet || 'No customer details'}</small></td>
                                    <td>{quote.gr_quotedate ? date.format(new Date(`${quote.gr_quotedate.slice(0, 10)}T00:00:00`)) : '—'}</td>
                                    <td><span className={`quote-status status-${quote.gr_quotestatus}`}>{QUOTE_STATUS_LABELS[quote.gr_quotestatus] ?? 'Unknown'}</span></td>
                                    <td>Rev {quote.gr_revision}</td>
                                    <td className="quotes-money"><strong>{money.format(quote.gr_total)}</strong></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {visibleQuotes.length === 0 && (
                        <div className="quotes-empty"><h2>{quotes.length ? 'No matching quotes' : 'No quotes yet'}</h2><p>{quotes.length ? 'Try a different search.' : 'Create the first quote and link it to an existing job.'}</p></div>
                    )}
                </div>
            )}

            {isOpening && <div className="quotes-opening" role="status">Loading quote lines…</div>}

            {editingQuote !== undefined && (
                <QuoteEditorDialog
                    quote={editingQuote}
                    existingLines={editingLines}
                    jobs={jobs}
                    pricingItems={pricingItems}
                    initialJobId={requestedNewJobId}
                    isSaving={isSaving}
                    error={saveError}
                    onClose={() => {
                        setEditingQuote(undefined)
                        setSearchParams({})
                    }}
                    onSave={saveQuote}
                />
            )}
        </div>
    )
}
