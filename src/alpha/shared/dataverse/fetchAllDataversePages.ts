export type DataverseCollectionPage<T> = {
    value?: T[]
    '@odata.nextLink'?: string
}

/** Follow Dataverse-provided next links verbatim so server paging cookies remain intact. */
export async function fetchAllDataversePages<T>(
    initialUrl: string,
    init: RequestInit,
    ensureSuccess: (response: Response) => void | Promise<void>,
): Promise<T[]> {
    const rows: T[] = []
    let nextUrl: string | undefined = initialUrl

    while (nextUrl) {
        const response = await fetch(nextUrl, init)
        await ensureSuccess(response)
        const page = await response.json() as DataverseCollectionPage<T>
        rows.push(...(page.value ?? []))
        nextUrl = page['@odata.nextLink']
    }

    return rows
}
