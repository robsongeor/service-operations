# Release readiness

Reviewed 10 October 2026 at `f73f3d6`. **Broad restricted-role rollout is not signed off.**
This checklist separates implemented source from verified deployment. Older progress notes
remain in Git (`git show f73f3d6:RELEASE_READINESS.md`); they are not current approval.

## Required gates

| Gate | Status | Acceptance evidence |
| --- | --- | --- |
| Build | Pass locally | Repeat on CI Node 20 and deployed artifact |
| Complete tests and lint | Pass locally | 894 Node tests including legacy-backend compatibility, full ESLint and build pass; 114 offline access-policy tests pass. Repeat in CI and on the release artifact |
| Restricted-role policy | Blocked (A01) | Real Office/Job Book accounts: allowed corrections/mechanic/basic Equipment saves succeed; unrelated fields/status/scheduling/delete fail server-side |
| Registration status | Blocked (A02) | Selecting a mechanic/supplier alone remains Unallocated; only confirmed dispatch allocates |
| Completion consistency | Blocked (A03) | Missing required evidence remains Completion Review; valid completion updates type-specific history/maintenance/compliance exactly once |
| Reconciliation | Unverified/needs work (A04/A05) | Scheduled identity passes guard, correct store/checkpoint, partial failures visible, backlog advances, retries do not lose conflicts |
| Multi-user freshness | Blocked (A06) | Separate browsers and resume/reconnect reflect unified Job mutations without manual route reload |
| Customer Info | Blocked for exposed unfinished editing (A07) | Nonpersistent fields cannot be presented as saved; working Site/PO/transfer functions retained |
| Auth recovery | Needs smoke (A09) | Correct redirect bridge; expiry/cancel/logout/account-switch behavior; no wrong-account mutation resume |
| Job Card bridge | Must remain until replacement proved | V1/V2 share authoritative cards; existing links/photos/reviews continue working |
| Dataverse rollout/rollback | Needs live verification | Exact artifacts, secure role map, step states, effective roles, no unintended V1 breakage; usable signing-key recovery/rollback |
| Monitoring | Incomplete | Alert on per-record reconciliation failure and aging backlog, not HTTP/job success alone |

Details and source owners: [application audit](docs/reviews/2026-10-10-application-audit.md).
Do not resolve a denied operation by disabling the guard or granting broad Dataverse roles.

## Restricted-role acceptance matrix

Run with real delegated tokens for each role, not development simulation. Use controlled test
records and obtain separate approval before destructive test cleanup.

- Job Book Admin: register a Job, select/change mechanic through the approved workflow, correct
  allowed details, search Customers/Sites, move Equipment explicitly and save permitted core details.
- Office Admin (`ServiceOperations.JobCardAdmin`): all permitted book functions plus assigned-tech
  dispatch, authorized Job Card review and approved entry markers. Sending successfully followed
  by a failed status update must not silently report a fully completed dispatch workflow.
- Both: scheduling, operational status mutation, number/type changes and destructive/history
  actions must be rejected server-side where not explicitly allowed.
- Service Coordinator / FullAccess: verify their own route/operation sets; broader roles must not
  accidentally mask failures during restricted-account testing.
- No supported role: management access denied. Public bearer links remain separately scoped.
- Repeat direct-API attempts with extra fields, another record's relationships, stale ETags,
  mixed direct/team roles and tampered action inputs.

Entra claims, Dataverse table privileges, plugins, reviewer allowlists and server feature switches
are independent layers. Test all applicable layers.

## Feature-specific release gates

- **Job Cards:** follow the [office-approval activation report](docs/reviews/2026-10-10-job-card-implementation.md).
  Meter/continuation flags are off; verify schema, narrow server identity, shared V1 backend,
  retries and real-account acceptance. The signed-in technician app is parked; do not expand the pilot.
  The dedicated writer and guard `1.0.2.0` are implemented locally, not deployed. Live read-only
  checks found no approval-reference column or dedicated role; production guard is `1.0.1.0`.
  Follow the [meter-writer rollout checklist](docs/job-card-meter-writer-rollout.md); explicit
  production approval and real-identity acceptance remain required. Do not grant humans meter writes.
- **External supplier:** enable only after schema/plugin contract and restricted create/edit/save
  tests pass; no staff record created; validate display, dispatch and status behavior.
- **Hour-meter classification:** test Actual/Estimated writes, date-only handling, missing data
  and completion-side effects before changing build flags.
- **Site Checks:** use [operations checklist](docs/site-checks-operations.md); implemented portal
  code does not approve checklist content, role access or full release.
- **Chargeable invoices:** use [operations checklist](docs/chargeable-invoice-review-operations.md);
  manager authorization and import/approval flags remain separate.
- **Regional books/numbering:** rehearse migration/counts/uniqueness and V1 compatibility before
  enabling additional flags or invariant guards.
- **Maps:** verify tiles/geocoding configuration and address the public tile-proxy usage budget.
- **Quotes:** failure/concurrency tests for full save; partial header/line updates remain a known risk.

## Cutover evidence

Record the exact commit, client flags, API artifact, plugin version/hash, deployment environment,
effective role snapshot, test identities, outcomes and rollback artifact. Keep secrets and customer
exports out of Git. Check both V1 and V2 if they share Dataverse or Job Card storage.

Deployment workflows currently build without running the complete lint/test gate; add those checks.
Do not infer release approval from a green Azure/GitHub deployment alone.

No infrastructure or data retirement is approved by this checklist. Follow the
[retirement runbook](docs/architecture/retirement-plan.md) for dependency checks and rollback.
