# Equipment Map Dataverse Schema

## Purpose

Equipment Map stores derived address coordinates on the authoritative Site so all signed-in
devices can reuse a completed Geoapify resolution. The Site address remains authoritative;
coordinates are derived cache data and are valid only while `gr_geocodesourceaddress` exactly
matches the current `gr_address` value.

## Site columns

All columns are optional and belong to the existing organization-owned `gr_site` table.

| Display name | Logical name | Type | Purpose |
| --- | --- | --- | --- |
| Geocode Latitude | `gr_geocodelatitude` | Decimal, 6 places, -90 to 90 | Resolved latitude |
| Geocode Longitude | `gr_geocodelongitude` | Decimal, 6 places, -180 to 180 | Resolved longitude |
| Geocode Source Address | `gr_geocodesourceaddress` | Text, 500 | Exact Site address that was resolved |
| Geocode Formatted Address | `gr_geocodeformattedaddress` | Text, 500 | Bounded provider display value |
| Geocode Resolved On | `gr_geocoderesolvedon` | Date and time, User Local | Resolution attempt timestamp |

A resolved timestamp and matching source address with empty coordinates represents a completed
“not found” result. Changing `gr_address` invalidates both matched and not-found results without
requiring a synchronous cleanup write.

## Write boundary

`POST /api/equipmentgeocode` validates the delegated Dataverse token, resolves missing addresses,
and writes only the five derived fields with bounded four-at-a-time Dataverse concurrency. An
individual Site failure does not roll back successful cache writes for other Sites. It never changes
`gr_address`, Site ownership, Customer, or Equipment. A persistence failure does not discard the
coordinates returned to the requesting browser; its account/environment-scoped IndexedDB cache
remains the device fallback.

## Provisioning

Use `scripts/manage-equipment-map-site-geocode-schema.ps1` with `Inspect`, `Provision`, or `Verify`.
The script is idempotent, uses one Dataverse connection, adds the fields to the
`ServiceOperationsNew` solution, publishes Site metadata, and verifies exact types and bounds.
