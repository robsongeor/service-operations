# Job Card meter writer — controlled rollout

10 October 2026. **Implemented locally; not deployed or activated.** The technician app remains
parked. This checklist covers office-approved Job meter writes only, not broader application rollout.

## Verified state

| Item | Evidence |
| --- | --- |
| Existing Job reading type and recorded date | Live read-only verification passed: Actual/Estimated Choice and Date Only metadata |
| `gr_hourmeterapprovalreference` | Missing; optional String(100) definition is local only |
| Dedicated meter role/application | Named role absent; no application user or credential provisioned in this work |
| Live access guard | `1.0.1.0`, 14 access steps; no new secure configuration |
| Local candidate | `1.0.2.0`; 114 access-policy tests, 47 registration tests, 890 Node tests, lint/build pass |
| Activation | Both meter flags remain off; no production data writes |

Schema provisioning was rejected at the approval gate before execution. Obtain explicit approval
for production schema changes and, separately, identity/role/guard deployment before proceeding.
Local checks do not substitute for acceptance with actual application and human identities.

## Security contract

The reviewer is validated with delegated Dataverse identity and the office reviewer allowlist.
The approved reading, date, reviewer and reason are saved durably in Azure before synchronization.
The dedicated server identity can patch exactly these four Job attributes, together:

- `gr_hourmeter` — nonnegative whole hours.
- `gr_hourmeterreadingtype` — Actual (`122830000`).
- `gr_hourmeterrecordeddate` — valid, nonfuture Date Only.
- `gr_hourmeterapprovalreference` — `reviewId|hours|YYYY-MM-DD|equipmentId`.

The reference binds evidence; it is not an authorization token. The server credential remains
trusted and must not be available to browsers. The backend enforces ETags, source bindings and
Equipment-baseline checks. The plugin checks caller/role/application, exact fields and current Job
state inside PreOperation; it does not inspect HTTP If-Match or verify an Azure approval itself.
No status, equipment, maintenance, WOF, create, delete, assign or share operation is permitted.

