const MAX_PDF_BYTES = 5 * 1024 * 1024
const MAX_PDF_PAGES = 5
const MAX_TEXT_ITEMS = 20_000
const PDF_PARSE_TIMEOUT_MS = 15_000
const EXTRACTION_VERSION = 'greentree-layout-v3'
const { createHash, randomBytes } = require('node:crypto')
const { COMPARISONS, compareUnresolvedCorrections } = require('./chargeableInvoiceComparison')

const MATCHED_EXACTLY = 122830000
const UNMATCHED = 122830002
const AMBIGUOUS = 122830003
const IMPORT_STAGING = 122830000
const IMPORT_ACTIVE = 122830001
const IMPORT_FAILED = 122830002

class UnknownImportOutcomeError extends Error {}

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
        body: JSON.stringify(body),
    }
}

function requestHeader(request, name) {
    const target = name.toLowerCase()
    const entry = Object.entries(request.headers || {}).find(([key]) => key.toLowerCase() === target)
    return typeof entry?.[1] === 'string' ? entry[1].trim() : ''
}

function dataverseOrigin() {
    try {
        const url = new URL((process.env.DATAVERSE_URL || process.env.VITE_DATAVERSE_URL || '').trim())
        return url.protocol === 'https:' ? url.origin : ''
    } catch {
        return ''
    }
}

function importEnabled() {
    return process.env.CHARGEABLE_INVOICE_PREVIEW_ENABLED === 'true'
}

async function validateManager(request) {
    const authorization = requestHeader(request, 'authorization')
    const origin = dataverseOrigin()
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
        return { error: jsonResponse(401, { error: 'Authentication is required.' }, { 'WWW-Authenticate': 'Bearer' }) }
    }
    if (!origin) return { error: jsonResponse(500, { error: 'Authentication validation is not configured.' }) }
    let identityResponse
    try {
        identityResponse = await fetch(`${origin}/api/data/v9.2/WhoAmI`, {
            headers: { Authorization: authorization, Accept: 'application/json' },
        })
    } catch {
        return { error: jsonResponse(503, { error: 'Authentication could not be validated.' }) }
    }
    if (!identityResponse.ok) {
        const status = identityResponse.status === 401 || identityResponse.status === 403 ? 401 : 503
        return { error: jsonResponse(status, {
            error: status === 401 ? 'The authenticated session is invalid or expired.' : 'Authentication could not be validated.',
        }, status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) }
    }
    const identity = await identityResponse.json().catch(() => null)
    if (typeof identity?.UserId !== 'string' || !identity.UserId) {
        return { error: jsonResponse(401, { error: 'The authenticated identity is invalid.' }) }
    }
    let accessResponse
    try {
        accessResponse = await fetch(
            `${origin}/api/data/v9.2/gr_chargeableinvoicereviews?$select=gr_chargeableinvoicereviewid&$top=1`,
            { headers: { Authorization: authorization, Accept: 'application/json' } },
        )
    } catch {
        return { error: jsonResponse(503, { error: 'Chargeable Invoice Review access could not be validated.' }) }
    }
    if (!accessResponse.ok) {
        const status = accessResponse.status === 401 || accessResponse.status === 403 ? 403 : 503
        return { error: jsonResponse(status, {
            error: status === 403
                ? 'Chargeable Invoice Manager access is required.'
                : 'Chargeable Invoice Review access could not be validated.',
        }) }
    }
    return { authorization, origin }
}

function validatePdfBody(body) {
    if (!body || typeof body !== 'object') return { error: 'The request body is invalid.' }
    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
    const contentType = typeof body.contentType === 'string' ? body.contentType.trim().toLowerCase() : ''
    const base64 = typeof body.base64 === 'string' ? body.base64.trim() : ''
    const declaredBytes = body.byteLength
    if (!fileName || fileName.length > 260 || !fileName.toLowerCase().endsWith('.pdf')) {
        return { error: 'Choose a PDF file with a valid filename.' }
    }
    if (contentType !== 'application/pdf') return { error: 'Only PDF invoices are supported.' }
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 1 || declaredBytes > MAX_PDF_BYTES) {
        return { error: 'Each PDF must be no larger than 5 MiB.' }
    }
    if (!base64 || base64.length % 4 !== 0 || base64.length > Math.ceil(MAX_PDF_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        return { error: 'The PDF payload is invalid.' }
    }
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length !== declaredBytes || buffer.length > MAX_PDF_BYTES || buffer.toString('base64') !== base64
        || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return { error: 'The PDF payload does not match the selected file.' }
    }
    return { fileName, buffer }
}

