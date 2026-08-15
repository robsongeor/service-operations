# Equipment Map Architecture

## Purpose

Equipment Map provides an authenticated geographic view of Equipment at its current assigned
Site. It is an assigned-location dashboard, not a GPS or live-tracking system.

## Architecture

`/equipment-map` reuses `useEquipmentManager` and the existing Equipment projection. Equipment
is grouped by its authoritative `gr_Site` relationship; Customer is derived through
`gr_Site.gr_Customer`. A Site produces at most one marker and its marker count represents the
currently filtered Equipment at that Site.

The browser sends one bounded set of distinct Site IDs and `gr_address` values to the authenticated
`/api/equipmentgeocode` endpoint. The server validates the delegated Dataverse bearer token through
`WhoAmI`, keeps `GEOAPIFY_API_KEY` server-only, restricts geocoding to New Zealand, and returns only
Site ID, submitted address, coordinates, and the provider's bounded formatted address. The client
sends batches of at most 20 Sites and caches each completed batch immediately. The map waits for the
initial address pass to settle before fitting its markers, avoiding repeated refits while batches arrive.
Within a batch, provider requests start at a bounded four-per-second rate; temporary failures receive
one bounded retry and then settle only that Site as Not mapped rather than rejecting the batch. Results
are cached in a bounded Function process cache. The client also persists results in IndexedDB,
scoped by signed-in account and Dataverse environment and keyed by the Site ID and exact current
address. The persisted cache is restored before any geocoding request begins, so reopening the app
on the same device does not repeat Geoapify requests for unchanged addresses. Resolved coordinates
are also persisted as derived fields on the authoritative Site, allowing every device to reuse them.
An exact source-address comparison invalidates prior coordinates when `gr_address` changes. Browser
storage or shared persistence failure remains non-fatal and falls back to resolving addresses normally.

Leaflet renders an interactive raster-tile map from configurable
`VITE_EQUIPMENT_MAP_TILE_URL`, defaulting to the standard OpenStreetMap tile endpoint for normal,
low-volume interactive viewing. Selecting a marker updates its style without rebuilding or refitting
the map. Nearby Site markers cluster by screen distance and split as users zoom; maximum-zoom clusters
spiderfy overlapping locations so dense areas remain selectable. Selecting a Site opens a closable
details window over the map; keyboard-enabled markers retain the same selection workflow. Selecting
Equipment there navigates to the canonical Equipment drawer through
`/equipment?equipmentId=...`.
On desktop, the map consumes the remaining viewport height below the page header and filters; smaller
screens retain a bounded scrollable layout.

## Business Rules

- Location means the current Site address; it never claims current machine telemetry.
- Equipment without a Site is not mapped because no authoritative current location exists.
- Sites without an address or without a geocoding match remain unmapped and do not produce a marker.
- Customer remains derived through Site and is never duplicated on Equipment.
- Moving Equipment changes its current map grouping but never rewrites historical Jobs or evidence.
- Active Equipment is the default view; users may include or isolate inactive Equipment.

## Security and External Services

Geoapify receives Site address text only after an authenticated office user opens the map. The API
key is never returned to the browser. Errors omit upstream bodies, credentials, and addresses. The
page shows a safe warning when geocoding is unavailable or unconfigured.

OpenStreetMap supplies best-effort public tiles without a credential for normal interactive use;
visible attribution is retained and the browser honours provider caching. Leaflet remains
provider-independent; production can replace the public tile URL through deployment
configuration without changing feature code.

## Dataverse and API Contracts

- Read-only Equipment: `gr_equipment` / `gr_equipments`.
- Read-only current Site relationship: `gr_Site`.
- Authoritative Site address: `gr_address`.
- Derived Site geocode cache: `gr_geocodelatitude`, `gr_geocodelongitude`,
  `gr_geocodesourceaddress`, `gr_geocodeformattedaddress`, and `gr_geocoderesolvedon`.
- Read-only derived Customer: `gr_Site.gr_Customer`.
- Authenticated server route: `POST /api/equipmentgeocode`, maximum 200 distinct locations.

No relationship or new table is required. Existing Site read/update permission protects the derived
cache fields; the endpoint writes with the authenticated office user's delegated Dataverse token.
See [Equipment Map Dataverse schema](../equipment-map-dataverse-schema.md).

## Deployment Readiness

Production markers require a separately created Geoapify key in the server-only
`GEOAPIFY_API_KEY` Static Web App / Function setting. Restrict the key to the approved API and
deployment origin/IP controls available in the provider account. Do not use a `VITE_` variable for
the key. Deployment and signed-in smoke testing remain explicit approval gates.

## Related Files

- [`../../src/alpha/equipment-map/EquipmentMapScreen.tsx`](../../src/alpha/equipment-map/EquipmentMapScreen.tsx)
- [`../../src/alpha/equipment-map/EquipmentLocationMap.tsx`](../../src/alpha/equipment-map/EquipmentLocationMap.tsx)
- [`../../api/services/equipmentGeocodingService.js`](../../api/services/equipmentGeocodingService.js)
- [Equipment Map Dataverse schema](../equipment-map-dataverse-schema.md)
- [Equipment](equipment.md)
- [Routing](routing.md)
- [Security](security.md)
- [Deployment](deployment.md)
