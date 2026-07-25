# Hour Meter Recorded Date Dataverse Schema

The Maintenance History workflow requires one new optional Equipment column.

| Display name | Logical name | Table | Type | Behaviour |
| --- | --- | --- | --- | --- |
| Current Hour Meter Recorded Date | `gr_currenthourmeterrecordeddate` | `gr_equipment` | Date Only | Date Only |

This date is saved with `gr_currenthourmeter`. It is the authoritative date shown beside the
Last Known Hour Meter and must not be inferred from Equipment `modifiedon`.

The application changes expect this column. Provisioning is intentionally deferred until
explicitly approved. The idempotent setup artifact is
`scripts/setup-hour-meter-recorded-date-schema.ps1`.
