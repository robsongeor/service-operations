const { createHash } = require('node:crypto')
const { isHosted } = require('./jobCardEnvironment')
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

function recipientKey(entity) {
    return 'recipient_' + createHash('sha256').update(`${entity.sourceJobId}:${entity.assignmentId || 'primary'}`).digest('hex')
}

function activeLinkError() {
    const error = new Error('An active link already exists.')
    error.code = 'active-link'
    return error
}

function isActive(entity) {
    return entity?.status === 'active' && Date.parse(entity.expiresOn) > Date.now()
}

// Azure Table string properties are limited to 64 KiB of UTF-16 data.
function serializeEntity(entity) {
    const result = { partitionKey: PARTITION_KEY, rowKey: entity.tokenHash }
    for (const [key, value] of Object.entries(entity)) {
        if (['etag', 'timestamp', 'partitionKey', 'rowKey'].includes(key) || value == null) continue
        if (typeof value === 'string' && value.length > 30000) {
            let offset = 0
            let count = 0
            while (offset < value.length) {
                let end = Math.min(offset + 30000, value.length)
                // Do not split a surrogate pair across separately encoded properties.
                if (end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1])) end--
                result[`${key}Chunk${count++}`] = value.slice(offset, end)
                offset = end
            }
            result[`${key}ChunkCount`] = count
        } else result[key] = value
    }
    return result
}

function deserializeEntity(entity) {
    for (const key of Object.keys(entity)) {
        if (!key.endsWith('ChunkCount')) continue
        const base = key.slice(0, -10)
        entity[base] = Array.from({ length: entity[key] }, (_, i) => entity[`${base}Chunk${i}`]).join('')
        for (let i = 0; i < entity[key]; i++) delete entity[`${base}Chunk${i}`]
        delete entity[key]
    }
    return entity
}

class MemoryJobCardStore {
    constructor() {
        this.entities = new Map()
        this.blobs = new Map()
        this.version = 0
        this.recipients = new Map()
    }

