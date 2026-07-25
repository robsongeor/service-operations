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