function groupWordsIntoLines(words) {
    const groups = []
    for (const word of [...words].sort((left, right) => right.y - left.y || left.x - right.x)) {
        let line = groups.find((candidate) => Math.abs(candidate.y - word.y) <= 2.5)
        if (!line) {
            line = { y: word.y, words: [] }
            groups.push(line)
        }
        line.words.push(word)
    }
    return groups
        .sort((left, right) => right.y - left.y)
        .map((line) => {
            const ordered = line.words.sort((left, right) => left.x - right.x)
            let text = ''
            let right = null
            for (const word of ordered) {
                if (text && right != null && word.x - right > 1.5) text += ' '
                text += word.text
                right = word.x + word.width
            }
            return { y: line.y, text: text.replace(/\s+/g, ' ').trim(), words: ordered }
        })
        .filter((line) => line.text)
}

async function extractPdfLayout(buffer) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true,
        isEvalSupported: false,
        verbosity: 0,
    })
    let document
    let destroyed = false
    const timeout = setTimeout(() => {
        destroyed = true
        void loadingTask.destroy().catch(() => {})
    }, PDF_PARSE_TIMEOUT_MS)
    try {
        document = await loadingTask.promise
        if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
            throw new Error(`PDF must contain between 1 and ${MAX_PDF_PAGES} pages.`)
        }
        const pages = []
        let itemCount = 0
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber)
            const content = await page.getTextContent({ disableNormalization: false })
            const words = []
            for (const item of content.items) {
                if (typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) continue
                itemCount += 1
                if (itemCount > MAX_TEXT_ITEMS) throw new Error('PDF contains too much text to review safely.')
                words.push({
                    text: item.str,
                    x: Number(item.transform[4]),
                    y: Number(item.transform[5]),
                    width: Number(item.width) || 0,
                    height: Number(item.height) || 0,
                })
            }
            pages.push({ pageNumber, lines: groupWordsIntoLines(words) })
        }
        if (!pages.some((page) => page.lines.length)) throw new Error('PDF contains no extractable text.')
        return pages
    } finally {
        clearTimeout(timeout)
        if (!destroyed) await loadingTask.destroy()
    }
}

function lineValue(lines, expression) {
    for (const line of lines) {
        const match = expression.exec(line.text)
        if (match?.[1]) return match[1].trim()
    }
    return null
}

const EQUIPMENT_FIELD_BOUNDARY = '(?:Fleet\\s+No|Service\\s+Meter\\s+Reading|Meter(?:\\s+Reading)?|Make|Date\\s+of\\s+Job|Model|Service\\s+Interval|Serial(?:\\s+No)?|Next\\s+(?:Service\\s+)?Due)'

function equipmentLineValue(lines, labelExpression) {
    return lineValue(lines, new RegExp(
        `\\b${labelExpression}\\s*[:#]?\\s*(.+?)(?=\\s+${EQUIPMENT_FIELD_BOUNDARY}\\s*[:#]|$)`,
        'i',
    ))
}

