# Job Map Architecture

## Purpose

Job Map provides an authenticated geographic view of current operational Jobs at their recorded
Site. It shows Allocated, Unallocated, and Waiting for parts Jobs and does not represent live
technician, vehicle, or Equipment positions.

## Architecture

`/job-map` uses the canonical `useJobs` loader, so its Job data, device cache, pagination, and
realtime refresh behaviour remain aligned with the Jobs register. Jobs are grouped by their
historical `gr_Site` relationship. Each Site produces at most one marker and the marker count is the
number of Jobs matching the current filters. Single-status markers are colour coded; mixed-status
Sites use a distinct mixed marker. Nearby Sites use the same Leaflet marker clustering behaviour as
Equipment Map.

Site coordinates come from the existing authoritative Site geocode fields. Missing coordinates use
the same account/environment-scoped browser cache and authenticated `/api/equipmentgeocode`
workflow as Equipment Map. Job Map introduces no additional geocoding provider, credential, API, or
Dataverse table. Selecting a marker opens a closable Job list over the map. Selecting a Job navigates
to `/jobs?jobId=...`, which opens the canonical Job drawer and retains all existing edit and
completion workflows.

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
- Read-only Sites and Customer relationship: `gr_site` / `gr_sites`, `gr_Customer`.
- Existing Site geocode fields: `gr_geocodelatitude`, `gr_geocodelongitude`,
  `gr_geocodesourceaddress`, `gr_geocodeformattedaddress`, and `gr_geocoderesolvedon`.
- Existing authenticated endpoint: `POST /api/equipmentgeocode`.
- Existing Geoapify and OpenStreetMap configuration described by Equipment Map.

No schema or security-role change is required.

## Related Files

- [`../../src/alpha/job-map/JobMapScreen.tsx`](../../src/alpha/job-map/JobMapScreen.tsx)
- [`../../src/alpha/job-map/JobLocationMap.tsx`](../../src/alpha/job-map/JobLocationMap.tsx)
- [Jobs](jobs.md)
- [Equipment Map](equipment-map.md)
- [Routing](routing.md)
