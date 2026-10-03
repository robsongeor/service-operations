# Azure Job Card Storage and Operations

## Purpose

Technician Job Card requests and accepted evidence are retained in Azure without giving the
anonymous technician workflow any Dataverse identity or access. Azure Table Storage holds
the dispatch snapshot, token lifecycle, structured submission, review state, and audit
fields. A private Blob container holds photographs.

## Required Azure resources

Create these resources through the approved infrastructure process; the application does
not create them at runtime:

1. A dedicated general-purpose v2 Storage Account with public blob access disabled,
   HTTPS-only transport, minimum TLS 1.2, and the narrowest practical network access.
2. Table `JobCardRequests` (override with `JOB_CARD_TABLE_NAME`).
3. Private container `job-card-evidence` (override with `JOB_CARD_PHOTO_CONTAINER`).
4. Azure Communication Services Email with a verified sender domain, or set notifications
   to `disabled` until the email resource is approved.
5. Static Web App / Function application settings listed below.

Prefer a managed identity with Storage Table Data Contributor and Storage Blob Data
Contributor when the hosting combination supports it. This implementation currently uses
`AZURE_STORAGE_CONNECTION_STRING`; keep it only in Function application settings and
rotate it through the normal secret process. Never add it to Vite or repository variables.

## Server settings

```text
DATAVERSE_URL                         Office-token validation and office snapshot read only
AZURE_STORAGE_CONNECTION_STRING      Dedicated private Storage Account
JOB_CARD_TABLE_NAME                   JobCardRequests
JOB_CARD_PHOTO_CONTAINER              job-card-evidence
JOB_CARD_NOTIFICATION_MODE            acs | console | disabled
APP_PUBLIC_URL                        Authenticated application origin
ACS_EMAIL_CONNECTION_STRING           Required only for acs mode
ACS_EMAIL_SENDER                      Verified ACS sender
JOB_CARD_REVIEW_EMAIL_TO              Comma-separated office recipients
JOB_CARD_REVIEWER_EMAILS              Delegated reviewer allowlist (fail-closed)
```

`JOB_CARD_LOCAL_DEVELOPMENT=true` and `JOB_CARD_STORAGE_MODE=memory` are local-only. Never
set `JOB_CARD_LOCAL_DEVELOPMENT=true` in Azure. Hosted processes also reject local shortcuts;
the Vite-only bypass requires both the local-development flag and memory storage.

## Data layout and lifecycle

The raw 32-byte link token is returned once and never stored. Its SHA-256 hash is the Table
row key. A separate random review ID is used in office links. States are `active`,
`superseded`, `pendingReview`, and `reviewed`. Table fields include source Job/assignment
IDs, minimum dispatch snapshot, creator identity, created/expiry/submitted/reviewed times,
reviewer identity, notification outcome, submission values, and private photo references.

Accepted technician fields are immutable evidence. Office review adds only allowlisted office
fields: the explicit office status, bounded current note, optional GreenTree reference, review/
outcome administrator identity and server timestamps, plus a bounded append-only activity JSON
history. Every office transition copies the stored record, changes only those fields and lifecycle
status, and replaces it under the loaded ETag. A stale ETag returns conflict rather than silently
overwriting another administrator.

Office states are Pending, In review, Needs clarification, On hold, and Processed in GreenTree.
No invoice required is retired as an action; any previously saved outcome remains read-only.
The UI groups Pending under Submitted, other non-terminal states under Review, and terminal/legacy
outcomes under Completed. Existing `reviewed` rows without an office outcome derive as
`Reviewed (legacy outcome not recorded)` and never imply GreenTree processing. Opening a card or
marking Needs clarification never sends a technician message or creates a new link.

Lifecycle queries remain bounded (501-row sentinel, at most 500 scanned/displayable rows) and
sort a consistent bounded population before slicing page prefixes. Active/History API aliases
remain compatible. A separate Open jobs projection joins confirmed Dataverse delivery metadata
to batched submitted/reviewed Azure evidence; generating an `active` link does not count as a send.
See [technician submission architecture](architecture/technician-job-submission.md) for matching,
legacy-return checks, paging, permission preflight and limitations. No new storage table is created.

