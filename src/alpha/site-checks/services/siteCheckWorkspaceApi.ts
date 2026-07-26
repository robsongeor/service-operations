import type { Mechanic } from '../../jobs/types/mechanic.types'
import type { Site } from '../../jobs/types/site.types'

const DEFAULT_API_URL = `${import.meta.env?.VITE_DATAVERSE_URL ?? ''}/api/data/v9.2`

type Collection<T> = {
    value?: T[]
    '@odata.nextLink'?: string
}

function headers(accessToken: string) {
    return {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        Prefer: 'odata.maxpagesize=500',
    }
}

async function readAll<T>(
    accessToken: string,
    initialUrl: string,
    fallback: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const fetcher = options.fetcher ?? fetch
    const records: T[] = []
    let url: string | undefined = initialUrl
    while (url) {
        if (!url.startsWith(apiUrl)) throw new Error(`${fallback} returned an invalid continuation link.`)
        const response = await fetcher(url, { cache: 'no-store', headers: headers(accessToken) })
        if (!response.ok) throw new Error(fallback)
        const body = await response.json() as Collection<T>
        if (!Array.isArray(body.value)) throw new Error(fallback)
        records.push(...body.value)
        url = typeof body['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : undefined
    }
    return records
}

export function fetchSiteCheckWorkspaceSites(
    accessToken: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const query = [
        '$select=gr_siteid,gr_name,gr_address',
        '$expand=gr_Customer($select=gr_customerid,gr_name)',
        '$orderby=gr_name asc',
    ].join('&')
    return readAll<Site>(
        accessToken,
        `${apiUrl}/gr_sites?${query}`,
        'Sites could not be loaded for the Site Checks workspace.',
        options,
    )
}

export function fetchSiteCheckWorkspaceMechanics(
    accessToken: string,
    options: { apiUrl?: string; fetcher?: typeof fetch } = {},
) {
    const apiUrl = options.apiUrl ?? DEFAULT_API_URL
    const query = [
        '$select=gr_mechanicid,gr_name,gr_email,gr_phone,statecode',
        '$orderby=gr_name asc',
    ].join('&')
    return readAll<Mechanic>(
        accessToken,
        `${apiUrl}/gr_mechanics?${query}`,
        'Technicians could not be loaded for the Site Checks workspace.',
        options,
    )
}
