import type { WorkshopAssistantSession } from '../types/workshopAssistant.types.ts'

async function responseBody(response: Response) {
    try { return await response.json() as Record<string, unknown> } catch { return {} }
}

export async function createWorkshopAssistantSession(
    accessToken: string,
    signal?: AbortSignal,
): Promise<WorkshopAssistantSession> {
    const response = await fetch('/api/workshopassistant', {
        method: 'POST',
        cache: 'no-store',
        signal,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Dataverse-Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ action: 'session' }),
    })
    const body = await responseBody(response)
    if (!response.ok) {
        throw new Error(typeof body.error === 'string' ? body.error : 'The Workshop Assistant could not start.')
    }
    if (typeof body.value !== 'string' || !body.value
        || typeof body.webrtcUrl !== 'string' || !body.webrtcUrl
        || typeof body.model !== 'string' || !body.model) {
        throw new Error('The Workshop Assistant returned an invalid session.')
    }
    return {
        value: body.value,
        expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : undefined,
        model: body.model,
        webrtcUrl: body.webrtcUrl,
    }
}
