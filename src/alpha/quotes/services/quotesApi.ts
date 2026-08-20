import type {
    Quote,
    QuoteInput,
    QuoteJob,
    QuoteLine,
    QuoteLineInput,
} from '../types/quote.types'
import { fetchAllDataversePages } from '../../shared/dataverse/fetchAllDataversePages.ts'
import type { Customer } from '../../jobs/types/customer.types'
import type { Equipment } from '../../jobs/types/equipment.types'

const DATAVERSE_URL = import.meta.env?.VITE_DATAVERSE_URL ?? 'https://dataverse.invalid'
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

const quoteJobFields = 'gr_jobid,gr_jobnumber,gr_description'
const quoteJobExpansions = 'gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'
const quoteEquipmentFields = 'gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial,statecode'
const quoteEquipmentExpansions = 'gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))'

function escapedODataText(value: string) {
    return value.trim().replace(/'/g, "''")
}

async function fetchBoundedRows<T>(
    collection: string,
    accessToken: string,
    options: { select: string; expand?: string; filter?: string; orderBy?: string; top?: number },
    action: string,
    signal?: AbortSignal,
): Promise<T[]> {
    const url = new URL(`${API_URL}/${collection}`)
    url.searchParams.set('$select', options.select)
    if (options.expand) url.searchParams.set('$expand', options.expand)
    if (options.filter) url.searchParams.set('$filter', options.filter)
    if (options.orderBy) url.searchParams.set('$orderby', options.orderBy)
    url.searchParams.set('$top', String(options.top ?? 8))
    const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: { ...headers(accessToken), 'Cache-Control': 'no-cache' },
        signal,
    })
    await ensureSuccess(response, action)
    return ((await response.json()) as { value?: T[] }).value ?? []
}

export async function fetchQuoteJobById(accessToken: string, jobId: string, signal?: AbortSignal): Promise<QuoteJob | undefined> {
    const rows = await fetchBoundedRows<QuoteJob>('gr_jobs', accessToken, {
        select: quoteJobFields,
        expand: quoteJobExpansions,
        filter: `gr_jobid eq ${jobId}`,
        top: 1,
    }, 'Failed to load the selected Job for this Quote', signal)
    return rows[0]
}

export async function searchQuoteJobs(accessToken: string, query: string, signal?: AbortSignal): Promise<QuoteJob[]> {
    const search = escapedODataText(query)
    const filter = search
        ? `(contains(gr_jobnumber,'${search}') or contains(gr_description,'${search}') or contains(gr_Equipment/gr_fleet,'${search}') or contains(gr_Equipment/gr_alternatefleetnumbers,'${search}') or contains(gr_Site/gr_Customer/gr_name,'${search}'))`
        : undefined
    return fetchBoundedRows<QuoteJob>('gr_jobs', accessToken, {
        select: quoteJobFields,
        expand: quoteJobExpansions,
        filter,
        orderBy: 'createdon desc',
    }, 'Job search failed', signal)
}

export async function fetchQuoteCustomerById(accessToken: string, customerId: string, signal?: AbortSignal): Promise<Customer | undefined> {
    const rows = await fetchBoundedRows<Customer>('gr_customers', accessToken, {
        select: 'gr_customerid,gr_name',
        filter: `gr_customerid eq ${customerId}`,
        top: 1,
    }, 'Failed to load the selected Customer for this Quote', signal)
    return rows[0]
}

export async function searchQuoteCustomers(accessToken: string, query: string, signal?: AbortSignal): Promise<Customer[]> {
    const search = escapedODataText(query)
    return fetchBoundedRows<Customer>('gr_customers', accessToken, {
        select: 'gr_customerid,gr_name',
        filter: search ? `contains(gr_name,'${search}')` : undefined,
        orderBy: 'gr_name',
    }, 'Customer search failed', signal)
}

export async function fetchQuoteEquipmentById(accessToken: string, equipmentId: string, signal?: AbortSignal): Promise<Equipment | undefined> {
    const rows = await fetchBoundedRows<Equipment>('gr_equipments', accessToken, {
        select: quoteEquipmentFields,
        expand: quoteEquipmentExpansions,
        filter: `gr_equipmentid eq ${equipmentId}`,
        top: 1,
    }, 'Failed to load the selected Equipment for this Quote', signal)
    return rows[0]
}

