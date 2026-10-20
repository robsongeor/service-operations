import type { JobCardProgressSummary, PersonalJobWatch, ServiceCoordinationContext } from '../types/serviceCoordination.types.ts'

const SHARED_JOB_CARD_HEADERS: Record<string, string> = import.meta.env?.VITE_JOB_CARD_SHARED_BACKEND === 'v1-production'
    ? { 'X-Job-Card-Shared-Backend': 'v1-production' }
    : {}

async function responseBody(response: Response) {
    try { return await response.json() as Record<string, unknown> } catch { return {} }
}

async function requireResponse<T>(response: Response, fallback: string): Promise<T> {
    const body = await responseBody(response)
    if (!response.ok) {
        const error = new Error(typeof body.error === 'string' ? body.error : fallback) as Error & { code?: string; status?: number }
        error.code = typeof body.code === 'string' ? body.code : undefined
        error.status = response.status
        throw error
    }
    return body as T
}

function delegatedHeaders(accessToken: string) {
    return { Accept: 'application/json', 'X-Dataverse-Authorization': `Bearer ${accessToken}`, 'Cache-Control': 'no-cache' }
}

export async function fetchServiceCoordinationContext(accessToken: string, signal?: AbortSignal) {
    return requireResponse<ServiceCoordinationContext>(await fetch('/api/servicecoordination?view=context', {
        cache: 'no-store', signal, headers: delegatedHeaders(accessToken),
    }), 'Your Service Coordination branch could not be loaded.')
}

export async function fetchPersonalJobWatches(accessToken: string, signal?: AbortSignal): Promise<PersonalJobWatch[]> {
    const items: PersonalJobWatch[] = []
    const seen = new Set<string>()
    let cursor = ''
    for (let page = 0; page < 20; page += 1) {
        const result = await requireResponse<{ items?: PersonalJobWatch[]; next?: string }>(await fetch(
            `/api/servicecoordination?view=watches${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            { cache: 'no-store', signal, headers: delegatedHeaders(accessToken) },
        ), 'Your personal watchlist could not be loaded.')
        items.push(...(result.items ?? []))
        if (!result.next) return items
        if (seen.has(result.next)) throw new Error('The personal watchlist returned a repeated page.')
        seen.add(result.next)
        cursor = result.next
    }
    throw new Error('The personal watchlist exceeded its safe paging limit.')
}

export async function setPersonalJobWatch(accessToken: string, jobId: string, watched: boolean) {
    return requireResponse<{ watched: boolean }>(await fetch('/api/servicecoordination', {
        method: 'POST', cache: 'no-store',
        headers: { ...delegatedHeaders(accessToken), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: watched ? 'watch' : 'unwatch', jobId }),
    }), watched ? 'The Job could not be watched.' : 'The Job could not be removed from your watchlist.')
}

export async function fetchJobCardProgressSummaries(accessToken: string, jobIds: string[], signal?: AbortSignal) {
    if (jobIds.length < 1 || jobIds.length > 100) throw new Error('A bounded Job Card progress request is required.')
    return requireResponse<{ items: JobCardProgressSummary[] }>(await fetch('/api/jobcardreviews', {
        method: 'POST', cache: 'no-store', signal,
        headers: { ...delegatedHeaders(accessToken), ...SHARED_JOB_CARD_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'coordinationSummary', jobIds }),
    }), 'Job Card progress is unavailable.')
}
