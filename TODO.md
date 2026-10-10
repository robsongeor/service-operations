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
- [ ] **A02:** registration must remain Unallocated until confirmed dispatch, regardless of a selected
  mechanic/supplier. Update registration/guard/tests together and plan historical correction separately.
- [ ] **A03, owner-approved:** GreenTree closure without required completion evidence remains
  Completion Review. Safeguard implemented locally; verify deployment and historical/void/reopen
  handling. Operations still uses canonical type-specific completion when evidence is satisfied.
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
- [ ] Retire legacy JobBookOnly compatibility only after tenant-wide assignment and V1 checks.
- [ ] Replace V2 → V1 Job Card bridge only after storage/link/evidence/authorization migration is verified.
- [ ] Retain Site Check/legacy Dataverse submissions, regional ledgers and numbering compatibility
  until their independent migrations pass. Disabled flags and old filenames are not deletion evidence.
