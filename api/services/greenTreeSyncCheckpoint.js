const { TableClient } = require('@azure/data-tables')

const PARTITION_KEY = 'greentree-sync'
const ROW_KEY = 'jobs'
const DEFAULT_TABLE = 'GreenTreeSyncState'
const COOLDOWN_MS = 10 * 60_000
const LEASE_MS = 2 * 60_000
const OVERLAP_MS = 2 * 60_000
const INITIAL_LOOKBACK_MS = 23 * 60 * 60_000

function isNotFound(error) {
    return error?.statusCode === 404
}

function isConflict(error) {
    return error?.statusCode === 409 || error?.statusCode === 412
}

function startResult(entity, now) {
    const lastSuccessfulAt = Date.parse(entity?.lastSuccessfulAt || '')
    return {
        skipped: false,
        checkedThrough: new Date(now).toISOString(),
        modifiedSince: new Date(Number.isFinite(lastSuccessfulAt)
            ? lastSuccessfulAt - OVERLAP_MS
            : now - INITIAL_LOOKBACK_MS).toISOString(),
        lastSuccessfulAt: entity?.lastSuccessfulAt || '',
        etag: entity?.etag,
    }
}

class AzureGreenTreeSyncCheckpointStore {
    constructor(table) {
        this.table = table
        this.ready = null
    }

    async ensureTable() {
        if (!this.ready) this.ready = this.table.createTable().catch((error) => {
            if (error?.statusCode !== 409) throw error
        })
        await this.ready
    }

    async begin(now = Date.now()) {
        await this.ensureTable()
        let entity
        try { entity = await this.table.getEntity(PARTITION_KEY, ROW_KEY) }
        catch (error) { if (!isNotFound(error)) throw error }

        const lastSuccessfulAt = Date.parse(entity?.lastSuccessfulAt || '')
        const leaseUntil = Date.parse(entity?.leaseUntil || '')
        if (Number.isFinite(lastSuccessfulAt) && now - lastSuccessfulAt < COOLDOWN_MS) return { skipped: true, reason: 'cooldown' }
        if (Number.isFinite(leaseUntil) && leaseUntil > now) return { skipped: true, reason: 'running' }

        const lease = {
            partitionKey: PARTITION_KEY,
            rowKey: ROW_KEY,
            lastSuccessfulAt: entity?.lastSuccessfulAt || '',
            leaseUntil: new Date(now + LEASE_MS).toISOString(),
        }
        try {
            const response = entity
                ? await this.table.updateEntity(lease, 'Replace', { etag: entity.etag })
                : await this.table.createEntity(lease)
            return startResult({ ...lease, etag: response.etag }, now)
        } catch (error) {
            if (isConflict(error)) return { skipped: true, reason: 'running' }
            throw error
        }
    }

    async complete(run) {
        await this.table.updateEntity({
            partitionKey: PARTITION_KEY,
            rowKey: ROW_KEY,
            lastSuccessfulAt: run.checkedThrough,
            leaseUntil: '',
        }, 'Replace', { etag: run.etag })
    }

    async fail(run) {
        try {
            await this.table.updateEntity({
                partitionKey: PARTITION_KEY,
                rowKey: ROW_KEY,
                lastSuccessfulAt: run.lastSuccessfulAt || '',
                leaseUntil: '',
            }, 'Merge', { etag: run.etag })
        } catch (error) {
            if (!isConflict(error) && !isNotFound(error)) throw error
        }
    }
}

let cachedStore

function getGreenTreeSyncCheckpointStore() {
    if (cachedStore !== undefined) return cachedStore
    const connectionString = (process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim()
    if (!connectionString) return (cachedStore = null)
    const table = TableClient.fromConnectionString(
        connectionString,
        (process.env.GREENTREE_SYNC_TABLE_NAME || DEFAULT_TABLE).trim(),
    )
    return (cachedStore = new AzureGreenTreeSyncCheckpointStore(table))
}

function resetGreenTreeSyncCheckpointStore() {
    cachedStore = undefined
}

module.exports = {
    getGreenTreeSyncCheckpointStore,
    resetGreenTreeSyncCheckpointStore,
    AzureGreenTreeSyncCheckpointStore,
    _test: { startResult, PARTITION_KEY, ROW_KEY, COOLDOWN_MS, LEASE_MS, OVERLAP_MS, INITIAL_LOOKBACK_MS },
}
