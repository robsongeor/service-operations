import { useCallback, useEffect, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { acquireDataverseAccessToken } from '../../auth/dataverseAuthentication'
import { useActiveMsalAccount } from '../../auth/useActiveMsalAccount'
import {
    searchEquipmentPhotoJobs,
    uploadEquipmentPhoto,
    type EquipmentPhotoJob,
} from './equipmentPhotoApi'
import {
    loadPersistedEquipmentPhotos,
    persistEquipmentPhoto,
    removePersistedEquipmentPhoto,
    type PersistedEquipmentPhoto,
} from './equipmentPhotoQueueStore'
import './EquipmentPhotoUploadScreen.css'

const MAXIMUM_PHOTO_BYTES = 8 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

type QueueStatus = 'pending' | 'uploading' | 'done' | 'failed'
type QueueItem = {
    id: string
    job: EquipmentPhotoJob
    file: File
    previewUrl: string
    capturedAtUtc: string
    status: QueueStatus
    attemptCount: number
    error?: string
    webUrl?: string
}

function uploadId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatBytes(bytes: number) {
    return bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function EquipmentPhotoUploadScreen() {
    const { instance } = useMsal()
    const account = useActiveMsalAccount()
    const [query, setQuery] = useState('')
    const [jobs, setJobs] = useState<EquipmentPhotoJob[]>([])
    const [selectedJob, setSelectedJob] = useState<EquipmentPhotoJob | null>(null)
    const [queue, setQueue] = useState<QueueItem[]>([])
    const [loadingJobs, setLoadingJobs] = useState(true)
    const [uploading, setUploading] = useState(false)
    const [uploadsEnabled, setUploadsEnabled] = useState(true)
    const [queueReady, setQueueReady] = useState(false)
    const [message, setMessage] = useState('')
    const queueRef = useRef(queue)

    useEffect(() => {
        queueRef.current = queue
    }, [queue])

    const persistedItem = useCallback((item: QueueItem, status: PersistedEquipmentPhoto['status'], error?: string): PersistedEquipmentPhoto => ({
        id: item.id,
        job: item.job,
        file: item.file,
        fileName: item.file.name,
        contentType: item.file.type,
        lastModified: item.file.lastModified,
        capturedAtUtc: item.capturedAtUtc,
        status,
        attemptCount: item.attemptCount,
        error,
    }), [])

    useEffect(() => {
        let active = true
        void loadPersistedEquipmentPhotos()
            .then((items) => {
                if (!active) return
                setQueue(items.map((item) => {
                    const file = item.file instanceof File
                        ? item.file
                        : new File([item.file], item.fileName, { type: item.contentType, lastModified: item.lastModified })
                    return {
                        id: item.id,
                        job: item.job,
                        file,
                        previewUrl: URL.createObjectURL(file),
                        capturedAtUtc: item.capturedAtUtc,
                        status: item.status === 'uploading' ? 'pending' : item.status,
                        attemptCount: item.attemptCount,
                        error: item.error,
                    }
                }))
            })
            .catch((error) => {
                if (active) setMessage(error instanceof Error ? error.message : 'The offline photo queue could not be restored.')
            })
            .finally(() => {
                if (active) setQueueReady(true)
            })
        return () => { active = false }
    }, [])

    useEffect(() => () => {
        queueRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        const timer = globalThis.setTimeout(() => {
            setLoadingJobs(true)
            setMessage('')
            void acquireDataverseAccessToken(instance, account)
                .then((token) => searchEquipmentPhotoJobs(token, query, controller.signal))
                .then((result) => {
                    setJobs(result.jobs)
                    setUploadsEnabled(result.uploadsEnabled)
                })
                .catch((error) => {
                    if (error instanceof DOMException && error.name === 'AbortError') return
                    setMessage(error instanceof Error ? error.message : 'Jobs could not be loaded.')
                })
                .finally(() => setLoadingJobs(false))
        }, query.trim() ? 300 : 0)
        return () => {
            globalThis.clearTimeout(timer)
            controller.abort()
        }
    }, [account, instance, query])

    const addFiles = useCallback((files: FileList | null) => {
        if (!files?.length || !selectedJob) return
        const rejected: string[] = []
        const accepted: QueueItem[] = []
        Array.from(files).forEach((file) => {
            if (!ACCEPTED_TYPES.has(file.type)) rejected.push(`${file.name}: unsupported image format`)
            else if (file.size === 0 || file.size > MAXIMUM_PHOTO_BYTES) rejected.push(`${file.name}: must be under 8 MB`)
            else accepted.push({
                id: uploadId(),
                job: selectedJob,
                file,
                previewUrl: URL.createObjectURL(file),
                capturedAtUtc: new Date().toISOString(),
                status: 'pending',
                attemptCount: 0,
            })
        })
        setQueue((current) => [...current, ...accepted])
        setMessage(rejected.join('. '))
        void Promise.all(accepted.map((item) => persistEquipmentPhoto(persistedItem(item, 'pending'))))
            .catch((error) => setMessage(error instanceof Error ? error.message : 'One or more photos could not be saved for offline retry.'))
    }, [persistedItem, selectedJob])

    const removeItem = useCallback((id: string) => {
        setQueue((current) => {
            const target = current.find((item) => item.id === id)
            if (target) URL.revokeObjectURL(target.previewUrl)
            return current.filter((item) => item.id !== id)
        })
        void removePersistedEquipmentPhoto(id).catch((error) => setMessage(error instanceof Error ? error.message : 'The queued photo could not be removed from offline storage.'))
    }, [])

    const runUpload = useCallback(async () => {
        if (uploading) return
        const candidates = queue.filter((item) => item.status === 'pending' || item.status === 'failed')
        if (!candidates.length) return
        setUploading(true)
        setMessage('')
        try {
            const token = await acquireDataverseAccessToken(instance, account)
            for (const item of candidates) {
                setQueue((current) => current.map((entry) => entry.id === item.id
                    ? { ...entry, status: 'uploading', attemptCount: entry.attemptCount + 1, error: undefined }
                    : entry))
                const uploadingItem = { ...item, status: 'uploading' as const, attemptCount: item.attemptCount + 1, error: undefined }
                await persistEquipmentPhoto(persistedItem(uploadingItem, 'uploading'))
                try {
                    const result = await uploadEquipmentPhoto(token, {
                        jobId: item.job.id,
                        file: item.file,
                        clientUploadId: item.id,
                        capturedAtUtc: item.capturedAtUtc,
                    })
                    setQueue((current) => current.map((entry) => entry.id === item.id
                        ? { ...entry, status: 'done', webUrl: result.webUrl, error: undefined }
                        : entry))
                    await removePersistedEquipmentPhoto(item.id)
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Upload failed.'
                    setQueue((current) => current.map((entry) => entry.id === item.id
                        ? { ...entry, status: 'failed', error: errorMessage }
                        : entry))
                    await persistEquipmentPhoto(persistedItem(uploadingItem, 'failed', errorMessage))
                }
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'The upload session could not be started.')
        } finally {
            setUploading(false)
        }
    }, [account, instance, persistedItem, queue, uploading])

    const waitingCount = queue.filter((item) => item.status === 'pending' || item.status === 'failed').length
    const queuedJobCount = new Set(queue.filter((item) => item.status !== 'done').map((item) => item.job.id)).size

    return <main className="equipment-photo-page">
        <header className="equipment-photo-hero">
            <span className="equipment-photo-kicker">Workshop evidence</span>
            <h1>Equipment photos</h1>
            <p>Select the Job first, then capture or choose the photos. We will build the SharePoint path from the Job record.</p>
        </header>

        {!uploadsEnabled && <div className="equipment-photo-notice" role="status">
            Uploads are not enabled for this environment yet. Job selection can still be checked safely.
        </div>}
        {message && <div className="equipment-photo-error" role="alert">{message}</div>}
        {!queueReady && <div className="equipment-photo-notice" role="status">Restoring photos saved on this device...</div>}

        <section className="equipment-photo-step" aria-labelledby="equipment-photo-job-heading">
            <div className="equipment-photo-step-number">1</div>
            <div className="equipment-photo-step-body">
                <div className="equipment-photo-step-heading">
                    <div><span>Choose context</span><h2 id="equipment-photo-job-heading">Find the Job</h2></div>
                    {selectedJob && <button type="button" className="equipment-photo-text-button" onClick={() => setSelectedJob(null)}>Change</button>}
                </div>

                {selectedJob ? <article className="equipment-photo-selected-job">
                    <strong>{selectedJob.jobNumber}</strong>
                    <span>{selectedJob.customerName} / {selectedJob.siteName}</span>
                    <span>{selectedJob.equipmentName}</span>
                </article> : <>
                    <label className="equipment-photo-search">
                        <span>Search by Job number or description</span>
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try 48291 or hydraulic leak" autoComplete="off" />
                    </label>
                    <div className="equipment-photo-results" role="listbox" aria-label="Job results">
                        {loadingJobs && <div className="equipment-photo-empty">Loading Jobs...</div>}
                        {!loadingJobs && jobs.map((job) => <button type="button" role="option" aria-selected="false" key={job.id} onClick={() => setSelectedJob(job)}>
                            <span className="equipment-photo-job-number">{job.jobNumber}</span>
                            <span className="equipment-photo-job-context">{job.customerName} / {job.siteName}</span>
                            <span className="equipment-photo-job-equipment">{job.equipmentName}</span>
                        </button>)}
                        {!loadingJobs && jobs.length === 0 && <div className="equipment-photo-empty">No matching Jobs found.</div>}
                    </div>
                </>}
            </div>
        </section>

        <section className={`equipment-photo-step${selectedJob ? '' : ' is-locked'}`} aria-labelledby="equipment-photo-files-heading">
            <div className="equipment-photo-step-number">2</div>
            <div className="equipment-photo-step-body">
                <div className="equipment-photo-step-heading">
                    <div><span>Add evidence</span><h2 id="equipment-photo-files-heading">Choose photos</h2></div>
                    {queue.length > 0 && <span className="equipment-photo-count">{queue.length} selected</span>}
                </div>
                <div className="equipment-photo-actions">
                    <label className="equipment-photo-action primary">
                        <span className="equipment-photo-action-icon" aria-hidden="true">+</span>
                        <span>Take photo</span>
                        <input type="file" accept="image/*" capture="environment" disabled={!selectedJob} onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
                    </label>
                    <label className="equipment-photo-action">
                        <span className="equipment-photo-action-icon" aria-hidden="true">[]</span>
                        <span>Choose gallery</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple disabled={!selectedJob} onChange={(event) => { addFiles(event.target.files); event.target.value = '' }} />
                    </label>
                </div>

                {queue.length > 0 && <div className="equipment-photo-queue">
                    {queue.map((item) => <article key={item.id} className={`equipment-photo-card status-${item.status}`}>
                        <img src={item.previewUrl} alt="Selected equipment evidence preview" />
                        <div>
                            <strong>{item.file.name}</strong>
                            <span>Job {item.job.jobNumber} / {formatBytes(item.file.size)}</span>
                            <span>{item.status === 'done' ? 'Uploaded' : item.status === 'uploading' ? 'Uploading...' : item.status === 'failed' ? `Needs retry / ${item.attemptCount} attempt${item.attemptCount === 1 ? '' : 's'}` : 'Saved on this device'}</span>
                            {item.error && <small>{item.error}</small>}
                            {item.webUrl && <a href={item.webUrl} target="_blank" rel="noreferrer">Open in SharePoint</a>}
                        </div>
                        {item.status !== 'uploading' && <button type="button" aria-label={`Remove ${item.file.name}`} onClick={() => removeItem(item.id)}>x</button>}
                    </article>)}
                </div>}
            </div>
        </section>

        <div className="equipment-photo-submit-bar">
            <div><strong>{waitingCount ? `${waitingCount} photo${waitingCount === 1 ? '' : 's'} ready` : 'Add photos to continue'}</strong><span>{queuedJobCount ? `${queuedJobCount} Job${queuedJobCount === 1 ? '' : 's'} / saved offline` : selectedJob ? `Job ${selectedJob.jobNumber}` : 'No Job selected'}</span></div>
            <button type="button" disabled={!queueReady || !uploadsEnabled || waitingCount === 0 || uploading} onClick={() => void runUpload()}>
                {uploading ? 'Uploading...' : waitingCount && queue.some((item) => item.status === 'failed') ? 'Retry uploads' : 'Upload photos'}
            </button>
        </div>
    </main>
}
