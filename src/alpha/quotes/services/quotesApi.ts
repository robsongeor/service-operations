import type {
    Quote,
    QuoteInput,
    QuoteJob,
    QuoteLine,
    QuoteLineInput,
} from '../types/quote.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL
const API_URL = `${DATAVERSE_URL}/api/data/v9.2`

function headers(accessToken: string, includeContentType = false) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
    }
}

async function ensureSuccess(response: Response, action: string) {
    if (response.ok) return
    const responseText = await response.text()
    let detail = responseText
    try {
        const parsed = JSON.parse(responseText)
        detail = parsed.error?.message || responseText
    } catch {
        // Dataverse occasionally returns plain text instead of JSON.
    }
    throw new Error(`${action}: ${detail || `${response.status} ${response.statusText}`}`)
}

export async function fetchQuoteJobs(accessToken: string): Promise<QuoteJob[]> {
    const response = await fetch(
        `${API_URL}/gr_jobs?$select=gr_jobid,gr_jobnumber,gr_description&$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial),gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name))&$orderby=createdon desc`,
        { cache: 'no-store', headers: headers(accessToken) },
    )
    await ensureSuccess(response, 'Failed to load jobs for quotes')
    const data = await response.json()
    return data.value ?? []
}

export async function fetchQuotes(accessToken: string): Promise<Quote[]> {
    const fields = [
        'gr_quoteid', 'gr_name', 'gr_quotenumber', 'gr_quotestatus', 'gr_revision',
        'gr_quotedate', 'gr_validuntil', 'gr_notes', 'gr_gstrate', 'gr_subtotal',
        'gr_gst', 'gr_total', 'createdon', '_gr_job_value',
    ].join(',')
    const response = await fetch(
        `${API_URL}/gr_quotes?$select=${fields}&$expand=gr_Job($select=gr_jobid,gr_jobnumber,gr_description;$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial),gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name)))&$orderby=createdon desc`,
        { cache: 'no-store', headers: headers(accessToken) },
    )
    await ensureSuccess(response, 'Failed to load quotes')
    const data = await response.json()
    return data.value ?? []
}

export async function fetchQuoteLines(
    accessToken: string,
    quoteId: string,
): Promise<QuoteLine[]> {
    const fields = [
        'gr_quotelineid', 'gr_name', '_gr_quote_value', '_gr_pricingitem_value',
        'gr_category', 'gr_description', 'gr_quantity', 'gr_unitlabel',
        'gr_unitprice', 'gr_extendedprice', 'gr_taxable', 'gr_sortorder',
    ].join(',')
    const response = await fetch(
        `${API_URL}/gr_quotelines?$select=${fields}&$filter=_gr_quote_value eq ${quoteId}&$orderby=gr_sortorder asc`,
        { cache: 'no-store', headers: headers(accessToken) },
    )
    await ensureSuccess(response, 'Failed to load quote lines')
    const data = await response.json()
    return data.value ?? []
}

function quotePayload(quote: QuoteInput) {
    return {
        gr_name: quote.name.trim(),
        'gr_Job@odata.bind': `/gr_jobs(${quote.jobId})`,
        gr_quotestatus: quote.status,
        gr_revision: quote.revision,
        gr_quotedate: quote.quoteDate,
        gr_validuntil: quote.validUntil || null,
        gr_notes: quote.notes.trim() || null,
        gr_gstrate: quote.gstRate,
        gr_subtotal: quote.subtotal,
        gr_gst: quote.gst,
        gr_total: quote.total,
    }
}

function linePayload(line: QuoteLineInput, quoteId?: string, clearPricingItem = false) {
    return {
        gr_name: line.description.trim().slice(0, 850),
        ...(quoteId ? { 'gr_Quote@odata.bind': `/gr_quotes(${quoteId})` } : {}),
        ...(line.pricingItemId
            ? { 'gr_Pricingitem@odata.bind': `/gr_pricingitems(${line.pricingItemId})` }
            : clearPricingItem ? { 'gr_Pricingitem@odata.bind': null } : {}),
        gr_category: line.category,
        gr_description: line.description.trim(),
        gr_quantity: line.quantity,
        gr_unitlabel: line.unitLabel.trim() || null,
        gr_unitprice: line.unitPrice,
        gr_extendedprice: line.quantity * line.unitPrice,
        gr_taxable: line.taxable,
        gr_sortorder: line.sortOrder,
    }
}

async function createLine(accessToken: string, quoteId: string, line: QuoteLineInput) {
    const response = await fetch(`${API_URL}/gr_quotelines`, {
        method: 'POST',
        headers: headers(accessToken, true),
        body: JSON.stringify(linePayload(line, quoteId)),
    })
    await ensureSuccess(response, 'Failed to create a quote line')
}

export async function createQuote(accessToken: string, quote: QuoteInput): Promise<string> {
    const response = await fetch(`${API_URL}/gr_quotes`, {
        method: 'POST',
        headers: {
            ...headers(accessToken, true),
            Prefer: 'return=representation',
        },
        body: JSON.stringify(quotePayload(quote)),
    })
    await ensureSuccess(response, 'Failed to create quote')
    const created = await response.json()
    const quoteId = created.gr_quoteid as string

    try {
        await Promise.all(quote.lines.map((line) => createLine(accessToken, quoteId, line)))
    } catch (error) {
        const rollback = await fetch(`${API_URL}/gr_quotes(${quoteId})`, {
            method: 'DELETE',
            headers: headers(accessToken),
        })
        if (!rollback.ok) {
            throw new Error(
                `${error instanceof Error ? error.message : 'Failed to create quote lines'} `
                + `The incomplete quote ${quoteId} could not be removed automatically.`,
                { cause: error },
            )
        }
        throw error
    }
    return quoteId
}

export async function updateQuote(
    accessToken: string,
    quoteId: string,
    previousLines: QuoteLine[],
    quote: QuoteInput,
): Promise<void> {
    const retainedIds = new Set(quote.lines.flatMap((line) => line.id ? [line.id] : []))
    const deletedLines = previousLines.filter((line) => !retainedIds.has(line.gr_quotelineid))

    await Promise.all([
        ...deletedLines.map(async (line) => {
            const response = await fetch(`${API_URL}/gr_quotelines(${line.gr_quotelineid})`, {
                method: 'DELETE',
                headers: headers(accessToken),
            })
            await ensureSuccess(response, 'Failed to remove a quote line')
        }),
        ...quote.lines.map(async (line) => {
            if (!line.id) return createLine(accessToken, quoteId, line)
            const response = await fetch(`${API_URL}/gr_quotelines(${line.id})`, {
                method: 'PATCH',
                headers: headers(accessToken, true),
                body: JSON.stringify(linePayload(line, undefined, true)),
            })
            await ensureSuccess(response, 'Failed to update a quote line')
        }),
    ])

    const response = await fetch(`${API_URL}/gr_quotes(${quoteId})`, {
        method: 'PATCH',
        headers: headers(accessToken, true),
        body: JSON.stringify(quotePayload(quote)),
    })
    await ensureSuccess(response, 'Failed to update quote')
}
