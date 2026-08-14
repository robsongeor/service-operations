# Hour-meter Reading Classification Schema

## Status

Provisioned, published, and structurally verified in
`https://org0d4246d7.crm6.dynamics.com` / `ServiceOperationsNew` on 14 August 2026. The local
development gate is enabled; deployment and real-Job completion smoke testing remain unperformed.

## Purpose

Every Job type contributes a completion hour-meter reading. When a physical reading is unavailable,
the optional classification records that the saved value is an estimate without making ordinary
readings ambiguous. Incorrect readings and meter resets are detected from history and are not stored
as mutable labels.

## Proposed Job column

| Display name | Logical name | Type | Required | Values |
| --- | --- | --- | --- | --- |
| Hour Meter Reading Type | `gr_hourmeterreadingtype` | Local Choice | Optional | Actual `122830000`; Estimated `122830001` |
| Hour Meter Recorded Date | `gr_hourmeterrecordeddate` | Date and Time: Date Only | Optional | Copied from the selected Job Completion Date |

Null historical rows are interpreted as Actual for backward compatibility. A later approved migration
may backfill non-null historical Job readings to Actual, but the application does not require that
write. A null historical reading date falls back to the Job Completed Date. Jobs without a reading
remain null.

## Derived assessments

`Accepted`, `Potentially incorrect`, `Possible reset`, and `Confirmed reset` are calculated from the
chronological readings. They are deliberately not Dataverse columns: an isolated spike or dip is
ignored after a later reading demonstrates the error; a lower reading becomes a confirmed reset only
after two subsequent non-decreasing lower readings. A confirmed reset starts a new usage segment.

## Application and release contract

- `VITE_HOUR_METER_CLASSIFICATION_ENABLED` defaults to `false`.
- With the gate disabled, Job selects and writes omit `gr_hourmeterreadingtype` and
  `gr_hourmeterrecordeddate`; completion continues to capture actual readings using the existing schema.
- With the gate enabled, all completion workflows may write Actual or Estimated and history surfaces
  clearly label Estimated values.
- Completion uses one visible Job Completion Date and stores the same Date Only value as the meter
  chronology date; there is no second date control in the completion dialog.
- Existing Job read/update privileges cover the optional column; verify the intended manager role can
  read and update it before release.
- The columns use ordinary, non-field-secured Job attributes, so existing Job read/update privileges
  remain the access boundary; no security role was broadened during provisioning.
- Deployment and real-Job completion smoke testing remain separate approved operations.

## Provisioning workflow

Use `scripts/manage-hour-meter-reading-schema.ps1`. It defaults to read-only `Inspect`, supports
idempotent `Provision` and `Verify`, creates one Dataverse connection per invocation, publishes only
the Job table, and verifies the exact local Choice values and Date Only contract. `-ValidateDefinition`
performs local validation without creating a Dataverse connection.

## Verification checklist

1. [x] Confirm the Job table and publisher prefix in the intended solution.
2. [x] Provision the local Choice and Date Only column with the exact contracts above and verify Web
   API logical names.
3. [ ] Verify create, read, and update for the intended manager role without broadening table privileges.
4. [ ] Complete one Job of every type using Actual in a non-production build.
5. [ ] Complete a de-identified Job using Estimated and verify the label, Equipment current value, usage
   confidence penalty, and Dataverse value.
6. [ ] Verify existing null historical rows remain readable as Actual.

## Related documents

- [`architecture/jobs.md`](architecture/jobs.md)
- [`architecture/equipment.md`](architecture/equipment.md)
- [`architecture/maintenance.md`](architecture/maintenance.md)
- [`architecture/deployment.md`](architecture/deployment.md)
- [`architecture/dataverse.md`](architecture/dataverse.md)
