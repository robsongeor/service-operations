const DATAVERSE_ID_FILTER_BATCH_SIZE = 40

function normalizeDataverseId(value: string) {
    return value.trim().replace(/^\{/, '').replace(/\}$/, '')
}

/**
 * Builds bounded OData filters so customer-scoped child queries do not exceed practical URL limits.
 * IDs are de-duplicated because repeated Sites or Equipment must never multiply requests or rows.
 */
export function buildDataverseIdFilterBatches(field: string, ids: readonly string[]) {
    const uniqueIds = [...new Set(ids.map(normalizeDataverseId).filter(Boolean))]
    const filters: string[] = []
    for (let index = 0; index < uniqueIds.length; index += DATAVERSE_ID_FILTER_BATCH_SIZE) {
        filters.push(uniqueIds.slice(index, index + DATAVERSE_ID_FILTER_BATCH_SIZE)
            .map((id) => `${field} eq ${id}`)
            .join(' or '))
    }
    return filters
}
