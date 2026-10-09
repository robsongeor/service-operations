# Restricted access guard

**Live in production from 9 October 2026.** The signed `1.0.1.0` assembly and 14
synchronous PreOperation restricted-access steps are enabled with exact secure
Dataverse role IDs, required `Before` images and no filtering attributes. The 15
legacy number-invariant steps remain registered but disabled while V1/manual
numbering is still in use. Do not assign the obsolete Job Book Only role to the
new Admin cohorts.

## Implemented

- Distinct frontend FullAccess, ServiceCoordinator, JobCardAdmin (Office Admin),
  JobBookAdmin and an unassigned legacy JobBookOnly compatibility profile.
- Admin Equipment writes allow fleet, alternate fleet numbers, make, model,
  serial and Site only. The client requires an exact ETag and reloads the saved
  record. Moving Equipment does not rewrite historical Jobs.
- The plugin resolves configured Dataverse role IDs from direct/team
  membership. Unknown roles fail closed; Full and coordinator bypass this
  field guard, while ordinary data privileges and other plugins still apply.
- Office and Book profiles have separate marker permissions. Customer/Site
  creation, factual Job corrections, Equipment details and eligible unlinked
  Intake Void have narrow allowlists. Other generic writes fail closed.
- The local transactional `JobWorkflowPlugin` implements exact-version Manage
  job and linked registered-entry Void operations. Linked Void updates the Job
  and regional ledger together, and this guard permits only those exact child
  writes from the matching caller-context Custom API. Direct writes still fail.
- The same local plugin implements replay-safe initial dispatch. It resolves the
  assigned technician server-side, requires an exact Job version, rejects
  recipient/assignment overrides, and creates only the exact guarded Email
  Dispatch child row. The Azure secure-link service remains separate.

Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
scripts/test-restricted-access-plugin.ps1` from the repository root. The offline
checks exercise configuration and policy with the locally installed Power Apps
SDK. They do not prove real role resolution or deployment behavior.

## Remaining acceptance work

1. Test all four regional ledgers with real licensed pilot accounts. Cover
   direct HTTP denial, before/after handoff corrections, stale saves, atomic
   number allocation and Void, markers, email and reviewer authorization.
2. Review remaining write paths, including bulk messages, relationship operations,
   imports, automation and application users, and reconcile broader direct/team grants.
3. Remove Bruce's old FullAccess assignment
   after verifying coordinator access, leaving George as the sole FullAccess
   user in the agreed roster. No other assignments are implicitly removed.
4. Keep the number-invariant steps disabled until V1/manual numbering is retired;
   activation is a separate migration and cutover decision.

The authoritative roster and remaining acceptance gates are in
[the access plan](../../docs/features/JOB_BOOK_ACCESS_PLAN.md) and
[the live read-only audit](../../docs/features/JOB_BOOK_ACCESS_AUDIT.md). The machine-readable
unified-workflow API/capability boundary is in
[`unified-workflow-role-policy.json`](unified-workflow-role-policy.json); it is a review artifact,
not a role-provisioning manifest.