Use a new application identity, not the existing GreenTree/general identity. Its only Dataverse
role is the [writer manifest](../dataverse/access/job-card-meter-writer.json), with no Basic User or
other baseline. The six organization-depth privileges are Job read/write, Equipment read and
System User/Role/Team read. Field restriction comes from the guard, not the table-level role.
Neither humans nor teams receive this role. App-user creation and security-role assignment are
separate administration steps. [Microsoft application-user administration](https://learn.microsoft.com/en-us/power-platform/admin/manage-application-users).

The optional secure tuple is `meterrole=<role ID>;meteruser=<systemuser ID>;meterapplication=<client ID>`.
It must appear identically on all 14 access guards alongside the existing human role map. The
configured user or any holder of the role enters the meter policy before the Full/Coordinator
bypass. A mismatched or disabled identity is denied. No guard impersonation is introduced.
See [Microsoft plug-in caller context](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/impersonate-a-user).

## Approved rollout sequence

1. **Capture recovery evidence.** Confirm the authoritative V1 backend behind the V2 bridge.
   Record the source revision, API/client artifacts, current assembly hash/step configuration,
   human role IDs, setting names/flag states and rollback artifacts. Resolve the existing
   [signing-key recovery gate](unified-job-workflow-signing-key.md). Keep secrets outside Git/output.
2. **Schema.** With explicit approval, run `manage-hour-meter-reading-schema.ps1` in Provision mode
   with `-IncludeJobCardApproval`. It validates existing definitions, adds the missing optional
   column, publishes and verifies in one session. Inspect/Verify are read-only. Use the approved
   owner account hint with `-LoginPrompt Never`; interactive sign-in needs prior user approval.
   No backfill, existing-value update or required-field change is part of this rollout.
3. **Create the dedicated identity/role.** An approved administrator registers a backend-only
   application, creates its enabled Dataverse application user and grants exactly the manifest.
   Do not copy another user's roles or alter the existing GreenTree identity. Record tenant/client,
   application-user and role IDs. Keep credentials unavailable to the app until guard configuration
   is verified. If the six-privilege model fails, stop and investigate; do not add broad roles.
4. **Upgrade the signed assembly only.** Package the reviewed `1.0.2.0` with the existing signing
   identity and capture hashes. Update the existing assembly without creating duplicate steps,
   changing step states/filters/images, assigning humans, enabling numbering invariants or invoking
   broad Provision. Reverify the 14 synchronous, enabled, caller-context PreOperation registrations.
   The old four-profile configuration remains supported during this phase.
5. **Inspect, plan, configure.** Run the inspector below with the new client ID. Confirm exclusive
   user/role assignments and exact privilege depths. Run the configuration tool in default Plan mode.
   Only after reviewing that plan, use Apply with both confirmation switches and a new protected
   backup file path. Keep concurrent plugin/role administration stopped through snapshot and Apply.
   The tool preserves the four human maps, retains old secure-config rows, and attaches the new tuple
   to all 14 guards in one transaction. Re-run inspection; require all readiness checks true.
6. **Backend settings and compatible release.** Deploy the reviewed backend compatibly with the
   existing V1 clients/links; install only `JOB_CARD_METER_DATAVERSE_TENANT_ID`,
   `JOB_CARD_METER_DATAVERSE_CLIENT_ID`, `JOB_CARD_METER_DATAVERSE_CLIENT_SECRET` in protected
   server settings. Neither meter flag is enabled yet. Reconciliation status/Assignment reads
   retain their existing separate identity. A meter authentication failure must never reuse it.
7. **Acceptance.** Rehearse the matrix below in nonproduction first. Live write testing requires
   approved controlled Job/Equipment records and a narrowly approved activation window; do not
   use ordinary customer Jobs as test fixtures. Record before/after evidence and tested identities.
8. **Activate only after acceptance.** Enable `JOB_CARD_METER_APPROVAL_ENABLED` on the authoritative
   backend and release the compatible frontend with `VITE_JOB_CARD_METER_APPROVAL_ENABLED`.
   Confirm schema reads and user approval prompts. Test both V1/V2 clients; old clients cannot
   silently approve a meter. Monitor pending/failed approvals and replay after office filing.
   Cursor queue activation is a different release gate, not included here.

### Operator tools

Read-only examples, from the repository root (replace the client ID):

```powershell
powershell.exe -NoProfile -File scripts/manage-hour-meter-reading-schema.ps1 `
  -Mode Verify -IncludeJobCardApproval -UserName georger@liftrucks.co.nz -LoginPrompt Never

powershell.exe -NoProfile -File scripts/inspect-job-card-meter-access.ps1 `
  -ApplicationId <dedicated-client-id> -UserName georger@liftrucks.co.nz -LoginPrompt Never

powershell.exe -NoProfile -File scripts/configure-job-card-meter-guard.ps1 `
  -Mode Plan -ApplicationId <dedicated-client-id> -UserName georger@liftrucks.co.nz -LoginPrompt Never
```

Apply additionally requires `-ConfirmMeterFeatureDisabled -ConfirmExclusiveDeploymentWindow`
and `-BackupPath` pointing to a new protected file in an existing directory. This tool does not
create identities, credentials, roles, privileges, schema or assemblies, and cannot activate flags.
Its existing-role/application branches and live Apply transaction have not yet been exercised.

**Generic deployment-tool limitation:** `manage-unified-job-workflow-deployment.ps1` still verifies
the original four-profile secure map. After adding the meter tuple its verification must fail closed,
not strip the tuple. Do not use broad Provision as an assembly-upgrade shortcut. Future releases
must coordinate that verifier with this inspector before any role/configuration mutation.

## Acceptance matrix

| Check | Required result |
| --- | --- |
| Authorized office approval | Attributed immutable Azure approval; exactly four Job fields changed; no other records changed |
| Office/Job Book direct API; unauthorized reviewer | Denied, even when UI is bypassed |
| Dedicated identity: extra/null fields, create/delete, Equipment/status writes | Denied server-side |
| Wrong app/user/role, disabled user; meter identity also has broad role | Denied identity/payload violations; no broad-role bypass |
| Future/malformed date, inactive/void/complete Job, wrong equipment | Denied without silently altering evidence |
| Older date, different same-day reading, stale Job ETag | Conflict; no unconditional overwrite |
| Corrected/lower/large-jump reading | Explicit approval/reason checked by backend; audit retained |
| Failure before/after Job write, lost response, repeat retry | Saved approval retained; retry is safe; identical applied evidence is a no-op |
| Missing credentials, wrong client, token failure | Meter update stays pending/failed; no general/GreenTree fallback |
| Flag off | No meter token acquisition or Job mutation; explicit retry refused |
| Scheduled recovery after office filing | Same immutable approval applied once with dedicated identity; failures visible |
| Predictions and completion | Approved dated evidence may inform usage; operational completion/service/WOF still separate |

Offline tests cover policy/coordination behavior, not Dataverse runtime authorization or a live
end-to-end write. Test guard ordering, bulk/import entry points, actual role resolution, field security,
and other installed plugins; unexpected behavior blocks activation. Never fix denial by adding FullAccess.

## Stop and rollback

1. Disable backend meter processing and the matching frontend flag; pause meter recovery if needed.
   Retain pending/failed approvals. Do not remove the source evidence, Job readings/reference or schema.
2. Block the dedicated identity's access (disable that application user or remove its sole role)
   before restoring old assembly/configuration; do not change the shared GreenTree identity.
3. Restore each access step's prior secure-config reference from the captured backup in a controlled
   transaction, keeping all 14 guards enabled. Old secure-config rows are deliberately retained.
   Restore the previously verified signed assembly only after new processing is stopped and the
   config is compatible; verify human allowed/denied behavior and unchanged numbering-step states.
4. Restore API/client artifacts only after proving they preserve newer Azure approval/audit fields.
   If old code cannot round-trip them, leave meter features disabled on the compatible backend.
5. Audit any already-applied readings against saved approvals. Incorrect evidence needs a separate
   authorized correction; rollback must not blindly overwrite readings or delete history.

There is no automatic rollback command or approval to delete the new identity/column. Rehearse
recovery and record outcomes before activation. Remaining application-wide gates are in
[release readiness](../RELEASE_READINESS.md); these meter changes do not close them.
