# TimeCloud Job integration rollout

## Status and safety boundary

The integration is implemented locally but is not deployed or enabled. Azure deployment,
Dataverse provisioning and server-setting changes are separately authorised operations.
`TIMECLOUD_JOB_CREATION_ENABLED` defaults to disabled. When creation is enabled,
`TIMECLOUD_JOB_MODE` defaults to `test`; production behaviour requires the exact value
`production`.

On 15 October 2026, the following non-secret Production settings were saved on the V2 Static Web
App: `TIMECLOUD_JOB_CREATION_ENABLED=false`, `TIMECLOUD_JOB_MODE=test`, and
`TIMECLOUD_JOB_LAYER_ID=671835fe0d6412dbb8cafb30`. The four TimeCloud credential settings were
entered by the owner and verified only for presence while masked; their values were not recorded in
the repository or this runbook. The application code has not been deployed, and creation remains
disabled. The two Job identity columns were provisioned, published and structurally re-verified in
Dataverse on 15 October 2026 with `scripts/manage-timecloud-job-schema.ps1 -Mode Provision`.

Test mode creates an active Job Item with:

- name: `<Job Number> [TEST ONLY - SAFE TO DELETE] <Description>`;
- custom code: `JOBBOOK-TEST-ONLY`;
- the configured Job Number layer;
- no geofence; and
- a TimeCloud-assigned code.

The Job Number stays as the first complete name token so the duplicate guard works in both modes.
Cleanup must require both the test-only name label and custom code; neither marker alone is enough
authority for bulk deletion.

## Prerequisites

1. An authorised Dataverse administrator provisions and verifies `gr_job.gr_timecloudjobitemid`
   and `gr_job.gr_timecloudcode` with `scripts/manage-timecloud-job-schema.ps1`.
2. The existing server Dataverse application identity can read and conditionally update `gr_job`.
3. An Azure Static Web App contributor adds the TimeCloud settings to V2. Secrets must never be
   pasted into source, documentation, chat transcripts, browser-visible `VITE_` variables or logs.
4. Keep `TIMECLOUD_JOB_CREATION_ENABLED=false` while settings and schema are being prepared.

Required V2 server settings:

```text
TIMECLOUD_CLIENT_ID
TIMECLOUD_API_USERNAME
TIMECLOUD_API_PASSWORD
TIMECLOUD_INTEGRATOR_KEY
TIMECLOUD_JOB_LAYER_ID=671835fe0d6412dbb8cafb30
TIMECLOUD_JOB_CREATION_ENABLED=false
TIMECLOUD_JOB_MODE=test
```

The API and authentication URL/audience settings have safe defaults and may be overridden only
when TimeCloud requires a documented environment-specific value.

## Controlled test

1. Verify the target is V2 and record the deployed artifact and current server settings without
   recording secret values.
2. Confirm the schema columns and the dedicated TimeCloud API user.
3. Set `TIMECLOUD_JOB_MODE=test`, then deliberately set
   `TIMECLOUD_JOB_CREATION_ENABLED=true`.
4. Register one purpose-built disposable Job Book job with no customer-sensitive test text.
5. Confirm registration alone does not create a TimeCloud item, then deliberately select
   Timecloud Entry on that registered disposable row.
6. Verify exactly one TimeCloud item exists with the expected Job Number prefix, test-only label,
   custom code, Job Number layer, assigned code and no geofence.
7. Confirm Dataverse records the returned item ID/code and marks Timecloud Entry.
8. For the same disposable row, clear and reselect Timecloud Entry once. Verify the integration
   finds the same TimeCloud item and does not create a duplicate.
9. Exercise an unauthorised caller and verify no TimeCloud request or Dataverse write occurs.
10. Return `TIMECLOUD_JOB_CREATION_ENABLED=false` after the test window unless another approved
   test immediately follows.

## Test cleanup

Before deletion, capture only the TimeCloud item IDs, assigned codes and related disposable Job
numbers needed for the test record. Select candidates that have both:

- `[TEST ONLY - SAFE TO DELETE]` in the name; and
- `JOBBOOK-TEST-ONLY` as the custom code.

Review the candidate list manually, then remove only the approved TimeCloud test items through the
authorised TimeCloud administration path. Deleting a TimeCloud item does not clear its Dataverse
confirmation. The disposable Dataverse test Job should be retained for audit or removed through
its separately approved test-data cleanup. Do not clear TimeCloud IDs or markers on a real Job, and
do not expect a deleted test item to be recreated from an already-confirmed Dataverse row; create a
new disposable test Job for another end-to-end run.

## Production promotion

Production promotion is a separate decision after test evidence is accepted:

1. Disable creation and complete the approved test cleanup.
2. Verify there are no unintended test-labelled items and no duplicate Job Numbers.
3. Record approval, artifact, settings owner and rollback owner.
4. Change `TIMECLOUD_JOB_MODE` from `test` to `production` while creation remains disabled.
5. Re-enable creation and perform one controlled real-Job smoke test.
6. Verify the production item has `<Job Number> <Description>`, a blank integration custom code,
   the assigned TimeCloud code and no geofence.

Never change test items into production items by renaming them. Production creates must start from
an approved real Job Book registration.

## Rollback

Set `TIMECLOUD_JOB_CREATION_ENABLED=false` first. This blocks new TimeCloud creation without
removing Job Book or Dataverse data. Preserve existing TimeCloud items and Dataverse confirmation
fields while the incident is assessed; rollback is not authority to delete or clear them. Roll
back the application artifact through the normal V2 workflow only if required, and reconcile any
Job saved during an uncertain response before retrying.
