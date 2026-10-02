import { Zip, ZipPassThrough } from 'fflate'
import type { JobCardReview } from './jobCardReview.types.ts'

export function safePhotoFilename(value: string, fallback = 'Job photos') {
    const printable = Array.from(value.normalize('NFC'), (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '-' : character).join('')
    const safe = printable.replace(/[<>:"/\\|?*]/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 160).replace(/[. ]+$/g, '')
    return !safe || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(safe) ? fallback : safe
}

export function jobCardPhotoFilename(review: Pick<JobCardReview, 'jobNumber' | 'workRequired' | 'submittedOn'>) {
    const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(review.submittedOn))
    const value = (type: string) => parts.find((part) => part.type === type)?.value
    const date = `${value('day')}-${value('month')}-${value('year')}`
    return `${safePhotoFilename(review.jobNumber, 'Job').slice(0, 30)} - ${safePhotoFilename(review.workRequired || '', 'No description').slice(0, 95)} - ${date}.zip`
}

/** Store photos without recompression; fetch sequentially and keep only bounded archive chunks. */
export async function buildJobCardPhotoArchive(
    photos: JobCardReview['photos'],
    load: (id: string) => Promise<Blob>,
    onProgress: (completed: number) => void = () => undefined,
    signal?: AbortSignal,
) {
    if (!photos.length || photos.length > 20) throw new Error('Choose a submission with 1 to 20 photos.')
    const chunks: BlobPart[] = []
    const zip = new Zip((error, chunk) => {
        if (error) throw error
        chunks.push(new Uint8Array(chunk))
    })
    try {
        for (const [index, photo] of photos.entries()) {
            signal?.throwIfAborted()
            const blob = await load(photo.id)
            signal?.throwIfAborted()
            if (!blob.size || blob.size > 10 * 1024 * 1024 || blob.size !== photo.size) throw new Error('A photo could not be downloaded completely. No archive was saved.')
            const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif' } as Record<string, string>)[photo.mimeType]
            if (!extension) throw new Error('A photo has an unsupported file type.')
            // Numbering prevents collisions; canonical extensions and flat names prevent paths/executables.
            const file = new ZipPassThrough(`${String(index + 1).padStart(2, '0')} - ${safePhotoFilename(photo.fileName.replace(/\.[^.]*$/, ''), 'Photo')}.${extension}`)
            zip.add(file)
            const bytes = new Uint8Array(await blob.arrayBuffer())
            signal?.throwIfAborted()
            file.push(bytes, true)
            onProgress(index + 1)
        }
        zip.end()
        return new Blob(chunks, { type: 'application/zip' })
    } catch (error) { zip.terminate(); throw error }
}

type SaveHandle = { createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> }
type SaveWindow = Window & { showSaveFilePicker?: (options: { id: string; suggestedName: string; startIn: 'downloads'; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<SaveHandle> }

/** Call directly from the Save click, before token acquisition, to retain browser user activation. */
export async function saveJobCardPhotos(filename: string, build: () => Promise<Blob>, signal?: AbortSignal) {
    const name = `${safePhotoFilename(filename.replace(/\.zip$/i, ''))}.zip`
    const picker = (window as SaveWindow).showSaveFilePicker
    const handle = picker ? await picker.call(window, { id: 'job-card-photos', suggestedName: name, startIn: 'downloads', types: [{ description: 'Photo ZIP archive', accept: { 'application/zip': ['.zip'] } }] }) : undefined
    signal?.throwIfAborted()
    const archive = await build()
    signal?.throwIfAborted()
    if (handle) {
        const writable = await handle.createWritable()
        try { await writable.write(archive); signal?.throwIfAborted(); await writable.close() }
        catch (error) { await writable.abort().catch(() => undefined); throw error }
        return 'Photos saved to your selected location.'
    }
    const url = URL.createObjectURL(archive)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'Photo ZIP sent to your browser downloads.'
}
