# Prioritised backlog

Updated 10 October 2026 from the [source audit](docs/reviews/2026-10-10-application-audit.md).
This is remaining work, not a completed-change log. See [current state](CURRENT_STATE.md) and
[release gates](RELEASE_READINESS.md); historical backlog is retained in Git.

## Current review and technician workspace

- [x] **Job Card review screens/functions — initial review completed 10 October:**
  [findings and acceptance plan](docs/reviews/2026-10-10-job-card-review.md), including a sample-only
  walkthrough and 100 passing focused tests. This does not complete implementation or live acceptance.
- [x] **Office queue first pass:** keep the Submitted queue mounted while a saved card opens in a
  centred review dialog; preserve queue filters; label the action as GreenTree entry; use explicit
  Auckland display time and lead with a compact evidence/attention scan strip. This is not deployed acceptance.
- [x] **Local office safeguards:** office-only meter approval, correction notes, Resume entry,
  expired-return visibility, assignment-return checks and retry discovery after filing. See
  [implementation/activation report](docs/reviews/2026-10-10-job-card-implementation.md); not deployed.
- [x] **Local meter-writer security:** dedicated backend credentials, exact application/user/role
  binding and four-field guard in `1.0.2.0`; 114 offline policy tests pass. No shared GreenTree token
  fallback or new human grants. [Rollout checklist](docs/job-card-meter-writer-rollout.md).
- [ ] **Meter-writer production rollout:** obtain explicit approval for the missing reference column,
  dedicated identity/role and guard deployment; verify actual allowed/denied writes and rollback
  before enabling flags. Live remains `1.0.1.0`; no cloud changes made in this continuation.
- [ ] **Review tracking/recovery release (JC01–JC04):** verify schema/permissions and shared backend,
  enable/test optional bounded continuation/exact lookup; add proper queue indexes, monitoring,
  assignment-concurrency protection and Open jobs continuation. New flags remain off.
- [ ] **Review UX (JC05–JC06):** decide whether Open jobs should be renamed Awaiting cards;
  refine focus-refresh/page retention, scroll
  restoration and compact the queue columns. Reuse canonical review/shared components; no second
  review workflow.
- [ ] **Technician app — PARKED by owner on 10 October:** eventually provide a mobile-friendly personal list of assigned Jobs and let the
  technician open, complete and submit each Job Card from that workspace. Reuse existing Job Card
  forms, validation and evidence storage. Design authenticated technician identity and server-side
  assignment-scoped access first; anonymous single-job tokens are not authority to list jobs.
  Keep technician submission separate from operational Job completion. Offline support,
  notifications and app packaging remain decisions, not assumed scope. Personal accounts are desired,
  but Azure intermediaries must not be assumed to remove Dataverse licence requirements.

## P0 — Before broad restricted-role rollout

- [ ] **A01:** align client capabilities, narrow payloads, role-policy manifests and server guards.
  Cover mechanic/supplier edits, Equipment saves containing compliance fields, and post-email allocation.
  Preserve server-side rejection of unrelated writes; test real restricted identities.
- [ ] **A02:** registration must remain Staging (stored as Unallocated) until confirmed dispatch, regardless of a selected
  mechanic/supplier. Update registration/guard/tests together and plan historical correction separately.
- [ ] **A03, owner-approved:** GreenTree closure without required completion evidence remains
  Completion Review. Safeguard implemented locally; verify deployment and historical/void/reopen
  handling. Operations still uses canonical type-specific completion when evidence is satisfied.
  Automatic Completion Review → Complete processing remains explicitly on hold.
- [ ] **A04/A05:** prove scheduled application identity and shared Job Card store, expose per-record
  failure, add durable retries/continuation and prevent pending-card backlog starvation.
- [ ] **A06:** connect unified Job worklist state to shared invalidation, then restore/verify V2
  realtime configuration and independent-browser freshness.
- [ ] **A07, owner-approved:** hide unfinished Customer Info editing until persistent.
  Do not remove working Customer/Site creation, Site settings, PO contacts or Equipment transfers.
- [x] Repair the three stale manifest/roster test expectations and six lint findings. Full local
  suite now passes (890 Node tests); provisioning/deployment/assignment safeguards remain tested.
- [ ] Reconcile remaining readiness-manifest/client-flag drift with actual deployment evidence.
- [ ] Enforce Node 20 tests/lint/build and offline plugin policy tests in CI; complete named-user,
  service-identity, auth and two-browser smoke from the release checklist.

## P1 — Data integrity and operational reliability

