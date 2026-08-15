import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'

export const GREENTREE_TABLE_DISPLAY_NAME = 'GreentreeEquipmentTable'

export type GreentreeRecord = Record<string, unknown>

export type GreentreeTableResult = {
    records: GreentreeRecord[]
    entitySetName: string
    logicalName: string
    primaryIdAttribute: string
    primaryNameAttribute: string | null
}

type EntityDefinition = {
    EntitySetName: string
    LogicalName: string
    PrimaryIdAttribute: string
    PrimaryNameAttribute?: string | null
    DisplayName?: { UserLocalizedLabel?: { Label?: string } | null } | null
}

function cleanEnvironmentUrl(value: string) {
    return value.trim().replace(/\/+$/, '')
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
            Prefer: 'odata.maxpagesize=5000, odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
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

async function acquireExternalToken(
    instance: IPublicClientApplication,
    account: AccountInfo,
    environmentUrl: string,
) {
    const request = {
        account,
        scopes: [`${environmentUrl}/user_impersonation`],
        redirectUri: import.meta.env.VITE_MSAL_SILENT_REDIRECT_URI || window.location.origin,
    }
    try {
        return (await instance.acquireTokenSilent(request)).accessToken
    } catch {
        return (await instance.acquireTokenPopup(request)).accessToken
    }
}

export async function fetchGreentreeEquipmentTable(
    instance: IPublicClientApplication,
    account: AccountInfo | null,
    configuredEnvironmentUrl: string,
): Promise<GreentreeTableResult> {
    if (!account) throw new Error('No signed-in Microsoft account is available.')
    const environmentUrl = cleanEnvironmentUrl(configuredEnvironmentUrl)
    if (!environmentUrl) {
        throw new Error('Set VITE_GREENTREE_DATAVERSE_URL to the Dataverse organization URL that contains GreentreeEquipmentTable.')
    }
    if (!/^https:\/\/[^/]+\.dynamics\.com$/i.test(environmentUrl)) {
        throw new Error('VITE_GREENTREE_DATAVERSE_URL must be a Dataverse organization URL, for example https://example.crm6.dynamics.com.')
    }

    const token = await acquireExternalToken(instance, account, environmentUrl)
    const apiUrl = `${environmentUrl}/api/data/v9.2`
    const definitions = await get(token, `${apiUrl}/EntityDefinitions?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName`)
    const entities = (definitions.value ?? []) as EntityDefinition[]
    const target = entities.find((entity) =>
        entity.DisplayName?.UserLocalizedLabel?.Label?.localeCompare(GREENTREE_TABLE_DISPLAY_NAME, undefined, { sensitivity: 'accent' }) === 0,
    ) ?? entities.find((entity) => entity.LogicalName.toLowerCase().includes('greentreeequipment'))

    if (!target?.EntitySetName) {
        throw new Error(`The table ${GREENTREE_TABLE_DISPLAY_NAME} was not found in the configured environment.`)
    }

    const records = await getAllRecords(
        token,
        `${apiUrl}/${encodeURIComponent(target.EntitySetName)}`,
        environmentUrl,
    )
    return {
        records,
        entitySetName: target.EntitySetName,
        logicalName: target.LogicalName,
        primaryIdAttribute: target.PrimaryIdAttribute,
        primaryNameAttribute: target.PrimaryNameAttribute ?? null,
    }
}
