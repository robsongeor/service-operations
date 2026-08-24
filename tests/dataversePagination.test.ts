import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchAllDataversePages } from '../src/alpha/shared/dataverse/fetchAllDataversePages.ts'
import { buildDataverseIdFilterBatches } from '../src/alpha/shared/dataverse/boundedDataverseFilters.ts'

test('shared Dataverse paging follows opaque next links and combines all rows', async () => {
    const originalFetch = globalThis.fetch
    const requested: string[] = []
    globalThis.fetch = (async (input: string | URL | Request) => {
        requested.push(String(input))
        if (requested.length === 1) {
            return new Response(JSON.stringify({
                value: [{ id: 'first' }],
                '@odata.nextLink': 'https://example.invalid/next?cookie=opaque',
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return new Response(JSON.stringify({ value: [{ id: 'second' }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })
    }) as typeof fetch

    try {
        const rows = await fetchAllDataversePages<{ id: string }>(
            'https://example.invalid/first',
            { headers: { Authorization: 'Bearer test' } },
            (response) => assert.equal(response.ok, true),
        )
        assert.deepEqual(rows, [{ id: 'first' }, { id: 'second' }])
        assert.deepEqual(requested, [
            'https://example.invalid/first',
            'https://example.invalid/next?cookie=opaque',
        ])
    } finally {
        globalThis.fetch = originalFetch
    }
})

test('bounded Dataverse ID filters de-duplicate IDs and split large scoped collections', () => {
    const ids = Array.from({ length: 82 }, (_, index) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`)
    const filters = buildDataverseIdFilterBatches('_gr_site_value', [ids[0], ...ids, `{${ids[0]}}`])
    assert.equal(filters.length, 3)
    assert.equal(filters[0].split(' or ').length, 40)
    assert.equal(filters[1].split(' or ').length, 40)
    assert.equal(filters[2].split(' or ').length, 2)
    assert.equal(filters.join('|').match(new RegExp(ids[0], 'g'))?.length, 1)
})

test('shared Dataverse paging stops before parsing an unsuccessful page', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('denied', { status: 403 })) as typeof fetch
    try {
        await assert.rejects(
            fetchAllDataversePages('https://example.invalid/first', {}, (response) => {
                if (!response.ok) throw new Error('safe failure')
            }),
            /safe failure/,
        )
    } finally {
        globalThis.fetch = originalFetch
    }
})
