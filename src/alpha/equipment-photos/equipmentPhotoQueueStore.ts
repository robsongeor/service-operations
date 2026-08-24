import type { EquipmentPhotoJob } from './equipmentPhotoApi'

const DATABASE_NAME = 'service-operations-equipment-photo-queue'
const STORE_NAME = 'photos'
const DATABASE_VERSION = 1

export type PersistedEquipmentPhoto = {
    id: string
    job: EquipmentPhotoJob
    file: Blob
    fileName: string
    contentType: string
    lastModified: number
    capturedAtUtc: string
    status: 'pending' | 'uploading' | 'failed'
    attemptCount: number
    error?: string
}

function requestResult<T>(request: IDBRequest<T>) {
    return new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error || new Error('The offline photo queue could not be accessed.'))
    })
}

function transactionComplete(transaction: IDBTransaction) {
    return new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error || new Error('The offline photo queue could not be updated.'))
        transaction.onabort = () => reject(transaction.error || new Error('The offline photo queue update was cancelled.'))
    })
}

async function database() {
    if (!globalThis.indexedDB) throw new Error('Offline photo storage is not supported by this browser.')
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
        const value = request.result
        if (!value.objectStoreNames.contains(STORE_NAME)) value.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    return requestResult(request)
}

export async function loadPersistedEquipmentPhotos() {
    const value = await database()
    try {
        const transaction = value.transaction(STORE_NAME, 'readonly')
        return await requestResult(transaction.objectStore(STORE_NAME).getAll()) as PersistedEquipmentPhoto[]
    } finally {
        value.close()
    }
}

export async function persistEquipmentPhoto(item: PersistedEquipmentPhoto) {
    const value = await database()
    try {
        const transaction = value.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).put(item)
        await transactionComplete(transaction)
    } finally {
        value.close()
    }
}

export async function removePersistedEquipmentPhoto(id: string) {
    const value = await database()
    try {
        const transaction = value.transaction(STORE_NAME, 'readwrite')
        transaction.objectStore(STORE_NAME).delete(id)
        await transactionComplete(transaction)
    } finally {
        value.close()
    }
}
