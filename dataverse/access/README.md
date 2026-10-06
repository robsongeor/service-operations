# Restricted access guard — local draft

**Not deployed and not ready to register.** This source is an initial field-write
policy, not a complete Dataverse security solution. Do not assign the existing
Job Book Only data role to the new Admin cohorts: its broad write privileges do
not match the agreed policy.

## Implemented locally

- Distinct frontend FullAccess, ServiceCoordinator, JobCardAdmin (Office Admin),
  JobBookAdmin and retained legacy JobBookOnly profiles.
- Admin Equipment writes allow fleet, alternate fleet numbers, make, model,
  serial and Site only. The client requires an exact ETag and reloads the saved
  record. Moving Equipment does not rewrite historical Jobs.
- The draft plugin resolves configured Dataverse role IDs from direct/team
  membership. Unknown roles fail closed; Full and coordinator bypass this
  field guard, while ordinary data privileges and other plugins still apply.
- Office and Book profiles have separate marker permissions. Customer/Site
  creation, factual Job corrections, Equipment details and eligible unlinked
  Intake Void have narrow allowlists. Other generic writes fail closed.

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
scripts/test-restricted-access-plugin.ps1` from the repository root. The offline
checks exercise configuration and policy with the locally installed Power Apps
SDK. They do not prove real role resolution or deployment behavior.

## Required before registration or user assignment

1. Integrate authorization into the registration, linked Void and initial
   technician/dispatch operations. This draft deliberately blocks generic
   Job/ledger/dispatch creation and linked-ledger updates, so installing it now
   would break allowed workflows. Do not bypass it by trusting a browser flag,
   arbitrary parent context or unverified shared variable.
2. Review every write path, including bulk messages, relationship operations,
   reassignment, status changes, imports, automation and application users.
   Define separate least-privilege data roles and remove overlapping broader
   grants for the intended users. Preserve unrelated users and integrations.
3. Register synchronous PreOperation, caller-context steps only after that
   integration is complete. Update steps require a `Before` pre-image with the
   record identity and every field consulted by policy: Job registration Void;
   ledger stage, registered/promoted Job and both entry markers. Do not use
   filtering attributes that allow forbidden field updates to bypass the guard.
4. Secure configuration must supply actual Dataverse role IDs, including
   approved business-unit copies: `full=GUID;coordinator=GUID;office=GUID;book=GUID`.
   Comma-separated IDs are supported per profile; IDs must be distinct and
   nonzero. These are **not Entra app-role IDs**. Verify role-query permissions,
   team membership and caller behavior in the acceptance environment.
5. Test all four regional ledgers with real licensed pilot accounts. Cover
   direct HTTP denial, before/after handoff corrections, stale saves, atomic
   number allocation and Void, markers, email and reviewer authorization.
6. Deploy compatible application/backend versions before assigning the new
   Entra and Dataverse roles. Then remove Bruce's old FullAccess assignment
   after verifying coordinator access, leaving George as the sole FullAccess
   user in the agreed roster. No other assignments are implicitly removed.

The authoritative roster and remaining acceptance gates are in
[the access plan](../../docs/features/JOB_BOOK_ACCESS_PLAN.md) and
[the live read-only audit](../../docs/features/JOB_BOOK_ACCESS_AUDIT.md).
