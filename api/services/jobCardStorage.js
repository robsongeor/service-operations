const { randomUUID } = require('node:crypto')
const { TableClient } = require('@azure/data-tables')
const { BlobServiceClient } = require('@azure/storage-blob')

const PARTITION_KEY = 'job-card'
const DEFAULT_TABLE = 'JobCardRequests'
const DEFAULT_CONTAINER = 'job-card-evidence'

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value))
}

function preconditionError() {
    const error = new Error('The record changed before the operation completed.')
    error.statusCode = 412
    return error
}

class MemoryJobCardStore {
    constructor() {
        this.entities = new Map()
        this.blobs = new Map()
        this.version = 0
    }

    async create(entity) {
        if (this.entities.has(entity.tokenHash)) throw new Error('Duplicate token hash.')
        const stored = { ...clone(entity), partitionKey: PARTITION_KEY, rowKey: entity.tokenHash, etag: `W/\"${++this.version}\"` }
        this.entities.set(entity.tokenHash, stored)
        return clone(stored)
    }

    async getByTokenHash(tokenHash) {
        return clone(this.entities.get(tokenHash) ?? null)
    }

    async getByReviewId(reviewId) {
        return clone([...this.entities.values()].find((item) => item.reviewId === reviewId) ?? null)
    }

    async listByJobId(jobId) {
        return [...this.entities.values()].filter((item) => item.sourceJobId === jobId).map(clone)
    }

    async listPending(limit = 100) {
        return [...this.entities.values()]
            .filter((item) => item.status === 'pendingReview')
            .sort((left, right) => String(right.submittedOn).localeCompare(String(left.submittedOn)))
            .slice(0, limit)
            .map(clone)
    }

    async replace(entity, etag) {
        const current = this.entities.get(entity.tokenHash)
        if (!current || current.etag !== etag) throw preconditionError()
        const stored = { ...clone(entity), partitionKey: PARTITION_KEY, rowKey: entity.tokenHash, etag: `W/\"${++this.version}\"` }
        this.entities.set(entity.tokenHash, stored)
        return clone(stored)
    }

    async uploadPhoto(tokenHash, photo) {
        const uploadId = randomUUID()
        const blobName = `uploads/${tokenHash}/${uploadId}`
        this.blobs.set(blobName, {
            data: Buffer.from(photo.data, 'base64'),
            contentType: photo.mimeType,
            metadata: { tokenhash: tokenHash, filename: photo.fileName },
        })
        return { uploadId, blobName }
    }

    async inspectPhoto(blobName) {
        const blob = this.blobs.get(blobName)
        if (!blob) return null
        return {
            size: blob.data.length,
            mimeType: blob.contentType,
            tokenHash: blob.metadata.tokenhash,
            fileName: blob.metadata.filename,
        }
    }

    async downloadPhoto(blobName) {
        const blob = this.blobs.get(blobName)
        if (!blob) return null
        return { data: Buffer.from(blob.data), mimeType: blob.contentType }
    }
}

class AzureJobCardStore {
    constructor(connectionString, tableName, containerName) {
        this.table = TableClient.fromConnectionString(connectionString, tableName)
        this.container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName)
    }

    toEntity(entity) {
        const { etag, timestamp, ...properties } = entity
        void etag
        void timestamp
        return { ...properties, partitionKey: PARTITION_KEY, rowKey: entity.tokenHash }
    }

    async create(entity) {
        await this.table.createEntity(this.toEntity(entity))
        return this.getByTokenHash(entity.tokenHash)
    }

    async getByTokenHash(tokenHash) {
        try {
            return await this.table.getEntity(PARTITION_KEY, tokenHash)
        } catch (error) {
            if (error?.statusCode === 404) return null
            throw error
        }
    }

    async collect(filter, limit = 100) {
        const results = []
        for await (const entity of this.table.listEntities({ queryOptions: { filter } })) {
            results.push(entity)
            if (results.length >= limit) break
        }
        return results
    }

    async getByReviewId(reviewId) {
        const escaped = String(reviewId).replaceAll("'", "''")
        return (await this.collect(`PartitionKey eq '${PARTITION_KEY}' and reviewId eq '${escaped}'`, 2))[0] ?? null
    }

    async listByJobId(jobId) {
        const escaped = String(jobId).replaceAll("'", "''")
        return this.collect(`PartitionKey eq '${PARTITION_KEY}' and sourceJobId eq '${escaped}'`, 100)
    }

    async listPending(limit = 100) {
        const entities = await this.collect(`PartitionKey eq '${PARTITION_KEY}' and status eq 'pendingReview'`, limit)
        return entities.sort((left, right) => String(right.submittedOn).localeCompare(String(left.submittedOn)))
    }

    async replace(entity, etag) {
        await this.table.updateEntity(this.toEntity(entity), 'Replace', { etag })
        return this.getByTokenHash(entity.tokenHash)
    }

    async uploadPhoto(tokenHash, photo) {
        const uploadId = randomUUID()
        const blobName = `uploads/${tokenHash}/${uploadId}`
        const client = this.container.getBlockBlobClient(blobName)
        const bytes = Buffer.from(photo.data, 'base64')
        await client.uploadData(bytes, {
            blobHTTPHeaders: { blobContentType: photo.mimeType },
            metadata: { tokenhash: tokenHash, filename: Buffer.from(photo.fileName, 'utf8').toString('base64url') },
        })
        return { uploadId, blobName }
    }

    async inspectPhoto(blobName) {
        try {
            const properties = await this.container.getBlobClient(blobName).getProperties()
            return {
                size: properties.contentLength,
                mimeType: properties.contentType,
                tokenHash: properties.metadata?.tokenhash,
                fileName: properties.metadata?.filename
                    ? Buffer.from(properties.metadata.filename, 'base64url').toString('utf8')
                    : '',
            }
        } catch (error) {
            if (error?.statusCode === 404) return null
            throw error
        }
    }

    async downloadPhoto(blobName) {
        try {
            const response = await this.container.getBlobClient(blobName).downloadToBuffer()
            const properties = await this.container.getBlobClient(blobName).getProperties()
            return { data: response, mimeType: properties.contentType || 'application/octet-stream' }
        } catch (error) {
            if (error?.statusCode === 404) return null
            throw error
        }
    }
}

let cachedStore

function createJobCardStore() {
    const mode = (process.env.JOB_CARD_STORAGE_MODE || '').trim().toLowerCase()
    if (mode === 'memory' || process.env.NODE_ENV === 'test') return new MemoryJobCardStore()
    const connectionString = (process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim()
    if (!connectionString) throw new Error('Job card storage is not configured.')
    return new AzureJobCardStore(
        connectionString,
        (process.env.JOB_CARD_TABLE_NAME || DEFAULT_TABLE).trim(),
        (process.env.JOB_CARD_PHOTO_CONTAINER || DEFAULT_CONTAINER).trim(),
    )
}

function getJobCardStore() {
    if (!cachedStore) cachedStore = createJobCardStore()
    return cachedStore
}

function resetJobCardStore() {
    cachedStore = undefined
}

module.exports = { getJobCardStore, resetJobCardStore, MemoryJobCardStore, PARTITION_KEY }
