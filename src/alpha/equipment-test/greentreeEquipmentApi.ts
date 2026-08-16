export const GREENTREE_TABLE_LOGICAL_NAME = 'gr_greentreeequipment'
export const GREENTREE_TABLE_ENTITY_SET = 'gr_greentreeequipments'
export const GREENTREE_TABLE_PRIMARY_ID = 'gr_greentreeequipmentid'

const GREENTREE_COLUMNS = [
    GREENTREE_TABLE_PRIMARY_ID,
    'gr_greentreecode',
    'gr_make',
    'gr_model',
    'gr_serial',
    'gr_site',
    'gr_siteaddress1',
    'gr_siteaddress2',
    'gr_alternatefleet',
    'gr_sourcekey',
].join(',')

export type GreentreeRecord = Record<string, unknown>

export type GreentreeTableResult = {
    records: GreentreeRecord[]
    entitySetName: string
    logicalName: string
    primaryIdAttribute: string
    primaryNameAttribute: string
}

async function readJson(response: Response) {
    const body = await response.text()
    if (!response.ok) throw new Error(body || `${response.status} ${response.statusText}`)
    return body ? JSON.parse(body) as Record<string, unknown> : {}
}

async function get(accessToken: string, url: string) {
    return readJson(await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            Prefer: 'odata.maxpagesize=5000',
            'OData-MaxVersion': '4.0',
            'OData-Version': '4.0',
        },
    }))
}

async function getAllRecords(accessToken: string, initialUrl: string, environmentUrl: string) {
    const records: GreentreeRecord[] = []
    const visited = new Set<string>()
    const expectedOrigin = new URL(environmentUrl).origin
    let nextUrl: string | null = initialUrl

    while (nextUrl) {
        if (visited.has(nextUrl)) throw new Error('Dataverse returned a repeated pagination link.')
        if (new URL(nextUrl).origin !== expectedOrigin) throw new Error('Dataverse returned an unexpected pagination host.')
        visited.add(nextUrl)

        const page = await get(accessToken, nextUrl)
        records.push(...((page.value ?? []) as GreentreeRecord[]))
        nextUrl = typeof page['@odata.nextLink'] === 'string' ? page['@odata.nextLink'] : null
    }

    return records
}

export async function fetchGreentreeEquipmentTable(accessToken: string): Promise<GreentreeTableResult> {
    const environmentUrl = (import.meta.env.VITE_DATAVERSE_URL ?? '').trim().replace(/\/+$/, '')
    if (!/^https:\/\/[^/]+\.dynamics\.com$/i.test(environmentUrl)) {
        throw new Error('VITE_DATAVERSE_URL must be a Dataverse organization URL.')
    }

    const records = await getAllRecords(
        accessToken,
        `${environmentUrl}/api/data/v9.2/${GREENTREE_TABLE_ENTITY_SET}?$select=${GREENTREE_COLUMNS}`,
        environmentUrl,
    )
    return {
        records,
        entitySetName: GREENTREE_TABLE_ENTITY_SET,
        logicalName: GREENTREE_TABLE_LOGICAL_NAME,
        primaryIdAttribute: GREENTREE_TABLE_PRIMARY_ID,
        primaryNameAttribute: 'gr_name',
    }
}
