import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { groupEquipmentBySite } from '../src/alpha/equipment-map/equipmentMap.ts'
import type { Equipment } from '../src/alpha/jobs/types/equipment.types.ts'

const require = createRequire(import.meta.url)
const service = require('../api/services/equipmentGeocodingService.js') as {
    geocode: (request: { method: string; headers: Record<string, string>; body: unknown }) => Promise<{ status: number; body: string }>
    test: {
        addressSuggestionFromGeoapify: (value: unknown) => unknown
        coordinateFromGeoapify: (value: unknown) => unknown
        normalizeAddressQuery: (value: unknown) => string
        normalizeLocations: (body: unknown) => unknown
        resolveLocations: (
            locations: Array<{ siteId: string; address: string }>,
            resolver: (location: { siteId: string; address: string }) => Promise<unknown>,
        ) => Promise<Array<{ siteId: string; coordinate: unknown; status: string }>>
    }
}

test('Geoapify autocomplete input and results are bounded and sanitized', () => {
    assert.equal(service.test.normalizeAddressQuery({ query: '  12   Queen Street  ' }), '12 Queen Street')
    assert.equal(service.test.normalizeAddressQuery({ query: 'ab' }), '')
    assert.deepEqual(service.test.addressSuggestionFromGeoapify({
        place_id: 'place-1', formatted: '12 Queen Street, Auckland 1010, New Zealand',
        address_line1: '12 Queen Street', address_line2: 'Auckland 1010, New Zealand', suburb: 'Auckland Central', lat: -36.85, lon: 174.76,
    }), {
        id: 'place-1', formattedAddress: '12 Queen Street, Auckland 1010, New Zealand',
        addressLine1: '12 Queen Street', addressLine2: 'Auckland 1010, New Zealand', siteName: 'Auckland Central', latitude: -36.85, longitude: 174.76,
    })
    assert.equal(service.test.addressSuggestionFromGeoapify({ formatted: 'Invalid', lat: -91, lon: 174.76 }), null)
})

test('Equipment Map groups Equipment by the authoritative Site relationship', () => {
    const equipment = [
        { gr_equipmentid: 'e2', gr_fleet: '10', gr_serial: null, gr_make: null, gr_model: null, gr_Site: { gr_siteid: 's1', gr_name: 'Workshop', gr_address: '1 Main Road', gr_Customer: { gr_customerid: 'c1', gr_name: 'Alpha' } } },
        { gr_equipmentid: 'e1', gr_fleet: '2', gr_serial: null, gr_make: null, gr_model: null, gr_Site: { gr_siteid: 's1', gr_name: 'Workshop', gr_address: '1 Main Road', gr_Customer: { gr_customerid: 'c1', gr_name: 'Alpha' } } },
        { gr_equipmentid: 'e3', gr_fleet: 'Unassigned', gr_serial: null, gr_make: null, gr_model: null },
    ] satisfies Equipment[]

    const sites = groupEquipmentBySite(equipment)
    assert.equal(sites.length, 1)
    assert.equal(sites[0].customerId, 'c1')
    assert.deepEqual(sites[0].equipment.map((item) => item.gr_equipmentid), ['e1', 'e2'])
})

test('geocoding input is bounded, distinct, and address-safe', () => {
    assert.deepEqual(service.test.normalizeLocations({ locations: [{ siteId: 's1', address: ' 1  Main Road ' }] }), [{ siteId: 's1', address: '1 Main Road' }])
    assert.equal(service.test.normalizeLocations({ locations: [{ siteId: 's1', address: 'A' }, { siteId: 's1', address: 'B' }] }), null)
    assert.equal(service.test.normalizeLocations({ locations: [{ siteId: 's1', address: '' }] }), null)
    assert.equal(service.test.normalizeLocations({ locations: Array.from({ length: 201 }, (_, index) => ({ siteId: `s${index}`, address: 'Address' })) }), null)
})

