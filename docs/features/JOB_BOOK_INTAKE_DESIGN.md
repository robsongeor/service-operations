# Job Book Intake safety model

## Decision

Job Book entries are not Jobs. They are intake/number-ledger records that may later create one managed `gr_job` record.

This prevents incomplete daily Job Book entries from appearing in Breakdown, Service, Workshop, WOF, or Site Check workflows. There is no `Unset` Job Type. A Job Type is selected deliberately during promotion.

## Record lifecycle

1. **Intake** — a number has been allocated and the incoming work is recorded. It can be corrected by admins but is excluded from managed Job workflows.
2. **Promoted** — one `gr_job` has been created and linked. The Intake record becomes historical/read-only except for separately approved administration fields.
3. **Legacy** — imported historical ledger data that is not expected to become a managed Job.
4. **Void** — an allocated number that must not be reused. The record and reason remain auditable.

The Job Book Legacy view now reads Intake and managed Job rows from Dataverse. New Intake entries and subsequent row edits are saved directly to Dataverse; obsolete browser-only draft rows and overrides are no longer loaded or written.

## Provisioned Dataverse table

The organization-owned `gr_jobbookentry` / `gr_jobbookentries` table was provisioned, published, and verified in `ServiceOperationsNew` on 16 August 2026 with:

- `gr_jobbookentryid` — primary key
- `gr_jobnumber` — required AutoNumber primary name using `{SEQNUM:6}`; alternate key `gr_jobbookentry_jobnumber_key` is Active
- `gr_entrydate` — required date/time, server assigned
- `gr_stage` — required choice: Intake, Promoted, Legacy, Void
- `gr_mechanic` lookup plus `gr_mechanictext` for custom/outwork values
- `gr_equipment` lookup; equipment may be absent only when `gr_equipmentreviewrequired` is true
- `gr_customer` and `gr_site` lookups where known
- snapshot text for fleet, serial, make, model, customer, site, and address
- address verification/not-found flags
- `gr_description` — required
- `gr_customerpo`
- `gr_entered` (displayed as **GT Entry**) â€” independent marker that the admin team has entered the job into Greentree
- `gr_timecloudentered` (displayed as **Timecloud Entry**) â€” independent marker that the admin team has entered the job into Timecloud
- `gr_promotedjob` — optional lookup to `gr_job`
- `gr_promotedon`, `gr_promotedby`
- `gr_voidreason` — required when Void

The first Intake allocation is seeded at `145969`, one above the highest numeric Job Number observed during provisioning. Dataverse assigns the value as part of Intake creation; the browser never calculates or submits it.

The Service Operations role has organization-depth Create, Read, Write, Append, and Append To on the Intake table. Delete, Assign, and Share were not granted; a mistaken allocation must be retained and moved to Void.

The `gr_job_jobnumber_key` alternate key was provisioned and verified Active after the latest preflight found no duplicate values among 399 numbered Jobs. No existing Job was changed.

Snapshots preserve what was known when the number was allocated; lookups support later reconciliation.

Managed `gr_job` records carry the same two independent administrative markers in `gr_gtentered` and `gr_timecloudentered`. They are not derived from Job status and neither marker implies that the other task is complete.

## Atomic promotion contract

Promotion must be a single server-side operation (custom API/plugin or equivalent transaction), not two independent browser writes:

1. Lock/read the Intake record and require Stage = Intake.
2. Validate Job Number, description, equipment decision, address decision, and selected standard Job Type.
3. Create exactly one `gr_job` using the already allocated Job Number.
4. Set `gr_promotedjob`, promotion audit fields, and Stage = Promoted.
5. Return the created Job ID.

Use the Intake ID as an idempotency key and enforce unique Job Number values so retrying cannot create a second Job. WOF and Site Check remain protected specialist creation workflows and are not standard promotion choices.

## Jobs screen behaviour

- The standard Jobs tabs query only `gr_job`; Intake records cannot appear in type tabs.
- The Jobs header provides a direct route to Job Book Intake.
- Promoted rows can open their linked managed Job.
- A future combined “All work” view may display both record kinds, but it must label the source and never treat Intake as a Job.

## Next production step

Implement and verify atomic promotion. Do not enable the prototype's Create managed Job button before the server-side promotion operation and its idempotency tests exist.
