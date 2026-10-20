# TimeCloud Job integration rollout

## Status and safety boundary

The integration is deployed to the V2 Static Web App. Azure deployment, Dataverse provisioning
and server-setting changes are separately authorised operations. `TIMECLOUD_JOB_CREATION_ENABLED`
defaults to disabled. When creation is enabled, `TIMECLOUD_JOB_MODE` defaults to `test`;
production behaviour requires the exact value `production`.

On 15 October 2026, the following non-secret Production settings were saved on the V2 Static Web
App: `TIMECLOUD_JOB_CREATION_ENABLED=true`, `TIMECLOUD_JOB_MODE=test`, and
`TIMECLOUD_JOB_LAYER_ID=671835fe0d6412dbb8cafb30`. The four TimeCloud credential settings were
entered by the owner and verified only for presence while masked; their values were not recorded in
the repository or this runbook. The deployed creation gate was deliberately enabled for controlled
testing on 15 October 2026. The two Job identity columns were provisioned, published and
structurally re-verified in Dataverse on 15 October 2026 with
`scripts/manage-timecloud-job-schema.ps1 -Mode Provision`.

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
5. Confirm registration automatically creates its test-labelled TimeCloud item. Separately create
   an unnumbered Service Coordination Job and confirm TimeCloud creation occurs only when its
   permanent regional number is allocated.
6. Verify exactly one TimeCloud item exists with the expected Job Number prefix, test-only label,
   custom code, Job Number layer, assigned code and no geofence.
7. Confirm Dataverse records the returned item ID/code and marks Timecloud Entry.
8. For the same disposable row, retry Timecloud Entry once. Verify the integration finds the same
   TimeCloud item and does not create a duplicate.
9. Exercise an unauthorised caller and verify no TimeCloud request or Dataverse write occurs.
10. Return `TIMECLOUD_JOB_CREATION_ENABLED=false` after the test window unless another approved
   test immediately follows.

## Test cleanup

All Job numbers below `150000` are explicitly excluded from the disposable test batch. Exact live
checks on 15 October 2026 confirmed that `147367` exists in neither managed Jobs nor the Auckland
registration ledger; the failed transaction may nevertheless have consumed that AutoNumber.
Job `147368` was entered independently by another user and is a real Job. The test batch begins
with the first successfully registered purpose-built test Job at or after `150000`, but every
returned number and Dataverse/TimeCloud ID must be recorded. Numbers at or above `150000` are only
a tracking aid, never deletion authority: another app user can also receive numbers in this range.
A TimeCloud item must still have both test markers below and be manually confirmed before cleanup.

On 15 October 2026, the initial fail-closed preflight confirmed Auckland's then-current Job maximum
was `147366`, the registration ledger had zero rows, and the ledger AutoNumber format was
`{SEQNUM:6}`. The ledger seed was first set to `147367`; failed registration attempts did not create
a Job or ledger row. After independently created Job `147368` appeared, an exact absence check for
`147367` and a fresh maximum/empty-ledger preflight were required before reserving the test range
by moving the next ledger seed to `150000`.

The retained request ultimately registered successfully as Job `150004`. Failed attempts that
reached the AutoNumber allocation consumed `150000` through `150003` even though their surrounding
transactions rolled back; those values are gaps, not Jobs. Record `150004` and its exact
Dataverse Job/ledger IDs as the first disposable test candidate. Do not infer cleanup candidates
from the gap or from the numeric range.

The first manual Timecloud Entry attempt for `150004` returned `503 Server identity is
unavailable` before any TimeCloud authentication, search or create request. A masked-name audit of
the V2 Production settings found `DATAVERSE_URL` but not `DATAVERSE_TENANT_ID`,
`DATAVERSE_CLIENT_ID` or `DATAVERSE_CLIENT_SECRET`. The separately configured
`GREENTREE_DATAVERSE_*` identity must not be treated as an implicit fallback. Configure and verify
the intended server Dataverse application identity before retrying `150004`.

The approved remediation was deployed on 15 October 2026. Signed unified workflow assembly
`1.0.7.0` adds an opt-in TimeCloud writer path that requires an exact match of the Public Portal
Service role, Dataverse application user and Entra application ID. That identity may update only
`gr_timecloudentered`, `gr_timecloudjobitemid` and `gr_timecloudcode`, with bounded values and
active/non-Void/idempotency checks. It is evaluated before human profiles, so assigning Full Access
cannot bypass the three-field policy. The existing human profiles, meter writer configuration,
role grants, 14 guard steps, legacy V1 behavior and feature flags were preserved. The exact tuple
was attached to all 14 guards atomically and independently verified; a rollback snapshot is stored
outside the repository in the local ServiceOperations backup area.

The first successful test creation produced TimeCloud code `27892` for disposable Job `150004`
with both deletion markers and no geofence. Its Dataverse confirmation initially failed because
`prvReadUser` cannot be granted at Basic depth (Dataverse supports only Local, Deep or Global for
that privilege). Assembly `1.0.8.0` therefore keeps role queries and all business-record operations
in caller context while using one internal system-context read of only `applicationid` and
`isdisabled` for the exact configured server-writer user. This avoids granting the portal
application broader user- or role-directory access. The first `1.0.8.0` identity-only lookup still
left the exact role association dependent on caller visibility; `1.0.9.0` includes that one exact
direct membership check in the same internal authorization lookup.
Assembly `1.0.12.0` additionally tolerates only the four fields Dataverse injects into this
PreOperation target (`gr_jobid`, `modifiedby`, `modifiedon`, `modifiedonbehalfby`). The writer still
requires all three TimeCloud confirmation fields and rejects every other business field.

The controlled reconciliation then succeeded. Dataverse Job `150004` records TimeCloud item ID
`6ad05f4beb98711856e562a2`, assigned code `27892`, and `gr_timecloudentered=true`. TimeCloud shows
the same item with `[TEST ONLY - SAFE TO DELETE]`, custom code `JOBBOOK-TEST-ONLY`, and no geofence.
Use this exact item ID for the later approved cleanup; never delete by Job-number range.

V2 Production contains the dedicated Dataverse tenant, client and owner-supplied secret settings.
Never copy the secret into source control, chat, logs or rollout documentation.

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