- [ ] Release the reviewed
  [Service Coordination V3 managed worklist](docs/features/SERVICE_COORDINATION_V3_MANAGED_WORKLIST.md):
  signed assembly/API `1.0.24.0` and the preserved yellow-cliff V3 pilot are deployed and verified.
  The separately approved V3 GreenTree/TimeCloud settings are installed and passed read-only
  production smoke checks. The explicitly approved historical plan is applied: a post-apply snapshot
  verifies all 254 active Jobs as managed Auckland and all 1,142 GreenTree-closed Jobs unchanged,
  with zero mismatches. Full Access live acceptance, a 13-user role audit and restricted-role
  simulation passed. The seven exact Auckland home-branch plans were owner-approved, applied and
  automatically verified with zero mismatches. Complete real-account restricted-role UI acceptance,
  then record the release go/no-go decision.

- [ ] Execute the ordered
  [Service Coordination workflow implementation plan](docs/features/SERVICE_COORDINATION_WORKFLOW_IMPLEMENTATION_PLAN.md)
  phase by phase. Initial delivery ends with lifecycle, branch queue, personal watchlist, card
  progress, reviewed migrations and staged acceptance; specialised Service/WOF cards and automatic
  Completion Review → Complete remain deferred and must not be pulled into the first release.
  - [x] Complete Phases 0–2: source/authority inventory, shared labels, lifecycle model, registration
    and WOF Staging alignment, guarded dispatch recovery, and transition tests without changing
    Dataverse metadata or data.
  - [x] Retire Unconfirmed from active source behavior: remove the tab/status choice and new-write
    paths; compatibility-map legacy rows/preferences to Staging so they stay visible and actionable.
    Live Inspect found 25 rows with zero missing ETags; the zero-exception Plan remains unapplied.
  - [x] Build and run the approved Phase 3 metadata manager for Job Status labels, operating branch
    fields and the private user-owned Job Watch table. Post-Verify passes; ordinary coordinator watch
    privileges are user-depth and Assign/Share were not granted. No user/Job branch values were set.
- [x] Add explicit operating-branch scope and a private per-user Job Watch table in source. Auckland users
  must share the Auckland branch queue while retaining independent watchlists; Christchurch users
  default to Christchurch work. Do not derive branch from technician text, Site address, creator or
  browser storage, and do not reuse shared Office Attention as a personal watch. Follow the
  [branch/watchlist schema, migration and acceptance plan](docs/job-branch-and-personal-watchlist.md).
  Backend/client gates are enabled in V2 and V3. The approved Auckland branch migration and all 13
  reviewed user home branches are applied and verified. The separate V3 managed-worklist migration
  verified 254 active Jobs as managed Auckland and left 1,142 GreenTree-closed Jobs unchanged.
- [x] Record the initial branch scope as normal operational filtering, not Dataverse row-level
  isolation. If isolation is later required, design branch owner teams/business units and prove allowed
  Auckland collaboration plus denied cross-branch reads with direct named-user/API tests; a hidden UI
  row is not a security boundary.
- [x] Implement the agreed Service Coordination lifecycle presentation in source and verified metadata without changing Dataverse
  Choice numbers: display Unallocated as **Staging**, Allocated as **With Technician**, expose
  per-assignment Job Card return progress in the worklist, and use office attention/follow-up rather
  than an inaccurate lifecycle status to keep watched Jobs visible. Inspect and publish the matching
  global `gr_status` labels through the controlled
  [schema and historical migration plan](docs/job-status-lifecycle-migration.md).
  Progress/client gates remain off until the shared backend is deployed and accepted.
- [x] Build and simulate the evidence-based historical Job Status migration in Inspect, Plan, Apply
  and Verify modes. Do not blanket-reset Allocated Jobs: confirmed dispatch, current assignment/card
  lifecycle, deliberate Action Required and terminal/completion evidence must drive classification.
  Deterministically migrate legacy Unconfirmed `122830005` to Staging `122830001`; verify no rows,
  filters, plugins or integrations still reference it before removing/retiring that Choice option.
  Apply only an approved plan in bounded ETag-protected batches and retain exceptions/rollback audit.
  - [x] Add the narrow, write-free legacy retirement manifest and Inspect/Plan tool with aggregate
    inspection, deterministic hash, expected row versions and a synthetic PowerShell 5.1 test.
  - [x] Run approved live Inspect: 1,353 Jobs, 25 legacy Unconfirmed and zero missing ETags. The
    deterministic Plan has 25 ready changes and zero exceptions. Apply is not approved and has not
    run; historical branch evidence and participating-user mappings remain outstanding.
- [ ] Extend the shared technician Job Card contract with type-specific completion evidence. Service
  cards must supply the Service Type, completion date and classified/dated completion meter required
  by atomic maintenance updates. WOF cards must supply the completion date, classified/dated meter
  and new WOF expiry required by the linked inspection/Equipment update. Preserve immutable evidence,
  assignment ownership, review/correction history and the anonymous-browser Dataverse boundary.
- [ ] After type-specific cards and atomic processing are accepted, replace the manual Service/WOF
  completion dialogs and design the guarded Completion Review → Complete processor. Require complete
  current-roster evidence, safe type-specific side effects and GreenTree Closed/Finalised; retain
  Completion Review with office attention for missing/conflicting evidence. Do not remove the manual
  paths or enable automatic completion before migration, idempotency, retry and live acceptance gates.