export async function searchQuoteEquipment(accessToken: string, query: string, signal?: AbortSignal): Promise<Equipment[]> {
    const search = escapedODataText(query)
    const identifiers = search
        ? `(contains(gr_fleet,'${search}') or contains(gr_alternatefleetnumbers,'${search}') or contains(gr_serial,'${search}') or contains(gr_make,'${search}') or contains(gr_model,'${search}') or contains(gr_Site/gr_Customer/gr_name,'${search}'))`
        : undefined
    return fetchBoundedRows<Equipment>('gr_equipments', accessToken, {
        select: quoteEquipmentFields,
        expand: quoteEquipmentExpansions,
        filter: identifiers ? `statecode eq 0 and ${identifiers}` : 'statecode eq 0',
        orderBy: 'gr_fleet',
    }, 'Equipment search failed', signal)
}

const quoteFields = [
    'gr_quoteid', 'gr_name', 'gr_quotenumber', 'gr_quotestatus', 'gr_revision',
    'gr_quotedate', 'gr_validuntil', 'gr_notes', 'gr_gstrate', 'gr_subtotal',
    'gr_gst', 'gr_total', 'createdon', '_gr_job_value', '_gr_customer_value',
    '_gr_equipment_value', '_createdby_value',
].join(',')

const quoteExpansions = 'gr_Job($select=gr_jobid,gr_jobnumber,gr_description;$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))),gr_Customer($select=gr_customerid,gr_name),gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial;$expand=gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))),createdby($select=systemuserid,fullname,azureactivedirectoryobjectid)'

export async function fetchQuotes(accessToken: string, signal?: AbortSignal): Promise<Quote[]> {
    return fetchAllDataversePages<Quote>(
        `${API_URL}/gr_quotes?$select=${quoteFields}&$expand=${quoteExpansions}&$orderby=createdon desc`,
        { cache: 'no-store', headers: headers(accessToken), signal },
        (response) => ensureSuccess(response, 'Failed to load quotes'),
    )
}

export async function fetchQuoteById(
    accessToken: string,
    quoteId: string,
    signal?: AbortSignal,
): Promise<Quote | undefined> {
    const url = new URL(`${API_URL}/gr_quotes`)
    url.searchParams.set('$select', quoteFields)
    url.searchParams.set('$expand', quoteExpansions)
    url.searchParams.set('$filter', `gr_quoteid eq ${quoteId}`)
    url.searchParams.set('$top', '2')
    const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: headers(accessToken),
        signal,
    })
    await ensureSuccess(response, 'Failed to load quote')
    const data = await response.json()
    const rows = (data.value ?? []) as Quote[]
    if (rows.length > 1 || data['@odata.nextLink']) throw new Error('Dataverse returned more than one Quote for this identity.')
    return rows[0]
}

export async function fetchQuotesForJob(
    accessToken: string,
    jobId: string,
    signal?: AbortSignal,
): Promise<Quote[]> {
    const fields = [
        'gr_quoteid', 'gr_name', 'gr_quotenumber', 'gr_quotestatus', 'gr_revision',
        'gr_quotedate', 'gr_validuntil', 'gr_notes', 'gr_gstrate', 'gr_subtotal',
        'gr_gst', 'gr_total', 'createdon', '_gr_job_value', '_gr_customer_value',
        '_gr_equipment_value', '_createdby_value',
    ].join(',')
    const url = new URL(`${API_URL}/gr_quotes`)
    url.searchParams.set('$select', fields)
    url.searchParams.set('$expand', 'createdby($select=systemuserid,fullname,azureactivedirectoryobjectid)')
    url.searchParams.set('$filter', `_gr_job_value eq ${jobId}`)
    url.searchParams.set('$orderby', 'createdon desc')
    url.searchParams.set('$top', '51')
    const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: headers(accessToken),
        signal,
    })
    await ensureSuccess(response, 'Failed to load quotes for this Job')
    const data = await response.json()
    const quotes = (data.value ?? []) as Quote[]
    if (quotes.length > 50 || data['@odata.nextLink']) {
        throw new Error('This Job has more than 50 linked quotes and cannot be displayed safely.')
    }
    return quotes
}

