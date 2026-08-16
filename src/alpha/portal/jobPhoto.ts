export const MAX_JOB_PHOTOS = 20
export const MAX_JOB_PHOTO_BYTES = 10 * 1024 * 1024
export const ACCEPTED_JOB_PHOTO_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
])

export type PendingJobPhoto = {
    id: string
    fileName: string
    mimeType: string
    size: number
    data: string
    previewUrl: string
}

function inferredPhotoType(file: Pick<File, 'name' | 'type'>) {
    const supplied = file.type.toLowerCase()
    if (supplied) return supplied
    const extension = file.name.split('.').pop()?.toLowerCase()
    return extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg'
        : extension === 'png' ? 'image/png'
            : extension === 'heic' ? 'image/heic'
                : extension === 'heif' ? 'image/heif'
                    : ''
}

export function validateJobPhoto(file: Pick<File, 'name' | 'type' | 'size'>) {
    if (!ACCEPTED_JOB_PHOTO_TYPES.has(inferredPhotoType(file))) {
        return `${file.name} is not a supported JPG, PNG, or HEIC image.`
    }
    if (file.size > MAX_JOB_PHOTO_BYTES) return `${file.name} is larger than 10 MB.`
    return ''
}

export function removePendingJobPhoto(photos: PendingJobPhoto[], id: string) {
    return photos.filter((photo) => photo.id !== id)
}

function readDataUrl(file: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('The photo could not be read.'))
        reader.readAsDataURL(file)
    })
}

async function compressBrowserImage(file: File) {
    if (!['image/jpeg', 'image/png'].includes(file.type.toLowerCase()) || typeof createImageBitmap !== 'function') return file
    const image = await createImageBitmap(file)
    try {
        const scale = Math.min(1, 2000 / Math.max(image.width, image.height))
        if (scale === 1 && file.size < 2 * 1024 * 1024) return file
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.width * scale))
        canvas.height = Math.max(1, Math.round(image.height * scale))
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
        return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file
    } finally {
        image.close()
    }
}

export async function prepareJobPhoto(file: File): Promise<PendingJobPhoto> {
    const validation = validateJobPhoto(file)
    if (validation) throw new Error(validation)
    const normalized = file.type ? file : new File([file], file.name, { type: inferredPhotoType(file) })
    const prepared = await compressBrowserImage(normalized)
    const dataUrl = await readDataUrl(prepared)
    return {
        id: crypto.randomUUID(),
        fileName: prepared.name,
        mimeType: prepared.type,
        size: prepared.size,
        data: dataUrl.slice(dataUrl.indexOf(',') + 1),
        previewUrl: dataUrl,
    }
}