Photo uploads use `uploads/<token-hash>/<content-derived-id>`. Final submission revalidates Blob
size, content type, ownership metadata, token state, and Table ETag before saving those
private references. Authenticated office requests stream files through the Function.

Recommended retention policy, subject to the organisation's evidence policy:

- delete unreferenced `uploads/` blobs after 7 days;
- delete expired or superseded, unsubmitted Table rows 30 days after expiry;
- retain submitted/reviewed Table rows and their referenced blobs for the approved service-record
  period once approved, then delete both together;
- keep Storage logging shorter (for example 90 days) unless incident policy requires more.

Because accepted and orphan uploads share a private prefix, a scheduled, audited cleanup
Function must reconcile Blob names against submitted Table references before deleting
orphans. Table-row and paired evidence retention is the same operations extension and is
not automatically enabled by this change.

## Cost and monitoring controls

- Use Standard locally redundant storage unless resilience requirements justify a higher
  tier; photographs usually dominate cost.
- Keep the 20-photo, 10-MB-per-photo limits and browser compression.
- Alert on Storage capacity, Function failures, `notificationStatus=failed`, and unusual
  anonymous request volume.
- Apply Function/App Service request throttling or Front Door/WAF rate limits before broad
  external rollout.
- Review the pending queue even when email delivery fails; email is a notification, not the
  evidence source of truth.

## Deployment and verification

1. Create the Table and private container; do not enable anonymous container access.
2. Add Function settings and restart the API.
3. Retain the Application User credentials for the separate Site Check service. The
   Job-level public service never reads or uses them.
4. Generate a link as a licensed office user and verify the Table snapshot.
5. Submit a test card and photo; verify no public Dataverse requests occur.
6. Open the emailed `/job-card-reviews/<id>` link while signed in and verify the photo can be
   read only with the office bearer token.
7. Verify replay is rejected and no Job/Equipment/assignment Dataverse record changed.

## Future Dataverse import extension

Accepted evidence remains in Azure. A future import must be a separate, explicit office
action executed with the licensed office user's delegated token, with its own mapping,
idempotency key, audit result, and confirmation. The anonymous submission service must not
receive a Dataverse Application User again.

## Infrastructure and cutover

Deploy `infra/job-card-resources.json` in incremental mode to ServiceOperations, then
`infra/job-card-settings.json`. Resources include dedicated Standard LRS storage, private
photos with 30-day soft-delete, the Table, and ACS Email with an Azure-managed domain.
Settings are merged with the existing Static Web App settings; credentials are resolved
inside Azure with no secret outputs. No automatic evidence deletion is enabled.
The settings template reads and merges existing settings in an outer deployment, then
passes them as a secure object to an inner deployment, avoiding a self-reference dependency.
The owner approved replacing unused legacy Job links on 2 October 2026. Regenerate them
from the office app; existing submitted Dataverse evidence is preserved. Notifications and
reviewer access default to `georger@liftrucks.co.nz`; the existing pilot recipient restriction remains.

Local adapter verification: start in-memory Azurite, then run
`JOB_CARD_AZURITE_TEST=true node --test tests/jobCardStorage.integration.cjs` (set the
environment variable with the shell's syntax). This test is restricted to the standard
loopback emulator connection and never loads production credentials.

## Verified production cutover — 2 October 2026

- Resources: `CustomDeployment-20261002192950`; backend settings:
  `CustomDeployment-20261002194447`, both successful in ServiceOperations.
- Code `c8d325a`: [successful production workflow](https://github.com/robsongeor/service-operations/actions/runs/36975098954).
- Approved older Job 142314 was used for one clearly labelled synthetic submission, with
  email sent only to George. Both the dispatch and Azure-managed review notice were received.
- Private photo retrieval, authenticated review, persisted Reviewed state, used-link rejection,
  anonymous API denial and private-container denial were checked. The operational Job remained
  Complete and its description unchanged. The test review is retained; no evidence was deleted.
