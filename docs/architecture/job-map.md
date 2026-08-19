# Job Map Architecture

## Purpose

Job Map provides an authenticated geographic view of current operational Jobs at their recorded
Site. It shows Allocated, Unallocated, and Waiting for parts Jobs and does not represent live
technician, vehicle, or Equipment positions.

## Architecture

`/job-map` uses `useJobMapData`, an account/environment-scoped Operational Data Client query rather
than the global Jobs or Sites collections. The query key contains the canonical enabled-status set
and the Dataverse request returns only the Job identity, description, Equipment identity, mechanic
name, recorded Site, Customer, address, and persisted geocode fields required by the map. It follows
every `@odata.nextLink`. When every status is disabled, no Dataverse request is issued.

Jobs are grouped by their historical `gr_Site` relationship. Each Site produces at most one marker
and the marker count is the number of Jobs matching the current filters. Single-status markers are
colour coded; mixed-status Sites use a distinct mixed marker. Nearby Sites use the same Leaflet
marker clustering behaviour as Equipment Map.

Site coordinates come from the existing authoritative Site geocode fields. Missing coordinates use
the same account/environment-scoped browser cache and authenticated `/api/equipmentgeocode`
workflow as Equipment Map. Job Map introduces no additional geocoding provider, credential, API, or
Dataverse table. Selecting a marker opens a closable Job list over the map. Selecting a Job navigates
to `/jobs?jobId=...`, which opens the canonical Job drawer and retains all existing edit and
completion workflows.

## Data Loading and Synchronization

- The three-status default query has a 20-second freshness window and five-minute unobserved memory
  retention. Exact status combinations have independent shared keys, so concurrent consumers
  deduplicate work and obsolete requests cannot replace newer results.
- Disabling a status immediately derives a safe subset from the already complete all-status result
  while the exact status query revalidates. A secondary refresh error keeps those usable locations
  visible with a scoped warning instead of blanking the map.
- Job mutations invalidate every Job Map status key. Job SignalR events, reconnect, and visibility
  recovery coalesce a refresh of currently observed Job Map queries; focused Job cores are
  invalidated independently.
- Site and Equipment mutations performed through the application also invalidate Job Map keys
  because the marker card projection contains Site address/geocode and Equipment identity.
- The map position is not reset by a background data refresh. The existing viewport key changes
  only for an intentional search, Customer, Site, or status-filter change.
- The Site geocoding response continues to update the current map immediately and persists through
  the existing authenticated server boundary. The Job Map currently subscribes only to Job events,
  so Site- or Equipment-only changes made by another user reconcile on the next visibility return or
  stale route re-entry unless a Job event also occurs. Central app-shell Site and Equipment realtime
  dispatch remains a later synchronization phase.

## Business Rules

- Only Allocated, Unallocated, and Waiting for parts Jobs are in scope; all three are enabled by
  default and can be filtered independently.
- Location is the Job's recorded Site, not the Equipment's current Site. This preserves historical
  accuracy when Equipment moves.
- Jobs without a Site, Sites without an address, and unresolved addresses remain included in the
  visible unmapped count and never silently disappear.
- Customer is derived through `gr_Site.gr_Customer`.
- Search covers Job number, description, Equipment identity, Site, Customer, and mechanic.
- Opening a Job delegates to the Jobs screen rather than duplicating editing or completion logic.

## Dataverse, APIs, and Services

- Read-only Jobs: `gr_job` / `gr_jobs` with `gr_Site`, `gr_Equipment`, and `gr_Mechanic` expansions.
- Read-only Site and Customer relationship through the Job's `gr_Site` expansion; Job Map no longer
  downloads the complete `gr_sites` collection.
- Existing Site geocode fields: `gr_geocodelatitude`, `gr_geocodelongitude`,
  `gr_geocodesourceaddress`, `gr_geocodeformattedaddress`, and `gr_geocoderesolvedon`.
- Existing authenticated endpoint: `POST /api/equipmentgeocode`.
- Existing Geoapify and OpenStreetMap configuration described by Equipment Map.

No schema or security-role change is required.

## Related Files

- [`../../src/alpha/job-map/JobMapScreen.tsx`](../../src/alpha/job-map/JobMapScreen.tsx)
- [`../../src/alpha/job-map/useJobMapData.ts`](../../src/alpha/job-map/useJobMapData.ts)
- [`../../src/alpha/job-map/jobMapApi.ts`](../../src/alpha/job-map/jobMapApi.ts)
- [`../../src/alpha/job-map/JobLocationMap.tsx`](../../src/alpha/job-map/JobLocationMap.tsx)
- [Jobs](jobs.md)
- [Equipment Map](equipment-map.md)
- [Routing](routing.md)
