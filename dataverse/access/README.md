# Restricted access guard

**Live in production from 9 October 2026.** The signed `1.0.1.0` assembly and 14
synchronous PreOperation restricted-access steps are enabled with exact secure
Dataverse role IDs, required `Before` images and no filtering attributes. The 15
legacy number-invariant steps remain registered but disabled while V1/manual
numbering is still in use. Do not assign the obsolete Job Book Only role to the
new Admin cohorts.

## Known policy gap — source audit 10 October 2026

The current client exposes mechanic selection to all admitted Job Book roles and sends WOF/REGO
fields during restricted Equipment detail saves. The allowlists below reject those fields.
Confirmed Office dispatch also performs a separate status PATCH that the normal guard rejects.
These are rollout blockers, not evidence the UI is correctly enforced end-to-end.
Registration's special child rule also allocates when a mechanic/supplier is selected, before delivery.

Reconcile intended operations, payloads, this policy and tests together; do not disable the guard
or broaden roles as a workaround. The offline tests currently encode some of the mismatched policy.
See [audit A01/A02](../../docs/reviews/2026-10-10-application-audit.md) and
[release gates](../../RELEASE_READINESS.md). A targeted read-only check on 10 October confirmed
assembly `1.0.1.0` and 14 access steps; it did not reverify the entire human-access rollout.

## Dedicated Job Card meter writer — local only

Source version `1.0.2.0` adds an optional, all-or-nothing secure tuple:
`meterrole=<role GUID>;meteruser=<systemuser GUID>;meterapplication=<client GUID>`.
The existing four human-role profiles are preserved. The configured application user or any
holder of its role enters the meter policy before Full/Coordinator bypass: exact identity,
enabled application status, role, four-field payload and current Job checks must pass.
Direct Office/Book meter writes remain denied. There is no equipment/status/maintenance grant.

The [writer manifest](job-card-meter-writer.json) specifies the dedicated role and six privileges.
Live inspection found that role absent. The [rollout checklist](../../docs/job-card-meter-writer-rollout.md)
owns configuration, acceptance and rollback. Offline tests do not authorize cloud changes or
prove live effective privileges; both meter feature flags remain off.

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
