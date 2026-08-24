import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { QuoteEditorOverlayContext, type QuoteEditorOverlayContextValue, type QuoteEditorRequest } from './QuoteEditorOverlayContext'

const QuoteEditorOverlay = lazy(() => import('./components/QuoteEditorOverlay'))

export function QuoteEditorOverlayProvider({ children }: { children: ReactNode }) {
    const [request, setRequest] = useState<QuoteEditorRequest | null>(null)
    const value = useMemo<QuoteEditorOverlayContextValue>(() => ({
        openQuote: (quoteId) => setRequest({ kind: 'existing', quoteId }),
        createQuote: (jobId) => setRequest({ kind: 'new', jobId }),
    }), [])

    return <QuoteEditorOverlayContext.Provider value={value}>
        {children}
        {request && <Suspense fallback={<div className="quotes-opening" role="status">Loading quote editor…</div>}>
            <QuoteEditorOverlay request={request} onClose={() => setRequest(null)} />
        </Suspense>}
    </QuoteEditorOverlayContext.Provider>
}
