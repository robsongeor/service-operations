import { createContext, useContext } from 'react'

export type QuoteEditorRequest =
    | { kind: 'existing'; quoteId: string }
    | { kind: 'new'; jobId?: string }

export type QuoteEditorOverlayContextValue = {
    openQuote: (quoteId: string) => void
    createQuote: (jobId?: string) => void
}

export const QuoteEditorOverlayContext = createContext<QuoteEditorOverlayContextValue | null>(null)

export function useQuoteEditorOverlay() {
    const context = useContext(QuoteEditorOverlayContext)
    if (!context) throw new Error('useQuoteEditorOverlay must be used inside QuoteEditorOverlayProvider.')
    return context
}