- [ ] **A08:** make Quote header/line saves atomic and concurrency-protected.
- [ ] **A09:** bind pending session recovery to initiating account; cancel safely on logout/switch.
- [ ] **A10:** add map-tile quota/rate/cache controls and monitoring without exposing the provider key.
- [ ] **A11:** strengthen deployment preflight, artifact/configuration verification, rollback capture
  and signing-key recovery rehearsal before further plugin/role activation.
- [ ] Define GreenTree reopen and voided/historical-job rules; never infer operational relationships
  from inaccurate GT account data.
- [ ] Confirm required technician/assignment evidence even when an assigned technician has no Azure link.
- [ ] Make over-limit queue/history states actionable rather than silently omitting older work.
- [ ] Complete feature-specific release checks for supplier assignment, hour-meter classification,
  Site Checks and chargeable invoices; source presence is not activation approval.

## P2 — Reuse, performance and maintainability

- [ ] Extend shared searchable-select focus/keyboard/portal behavior; migrate compatible custom
  mechanic/equipment controls without losing Other supplier / Unknown equipment actions.
- [x] Reuse bounded Customer search coordination in Equipment filtering, including stale-response protection.
- [ ] Put unified worklist into scoped query ownership with cancellation and incremental paging.
- [ ] Measure Equipment initial projection, client filtering and heap; narrow loading where justified.
- [ ] Index/resume Azure Table queues; measure scanned rows, oldest pending age and partial failures.
- [ ] Extract orchestration/domain transitions from large Jobs, Customer, Equipment and Job Book files.
  Keep canonical feature drawers instead of introducing more versions.
- [ ] Reuse small authenticated-request helpers while preserving separate anonymous, reviewer,
  invoice-role and application-identity authorization policies.
- [ ] Add rendered interaction, failure-injection and cross-browser tests alongside textual contract tests.
- [ ] Profile initial/PDF bundles before additional splitting; routes are already lazy-loaded.

## Retained product and operational follow-ups

These remain open from the earlier backlog; consolidation is not cancellation or completion.

- [ ] Complete the owner-approved Excel replacement rehearsal, regional reconciliation and
  single-writer number cutover. Recalculate seeds; old audit maxima are not current seeds.
- [ ] Obtain the expanded Job Type categories and decide required selection for Office entry.
  Preserve unclassified interim jobs; do not invent a service type or meter requirement.
- [ ] Verify signing-key backup ownership/recovery and all required server configuration for the
  specific backend; anonymous Azure Job Cards do not require Site Check credentials.
- [ ] Verify non-empty Job-number uniqueness against current metadata/data before deciding whether
  any additional key provisioning is needed; do not recreate an existing active key.
- [ ] Review Equipment CSV administrator-only authorization beyond its client email gate.
- [ ] Define orphan/retry-staged photo retention and cleanup; preserve accepted evidence.
- [ ] Add privacy-safe portal failure/replay monitoring and cold/warm signed-in performance baselines.
- [ ] Design the newly allocated-number GreenTree grace/retry policy and explicit archive marker.
  Absence from a delta response is not a 404 or proof a Job is missing.
- [ ] Make usage forecasting Site-aware only after defining historical/unknown-Site segmentation;
  current evidence must not be rewritten or discarded.
- [ ] Finish Staff signed-in/recipient smoke and intended configuration; keep external PO recipients
  separate from opted-in internal CCs.
- [ ] Complete reviewed Site Check findings and checklist-content/admin release work in its tracker.
- [ ] Define persistent Customer Info separately after hiding unfinished editing.
- [ ] Decide Parts quantity/part-number/inventory scope and technician evidence grouping.
- [ ] Decide reviewed follow-up actions for Further Work/Safety evidence; no automatic outcome
  based solely on technician responses.
- [ ] Dedicated WOF/Schedule/Site events or delta recovery require a separate approved infrastructure change.

## Retirement candidates — separate, gated changes

Use the [retirement runbook](docs/architecture/retirement-plan.md). No removal has occurred or is
certified unconditionally safe.

- [ ] Recheck and remove isolated unused test screens, old CustomerOpenJobsTab and old maintenance
  drawer component; preserve CSS still imported by current consumers.
- [ ] Migrate remaining JobsTableSortIcon wrapper consumers before removing the wrapper.
- [ ] Remove dormant prototype Customer draft branches only after proving no live entry point.
- [ ] Retire legacy JobBookOnly compatibility only after tenant-wide assignment and V2/V3
  authoritative-backend checks.
- [ ] Replace the V2 → authoritative yellow-cliff Job Card bridge only after
  storage/link/evidence/authorization migration is verified.
- [ ] Retain Site Check/legacy Dataverse submissions, regional ledgers and numbering compatibility
  until their independent migrations pass. Disabled flags and old filenames are not deletion evidence.