function extractGreenTreeHeadline(lines) {
    const fleetIndex = lines.findIndex((line) => /\bFleet\s+No\s*[:#]/i.test(line.text))
    if (fleetIndex > 0) {
        for (let index = fleetIndex - 1; index >= 0; index -= 1) {
            const text = lines[index].text.trim()
            if (!text || /^Description\s+Quantity\s+Price\s+Total$/i.test(text)) continue
            return text
        }
    }
    return lineValue(lines, /^Description\s*[:#]\s*(.+)$/i)
}

function sectionText(lines, startExpression, endExpressions) {
    const start = lines.findIndex((line) => startExpression.test(line.text))
    if (start < 0) return null
    const values = []
    for (let index = start + 1; index < lines.length; index += 1) {
        if (endExpressions.some((expression) => expression.test(lines[index].text))) break
        values.push(lines[index].text)
    }
    return values.join(' ').replace(/\s+/g, ' ').trim() || null
}

function extractLines(lines) {
    const extracted = []
    let currentType = 'Other'
    for (const line of lines) {
        if (/^Labou?r\b/i.test(line.text)) currentType = 'Labour'
        else if (/^Parts?\b/i.test(line.text)) currentType = 'Parts'
        const match = /^(?:(Labou?r|Parts?)\s+)?(.+?)\s+(-?\$?[\d,]+(?:\.\d+)?)\s+(-?\$?[\d,]+(?:\.\d+)?)\s+(-?\$?[\d,]+(?:\.\d+)?)$/.exec(line.text)
        if (!match || /^(Subtotal|GST|Invoice Total|Total)\b/i.test(line.text)) continue
        extracted.push({
            type: match[1] || currentType,
            description: match[2],
            quantity: match[3],
            unitPrice: match[4],
            extendedPrice: match[5],
            rawText: line.text,
            confidence: 0.8,
        })
    }
    return extracted
}

function extractGreenTreeCandidate(pages) {
    const lines = pages.flatMap((page) => page.lines)
    return {
        invoiceNumber: lineValue(lines, /\bInvoice\s+No\s*[:#]?\s*([A-Z0-9._/-]+)/i),
        invoiceDate: lineValue(lines, /^(?!.*Date\s+of\s+Job).*\bDate\s*[:#]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i),
        rawOrderNumber: lineValue(lines, /\bOrder\s+No\s*[:#]?\s*(.*)$/i),
        greenTreeReference: lineValue(lines, /\bOur\s+Ref\s*[:#]?\s*([A-Z0-9._/-]+)/i),
        accountSnapshot: lineValue(lines, /\bAccount\s*[:#]?\s*([A-Z0-9._/-]+)/i),
        headline: extractGreenTreeHeadline(lines),
        fleet: equipmentLineValue(lines, 'Fleet\\s+No'),
        make: equipmentLineValue(lines, 'Make'),
        model: equipmentLineValue(lines, 'Model'),
        serial: equipmentLineValue(lines, 'Serial(?:\\s+No)?'),
        meter: lineValue(lines, /\b(?:Service\s+)?Meter(?:\s+Reading)?\s*[:#]?\s*([\d,.]+)/i),
        dateOfJob: lineValue(lines, /\bDate\s+of\s+Job\s*[:#]?\s*(?:[:#]\s*)?(\d{1,2}(?:[/-]\d{1,2}[/-]\d{2,4}|\s+[A-Za-z]{3,9}\s+\d{4}))/i),
        serviceInterval: lineValue(lines, /\bService\s+Interval\s*[:#]?\s*([^|]+?)(?=\s{2,}|\bNext\b|$)/i),
        nextDue: lineValue(lines, /\bNext\s+(?:Service\s+)?Due\s*[:#]?\s*(.+)$/i),
        repairDescription: sectionText(lines, /Description\s+of\s+Repair\s+Work/i, [/Work\s+Completed/i, /^Labou?r\b/i, /^Parts?\b/i, /^Subtotal\b/i]),
        workCompleted: sectionText(lines, /Work\s+Completed/i, [/^Labou?r\b/i, /^Parts?\b/i, /^Subtotal\b/i]),
        subtotal: lineValue(lines, /^Subtotal\s*[:$]?\s*([\d,.-]+)/i),
        gstRate: lineValue(lines, /^GST(?!\s+Reg\b)[^%]*?([\d.]+)\s*%/i),
        gstAmount: lineValue(lines, /^GST(?!\s+Reg\b).*?(-?\$?[\d,]+(?:\.\d+)?)\s*$/i),
        total: lineValue(lines, /^(?:Invoice\s+)?Total\s*[:$]?\s*([\d,.-]+)/i),
        lines: extractLines(lines),
        extractionVersion: EXTRACTION_VERSION,
        sourceEvidence: {
            parserVersion: EXTRACTION_VERSION,
            pageCount: pages.length,
            pages,
        },
    }
}

function escapeOData(value) {
    return value.replaceAll("'", "''")
}

function parseNumber(value) {
    if (value == null || value === '') return null
    const normalized = String(value).trim().replace(/[,$()\s]/g, '')
    if (!/^[+-]?\d+(?:\.\d{1,5})?$/.test(normalized)) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? (/^\(.*\)$/.test(String(value).trim()) ? -Math.abs(parsed) : parsed) : null
}

function parseDateOnly(value) {
    const normalized = String(value || '').trim()
    const namedMatch = /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/.exec(normalized)
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    const namedMonth = namedMatch
        ? monthNames.findIndex((month) => month.startsWith(namedMatch[2].toLowerCase())) + 1
        : 0
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(normalized)
        || (namedMatch && namedMonth ? [namedMatch[0], namedMatch[1], String(namedMonth), namedMatch[3]] : null)
    if (!match) return null
    const day = Number(match[1]); const month = Number(match[2]); const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function stableLineKeys(lines) {
    const counts = new Map()
    return lines.map((line) => {
        const type = /^labou?r$/i.test(line.type) ? 122830000 : /^parts?$/i.test(line.type) ? 122830001 : 122830002
        const canonical = `${type}|${String(line.description || '').replace(/\s+/g, ' ').trim().toLowerCase()}`
        let hash = 2166136261
        for (let index = 0; index < canonical.length; index += 1) { hash ^= canonical.charCodeAt(index); hash = Math.imul(hash, 16777619) }
        const base = `line-${(hash >>> 0).toString(36)}`
        const occurrence = (counts.get(base) || 0) + 1
        counts.set(base, occurrence)
        return occurrence === 1 ? base : `${base}-${occurrence}`
    })
}

function normalizedImport(candidate) {
    const invoiceNumber = String(candidate.invoiceNumber || '').trim()
    const invoiceDate = parseDateOnly(candidate.invoiceDate)
    const reference = String(candidate.greenTreeReference || '').trim()
    const subtotal = parseNumber(candidate.subtotal); const gstAmount = parseNumber(candidate.gstAmount); const total = parseNumber(candidate.total)
    if (!invoiceNumber || invoiceNumber.length > 50 || !invoiceDate || !reference || reference.length > 50) throw new Error('Required invoice identity fields are invalid.')
    if (subtotal != null && gstAmount != null && total != null && Math.abs(subtotal + gstAmount - total) > 0.02) throw new Error('Invoice totals do not balance.')
    if (!Array.isArray(candidate.lines) || candidate.lines.length > 200) throw new Error('The invoice contains too many lines to import safely.')
    const lineKeys = stableLineKeys(candidate.lines)
    const lines = candidate.lines.map((line, index) => {
        const description = String(line.description || '').replace(/\s+/g, ' ').trim()
        if (!description || description.length > 4000) throw new Error('An invoice line description is invalid.')
        const quantity = parseNumber(line.quantity); const unitPrice = parseNumber(line.unitPrice); const extendedPrice = parseNumber(line.extendedPrice)
        return {
            gr_name: description.slice(0, 200), gr_linekey: lineKeys[index],
            gr_linetype: /^labou?r$/i.test(line.type) ? 122830000 : /^parts?$/i.test(line.type) ? 122830001 : 122830002,
            gr_description: description, gr_quantity: quantity, gr_unitprice: unitPrice, gr_extendedprice: extendedPrice,
            gr_sortorder: index, gr_confidence: line.confidence ?? null, gr_rawtext: line.rawText || null,
        }
    })
    const extractionJson = JSON.stringify(candidate.sourceEvidence)
    if (extractionJson.length > 1_048_576) throw new Error('The extracted source evidence is too large to retain safely.')
    return {
        invoiceNumber, invoiceDate, reference, lines,
        revision: {
            gr_extractionversion: candidate.extractionVersion, gr_extractionconfidence: null,
            gr_invoicenumber: invoiceNumber, gr_invoicedate: invoiceDate, gr_rawordernumber: candidate.rawOrderNumber || null,
            gr_greentreereference: reference, gr_accountsnapshot: candidate.accountSnapshot || null,
            gr_customersnapshot: candidate.customerSnapshot || null, gr_sitesnapshot: candidate.siteSnapshot || null,
            gr_headline: candidate.headline || null, gr_fleet: candidate.fleet || null, gr_make: candidate.make || null,
            gr_model: candidate.model || null, gr_serial: candidate.serial || null, gr_meter: parseNumber(candidate.meter),
            gr_dateofjob: candidate.dateOfJob ? parseDateOnly(candidate.dateOfJob) : null,
            gr_serviceinterval: candidate.serviceInterval || null, gr_nextdue: candidate.nextDue || null,
            gr_repairdescription: candidate.repairDescription || null, gr_workcompleted: candidate.workCompleted || null,
            gr_subtotal: subtotal, gr_gstrate: parseNumber(candidate.gstRate), gr_gstamount: gstAmount, gr_total: total,
            gr_extractionjson: extractionJson,
        },
    }
}

async function dataverseJson(url, authorization, options = {}) {
    const response = await fetch(url, { ...options, headers: { Authorization: authorization, Accept: 'application/json', ...(options.headers || {}) } })
    const text = await response.text()
    if (!response.ok) throw new Error(`Dataverse request failed (${response.status}).`)
    return text ? JSON.parse(text) : null
}

function finalizationBatch(reviewId, reviewEtag, documentId, revisionNumber, normalized, firstImport, comparisons = []) {
    const boundary = `batch_${randomBytes(12).toString('hex')}`
    const changeset = `changeset_${randomBytes(12).toString('hex')}`
    const parts = []
    const add = (contentId, method, path, fields, extraHeaders = []) => parts.push([
        `--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', `Content-ID: ${contentId}`, '',
        `${method} ${path} HTTP/1.1`, 'Content-Type: application/json;type=entry', ...extraHeaders, '', JSON.stringify(fields),
    ].join('\r\n'))
    add(1, 'POST', 'gr_chargeableinvoicerevisions', {
        gr_name: `${normalized.invoiceNumber} revision ${revisionNumber}`, 'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${reviewId})`,
        'gr_SourceDocument@odata.bind': `/gr_chargeableinvoicedocuments(${documentId})`, gr_revisionnumber: revisionNumber, ...normalized.revision,
    })
    normalized.lines.forEach((line, index) => add(index + 2, 'POST', 'gr_chargeableinvoicelines', { ...line, 'gr_Revision@odata.bind': '$1' }))
    const nextId = normalized.lines.length + 2
    add(nextId, 'PATCH', `gr_chargeableinvoicedocuments(${documentId})`, { 'gr_Revision@odata.bind': '$1', gr_uploadstatus: 122830001 })
    add(nextId + 1, 'PATCH', `gr_chargeableinvoicereviews(${reviewId})`, { 'gr_CurrentRevision@odata.bind': '$1', gr_importstatus: IMPORT_ACTIVE }, reviewEtag ? [`If-Match: ${reviewEtag}`] : [])
    add(nextId + 2, 'POST', 'gr_chargeableinvoiceactivities', {
        gr_name: firstImport ? 'Invoice uploaded' : 'Revised invoice uploaded',
        'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${reviewId})`, 'gr_Revision@odata.bind': '$1',
        'gr_Document@odata.bind': `/gr_chargeableinvoicedocuments(${documentId})`, gr_event: firstImport ? 122830000 : 122830009,
        gr_occurredon: new Date().toISOString(),
    })
    if (!firstImport) {
        comparisons.forEach((comparison, index) => add(nextId + 3 + index, 'PATCH', `gr_chargeableinvoicecorrections(${comparison.correctionId})`, {
            gr_comparisonstatus: comparison.comparison,
            ...(comparison.comparison === COMPARISONS.MATCHED_IN_REVISION ? { 'gr_MatchedRevision@odata.bind': '$1' } : {}),
        }, [`If-Match: ${comparison.etag}`]))
        const matched = comparisons.filter((comparison) => comparison.comparison === COMPARISONS.MATCHED_IN_REVISION).length
        add(nextId + 3 + comparisons.length, 'POST', 'gr_chargeableinvoiceactivities', {
            gr_name: 'Revision compared', 'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${reviewId})`,
            'gr_Revision@odata.bind': '$1', gr_event: 122830010,
            gr_detail: `${matched} correction${matched === 1 ? '' : 's'} matched; ${comparisons.length - matched} not made.`,
            gr_occurredon: new Date().toISOString(),
        })
    }
    return { boundary, payload: [`--${boundary}`, `Content-Type: multipart/mixed;boundary=${changeset}`, '', ...parts, `--${changeset}--`, `--${boundary}--`, ''].join('\r\n') }
}

async function unresolvedCorrections(reviewId, origin, authorization) {
    const url = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicecorrections`)
    url.searchParams.set('$select', [
        'gr_chargeableinvoicecorrectionid', 'gr_correctiontype', 'gr_fieldkey', 'gr_originalsnapshot',
        'gr_requestedtext', 'gr_requestedlinetype', 'gr_requesteddescription', 'gr_requestedquantity',
        'gr_requestedunitprice', 'gr_comparisonstatus',
    ].join(','))
    url.searchParams.set('$filter', `_gr_review_value eq ${reviewId} and (gr_comparisonstatus eq ${COMPARISONS.OUTSTANDING} or gr_comparisonstatus eq ${COMPARISONS.NOT_MADE})`)
    url.searchParams.set('$top', '201')
    const body = await dataverseJson(url, authorization)
    const corrections = Array.isArray(body?.value) ? body.value : []
    if (corrections.length > 200) throw new Error('The review has too many unresolved corrections to compare safely.')
    if (corrections.some((correction) => !correction['@odata.etag'])) throw new Error('Correction concurrency data is unavailable.')
    return corrections
}

async function reconcileFinalization(origin, authorization, reviewId, revisionNumber) {
    const url = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicerevisions`)
    url.searchParams.set('$select', 'gr_chargeableinvoicerevisionid,gr_revisionnumber')
    url.searchParams.set('$filter', `_gr_review_value eq ${reviewId} and gr_revisionnumber eq ${revisionNumber}`)
    url.searchParams.set('$top', '2')
    let response
    try { response = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' } }) }
    catch { throw new UnknownImportOutcomeError('Finalization outcome could not be reconciled.') }
    if (!response.ok) throw new UnknownImportOutcomeError('Finalization outcome could not be reconciled.')
    const rows = (await response.json().catch(() => null))?.value
    if (!Array.isArray(rows) || rows.length > 1) throw new UnknownImportOutcomeError('Finalization outcome could not be reconciled.')
    return rows.length === 1
}

async function exactJobMatch(reference, origin, authorization) {
    const normalized = typeof reference === 'string' ? reference.trim() : ''
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(normalized)) {
        return { status: UNMATCHED, job: null, reason: 'Our Ref is missing or is not a supported Job Number.' }
    }
    const url = new URL(`${origin}/api/data/v9.2/gr_jobs`)
    url.searchParams.set('$select', 'gr_jobid,gr_jobnumber,gr_description,_gr_site_value,_gr_equipment_value')
    url.searchParams.set('$expand', 'gr_Site($select=gr_siteid,gr_name;$expand=gr_Customer($select=gr_customerid,gr_name)),gr_Equipment($select=gr_equipmentid,gr_fleet,gr_make,gr_model,gr_serial)')
    url.searchParams.set('$filter', `gr_jobnumber eq '${escapeOData(normalized)}'`)
    url.searchParams.set('$top', '2')
    const response = await fetch(url, { headers: { Authorization: authorization, Accept: 'application/json' } })
    if (!response.ok) throw new Error('Exact Job matching failed.')
    const body = await response.json()
    const matches = Array.isArray(body.value) ? body.value : []
    if (matches.length === 1) return { status: MATCHED_EXACTLY, job: matches[0], reason: null }
    if (matches.length > 1) return { status: AMBIGUOUS, job: null, reason: 'More than one Job has this Job Number.' }
    return { status: UNMATCHED, job: null, reason: 'No exact Job Number match was found.' }
}

async function existingInvoice(invoiceNumber, origin, authorization) {
    const normalized = typeof invoiceNumber === 'string' ? invoiceNumber.trim() : ''
    if (!normalized || normalized.length > 50) return { kind: 'unresolved', reason: 'Invoice Number is missing or invalid.' }
    const reviewUrl = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicereviews`)
    reviewUrl.searchParams.set('$select', 'gr_chargeableinvoicereviewid,gr_invoicenumber,gr_importstatus,_gr_currentrevision_value')
    reviewUrl.searchParams.set('$filter', `gr_invoicenumber eq '${escapeOData(normalized)}'`)
    reviewUrl.searchParams.set('$top', '2')
    const response = await fetch(reviewUrl, { headers: { Authorization: authorization, Accept: 'application/json' } })
    if (!response.ok) throw new Error('Invoice duplicate lookup failed.')
    const reviews = (await response.json()).value ?? []
    if (reviews.length > 1) return { kind: 'conflict', reason: 'More than one review has this Invoice Number.' }
    if (!reviews.length) return { kind: 'new', proposedRevisionNumber: 1, review: null, reason: null }
    const review = reviews[0]
    const revisionUrl = new URL(`${origin}/api/data/v9.2/gr_chargeableinvoicerevisions`)
    revisionUrl.searchParams.set('$select', 'gr_revisionnumber')
    revisionUrl.searchParams.set('$filter', `_gr_review_value eq ${review.gr_chargeableinvoicereviewid}`)
    revisionUrl.searchParams.set('$orderby', 'gr_revisionnumber desc')
    revisionUrl.searchParams.set('$top', '1')
    const revisionResponse = await fetch(revisionUrl, { headers: { Authorization: authorization, Accept: 'application/json' } })
    if (!revisionResponse.ok) throw new Error('Invoice revision lookup failed.')
    const revisions = (await revisionResponse.json()).value ?? []
    const latest = Number(revisions[0]?.gr_revisionnumber) || 0
    const status = review.gr_importstatus
    if (status === IMPORT_STAGING || status === IMPORT_FAILED) {
        return { kind: 'retry', proposedRevisionNumber: Math.max(1, latest + 1), review, reason: 'An incomplete import can be retried.' }
    }
    if (status !== IMPORT_ACTIVE) return { kind: 'conflict', review, reason: 'The existing review has an unsupported import status.' }
    return { kind: 'revision', proposedRevisionNumber: latest + 1, review, reason: 'This Invoice Number already exists. Confirm a new revision or skip it.' }
}

async function manualJobLookup(jobNumber, origin, authorization) {
    const match = await exactJobMatch(jobNumber, origin, authorization)
    return match.status === MATCHED_EXACTLY
        ? { ...match, status: 122830001 }
        : match
}

async function importInvoice(request, manager) {
    const validated = validatePdfBody(request.body)
    if (validated.error) return jsonResponse(400, { error: validated.error })
    const decision = request.body?.decision
    const jobId = typeof request.body?.jobId === 'string' ? request.body.jobId.trim() : ''
    const jobNumber = typeof request.body?.jobNumber === 'string' ? request.body.jobNumber.trim() : ''
    if (!['new', 'revision', 'retry'].includes(decision) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId)) {
        return jsonResponse(400, { error: 'A valid import decision and exact Job are required.' })
    }
    let candidate
    let normalized
    let duplicate
    let jobMatch
    try {
        candidate = extractGreenTreeCandidate(await extractPdfLayout(validated.buffer))
        normalized = normalizedImport(candidate)
        ;[duplicate, jobMatch] = await Promise.all([
            existingInvoice(normalized.invoiceNumber, manager.origin, manager.authorization),
            exactJobMatch(jobNumber, manager.origin, manager.authorization),
        ])
    } catch (error) {
        return jsonResponse(422, { error: error instanceof Error ? error.message : 'The invoice could not be validated for import.' })
    }
    if (jobMatch.job?.gr_jobid?.toLowerCase() !== jobId.toLowerCase()) return jsonResponse(409, { error: 'The selected Job no longer matches exactly.' })
    if (duplicate.kind !== decision) return jsonResponse(409, { error: 'The invoice changed since preview. Preview it again before importing.' })
    const firstImport = decision !== 'revision'
    let reviewId = duplicate.review?.gr_chargeableinvoicereviewid
    let reviewEtag = duplicate.review?.['@odata.etag']
    let documentId
    let comparisons = []
    try {
        if (!reviewId) {
            const review = await dataverseJson(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicereviews`, manager.authorization, {
                method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify({
                    gr_name: normalized.invoiceNumber, gr_invoicenumber: normalized.invoiceNumber, gr_invoicedate: normalized.invoiceDate,
                    gr_greentreereference: normalized.reference, gr_matchstatus: jobNumber === normalized.reference ? MATCHED_EXACTLY : 122830001,
                    gr_importstatus: IMPORT_STAGING, gr_porequired: null, gr_photosrequired: null, gr_photosstatus: null,
                    'gr_Job@odata.bind': `/gr_jobs(${jobId})`,
                    ...(jobMatch.job._gr_site_value ? { 'gr_Site@odata.bind': `/gr_sites(${jobMatch.job._gr_site_value})` } : {}),
                    ...(jobMatch.job._gr_equipment_value ? { 'gr_Equipment@odata.bind': `/gr_equipments(${jobMatch.job._gr_equipment_value})` } : {}),
                    ...(jobMatch.job.gr_Site?.gr_Customer?.gr_customerid ? { 'gr_Customer@odata.bind': `/gr_customers(${jobMatch.job.gr_Site.gr_Customer.gr_customerid})` } : {}),
                }),
            })
            reviewId = review?.gr_chargeableinvoicereviewid
            reviewEtag = review?.['@odata.etag']
        }
        if (!reviewId) throw new Error('Review creation returned no identity.')
        if (!firstImport) {
            const corrections = await unresolvedCorrections(reviewId, manager.origin, manager.authorization)
            comparisons = compareUnresolvedCorrections(corrections, normalized.revision, normalized.lines)
        }
        const document = await dataverseJson(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicedocuments`, manager.authorization, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({
                gr_name: validated.fileName, 'gr_Review@odata.bind': `/gr_chargeableinvoicereviews(${reviewId})`,
                gr_documenttype: 122830000, gr_contenttype: 'application/pdf', gr_bytecount: validated.buffer.length,
                gr_sourcesnapshothash: createHash('sha256').update(validated.buffer).digest('hex'), gr_uploadstatus: 122830000,
            }),
        })
        documentId = document?.gr_chargeableinvoicedocumentid
        if (!documentId) throw new Error('Document creation returned no identity.')
        const upload = await fetch(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicedocuments(${documentId})/gr_file?x-ms-file-name=${encodeURIComponent(validated.fileName)}`, {
            method: 'PATCH', headers: { Authorization: manager.authorization, Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, body: validated.buffer,
        })
        if (!upload.ok) throw new Error('The source PDF file upload failed.')
        const batch = finalizationBatch(reviewId, reviewEtag, documentId, duplicate.proposedRevisionNumber, normalized, firstImport, comparisons)
        let finalized
        let result
        try {
            finalized = await fetch(`${manager.origin}/api/data/v9.2/$batch`, {
                method: 'POST', headers: { Authorization: manager.authorization, Accept: 'application/json', 'Content-Type': `multipart/mixed;boundary=${batch.boundary}` }, body: batch.payload,
            })
            result = await finalized.text()
        } catch {
            if (await reconcileFinalization(manager.origin, manager.authorization, reviewId, duplicate.proposedRevisionNumber)) {
                return jsonResponse(201, { imported: true, reviewId, revisionNumber: duplicate.proposedRevisionNumber, reconciled: true })
            }
            throw new Error('Invoice metadata finalization failed.')
        }
        if (!finalized.ok || /HTTP\/1\.1 [45]\d\d/.test(result)) throw new Error('Invoice metadata finalization failed.')
        return jsonResponse(201, {
            imported: true, reviewId, revisionNumber: duplicate.proposedRevisionNumber,
            comparison: firstImport ? null : {
                matched: comparisons.filter((item) => item.comparison === COMPARISONS.MATCHED_IN_REVISION).length,
                notMade: comparisons.filter((item) => item.comparison === COMPARISONS.NOT_MADE).length,
            },
        })
    } catch (error) {
        if (error instanceof UnknownImportOutcomeError) {
            return jsonResponse(503, { error: 'The invoice import outcome is unknown. Refresh before retrying.' })
        }
        if (documentId) {
            await fetch(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicedocuments(${documentId})`, {
                method: 'PATCH', headers: { Authorization: manager.authorization, 'Content-Type': 'application/json' },
                body: JSON.stringify({ gr_uploadstatus: 122830002, gr_uploaderror: 'Import did not complete. Retry from the invoice intake screen.' }),
            }).catch(() => {})
        }
        if (firstImport && reviewId) {
            await fetch(`${manager.origin}/api/data/v9.2/gr_chargeableinvoicereviews(${reviewId})`, {
                method: 'PATCH', headers: { Authorization: manager.authorization, 'Content-Type': 'application/json' },
                body: JSON.stringify({ gr_importstatus: IMPORT_FAILED }),
            }).catch(() => {})
        }
        return jsonResponse(503, { error: 'The invoice import did not complete. Its recoverable staging record can be retried.' })
    }
}

async function preview(request) {
    if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' }, { Allow: 'POST' })
    const manager = await validateManager(request)
    if (manager.error) return manager.error
    if (request.body?.action === 'jobLookup') {
        try {
            return jsonResponse(200, { match: await manualJobLookup(request.body.jobNumber, manager.origin, manager.authorization) })
        } catch {
            return jsonResponse(503, { error: 'The Job lookup could not be completed.' })
        }
    }
    if (request.body?.action === 'import') {
        if (!importEnabled()) {
            return jsonResponse(503, { error: 'Invoice PDF import is not enabled.' })
        }
        return importInvoice(request, manager)
    }
    const validated = validatePdfBody(request.body)
    if (validated.error) return jsonResponse(400, { error: validated.error })
    let pages
    try {
        pages = await extractPdfLayout(validated.buffer)
    } catch {
        return jsonResponse(422, { error: 'The PDF could not be read as a supported text-based GreenTree invoice.' })
    }
    const candidate = extractGreenTreeCandidate(pages)
    let match
    let duplicate
    try {
        ;[match, duplicate] = await Promise.all([
            exactJobMatch(candidate.greenTreeReference, manager.origin, manager.authorization),
            existingInvoice(candidate.invoiceNumber, manager.origin, manager.authorization),
        ])
    } catch {
        return jsonResponse(503, { error: 'The invoice was read, but its Job or duplicate status could not be checked.' })
    }
    return jsonResponse(200, {
        file: { fileName: validated.fileName, byteLength: validated.buffer.length, contentType: 'application/pdf' },
        candidate,
        match,
        duplicate,
    })
}

module.exports = {
    preview,
    jsonResponse,
    validateManager,
    test: {
        exactJobMatch,
        existingInvoice,
        manualJobLookup,
        normalizedImport,
        finalizationBatch,
        unresolvedCorrections,
        compareUnresolvedCorrections,
        reconcileFinalization,
        extractGreenTreeCandidate,
        extractPdfLayout,
        groupWordsIntoLines,
        validateManager,
        validatePdfBody,
    },
}
