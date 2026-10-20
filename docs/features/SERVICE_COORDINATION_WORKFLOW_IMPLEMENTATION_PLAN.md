# Service Coordination Workflow Implementation Plan

## Objective

Implement the agreed Service Coordination lifecycle, branch-scoped work queue and private personal
watchlist without losing historical Jobs, hiding unclassified work, weakening Dataverse security or
prematurely replacing the current Service/WOF completion workflows.

The delivered initial workflow is:

```text
Staging --confirmed Job Card dispatch--> With Technician
   ^                                      |
   | final technician withdrawn           | all current required cards returned
   |                                      v
   +------------------------------- Completion Review

With Technician <----resolved---- Action Required
```

**Complete is outside the initial automation.** Current manual type-specific completion remains in
place. Specialised Service/WOF Job Cards and guarded Completion Review → Complete processing are
deferred to later approved phases.

Authoritative product contracts:

- [Jobs architecture](../architecture/jobs.md#operational-job-status-lifecycle)
- [Job Status schema and historical migration](../job-status-lifecycle-migration.md)
- [Job Branch scope and personal watchlist](../job-branch-and-personal-watchlist.md)
- [Technician Job Card submission](../architecture/technician-job-submission.md)
- [Maintenance](../architecture/maintenance.md)
- [WOF](../architecture/wof.md)

## Instructions for Codex

Treat each numbered implementation phase as a bounded task. Do not start the next deployment or
data phase merely because the previous source phase passes locally.

At the beginning of every phase:

1. read `AI_CONTEXT.md`, `CURRENT_STATE.md`, `docs/README.md` and the authoritative documents above;
2. run `git status --short`, `git branch --show-current`, and `git log -3 --oneline`;
3. inspect current source before relying on filenames in this plan;
4. preserve unrelated worktree changes and reconcile any overlapping implementation already present;
5. state whether the phase is source-only, metadata-changing, data-changing or deployment-changing;
6. do not sign in to Dataverse, provision, deploy, commit, push or run a migration without the
   explicit approval required for that action; and
7. update this plan's checklist only when implementation and the stated validation are complete.

Normal source validation is:

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Run focused tests while iterating, then the full gate before each source handoff. Run the offline C#
guard and registration-plugin tests whenever their source/contracts change. Record pre-existing
failures separately and never conceal them by weakening a test.

## Non-goals for the initial delivery

- Do not automate Completion Review → Complete.
- Do not remove or bypass `JobCompletionWorkflow` or the atomic Service/WOF completion services.
- Do not add type-specific Service/WOF completion questions to the public card yet.
- Do not use GreenTree status to synthesize completion evidence or completion dates.
- Do not turn a branch UI filter into an unverified security claim.
- Do not renumber historical Jobs or create regional ledgers from number text.
- Do not reuse `gr_officeattentionrequired` as a personal watch.
- Do not store the authoritative watchlist or home branch only in browser storage.
- Do not expose Job Card evidence through the worklist progress summary.

## Delivery strategy and feature gates

Use staged, default-off gates so source can be deployed before dependent metadata/data is enabled:

| Gate | Default | Purpose |
| --- | --- | --- |
| `VITE_SERVICE_COORDINATION_BRANCH_ENABLED` | `false` | Enables home-branch resolution and branch-filtered worklists only after branch metadata and migration pass. |
| `VITE_SERVICE_COORDINATION_WATCHLIST_ENABLED` | `false` | Enables personal watch UI only after the backend/table/roles are deployed. |
| `SERVICE_COORDINATION_BACKEND_ENABLED` | `false` | Server-side branch/watch gate; a client flag alone never activates reads or writes. |
| `VITE_JOB_CARD_PROGRESS_SUMMARY_ENABLED` | `false` | Enables bounded progress summaries after the shared authoritative backend supports them. |
| `JOB_CARD_COORDINATION_SUMMARY_ENABLED` | `false` | Server-side progress-summary gate on the authoritative Job Card backend. |

Confirm final names against existing configuration conventions. Document every gate in
`.env.example`, deployment architecture and target workflow files. Client and server watch gates
must both be true. Missing branch metadata or an unmapped user must produce a visible setup error,
not an automatic Auckland/All-branches fallback.

## Phase 0 — Baseline and contract inventory

Status: [x] Complete — source inventory recorded 19 October 2026; no schema or data writes

### Tasks

- [x] Inventory every `gr_job.gr_status` writer across React services, Node APIs, C# plugins,
  imports, Site Checks, WOF and reconciliation.
- [x] Inventory the current local A02 changes before editing registration or restricted-access
  files; retain correct overlapping work instead of recreating it.
- [x] Confirm the deployed/source numeric Job Status contract and current global Choice labels.
- [x] Inventory all regional ledger relationships and every current source of branch-like data.
- [x] Confirm that no authoritative Job operating-branch or personal-watch table already exists.
- [x] Inventory V1/V2 Job Card routing so the progress endpoint is implemented against the same
  Azure Table store used by technician submission and office review.
- [x] Record which participating System Users are intended for Auckland and Christchurch without
  committing email addresses, tenant identifiers or customer data.
- [x] Decide/record that the first release is **operational filtering**, not Dataverse row-level
  branch isolation. Keep optional security isolation as Phase 11 unless the owner changes scope.
- [x] Add test vectors covering the transition matrix before changing behavior.

### Completed inventory

- The stable `gr_status` contract is owned in source by
  `src/alpha/jobs/types/jobStatus.types.ts`: Allocated `122830000`, Unallocated `122830001`,
  Waiting for parts `122830002`, Complete `122830003`, Review `122830004`, and legacy Unconfirmed
  `122830005`. Following the owner's 19 October decision, Unconfirmed is no longer an active
  lifecycle state: source treats it as Staging compatibility data pending the Phase 3 migration to
  `122830001`. The deployed global Choice verification/removal remains an approved-environment step.
- Manager-driven writes flow from `src/alpha/jobs/hooks/useJobs.ts` through
  `src/alpha/jobs/services/jobsApi.ts`. Confirmed delivery has a separate guarded
  Staging-to-With-Technician writer in `markJobAllocatedAfterConfirmedDelivery`.
- Technician return automation is owned by `api/services/jobOperationalStatusAutomation.js` and
  the Azure Table evidence read by `api/services/jobSubmissionService.js` and
  `api/services/jobCardStorage.js`. It conditionally moves only Allocated Jobs to Review or back to
  Unallocated. Service completion and Site Check completion have separate atomic writers in
  `src/alpha/jobs/completion/serviceCompletionApi.ts` and
  `src/alpha/site-checks/services/siteCheckCompletionApi.ts`.
- Controlled historical/import paths can deliberately create Complete Jobs. WOF creation currently
  creates an internally assigned Job as Allocated in `src/alpha/wof/hooks/useWof.ts`; Site Check
  creation does the same in `src/alpha/site-checks/services/siteCheckCreationApi.ts`. The ordinary
  WOF path conflicts with the new dispatch contract and must be aligned in Phase 2. Site Check is a
  protected specialised workflow and must retain an explicit exception until its own dispatch
  contract is redesigned. GreenTree reconciliation records factual GreenTree state and is not an
  operational Job Status writer.
- The overlapping A02 registration code is already present in
  `dataverse/job-registration/JobRegistrationPlugin.cs`, where technician/supplier presence implies
  Allocated, and its exact allowed-payload mirror exists in
  `dataverse/access/RestrictedAccessPlugin.cs`. Phase 2 must change and test both together; neither
  was edited in Phase 0 or 1.
- V2 marks shared Job Card requests with `VITE_JOB_CARD_SHARED_BACKEND=v1-production`; Vite and the
  `jobsubmission`/`jobcardreviews` proxies route them to the V1 production authority. New progress
  reads must use that same backend and store rather than infer state from V2 Dataverse projections.
- Regional ledgers provide Auckland, Waikato, Hastings and Christchurch number-book relationships.
  Technician `gr_region` is free text, Business Unit is not the accepted operating-branch source,
  and the current Job schema has no authoritative operating branch. No personal-watch table exists.
- Rollout configuration will map the two participating Auckland coordinators to the shared Auckland
  queue and participating Christchurch coordinators to Christchurch without committing identities.
  Personal watch rows remain user-owned. Release one is operational filtering, not row-level branch
  security; Phase 11 remains optional.
- `tests/jobLifecycle.test.ts` owns the source transition matrix and fail-closed progress vectors.

### Required output

- A short inventory section in the implementation report or this plan with exact source owners and
  any contract conflict.
- No schema or data writes.

### Exit criteria

- Every status writer and Job Card authority is accounted for.
- Existing overlapping changes are identified.
- No unresolved source owner prevents Phase 1.

## Phase 1 — Freeze lifecycle rules in domain tests

Status: [x] Complete — source implementation and full validation passed 19 October 2026

### Source changes

- Update `src/alpha/jobs/types/jobStatus.types.ts` display labels only:
  - `122830001` → **Staging**;
  - `122830000` → **With Technician**;
  - `122830002` → **Action Required**;
  - `122830004` → **Completion Review**;
  - Complete remains unchanged;
  - legacy Unconfirmed `122830005` displays as Staging but is absent from tabs and editable choices
    until historical rows are migrated to `122830001` and the Dataverse option can be retired.
- Keep stable internal numeric constants unless a symbol-only rename is demonstrably safe. Do not
  create new values or mechanically rename persistence contracts.
- Add a pure lifecycle/progress domain model under `src/alpha/jobs/types/` or `domain/` owning:
  - coordinator-facing status labels;
  - allowed automatic transitions;
  - conservative card-progress states;
  - Action Required override behavior; and
  - personal watch independence.
- Update status labels in Job Map, Customer dashboards, WOF references, Staff workload views and
  accessibility text through the shared status option owner, not copied strings.
- Update saved Jobs view-state/default-state versioning only if label/view semantics require a
  migration. Preserve user status selections by numeric value.

### Required tests

- Numeric values remain byte-for-byte unchanged.
- Selecting a mechanic does not imply With Technician.
- Confirmed dispatch moves only Staging to With Technician.
- Status automation never overrides Action Required, Completion Review or Complete; a legacy
  Unconfirmed value is canonicalised to Staging before applying a lifecycle signal.
- Final technician withdrawal returns only eligible With Technician work to Staging.
- All current required returns move only eligible With Technician work to Completion Review.
- Truncated, missing, expired/replacement-conflicted or contradictory evidence cannot claim ready.
- Existing default-view preferences survive label changes.
- Every UI consumer displays the new labels without its own competing mapping.

### Exit criteria

- Focused lifecycle tests pass.
- Full test/lint/build gate passes.
- No Dataverse metadata/data changed.

## Phase 2 — Align registration, dispatch and return automation

Status: [x] Complete — source alignment and full validation passed 19 October 2026; not deployed

### Source changes

- Make unified registration create Staging regardless of a selected mechanic or supplier.
- Update `JobRegistrationPlugin.cs`, restricted guard validation, registration contracts and tests
  together. Do not relax unrelated field protection.
- Preserve confirmed Email Dispatch as the sole normal Staging → With Technician trigger.
- Verify primary and additional technician sends use the same post-confirmed-delivery contract.
- Preserve the existing server-side current-roster check before With Technician → Completion Review.
- Ensure Action Required is never automatically cleared when cards arrive; expose “all cards
  received” separately so the coordinator can resolve the blocker deliberately.
- Preserve final-withdrawal recovery to Staging only when no current technician ownership/evidence
  remains.
- Make failed automatic transitions visible and retryable without resending a successfully delivered
  email or duplicating evidence.

### Completed implementation

- Unified registration now always writes Staging `122830001`; technician and external-supplier
  selection remain planning data. The restricted-access registration-child rule enforces the same
  exact payload, and the local contract records the behavior explicitly.
- Ordinary WOF creation now follows the same Staging rule even when an internal inspector is
  selected. Protected Site Check batch creation retains its documented specialised exception.
- Primary and additional technician sends both wait for confirmed delivery before invoking the
  shared ETag-guarded Staging-to-With-Technician transition.
- A confirmed email whose status update fails is presented as sent with recovery instructions. The
  Job drawer exposes **Retry status update**, which retries only the status transition and never
  queues another email or creates another Job Card lifecycle.
- Backend completion-review and withdrawal automation remains restricted to With Technician. The
  server tests now explicitly prove that all cards received cannot clear Action Required.
- The retired Unconfirmed value is absent from tabs, status selectors and new-write paths. Historical
  `122830005` rows and saved preferences render/filter as Staging, retain normal allocation,
  scheduling and dispatch behavior, and canonicalise to `122830001` on a subsequent status write.
  The bulk data/Choice retirement begins with read-only Phase 3 Inspect/Plan tooling; live Apply and
  Choice retirement remain separately approved cutover actions. No live rows or metadata were
  changed here.
- The future plugin package version is `1.0.19.0`. No assembly was built for deployment, no plugin or
  guard was deployed, and no historical Job was changed.

### Likely owners

- `dataverse/job-registration/JobRegistrationPlugin.cs`
- `dataverse/access/RestrictedAccessPlugin.cs`
- `dataverse/job-registration/contract.json`
- `src/alpha/jobs/services/primaryJobEmailWorkflow.ts`
- `src/alpha/jobs/services/jobsApi.ts`
- `api/services/jobOperationalStatusAutomation.js`
- `api/services/jobCardExpectedReturns.js`
- corresponding TS, CJS and offline C# tests

### Required tests

- Internal technician, external supplier, no technician, failed send, confirmed send and retry.
- Primary plus multiple assignments, replacement links, withdrawn assignments and concurrent roster
  changes.
- Action Required with all cards received remains Action Required.
- ETag conflict preserves the newer coordinator state.
- Successful email plus status-write failure reports recovery instructions and never sends twice.
- Registration/guard allow and deny matrices remain exact.

### Exit criteria

- A02 behavior is corrected in all active writers.
- Node and offline plugin/guard tests pass.
- No historical rows are rewritten in this phase.

## Phase 3 — Build historical status migration preflight and metadata tooling

Status: [x] Complete — schema provisioned and verified 19 October 2026; live status inspection and
deterministic legacy Plan completed; no historical Job data was changed

### Immediate historical migration slice

Bring the historical Job Status migration forward before branch/watch implementation. Start with
the only evidence-independent correction: every legacy Unconfirmed `122830005` Job must become
Staging `122830001`.

- [x] Add a versioned migration manifest with the exact table, Choice, source/target values, bound
  and explicit exclusions.
- [x] Add a PowerShell 5.1-compatible `Inspect`/`Plan` tool that opens at most one Dataverse
  connection, supports a synthetic offline snapshot, validates the global Choice contract and
  performs no Dataverse writes.
- [x] Make Inspect aggregate-only and make Plan emit only Job ID, expected row version, old/new
  status, safe reason code and disposition. Hash the sorted transition set for review.
- [x] Treat a legacy row without an ETag/row version as an exception rather than an applyable row.
- [x] Exclude every other status reclassification and Choice-option retirement from this first
  artifact. Those actions still require evidence/approval and cannot be inferred from assignment,
  schedule, Job number or GreenTree state.
- [x] Run live Inspect and review exact counts: 1,353 Jobs, 25 legacy Unconfirmed, zero missing
  ETags. The resulting 25-row deterministic Plan has zero exceptions; it remains unapplied.
- [x] Extend Plan to the evidence-based Staging/With Technician/Completion Review classifier after
  the shared dispatch, assignment and Job Card evidence reader is available.
- [x] Implement bounded conditional Apply/Verify plus checkpointed conditional rollback. Apply
  requires the exact approved plan hash and remains a separate explicit production approval.

The current source owners are
`dataverse/service-coordination/job-status-retirement-manifest.json` and
`scripts/plan-job-status-retirement.ps1`, plus the Phase 7 evidence classifier at
`scripts/service-coordination-migration.mjs`. Migration artifacts contain record identifiers and
must be stored with release evidence, not committed to Git.

### Metadata deliverable

Create one idempotent PowerShell 5.1-compatible manager, preferably
`scripts/manage-service-coordination-schema.ps1`, with `Inspect`, `Provision`, and `Verify` modes.
It must open one Dataverse connection per invocation, support non-interactive parameters consistent
with existing managers, and perform no write in Inspect/Verify.

### Metadata source progress

- [x] Add a versioned source manifest for the target Choice values, columns, user-owned Job Watch
  table, required lookups, relationship behavior, alternate key and coordinator role policy.
- [x] Add the PowerShell 5.1-compatible `Inspect`, `Provision` and `Verify` manager with Inspect as
  the default and a connection-free `ValidateDefinition` path.
- [x] Make Provision preflight every existing component before its first write, preserve non-English
  labels when updating Job Status labels, publish in one connection and post-verify the contract.
- [x] Restrict ordinary `Service Operations` Job Watch Create/Read/Write/Delete/Append/AppendTo to
  Dataverse `Basic` (user) depth and reject Assign, Share or any elevated existing watch grant.
- [x] Exclude user/role assignments, System User branch values, Job branch values, historical
  migration, Choice deletion, application deployment and feature enablement from every mode.
- [x] Run live read-only Inspect and review the exact solution/publisher, languages, collisions,
  existing role depths and generated entity-set names.
- [x] Run approved Provision and recorded post-Verify. The verified table entity set is
  `gr_jobwatchs`; the alternate key is Active; the Service Operations role has Basic-depth
  Create/Read/Write/Delete/Append/AppendTo and no Assign/Share grant.

The source owners are `dataverse/service-coordination/schema-manifest.json` and
`scripts/manage-service-coordination-schema.ps1`. Logical names remain proposed until live Inspect
confirms there is no target-environment conflict.

### Metadata owned by the tool

1. Update labels on global Choice `gr_status` without changing values:
   - Allocated → With Technician;
   - Unallocated → Staging;
   - Waiting for parts → Action Required;
   - Review → Completion Review.
   Inspect and report legacy Unconfirmed `122830005`, but do not delete it during source work. The
   approved migration must first apply and verify every reference.
2. Create global operating-branch Choice after conflict inspection:
   - Auckland `122830000`;
   - Waikato `122830001`;
   - Hastings `122830002`;
   - Christchurch `122830003`.
3. Add nullable `gr_operatingbranch` to Job using that Choice.
4. Add nullable `gr_serviceoperationsbranch` to System User using that Choice.
5. Create user-owned Job Watch with required Job and Watcher lookups, primary name, appropriate
   delete behavior and a unique Job + Watcher alternate key.
6. Add the table/columns/relationships/key to the approved solution.
7. Grant minimum required privileges to the exact participating roles; ordinary coordinators may
   manage only their own watches. Branch configuration remains administrative.
8. Publish and post-verify in the same approved Provision invocation.

### Safety requirements

- Inspect exact logical/schema/entity-set names, publisher prefix, option collisions, languages,
  ownership, key state, relationship behavior and existing solution components.
- Fail closed on incompatible existing metadata.
- Never delete or repurpose an existing option/table/column.
- Never set user branches or Job branches during schema provisioning.
- Never grant organization-wide Job Watch mutation merely to simplify implementation.
- Provisioning requires explicit user approval and is outside ordinary source implementation.

### Required tests/documentation

- Add source-level and synthetic offline tests for migration mode safety, metadata conflicts,
  paging bounds, deterministic sorting/hash, missing row versions and the exact legacy mapping.
- Add source-level contract tests for the metadata definition and mode safety.
- Update the authoritative schema documents with final verified logical names only after preflight.
- Record Provision/Verify output without secrets or tenant/customer exports.

### Exit criteria

- Tool passes local/static tests.
- Legacy Inspect/Plan source is reviewable without Apply authority; no live migration is implied by
  completing this source slice.
- Read-only Inspect has been reviewed before any approved Provision.
- Provision and post-verify are separately recorded when eventually authorized.

## Phase 4 — Implement authenticated branch/watch service boundaries

Status: [x] Complete in source — backend and local middleware implemented; gate remains off

### Server design

Add a narrow authenticated API/service and matching local Vite middleware for:

- resolving the caller's Dataverse System User ID and home branch;
- listing the caller's watches with bounded continuation;
- idempotently adding a watch for a readable Job;
- removing only the caller's matching watch; and
- loading exact watched Job summaries without N+1 requests.

Use the caller's delegated Dataverse token and validate it with `WhoAmI`. The server derives Watcher
and owner; it never accepts a supplied user ID as authority. Enforce the backend feature gate and
return private/no-store responses.

### Suggested source ownership

- `api/servicecoordination/index.js` and `function.json` or the established equivalent route
- `api/services/serviceCoordinationService.js`
- matching Vite middleware registration in `vite.config.ts`
- `src/alpha/jobs/services/serviceCoordinationApi.ts`
- typed contracts under `src/alpha/jobs/types/`

Use actual repository conventions discovered in Phase 0; do not duplicate an existing identity or
proxy helper merely to match these suggested filenames.

### Security and behavior tests

- Missing/invalid/expired authentication is rejected.
- Missing user branch is a setup error, never Auckland/All branches.
- Caller-supplied Watcher/owner fields are ignored or rejected.
- A user cannot list/delete another user's watches.
- Repeated add and repeated remove are idempotent.
- Job + Watcher uniqueness handles concurrent adds.
- Unreadable/missing/void Jobs return safe outcomes without stale content.
- Continuation links are same-origin/trusted and bounded.
- Account/environment switching cannot reuse another account's watches or home branch.
- Responses contain no Job Card evidence, tokens or unrelated user data.

### Exit criteria

- Backend/local parity tests pass.
- Feature remains disabled until metadata/roles are verified.

## Phase 5 — Add bounded Job Card progress summaries

Status: [x] Complete in source — authoritative batched summary operation implemented; gate remains off

### Backend contract

Extend the authoritative shared Job Card backend with one authenticated, bounded coordination
summary operation. It accepts a bounded set/page of Job IDs, verifies the caller can read those
Jobs, reads the same Azure lifecycle store used by submission/review, and returns only:

- expected/current required technician count;
- returned count;
- not-sent, awaiting, partial, ready, expired or conflict state;
- whether office attention is recommended because automation failed or evidence is incomplete; and
- a safe last-change timestamp if useful for freshness.

Do not return stories, hours, parts, photos, tokens, recipient emails or review notes. Batch
Dataverse Job/assignment reads and Azure lifecycle reads; do not call `readExpectedReturns` once per
table row. Fail visibly on truncation/incomplete roster evidence rather than claiming Ready.

### Shared-backend constraint

V2 currently bridges Job Card requests to the authoritative V1 backend. Deploy/verify the backend
summary capability before enabling the V2 client gate. Do not calculate progress from a different
partial store or from legacy Job Card Status alone.

### Required tests

- No card sent; awaiting one; awaiting several; partial; all returned; expired; withdrawn;
  replacement; all withdrawn; assignment changed; truncated store; duplicate lifecycle; unavailable
  backend; and caller lacks Job read access.
- Results are assignment-specific and do not let one technician's return satisfy another.
- Action Required is returned as Job lifecycle context but not auto-cleared.
- Bounded batch size, continuation and no N+1 behavior are asserted.

### Exit criteria

- Shared backend capability is source-complete and compatibility-tested.
- Existing technician links/reviews remain unchanged.
- Client gate remains off until deployed backend acceptance.

## Phase 6 — Implement branch queue and personal watchlist UI

Status: [x] Complete in source — branch/watch/progress UI and Job Book branch stamping implemented;
gates remain off pending migration and named-user acceptance

### Data-loading changes

- Add operating branch to the canonical Job type/select/parsing contracts.
- Resolve home branch once per account/environment through the authenticated service.
- Include branch in unified worklist server scopes and query/cache keys.
- Branch work loads only the signed-in user's branch after the gate is enabled.
- My watchlist loads personal watch IDs plus exact Job summaries in bounded batches, including
  watched Complete rows without loading the complete global archive.
- Job changes, branch transfers and watch mutations invalidate/reconcile only affected scoped query
  keys. Preserve stale-request and account-switch protections.
- When branch/watch features are disabled, retain the current worklist behavior.

### UI changes

- Add **Branch work** and **My watchlist** views to Service Coordination using the existing table,
  toolbar, filter and query-state patterns.
- Display the current branch clearly and show a setup error when unmapped.
- Add accessible Watch/Watching controls to each normal Job row and canonical Job drawer.
- Keep shared Needs Attention presentation/filter separate from personal watch state.
- Add the Job Card progress summary as a compact column/badge with explicit unavailable/conflict
  states and accessible text.
- Preserve the normal status, type, search, office-attention, sorting and sticky-column behavior.
- Show a branch badge on My watchlist, especially for any explicitly permitted cross-branch item.
- Do not expose who else watches a Job.
- Do not create a second Job editor or Job details route.

### Likely owners

- `src/alpha/jobs/JobsScreen.tsx`
- `src/alpha/jobs/components/JobsTable.tsx`
- `src/alpha/jobs/components/JobEditDrawer.tsx`
- `src/alpha/jobs/hooks/useUnifiedJobWorklist.ts`
- `src/alpha/jobs/services/jobsApi.ts`
- `src/alpha/jobs/types/jobsViewState.types.ts`
- `src/alpha/jobs/types/jobsDefaultView.types.ts`
- `src/alpha/jobs/services/jobsDataCache.ts`
- `src/alpha/jobs/services/jobsRealtime.ts`
- shared table primitives only where an established generic contract genuinely needs extension

### Required UI/data tests

- Two Auckland accounts see the same branch Jobs but different watched Jobs.
- Christchurch defaults to Christchurch and does not load Auckland rows in Branch work.
- Watch/unwatch updates immediately, survives reload/device, and is isolated on account switch.
- Two users can watch the same Job; one unwatch does not affect the other.
- Watched status transitions remain visible; Complete remains until personally unwatched.
- Needs Attention and Watching can independently be true/false in all combinations.
- Disabled flags preserve existing behavior.
- Missing branch, API failure, stale retained data, no matches and truly empty states are distinct.
- Keyboard/focus/ARIA behavior for watch controls and view filters.
- No global Job archive or one-request-per-watch loading regression.

### Exit criteria

- Focused UI/data-loading tests and full source gate pass.
- Gates remain off until Phases 3, 7 and 8 are approved/complete.

## Phase 7 — Complete evidence-based status reconciliation and branch migration tooling

Status: [x] Complete in source — deterministic classifier and branch hierarchy, exact-hash Plan,
checkpointed ETag Apply/Verify and conditional rollback implemented; no live Apply performed

### Remaining status reconciliation

Implement the modes and classification order from
[`job-status-lifecycle-migration.md`](../job-status-lifecycle-migration.md):

- Extend the Phase 3 `Inspect` inventory with dispatch/assignment/card/completion evidence.
- Extend the Phase 3 deterministic `Plan` artifact with unchanged/change/exception outcomes for
  non-legacy statuses.
- `Apply`: explicit approved artifact only; bounded, resumable conditional updates of `gr_status`.
- `Verify`: reconcile every planned outcome and prove no unrelated fields changed.

Do not blanket-reset Allocated/With Technician Jobs. Confirmed dispatch, current roster and current
card lifecycle drive classification. Preserve Action Required. Deterministically migrate every
legacy Unconfirmed is already isolated by the Phase 3 retirement plan and must not be sent through
this evidence classifier. After an approved Apply verifies zero remaining references, remove/retire
that Choice option as a separate metadata action. Existing Complete anomalies are exceptions until
an owner-approved repair policy exists.

### Branch migration

Implement the modes and evidence hierarchy from
[`job-branch-and-personal-watchlist.md`](../job-branch-and-personal-watchlist.md):

- linked Registered regional ledger;
- approved legacy regional source mapping;
- unambiguous supported legacy number format;
- explicit review.

Do not infer branch from technician region, Site address, creator, status or GreenTree account data.
Apply changes only `gr_operatingbranch`. Unknown/cross-region/unnumbered records remain reviewed
exceptions unless an exact population decision is approved.

### Tooling requirements

- PowerShell 5.1-compatible or an established repository migration runtime.
- One authenticated connection per run; no repeated interactive sign-in loops.
- Trusted continuation only, bounded pages/batches, resumable checkpoint and ETag conflict handling.
- Plan hash/run identifier, old/new values, reason codes, aggregate counts and privacy-safe output.
- No plan/data artifacts containing customer content committed to Git.
- Idempotent rerun and conditional rollback that never overwrites newer work.
- A simulation/fake-service test harness covering paging, conflicts, crash/restart and partial failure.

### Exit criteria

- Source/tool tests pass.
- Inspect/Plan can be reviewed without Apply authority.
- No live Apply occurs in an ordinary implementation task.

## Phase 8 — Controlled metadata, user mapping and migration rehearsal

Status: [ ] Exact-Plan approval gate — metadata is verified, the Auckland historical baseline is
planned, 43 unclassified Jobs are quarantined, and participating-user mappings are not authoritative

### Order

1. Capture solution metadata, plugin/role state and rollback artifacts.
2. Run schema `Inspect`; review exact conflicts, languages and privileges.
3. Provision/publish/verify metadata in one approved invocation.
4. Configure participating System User home branches: both Auckland coordinators as Auckland and
   Christchurch coordinators as Christchurch.
5. Run branch migration Inspect/Plan. Resolve or explicitly quarantine every unclassified active Job.
6. Run status migration Inspect/Plan. Resolve unsafe evidence and record Complete exceptions.
7. Rehearse Apply/Verify in a non-production or controlled cloned population when available.
8. Run named-user permission checks for home-branch read, own-watch CRUD and denied other-watch CRUD.

### Rehearsal evidence recorded 19 October 2026

- The read-only exporter inspected 1,353 Jobs and the regional ledgers without a data mutation.
- The branch Plan hash is
  `1b63fb82340a1b2bca732f7b91020f69936fc5900387000418bca5247f24421c`.
- 17 Jobs classify from unambiguous supported regional prefixes; 1,293 plain-number Jobs require
  an approved legacy source map and 43 Jobs have no accepted branch evidence.
- No branch Plan was applied. No participating System User branch was set because the exact
  Auckland/Christchurch user mapping has not been supplied as an approved artifact.
- These counts trigger the documented stop condition: enabling branch scope now would hide most
  historical work.

### Auckland baseline evidence recorded 20 October 2026

- The user approved Auckland as the historical branch for legacy plain-number Jobs. Regional `WJ`,
  `HJ` and `CJ` evidence remains authoritative and is not overridden.
- The revised read-only Plan contains 1,310 changes, zero unchanged rows and 43 exceptions. The 43
  exceptions have no accepted branch evidence and remain unchanged for later manual review.
- The revised Plan hash is
  `de9c8454ed78460d46cfebd9b60dd1fc37c6c484727b5774f87fc8df6df3ab74`.
- A CSV exception queue and a blank branch-mapping sheet for the three current Full/Coordinator
  participants were generated outside Git. No branch value was guessed.
- No branch Plan was applied and no participating System User branch was set. Apply still requires
  explicit approval of the exact revised Plan hash.
- A read-only System User lookup resolved one enabled Dataverse identity for each current
  Full/Coordinator participant and confirmed all three home-branch fields are blank. The review
  mapping records Andy Lee with Christchurch as the home/default branch and Bruce Frost plus George
  Robson with Auckland. Every participating user may switch to All branches; the home branch drives
  only the initial worklist and new-Job default. No user field has been updated.
- Home branch, All branches and My watchlist are implemented as distinct persisted worklist views.
  The exact three-user home-branch Plan contains three changes and has hash
  `b6c4bdc48e6c83b2b756abaa403037f6892fce47d55a5f0c32cdbd7315c83271`. It was conditionally
  applied and verified: three updated, three verified and zero mismatches.
- The approved historical Job Apply attempted no writes after all 1,310 planned rows failed the
  stale-row-version guard. A refreshed 1,361-Job snapshot produced 1,320 changes and 41 exceptions;
  replacement Plan hash `5a9029f01c18784788c4260b15370dc9a6520465bc840e82ec2dfd7e357aed10`
  remains unapplied pending exact approval.

### Stop conditions

- Incompatible existing metadata or option values.
- Missing/ambiguous regional evidence that would hide active Jobs on enablement.
- Job Watch permissions allow cross-user mutation.
- Status/branch plan counts do not reconcile.
- Migration would touch fields outside its exact allowlist.
- V1/V2 Job Card stores or deployed summary capability do not match.
- Rollback artifact or signing-key recovery is unavailable where required.

### Exit criteria

- Verified metadata and roles.
- Every participating user has a home branch.
- Approved migration plans and reviewed exception queues exist.
- No feature flag enabled yet.

## Phase 9 — Apply historical reconciliation and enable staged release

Status: [ ] Not started — exact branch Plan approval and authoritative user mappings still prevent
migration, deployment and feature enablement

### Cutover order

1. Deploy source with all new gates off and verify existing behavior.
2. Deploy/verify shared Job Card progress backend while its client gate remains off.
3. Stop or upgrade incompatible writers that still create old status semantics.
4. Apply and verify the approved branch plan.
5. Confirm no active in-scope Job has a null/unknown branch outside the reviewed admin exception queue.
6. Apply and verify the approved status plan.
7. Publish/verify final Job Status labels if not already completed with metadata provisioning.
8. Enable branch scope for the pilot users; verify Auckland and Christchurch independently.
9. Enable backend then client watchlist gates; verify own-watch isolation.
10. Enable Job Card progress for a bounded pilot after backend acceptance.
11. Observe logs, failure counts, stale queues and user feedback before widening access.

### Production acceptance matrix

- Auckland user A and B see the same Auckland active rows and each other's operational updates.
- Their watchlists differ and remain private; both can independently watch the same controlled Job.
- Christchurch sees Christchurch Staging/With Technician/Action Required/Completion Review work and
  does not normally load Auckland rows.
- Staging → With Technician happens only after confirmed dispatch.
- Multi-technician partial/ready progress is accurate and does not expose evidence.
- All required returns move eligible work to Completion Review without overriding Action Required.
- No path automatically marks Complete.
- Service/WOF manual completion still runs atomic side effects exactly once.
- Account switch, separate browsers, focus/reconnect and concurrent status/watch updates reconcile.
- Direct permission tests confirm a user cannot mutate another user's watch.
- If this release promises filtering only, documentation does not claim cross-branch data denial.

### Rollback

- Disable client progress/watch/branch gates in that order.
- Disable backend watch writes if integrity is uncertain.
- Restore the prior unscoped worklist query while retaining branch/watch metadata and rows.
- Roll back status/branch data only from recorded previous values and only where ETags prove no newer
  operational change; otherwise route to manual review.
- Restore previous Choice labels if necessary without renumbering values.
- Do not delete personal watches, branch columns/table, card evidence or historical migration audit
  as an emergency presentation rollback.

## Phase 10 — Post-release hardening

Status: [ ] Deferred until pilot acceptance

- [ ] Add operational metrics for unmapped users, null-branch active Jobs, failed watch operations,
  watch paging overflow, progress-summary failures, aging With Technician work and reconciliation
  exceptions. Exclude customer/job descriptions and credentials.
- [ ] Add an administrator-only reviewed queue for branch/status exceptions without exposing it to
  ordinary coordinators.
- [ ] Add explicit operating-branch transfer with ETag confirmation, audit and immutable Job Number
  provenance. Do not implement transfer as ordinary inline editing.
- [ ] Decide retention/cleanup for watches referencing legitimately deleted or inaccessible Jobs.
- [ ] Evaluate whether a shared branch-team watch or handover feature is needed; do not overload the
  private watch table pre-emptively.
- [ ] Reconcile documentation, TODO, CURRENT_STATE, readiness and release evidence after acceptance.

## Phase 11 — Optional Dataverse branch security isolation

Status: [ ] Deferred product/security decision

Only implement if the requirement changes from “do not normally show another branch” to “must not
be able to read another branch.”

- Design branch owner teams/business units and ownership for Job plus every related record needed by
  the workflows.
- Preserve Auckland collaboration through a shared Auckland team rather than personal Job ownership.
- Define cross-branch management, reassignment, transfer, reporting, scheduled integrations and
  application-user access.
- Migrate ownership with ETags/audit and prove V1 compatibility.
- Run direct Dataverse Web API allowed/denied tests with real Auckland, Christchurch, mixed-role and
  management identities. UI filtering is not evidence.
- Release separately from the initial operational-filtering/watchlist change.

## Phase 12 — Deferred specialised Service/WOF Job Cards

Status: [ ] On hold by owner decision

Do not begin this phase as part of the initial branch/watch/lifecycle implementation.

### Future design work

- Extend the shared assignment-owned immutable Job Card snapshot/submission contract with a
  versioned type-specific completion section.
- Service cards capture performed Service Type, Job Completion Date, completion meter, recorded date
  and reading classification plus the existing shared evidence.
- WOF cards capture Job Completion Date, completion meter/date/classification, new WOF expiry and the
  explicit Inspection/Equipment identity plus existing shared evidence.
- Define which assigned technician supplies authoritative completion fields and how conflicting
  multi-technician values enter office clarification/correction without editing original evidence.
- Add public/server validation, review display, correction audit, PDF/export behavior, storage
  migration and compatibility for existing links/cards.
- Preserve the anonymous-browser boundary: public cards never receive Dataverse credentials or
  directly update Job/Equipment/maintenance/WOF state.
- Build an office-authorized, idempotent atomic processor that reloads current Dataverse state and
  invokes the canonical Service/WOF side effects.

### Gate before any automatic Complete

- Complete type-specific evidence is accepted and reviewed.
- Current roster and assignment identity are consistent.
- GreenTree is Closed or Finalised under the approved external-status rule.
- Atomic Service/WOF operation passes concurrency, retry and unknown-outcome tests.
- Missing/conflicting evidence remains Completion Review with visible attention.
- Existing historical cards and manual workflows remain usable during cutover.

## Phase 13 — Deferred completion automation and manual-workflow retirement

Status: [ ] On hold by owner decision

Only after Phase 12 live acceptance:

1. run the canonical type-specific processor from Completion Review;
2. set Complete only after every required side effect commits or idempotent verification proves it
   already committed;
3. define GreenTree reopen behavior and historical Complete anomaly repair;
4. migrate/retain all in-flight Jobs and old Job Cards;
5. run the retirement dependency inventory from `architecture/retirement-plan.md`;
6. disable the manual completion entry points behind a reversible gate;
7. observe a full agreed operating period; and
8. remove old UI/code only in a later explicit retirement change with rollback and evidence
   retention.

Documentation of a replacement is not evidence that the current dialogs are safe to remove.

## Final definition of done for the initial delivery

The initial delivery ends after Phase 9 acceptance, not after the deferred phases. It is complete
only when:

- the new labels are consistent in app and Dataverse while numeric values remain unchanged;
- registration, dispatch, withdrawal and all-return transitions follow the agreed lifecycle;
- Auckland users share Auckland Branch work and Christchurch defaults to Christchurch Branch work;
- personal watchlists are durable, user-scoped and independent of Office Attention;
- Job Card progress is authoritative, bounded and privacy-minimal;
- historical branch/status migrations reconcile every planned row or reviewed exception;
- no automatic path marks a Job Complete;
- current Service/WOF manual completion remains intact and verified;
- full automated validation and named-user/two-browser acceptance pass;
- rollback has been captured and rehearsed proportionately; and
- authoritative documentation, CURRENT_STATE, TODO and release readiness reflect the actual deployed
  state rather than planned behavior.
