import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
    focusedQuoteQueryKey,
    PRICING_CATALOGUE_QUERY_KEY,
    QUOTES_REGISTER_QUERY_KEY,
    STAFF_DIRECTORY_QUERY_KEY,
} from '../src/alpha/shared/data/operationalCollectionKeys.ts'
import {
    fetchQuoteById,
    fetchQuoteJobById,
    searchQuoteCustomers,
    searchQuoteEquipment,
    searchQuoteJobs,
} from '../src/alpha/quotes/services/quotesApi.ts'

test('Quote loading uses stable shared keys for the register, pricing, Staff and focused records', () => {
    assert.deepEqual(QUOTES_REGISTER_QUERY_KEY, ['quotes', 'register-v1'])
    assert.deepEqual(PRICING_CATALOGUE_QUERY_KEY, ['pricing', 'catalogue-v1'])
    assert.deepEqual(STAFF_DIRECTORY_QUERY_KEY, ['staff', 'directory-v1'])
    assert.deepEqual(focusedQuoteQueryKey('ABC-123'), focusedQuoteQueryKey('abc-123'))
})

test('an existing cross-screen Quote is fetched by exact identity instead of loading the full register', async () => {
    const originalFetch = globalThis.fetch
    const controller = new AbortController()
    let requestedUrl = ''
    let requestedSignal: AbortSignal | undefined
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        requestedUrl = String(input)
        requestedSignal = init?.signal ?? undefined
        return new Response(JSON.stringify({ value: [{ gr_quoteid: 'quote-id' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    }) as typeof fetch
    try {
        const quote = await fetchQuoteById('token', 'quote-id', controller.signal)
        const url = new URL(requestedUrl)
        assert.equal(url.searchParams.get('$filter'), 'gr_quoteid eq quote-id')
        assert.equal(url.searchParams.get('$top'), '2')
        assert.equal(requestedSignal, controller.signal)
        assert.equal(quote?.gr_quoteid, 'quote-id')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Quotes renders the register independently and defers editor reference collections', async () => {
    const [hook, screen, overlay] = await Promise.all([
        readFile(new URL('../src/alpha/quotes/hooks/useQuotes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/quotes/QuotesScreen.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/quotes/components/QuoteEditorOverlay.tsx', import.meta.url), 'utf8'),
    ])

    assert.match(hook, /useOperationalQuery<Quote\[\]>/)
    assert.match(hook, /PRICING_CATALOGUE_QUERY_KEY/)
    assert.match(hook, /STAFF_DIRECTORY_QUERY_KEY/)
    assert.match(hook, /publishLocalOperationalInvalidation\('quotes'\)/)
    assert.match(screen, /useQuotes\(\{ loadEditorSupport: editorRequested \}\)/)
    assert.match(screen, /editingQuote !== undefined && !isEditorLoading/)
    assert.match(overlay, /loadRegister: false/)
    assert.match(overlay, /quoteId: request\.kind === 'existing'/)
    assert.doesNotMatch(overlay, /quotes\.find/)
})

test('Quote relationship selectors use bounded abortable Dataverse requests', async () => {
    const originalFetch = globalThis.fetch
    const requested: Array<{ url: URL; signal?: AbortSignal }> = []
    const controller = new AbortController()
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        requested.push({ url: new URL(String(input)), signal: init?.signal ?? undefined })
        return new Response(JSON.stringify({ value: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    }) as typeof fetch
    try {
        await Promise.all([
            searchQuoteJobs('token', 'FN2501', controller.signal),
            searchQuoteCustomers('token', 'Stratex', controller.signal),
            searchQuoteEquipment('token', 'FN2501', controller.signal),
            fetchQuoteJobById('token', 'job-id', controller.signal),
        ])
        assert.equal(requested.length, 4)
        requested.forEach(({ url, signal }) => {
            assert.ok(Number(url.searchParams.get('$top')) <= 8)
            assert.equal(signal, controller.signal)
        })
        assert.match(requested[0].url.searchParams.get('$filter') ?? '', /contains\(gr_jobnumber,'FN2501'\)/)
        assert.match(requested[1].url.searchParams.get('$filter') ?? '', /contains\(gr_name,'Stratex'\)/)
        assert.match(requested[2].url.searchParams.get('$filter') ?? '', /statecode eq 0/)
        assert.equal(requested[3].url.searchParams.get('$filter'), 'gr_jobid eq job-id')
        assert.equal(requested[3].url.searchParams.get('$top'), '1')
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('Quote editor support excludes full Job, Customer and Equipment directory downloads', async () => {
    const [hook, editor, searchableSelect] = await Promise.all([
        readFile(new URL('../src/alpha/quotes/hooks/useQuotes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/quotes/components/QuoteEditorDialog.tsx', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/shared/searchable-select/SearchableSelect.tsx', import.meta.url), 'utf8'),
    ])
    assert.doesNotMatch(hook, /fetchQuoteJobs\(/)
    assert.doesNotMatch(hook, /fetchCustomers\(/)
    assert.doesNotMatch(hook, /fetchEquipment\(/)
    assert.match(hook, /findJobs/)
    assert.match(hook, /findCustomers/)
    assert.match(hook, /findEquipment/)
    assert.match(editor, /onLoadJob\(jobId, controller\.signal\)/)
    assert.match(editor, /onSearchJobs\(jobSearch, controller\.signal\)/)
    assert.match(searchableSelect, /onSearchChange\?\.\(event\.target\.value\)/)
})

test('Quote pricing and Staff support are shared and fail independently', async () => {
    const [quotesHook, pricingHook, editor] = await Promise.all([
        readFile(new URL('../src/alpha/quotes/hooks/useQuotes.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/quotes/hooks/usePricingItems.ts', import.meta.url), 'utf8'),
        readFile(new URL('../src/alpha/quotes/components/QuoteEditorDialog.tsx', import.meta.url), 'utf8'),
    ])
    assert.match(quotesHook, /key: PRICING_CATALOGUE_QUERY_KEY/)
    assert.match(pricingHook, /key: PRICING_CATALOGUE_QUERY_KEY/)
    assert.match(quotesHook, /key: STAFF_DIRECTORY_QUERY_KEY/)
    assert.doesNotMatch(quotesHook, /subscribeToStaffChanges/)
    assert.match(quotesHook, /staffLoading:/)
    assert.match(quotesHook, /staffError:/)
    assert.match(editor, /Internal email recipients could not be loaded\. The Quote remains editable\./)
    assert.match(editor, /Retry Staff/)
})