export async function fetchQuotesForCustomer(
    accessToken: string,
    customerId: string,
    signal?: AbortSignal,
): Promise<Quote[]> {
    const fields = [
        'gr_quoteid', 'gr_name', 'gr_quotenumber', 'gr_quotestatus', 'gr_revision',
        'gr_quotedate', 'gr_validuntil', 'gr_notes', 'gr_gstrate', 'gr_subtotal',
        'gr_gst', 'gr_total', 'createdon', '_gr_job_value', '_gr_customer_value',
        '_gr_equipment_value', '_createdby_value',
    ].join(',')
    const url = new URL(`${API_URL}/gr_quotes`)
    url.searchParams.set('$select', fields)
    url.searchParams.set('$expand', 'gr_Job($select=gr_jobid,gr_jobnumber,gr_description;$expand=gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial),gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))),gr_Customer($select=gr_customerid,gr_name),gr_Equipment($select=gr_equipmentid,gr_fleet,gr_alternatefleetnumbers,gr_make,gr_model,gr_serial;$expand=gr_Site($select=gr_siteid,gr_name,gr_address;$expand=gr_Customer($select=gr_customerid,gr_name))),createdby($select=systemuserid,fullname,azureactivedirectoryobjectid)')
    url.searchParams.set('$filter', `_gr_customer_value eq ${customerId}`)
    url.searchParams.set('$orderby', 'createdon desc')
    url.searchParams.set('$top', '501')
    const response = await fetch(url.toString(), {
        cache: 'no-store',
        headers: headers(accessToken),
        signal,
    })
    await ensureSuccess(response, 'Failed to load quotes for this Customer')
    const data = await response.json()
    const quotes = (data.value ?? []) as Quote[]
    if (quotes.length > 500 || data['@odata.nextLink']) {
        throw new Error('This Customer has more than 500 linked quotes and cannot be displayed safely.')
    }
    return quotes
}

export async function fetchQuoteLines(
    accessToken: string,
    quoteId: string,
    signal?: AbortSignal,
): Promise<QuoteLine[]> {
    const fields = [
        'gr_quotelineid', 'gr_name', '_gr_quote_value', '_gr_pricingitem_value',
        'gr_category', 'gr_description', 'gr_quantity', 'gr_unitlabel',
        'gr_unitprice', 'gr_extendedprice', 'gr_taxable', 'gr_sortorder',
    ].join(',')
    const url = new URL(`${API_URL}/gr_quotelines`)
    url.searchParams.set('$select', fields)
    url.searchParams.set('$filter', `_gr_quote_value eq ${quoteId}`)
    url.searchParams.set('$orderby', 'gr_sortorder asc')
    url.searchParams.set('$top', '201')
    const response = await fetch(url.toString(), { cache: 'no-store', headers: headers(accessToken), signal })
    await ensureSuccess(response, 'Failed to load quote lines')
    const data = await response.json()
    const lines = (data.value ?? []) as QuoteLine[]
    if (lines.length > 200 || data['@odata.nextLink']) {
        throw new Error('This Quote has more than 200 lines and cannot be displayed safely.')
    }
    return lines
}

function quotePayload(quote: QuoteInput) {
    return {
        gr_name: quote.name.trim(),
        'gr_Job@odata.bind': quote.jobId ? `/gr_jobs(${quote.jobId})` : null,
        'gr_Customer@odata.bind': quote.customerId ? `/gr_customers(${quote.customerId})` : null,
        'gr_Equipment@odata.bind': quote.equipmentId ? `/gr_equipments(${quote.equipmentId})` : null,
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

export async function deleteQuote(
    accessToken: string,
    quoteId: string,
    quoteLineIds: string[],
): Promise<void> {
    const suffix = crypto.randomUUID().replaceAll('-', '')
    const batchBoundary = `batch_${suffix}`
    const changeBoundary = `changeset_${suffix}`
    const paths = [
        ...quoteLineIds.map((lineId) => `gr_quotelines(${lineId})`),
        `gr_quotes(${quoteId})`,
    ]
    const lines = [
        `--${batchBoundary}`,
        `Content-Type: multipart/mixed; boundary=${changeBoundary}`,
        '',
    ]
    paths.forEach((path, index) => {
        lines.push(
            `--${changeBoundary}`,
            'Content-Type: application/http',
            'Content-Transfer-Encoding: binary',
            `Content-ID: ${index + 1}`,
            '',
            `DELETE /api/data/v9.2/${path} HTTP/1.1`,
            'Accept: application/json',
            'If-Match: *',
            '',
            '',
        )
    })
    lines.push(`--${changeBoundary}--`, `--${batchBoundary}--`, '')

    const response = await fetch(`${API_URL}/$batch`, {
        method: 'POST',
        headers: {
            ...headers(accessToken),
            'Content-Type': `multipart/mixed; boundary=${batchBoundary}`,
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
        body: lines.join('\r\n'),
    })
    const responseBody = await response.text()
    const statuses = [...responseBody.matchAll(/HTTP\/1\.1\s+(\d{3})/g)]
        .map((match) => Number(match[1]))
    const failure = statuses.find((status) => status >= 400)
    if (!response.ok || failure) {
        if ((failure ?? response.status) === 403) {
            throw new Error('You do not have permission to delete this quote.')
        }
        throw new Error('Dataverse rejected the atomic quote deletion.')
    }
    if (statuses.filter((status) => status >= 200 && status < 300).length !== paths.length) {
        throw new Error('Dataverse did not confirm every quote deletion operation.')
    }
}
