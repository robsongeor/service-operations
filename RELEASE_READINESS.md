# Release readiness

Reviewed 21 October 2026 after the Auckland production cutover and V3 managed-worklist deployment. **Controlled Auckland role
acceptance is next; broad restricted-role rollout is not yet signed off.**
This checklist separates implemented source from verified deployment. Older progress notes
remain in Git (`git show f73f3d6:RELEASE_READINESS.md`); they are not current approval.

## Required gates

| Gate | Status | Acceptance evidence |
| --- | --- | --- |
| Build | Pass locally and deployed | Production build passed for V3 commit `0ac63fb`; GitHub Actions run `39550927453` deployed successfully |
| Complete tests and lint | Focused V3 gate passed | Access/workflow/Job Book suites passed 289 tests and the production build passed; retain the earlier full-suite/lint evidence and repeat the complete gate when source behavior changes |
| Restricted-role policy | Blocked (A01) | Real Office/Job Book accounts: allowed corrections/mechanic/basic Equipment saves succeed; unrelated fields/status/scheduling/delete fail server-side |
| Registration status | Deployed; live acceptance required | Current assembly 1.0.24 retains the verified rule that every registered Job starts in Staging even when a mechanic is selected; only confirmed dispatch moves it to With Technician |
| Completion consistency | Blocked (A03) | Missing required evidence remains Completion Review; valid completion updates type-specific history/maintenance/compliance exactly once |
| Reconciliation | Unverified/needs work (A04/A05) | Scheduled identity passes guard, correct store/checkpoint, partial failures visible, backlog advances, retries do not lose conflicts |
| Multi-user freshness | Job Book deployed; named-user acceptance pending (A06) | Auckland ledger and managed-Job events use bounded SignalR push with reconnect/visibility recovery and no timer polling; complete separate-browser Office Admin/Job Book Admin acceptance |
| Customer Info | Blocked for exposed unfinished editing (A07) | Nonpersistent fields cannot be presented as saved; working Site/PO/transfer functions retained |
| Auth recovery | Needs smoke (A09) | Correct redirect bridge; expiry/cancel/logout/account-switch behavior; no wrong-account mutation resume |
| Job Card bridge | Must remain until replacement proved | V2 proxies to the authoritative Job Card API/storage preserved on yellow-cliff; existing links/photos/reviews continue working after its frontend became V3 |
| V3 managed worklist | Deployed; real restricted-role acceptance open | 254 active Jobs verified managed Auckland; 1,142 GreenTree-closed Jobs excluded unchanged; all 13 roles and branches verified; complete named-account UI checks |
| Dataverse rollout/rollback | Live artifact verified; recovery/test evidence remains | Signed 1.0.24 hash/token, six reviewed Custom APIs, role grants, shared secure role/writer map and 29 enabled steps verified; complete named-role acceptance and protected off-PC signing-key recovery proof |
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
  Meter/continuation flags are off; verify schema, narrow server identity, authoritative shared backend,
  retries and real-account acceptance. The signed-in technician app is parked; do not expand the pilot.
  Unified guard assembly `1.0.24.0` is deployed, but that does not enable the independent meter or
  continuation switches or prove their application-identity acceptance.
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
- **Regional books/numbering:** Auckland spreadsheet allocation is frozen. The pre-cutover maximum
  was `147474` and `147475` was subsequently consumed; the guarded allocator is authoritative for
  the current next number. All 15 production invariant guards are enabled. Other regional creation
  remains disabled; do not treat this as approval to cut over another branch.
- **Maps:** verify tiles/geocoding configuration and address the public tile-proxy usage budget.
- **Quotes:** failure/concurrency tests for full save; partial header/line updates remain a known risk.

## Cutover evidence

On 20 October 2026 George approved the Auckland cutover after confirming the spreadsheet was frozen.
The initial signed `1.0.19.0` cutover package (`0edea2881bb8578c`, SHA-256
`1033a8c660c29e7dcba59cb0e42517447cee6846852eb0f7cc244b02f3852a04`) was deployed. Office Admin
role drift was reconciled, the approved writer-identity extensions were preserved, and independent
verification passed for 29 enabled steps: 14 restricted-access and 15 number-invariant. Pre- and
post-activation audits both reported maximum `147474`; no deployment test consumed `147475`.

Subsequent approved guard/API corrections culminated in signed assembly `1.0.24.0` (same public-key
token; SHA-256 `e1f173c0426f79d8ae700c13aacb31614b75040006fb44100444c4fb65eb257b`). The V3 deployment and
historical managed-worklist migration did not replace the numbering record above.

Before broad release, run the matrix above with the dedicated Job Book Admin and Office Admin test
accounts. Record the permanent Job created (or its retained Void history), its Staging status and
Auckland branch, TimeCloud outcome, Office dispatch/review behavior, and denied operations.

Record the exact commit, client flags, API artifact, plugin version/hash, deployment environment,
effective role snapshot, test identities, outcomes and rollback artifact. Keep secrets and customer
exports out of Git. Check V2 and V3/yellow-cliff because they share Dataverse and the authoritative
Job Card storage.

Deployment workflows currently build without running the complete lint/test gate; add those checks.
Do not infer release approval from a green Azure/GitHub deployment alone.

No infrastructure or data retirement is approved by this checklist. Follow the
[retirement runbook](docs/architecture/retirement-plan.md) for dependency checks and rollback.