    async createActive(entity, replaceActive) {
        const key = recipientKey(entity)
        const previous = this.entities.get(this.recipients.get(key))
        if (isActive(previous) && !replaceActive) throw activeLinkError()
        if (isActive(previous)) {
            this.entities.set(previous.tokenHash, { ...previous, status: 'superseded', supersededOn: entity.createdOn, etag: `W/"${++this.version}"` })
        }
        this.recipients.set(key, entity.tokenHash)
        return this.create(entity)
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

    async listByJobId(jobId, limit = 100) {
        return [...this.entities.values()].filter((item) => item.sourceJobId === jobId).slice(0, limit).map(clone)
    }

    async listPending(limit = 100) {
        return this.listActive(limit)
    }

    async listSubmittedByJobIds(jobIds, limit = 501) {
        const ids = new Set(jobIds.map((id) => id.toLowerCase()))
        return [...this.entities.values()].filter((item) => ids.has(String(item.sourceJobId).toLowerCase())
            && ['pendingReview', 'reviewed'].includes(item.status)).slice(0, limit).map(clone)
    }

    async listActive(limit = 100) {
        return this.listByLifecycleStatus('pendingReview', limit)
    }

    async listHistory(limit = 100) {
        return this.listByLifecycleStatus('reviewed', limit)
    }

    async listByLifecycleStatus(status, limit) {
        return [...this.entities.values()]
            .filter((item) => item.status === status)
            .sort((left, right) => String(right.submittedOn).localeCompare(String(left.submittedOn)))
            .slice(0, limit).map(clone)
    }

    async replace(entity, etag) {
        const current = this.entities.get(entity.tokenHash)
        if (!current || current.etag !== etag) throw preconditionError()
        const stored = { ...clone(entity), partitionKey: PARTITION_KEY, rowKey: entity.tokenHash, etag: `W/\"${++this.version}\"` }
        this.entities.set(entity.tokenHash, stored)
        return clone(stored)
    }

    async uploadPhoto(tokenHash, photo, uploadId) {
        const blobName = `uploads/${tokenHash}/${uploadId}`
        if (!this.blobs.has(blobName)) this.blobs.set(blobName, {
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
        return serializeEntity(entity)
    }

    async createActive(entity, replaceActive) {
        const key = recipientKey(entity)
        let sentinel
        try { sentinel = await this.table.getEntity(PARTITION_KEY, key) }
        catch (error) { if (error.statusCode !== 404) throw error }
        const previous = sentinel ? await this.getByTokenHash(sentinel.activeTokenHash) : null
        if (isActive(previous) && !replaceActive) throw activeLinkError()
        const next = { partitionKey: PARTITION_KEY, rowKey: key, activeTokenHash: entity.tokenHash }
        const actions = [sentinel ? ['update', next, 'Replace', { etag: sentinel.etag }] : ['create', next]]
        if (isActive(previous)) actions.push(['update', this.toEntity({ ...previous, status: 'superseded', supersededOn: entity.createdOn }), 'Replace', { etag: previous.etag }])
        actions.push(['create', this.toEntity(entity)])
        await this.table.submitTransaction(actions)
        return this.getByTokenHash(entity.tokenHash)
    }

    async create(entity) {
        await this.table.createEntity(this.toEntity(entity))
        return this.getByTokenHash(entity.tokenHash)
    }

    async getByTokenHash(tokenHash) {
        try {
            return deserializeEntity(await this.table.getEntity(PARTITION_KEY, tokenHash))
        } catch (error) {
            if (error?.statusCode === 404) return null
            throw error
        }
    }

    async collect(filter, limit = 100) {
        const results = []
        for await (const entity of this.table.listEntities({ queryOptions: { filter } })) {
            results.push(deserializeEntity(entity))
            if (results.length >= limit) break
        }
        return results
    }

    async getByReviewId(reviewId) {
        const escaped = String(reviewId).replaceAll("'", "''")
        return (await this.collect(`PartitionKey eq '${PARTITION_KEY}' and reviewId eq '${escaped}'`, 2))[0] ?? null
    }

    async listByJobId(jobId, limit = 100) {
        const escaped = String(jobId).replaceAll("'", "''")
        return this.collect(`PartitionKey eq '${PARTITION_KEY}' and sourceJobId eq '${escaped}'`, limit)
    }

    async listPending(limit = 100) {
        return this.listActive(limit)
    }

    async listSubmittedByJobIds(jobIds, limit = 501) {
        if (!jobIds.length) return []
        const jobs = jobIds.map((id) => `sourceJobId eq '${String(id).replaceAll("'", "''")}'`).join(' or ')
        return this.collect(`PartitionKey eq '${PARTITION_KEY}' and (status eq 'pendingReview' or status eq 'reviewed') and (${jobs})`, limit)
    }

    async listActive(limit = 100) {
        return this.listByLifecycleStatus('pendingReview', limit)
    }

    async listHistory(limit = 100) {
        return this.listByLifecycleStatus('reviewed', limit)
    }

    async listByLifecycleStatus(status, limit) {
        // Sort one bounded population consistently before taking a requested page prefix.
        // Sorting different-size prefixes can skip records between offset pages.
        const entities = await this.collect(`PartitionKey eq '${PARTITION_KEY}' and status eq '${status}'`, 501)
        return entities.sort((left, right) => String(right.submittedOn).localeCompare(String(left.submittedOn)) || String(left.reviewId).localeCompare(String(right.reviewId))).slice(0, limit)
    }

    async replace(entity, etag) {
        const response = await this.table.updateEntity(this.toEntity(entity), 'Replace', { etag })
        return { ...entity, etag: response.etag }
    }

    async uploadPhoto(tokenHash, photo, uploadId) {
        const blobName = `uploads/${tokenHash}/${uploadId}`
        const client = this.container.getBlockBlobClient(blobName)
        const bytes = Buffer.from(photo.data, 'base64')
        try { await client.uploadData(bytes, {
            conditions: { ifNoneMatch: '*' },
            blobHTTPHeaders: { blobContentType: photo.mimeType },
            metadata: { tokenhash: tokenHash, filename: Buffer.from(photo.fileName, 'utf8').toString('base64url') },
        }) } catch (error) {
            if (error.statusCode !== 409 && error.statusCode !== 412) throw error
            const existing = await this.inspectPhoto(blobName)
            if (!existing || existing.size !== bytes.length || existing.mimeType !== photo.mimeType) throw error
        }
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
    if (mode === 'memory' || process.env.NODE_ENV === 'test') {
        if (isHosted()) throw new Error('Local Job Card storage is forbidden in a hosted process.')
        return new MemoryJobCardStore()
    }
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

module.exports = { getJobCardStore, resetJobCardStore, MemoryJobCardStore, AzureJobCardStore, PARTITION_KEY, serializeEntity, deserializeEntity }
