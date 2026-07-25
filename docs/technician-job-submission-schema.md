# Technician Job Card Submission

Phase 1 exposes `/portal/job/:token` without exposing the authenticated management application.
An authenticated office request generates a 32-byte random token. Dataverse stores only its
SHA-256 hash. Anonymous validation and submission run through the server API using a dedicated
Dataverse application user with minimum privileges on the Job table.

## Job columns

| Display name | Logical name | Type |
| --- | --- | --- |
| Technician Submission Token Hash | `gr_techniciansubmissiontokenhash` | Single line text, 64 |
| Technician Submission Token Created On | `gr_techniciansubmissiontokencreatedon` | Date and time, User local |
| Technician Submission Token Expires On | `gr_techniciansubmissiontokenexpireson` | Date and time, User local |
| Technician Submission Token Used | `gr_techniciansubmissiontokenused` | Yes/No |
| Technician Submission Submitted On | `gr_techniciansubmissionsubmittedon` | Date and time, User local |
| Technician Submission Hour Meter | `gr_techniciansubmissionhourmeter` | Whole number |
| Technician Submission Story | `gr_techniciansubmissionstory` | Multiple lines of text, 10,000 |

The existing `gr_jobcardstatus` and `gr_jobcardsubmittedon` fields record the Job Card
transition to `Submitted`. Technician submission does not change `gr_status`,
`gr_completeddate`, `gr_hourmeter`, Equipment, maintenance plans, or assignments.

## Server configuration

The anonymous endpoint requires server-only `DATAVERSE_URL`, `DATAVERSE_TENANT_ID`,
`DATAVERSE_CLIENT_ID`, and `DATAVERSE_CLIENT_SECRET`. Never expose them through `VITE_`
variables. The application user needs read access to the minimum Job, Equipment, Site, and
Customer fields returned by the endpoint and update access only to the submission and Job
Card fields above.

The approved identity and role design is documented in
`docs/public-portal-service-identity.md`. Standard Dataverse roles grant table-level Write,
so the server-side submission service remains the fixed write-payload boundary.

The default token lifetime is seven days. Generation accepts a bounded 1–720 hour lifetime.
Submission revalidates expiry and used state, then uses the record ETag with `If-Match` so
near-simultaneous repeat submissions cannot both succeed.

Future portal phases may add separate evidence, checklist, inspection, signature, and
customer sign-off records without widening this minimal public Job response.

## Expanded Job Card submission

The expanded submission keeps the original Job fields for compatibility and adds immutable
technician evidence. The following optional Job columns hold conditional submission
metadata:

| Display name | Logical name | Type |
| --- | --- | --- |
| Technician Submission Further Work Required | `gr_techniciansubmissionfurtherworkrequired` | Yes/No, default No |
| Technician Submission Further Work Details | `gr_techniciansubmissionfurtherworkdetails` | Multiple lines, 10,000 |
| Technician Submission Safety Issue Identified | `gr_techniciansubmissionsafetyissueidentified` | Yes/No, default No |
| Technician Submission Safety Issue Details | `gr_techniciansubmissionsafetyissuedetails` | Multiple lines, 10,000 |

Time and parts are append-only child records rather than repeated Job columns:

### Job Card Submission Time Entry (`gr_jobcardsubmissiontimeentry`)

- Entity set: `gr_jobcardsubmissiontimeentries`
- Job lookup: `gr_Job`
- Date: `gr_entrydate` — Date Only
- Total Hours: `gr_totalhours` — Decimal, precision 2, 0–24
- Kilometres: `gr_kilometres` — Whole number, minimum 0

### Job Material (`gr_jobmaterial`)

- Entity set: `gr_jobmaterials`
- Job lookup: `gr_Job`
- Material: `gr_material` — Single line text, 500
- Display Order: `gr_displayorder` — Whole number

Both child tables are User owned and directly related to Job. “Parts” remains the technician
UI label, while Job Material supports parts, consumables, oils, grease, and chemicals without
an inventory schema. Their model deliberately
allows a Technician lookup and submission grouping identifier to be added later without
rewriting historical rows. This phase does not implement inventory, quantity, part number,
or stock behaviour.

The server submits child creates and the final Job update in one Dataverse change set. It
does not update operational Job Status, Completed Date, Equipment, maintenance, assignments,
quotes, or office tasks.

The schema was provisioned and published on 25 July 2026. The idempotent
`scripts/setup-job-card-submission-expansion-schema.ps1` preflights exact table, column,
relationship, type, required-level, length, behaviour, range, and default metadata.

## Generic Job Photos

Technician photos use the generic User-owned `Job Photo` (`gr_jobphoto`) table so future
office, WOF, Quote, delivery-inspection, and customer upload features can reuse the same
schema. This phase implements technician uploads only.

| Display name | Logical name | Type |
| --- | --- | --- |
| Job | `gr_Job` | Lookup to Job |
| Photo | `gr_photo` | File, maximum 10,240 KB |
| File Name | `gr_filename` | Single line text, 255 |
| Uploaded On | `gr_uploadedon` | Date and time, User local |
| Display Order | `gr_displayorder` | Whole number |
| Upload Key | `gr_uploadkey` | Single line text, 64 |

The entity set is `gr_jobphotos`. The server derives the non-secret upload key from the
submission token hash and display order. It allows a failed submission retry to reuse a
staged row rather than create duplicates. The raw token is never stored.

Dataverse File columns cannot be populated in an ordinary row create/update operation.
For each selected photo, the server therefore creates or reuses its metadata row and uploads
the binary through the authenticated File-column endpoint. Only after all photos upload
successfully does it commit the remaining child records and final Job Card submission state.
An upload failure leaves the token usable; staged photos remain inaccessible from the
manager review until the Job Card is successfully submitted and can be safely overwritten
by a retry.

Public lookup never returns photos or Dataverse file locations. After submission, the
authenticated management app reads Job Photo metadata and downloads the File value directly
with the office user's Dataverse bearer token. No predictable anonymous photo URL is
created.

The schema was provisioned and published on 25 July 2026. The Public Portal Service role has
Organization Create, Read, Write, and Append on all three child tables and Job Append To,
which Dataverse requires to create lookup-related children. Delete, Assign, and Share are
not granted.
