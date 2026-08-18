import type { SiteInductionDocument } from '../types/site.types'

const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL

const DOCUMENT_SUBJECT_PREFIX = 'Site Induction Documents'

type AnnotationListResponse = {
    value?: Array<{
        annotationid?: string
        filename?: string | null
        createdon?: string | null
        subject?: string | null
        mimetype?: string | null
        filesize?: number | null
        [key: string]: unknown
    }>
}

type AnnotationDownloadResponse = {
    documentbody?: string | null
    mimetype?: string | null
}

async function dataverseErrorMessage(response: Response, fallback: string) {
    const responseText = await response.text()
    if (!responseText) return fallback
    try {
        const parsed = JSON.parse(responseText)
        return parsed.error?.message || fallback
    } catch {
        return fallback
    }
}

function normalizeSubject(siteId: string) {
    return `${DOCUMENT_SUBJECT_PREFIX}: ${siteId}`
}

function normalizeODataString(value: string) {
    return value.replace(/'/g, "''")
}

function fileToBase64(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('The selected document could not be read.'))
        reader.onload = () => {
            const text = String(reader.result ?? '')
            const [, base64 = ''] = text.split(',')
            resolve(base64)
        }
        reader.readAsDataURL(file)
    })
}

function normalizeDocument(raw: {
    annotationid?: string
    filename?: string | null
    createdon?: string | null
    subject?: string | null
    mimetype?: string | null
    filesize?: number | null
}) {
    return {
        id: String(raw.annotationid || '').trim(),
        fileName: (raw.filename || 'Document').toString().trim(),
        createdOn: String(raw.createdon || '').trim(),
        subject: String(raw.subject || '').trim(),
        contentType: String(raw.mimetype || 'application/octet-stream').trim(),
        size: Number(raw.filesize || 0),
    } as SiteInductionDocument
}

function decodeBase64(value: string) {
    const bytes = atob(value)
    const buffer = new ArrayBuffer(bytes.length)
    const array = new Uint8Array(buffer)
    for (let index = 0; index < bytes.length; index += 1) {
        array[index] = bytes.charCodeAt(index)
    }
    return array
}

function extractAnnotationId(response: Response) {
    return response.text().then((responseText) => {
        if (responseText) {
            try {
                const parsed = JSON.parse(responseText)
                if (parsed?.annotationid) return String(parsed.annotationid)
            } catch {
                // Fall back to checking response headers.
            }
        }

        const headerId = response.headers.get('OData-EntityId') ?? response.headers.get('odata-entityid')
        return headerId?.match(/\(([^)]+)\)/)?.[1]?.trim()
    })
}

export async function fetchSiteInductionDocuments(
    accessToken: string,
    siteId: string,
): Promise<SiteInductionDocument[]> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const filter = encodeURIComponent(
        `isdocument eq true and subject eq '${normalizeODataString(normalizeSubject(siteId))}'`,
    )
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/annotations?$select=annotationid,filename,createdon,mimetype,subject,filesize&$filter=${filter}&$orderby=createdon desc`,
        { cache: 'no-store', headers },
    )
    if (!result.ok) {
        throw new Error(await dataverseErrorMessage(result, 'Site induction documents could not be loaded.'))
    }
    const data = await result.json() as AnnotationListResponse
    return (data.value ?? []).map(normalizeDocument)
}

async function createSiteInductionDocument(accessToken: string, siteId: string, file: File) {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    }
    const base64 = await fileToBase64(file)
    const subject = normalizeSubject(siteId)
    const attempts = [
        {
            'objectid_gr_site@odata.bind': `/gr_sites(${siteId})`,
            isdocument: true,
            subject,
            filename: file.name,
            mimetype: file.type || 'application/octet-stream',
            documentbody: base64,
            notetext: 'Site induction/safety document',
        },
        {
            isdocument: true,
            subject,
            filename: file.name,
            mimetype: file.type || 'application/octet-stream',
            documentbody: base64,
            notetext: 'Site induction/safety document',
        },
    ] as const

    const fallbackError = 'The document could not be uploaded. Ensure file access is configured for this Site.'
    for (const [index, body] of attempts.entries()) {
        const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/annotations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        })

        if (result.ok) {
            const annotationid = await extractAnnotationId(result)
            if (annotationid) {
                return { annotationid }
            }
            throw new Error('The Site document was created, but its record ID could not be resolved.')
        }

        if (index === 0 && result.status !== 400) {
            throw new Error(await dataverseErrorMessage(result, fallbackError))
        }
        if (index === 0) continue
        throw new Error(await dataverseErrorMessage(result, fallbackError))
    }

    throw new Error(fallbackError)
}

export async function uploadSiteInductionDocuments(
    accessToken: string,
    siteId: string,
    files: File[],
): Promise<SiteInductionDocument[]> {
    const cleaned = files.filter((file) => file && file.name.trim())
    if (!cleaned.length) return []
    await Promise.all(cleaned.map((file) => createSiteInductionDocument(accessToken, siteId, file)))
    return fetchSiteInductionDocuments(accessToken, siteId)
}

export async function downloadSiteInductionDocument(accessToken: string, documentId: string): Promise<Blob> {
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    const result = await fetch(
        `${DATAVERSE_URL}/api/data/v9.2/annotations(${documentId})?$select=documentbody,mimetype`,
        { cache: 'no-store', headers },
    )
    if (!result.ok) {
        throw new Error(await dataverseErrorMessage(result, 'The document could not be downloaded.'))
    }
    const data = await result.json() as AnnotationDownloadResponse
    if (!data.documentbody) throw new Error('The document is missing file content.')
    return new Blob([decodeBase64(data.documentbody)], { type: data.mimetype || 'application/octet-stream' })
}

export async function deleteSiteInductionDocument(accessToken: string, documentId: string): Promise<void> {
    const result = await fetch(`${DATAVERSE_URL}/api/data/v9.2/annotations(${documentId})`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    })

    if (!result.ok) {
        throw new Error(await dataverseErrorMessage(result, 'The document could not be deleted.'))
    }
}
