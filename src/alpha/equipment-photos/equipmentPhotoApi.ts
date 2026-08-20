export type EquipmentPhotoJob = {
    id: string
    jobNumber: string
    description: string
    createdOn: string
    customerName: string
    siteName: string
    equipmentName: string
}

type JobSearchResponse = {
    jobs?: EquipmentPhotoJob[]
    uploadsEnabled?: boolean
    error?: string
}

export type EquipmentPhotoUploadResult = {
    itemId: string
    fileName: string
    webUrl: string
    uploadedAtUtc: string
}

async function responseBody<T>(response: Response): Promise<T & { error?: string }> {
    return response.json().catch(() => ({})) as Promise<T & { error?: string }>
}

export async function searchEquipmentPhotoJobs(accessToken: string, query: string, signal?: AbortSignal) {
    const url = new URL('/api/equipmentphotos', globalThis.location.origin)
    if (query.trim()) url.searchParams.set('query', query.trim())
    const response = await fetch(url, {
        cache: 'no-store',
        headers: {
            Accept: 'application/json',
            'X-Dataverse-Authorization': `Bearer ${accessToken}`,
        },
        signal,
    })
    const body = await responseBody<JobSearchResponse>(response)
    if (!response.ok) throw new Error(body.error || 'Jobs could not be loaded.')
    return {
        jobs: Array.isArray(body.jobs) ? body.jobs : [],
        uploadsEnabled: body.uploadsEnabled === true,
    }
}

export async function uploadEquipmentPhoto(
    accessToken: string,
    input: {
        jobId: string
        file: File
        clientUploadId: string
        capturedAtUtc: string
    },
) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('The selected photo could not be read.'))
        reader.readAsDataURL(input.file)
    })
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const response = await fetch('/api/equipmentphotos', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Dataverse-Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            action: 'upload',
            jobId: input.jobId,
            originalFileName: input.file.name,
            contentType: input.file.type,
            byteLength: input.file.size,
            clientUploadId: input.clientUploadId,
            capturedAtUtc: input.capturedAtUtc,
            base64,
        }),
    })
    const body = await responseBody<EquipmentPhotoUploadResult>(response)
    if (!response.ok) throw new Error(body.error || 'The photo could not be uploaded.')
    return body
}