test('geocoding accepts only finite coordinates within world bounds', () => {
    assert.deepEqual(service.test.coordinateFromGeoapify({ lat: -36.85, lon: 174.76, formatted: 'Auckland, New Zealand' }), {
        latitude: -36.85,
        longitude: 174.76,
        formattedAddress: 'Auckland, New Zealand',
    })
    assert.equal(service.test.coordinateFromGeoapify({ lat: -91, lon: 174.76 }), null)
    assert.equal(service.test.coordinateFromGeoapify({ lat: -36.85, lon: Number.NaN }), null)
})

test('geocoding settles an individual provider failure without rejecting the batch', async () => {
    const results = await service.test.resolveLocations([
        { siteId: 'matched', address: '1 Main Road' },
        { siteId: 'failed', address: '2 Main Road' },
    ], async (location) => {
        if (location.siteId === 'failed') throw new Error('provider')
        return { latitude: -36.85, longitude: 174.76, formattedAddress: 'Auckland' }
    })
    assert.equal(results.length, 2)
    assert.equal(results[0].status, 'matched')
    assert.equal(results[1].status, 'provider_failed')
    assert.equal(results[1].coordinate, null)
})

test('Equipment geocoding rejects anonymous callers before provider access', async () => {
    const response = await service.geocode({ method: 'POST', headers: {}, body: { locations: [] } })
    assert.equal(response.status, 401)
    assert.match(response.body, /Authentication is required/)
})

test('Equipment geocoding reads the dedicated Dataverse bearer header case-insensitively', () => {
    assert.equal(service.test.requestHeader({
        method: 'POST',
        headers: { 'X-Dataverse-Authorization': ' Bearer delegated-token ' },
        body: {},
    }, 'x-dataverse-authorization'), 'Bearer delegated-token')
})

test('Equipment Map keeps Geoapify credentials out of client code and uses canonical routing', () => {
    const screen = readFileSync(new URL('../src/alpha/equipment-map/EquipmentMapScreen.tsx', import.meta.url), 'utf8')
    const clientApi = readFileSync(new URL('../src/alpha/equipment-map/equipmentGeocodingApi.ts', import.meta.url), 'utf8')
    const locationMap = readFileSync(new URL('../src/alpha/equipment-map/EquipmentLocationMap.tsx', import.meta.url), 'utf8')
    const mapCache = readFileSync(new URL('../src/alpha/equipment-map/equipmentMapCache.ts', import.meta.url), 'utf8')
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(screen + clientApi, /GEOAPIFY_API_KEY/)
    assert.match(clientApi, /'X-Dataverse-Authorization': `Bearer \$\{accessToken\}`/)
    assert.match(screen, /navigate\(`\/equipment\?equipmentId=/)
    assert.match(screen, /\.slice\(0, 20\)/)
    assert.match(screen, /sites=\{mappedSites\}/)
    assert.doesNotMatch(screen, /pendingAddressCount === 0[^\n]*mappedSites/)
    assert.match(locationMap, /classList\.toggle\('selected'/)
    assert.doesNotMatch(locationMap, /marker\.setIcon/)
    assert.match(locationMap, /markerClusterGroup/)
    assert.match(locationMap, /leaflet\.markercluster/)
    assert.match(screen, /result\.status === 'provider_failed'\) return/)
    assert.match(mapCache, /value\.status === 'not_found'/)
    assert.match(screen, /Resolving Site addresses… \{resolvedAddressCount\} of \{addressedSiteCount\}/)
    assert.match(app, /path="\/equipment-map"/)
})

test('Equipment edit reuses searchable Customer and Site creation workflow', () => {
    const drawer = readFileSync(new URL('../src/alpha/equipment/components/EquipmentDrawer.tsx', import.meta.url), 'utf8')
    const screen = readFileSync(new URL('../src/alpha/equipment/EquipmentScreen.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(drawer, /Customer \(site filter\)/)
    assert.match(drawer, /id="equipment-customer"/)
    assert.match(drawer, /\+ Add new customer/)
    assert.match(screen, /mode="edit"[\s\S]*onCreateCustomer=\{createCustomer\}[\s\S]*onCreateSite=\{createSite\}/)
})
