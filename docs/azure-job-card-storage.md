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
```

`JOB_CARD_LOCAL_DEVELOPMENT=true` and `JOB_CARD_STORAGE_MODE=memory` are local-only. Never
set `JOB_CARD_LOCAL_DEVELOPMENT` in Azure because it deliberately replaces Entra validation
with a development bearer and accepts the browser-provided sample snapshot.

## Data layout and lifecycle

The raw 32-byte link token is returned once and never stored. Its SHA-256 hash is the Table
row key. A separate random review ID is used in office links. States are `active`,
`superseded`, `pendingReview`, and `reviewed`. Table fields include source Job/assignment
IDs, minimum dispatch snapshot, creator identity, created/expiry/submitted/reviewed times,
reviewer identity, notification outcome, submission values, and private photo references.

Photo uploads use `uploads/<token-hash>/<upload-id>`. Final submission revalidates Blob
size, content type, ownership metadata, token state, and Table ETag before saving those
private references. Authenticated office requests stream files through the Function.

Recommended retention policy, subject to the organisation's evidence policy:

- delete unreferenced `uploads/` blobs after 7 days;
- delete expired or superseded, unsubmitted Table rows 30 days after expiry;
- retain submitted/reviewed Table rows and `evidence/` blobs for the approved service-record
  period (proposed default: 7 years), then delete both together;
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
3. Confirm the old portal Application User credentials are no longer configured for this
   workflow. Retire its role/secret only after confirming no other service uses it.
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
