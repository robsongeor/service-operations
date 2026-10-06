# Service Operations Backlog

This is the authoritative prioritised backlog. Architecture belongs in `docs/architecture/`;
temporary release readiness belongs in `CURRENT_STATE.md`; completed work belongs in
`CHANGELOG.md`.

## Priority 0 — Production readiness

- [ ] Complete the owner-facing [Job Book Excel replacement rollout plan](docs/features/JOB_BOOK_ROLLOUT_PLAN.md):
  confirm users/duties/regions, finish real integration, record acceptance evidence, rehearse migration,
  then separately approve the single-writer cutover. No rollout until release criteria pass.

- [ ] Complete regional Job Book migration and cutover using
  [`docs/features/REGIONAL_JOB_BOOKS.md`](docs/features/REGIONAL_JOB_BOOKS.md): obtain, retain, import,
  and reconcile each regional spreadsheet; derive and verify each production seed; target-smoke
  allocation; then enable the two regional release gates. All three regional schemas, active keys,
  and application-role privileges are provisioned and verified; both production gates remain disabled.
- [x] Review and approve the full-width desktop Job Card detail draft for commit/push.
- [ ] Deploy the full-width review and local-development safeguards only after separate owner
  deployment approval. Production is unchanged by the feature-branch commit/push.

- [x] Deploy the owner-approved pending Job Card table. Release `024685e` published successfully;
  live bundle and anonymous-access protection verified on 2 October 2026.
- [ ] Complete the read-only signed-in review-queue check after the owner signs in. Populated
  filters/shared controls are validated locally; mobile work is intentionally deferred.
- [ ] Confirm the authorized queue display after refreshing the owner's signed-in localhost
  browser. The approved live read-only connection, authentication boundary and write block pass
  local checks; no Azure keys or production changes were needed.

- [x] Publish and verify the Job Card review layout, all-photo ZIP save and same-screen associated
  quotes. Owner-approved deployment and read-only live verification completed on 2 October 2026.

- [x] Deploy and verify the Job Card office-control cleanup: Azure history in the Job drawer,
  retirement of legacy status controls for ordinary Jobs, saved Azure PDF export, on-demand historical
  evidence, and unchanged Site Check behaviour. Published with owner approval on 2 October 2026.

- [ ] Configure and verify the production server-only `DATAVERSE_URL`,
  `DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`, and `DATAVERSE_CLIENT_SECRET` settings.
- [ ] Complete and verify Job Type provisioning and the service-operator classification workflow
  for newly registered Office Admin Job Book entries. Office Admin create/edit must continue to
  omit these operator controls; an interim unclassified Job may send a Job Card without an invented
  type or service hour-meter requirement, but it must subsequently receive its correct Job Type.
- [ ] Provision an independent or dedicated shared permanent Job Card backend for V2, then retire
  the temporary V2-to-V1 bridge. Configure the private Dataverse, Azure Storage, ACS email,
  reviewer and public-URL settings listed in
  [`docs/architecture/deployment.md`](docs/architecture/deployment.md#temporary-v2-job-card-backend-bridge),
  pass the full production-safe Job Card smoke, remove `VITE_JOB_CARD_SHARED_BACKEND` from the V2
  workflow, redeploy and verify before removing the proxy. Do not retire V1 while the bridge is in use.
- [x] Run a production-safe Azure Technician Job Card submission smoke test covering link
  generation, public lookup, submission, manager review, photo download, and replay
  rejection.

## Priority 1 — Security and reliability

- [ ] Implement the agreed unified Job Book/staging/coordinator workflow in safe stages.
  Ordinary Job number safety, transactional registration/allocation plugin source, server number
  guards, disabled client adapter and offline SDK tests are implemented locally. A separate `--unified`
  fake-data walkthrough now connects both screens with session request/replay recovery, saved-master
  versus snapshot-only reconciliation, sample registered-entry Void, independent coordinator
  membership and bounded pages. Local transactional plugin contracts now cover exact-version
  membership and atomic registered-entry Void with caller-context guard integration; they remain
  unregistered. A strict disabled client adapter and bounded production worklist are connected behind
  the disabled gate; the default ordinary runtime is unchanged.
  Assigned-technician initial dispatch now has a replay-safe guarded API and gated client path;
  Manage/Void are also wired behind the same disabled gate while the localhost fixture remains separate.
  The production worklist now uses 100-row Dataverse pages, trusted continuation links and server-side
  Operational/Unconfirmed/type filters. A read-only readiness manifest/audit now defines the proposed
  APIs, columns, role gates and activation blockers. The approved target audit confirmed the exact
  missing delta without changes: five APIs, 12 columns, four regional Choice additions and two roles.
  Direct manual create/import/paste writes, number clearing and numbered Site Check deletion now fail
  closed behind the disabled gate; WOF number editing is omitted and new WOF Jobs remain unnumbered.
  The reviewed regional allocator now accepts those specialist Jobs without changing their type,
  evidence or source relationship, and the UI directs users to the guarded per-Job action. Next:
  the migration/role package now has machine-readable no-auto-link and default-deny policies plus a
  bounded aggregate-only audit, but all write/backfill decisions still need approval. The approved
  read-only run found 1,191 Jobs, zero regional ledger rows and eight
  unknown-format numbers. Preserve 1,154 numbered Jobs as legacy without fabricating ledgers; the
  eight values are reviewed immutable regionless exceptions with fingerprint drift detection.
  Review regional sequence/source evidence, assembly signing, exact
  registration and rollback before writing or approving a Provision mode.
  The compatible deployment unit is now rendered and validated: 12 columns, four Registered Choice
  additions, four plugin types in assembly `1.0.0.0`, five APIs, 29 guard steps, four role profiles
  and eleven reviewed assignments. The approved flag-off Dataverse package is provisioned and an
  independent Verify run passes. All 29 shared-environment guard steps are disabled for V1 safety
  while a separate V2 application deployment is prepared. No migration, seed, V1 application release
  or feature enablement was performed. Remaining blockers include application/Entra role work, eight users' Dataverse
  admission, sequence ownership and controlled live smoke testing. Feature enablement remains a
  later approval.
  Live read-only checks confirmed all four AutoNumber formats and Active keys plus provisional next
  values `147174`, `WJ1548`, `HJ12253`, `CJ23859`; recalculate at cutover. George and Bruce remain
  the only admitted intended Dataverse users, with no returned team-role grants; the other eight
  still require authorized admission/licensing work.
  Signing readiness now refuses repository-held keys and existing artifact overwrite, requires an
  external owner-approved `.snk`, and emits a public-token/source/assembly-hash manifest without
  deploying. George owns the protected PC-local key; signed assembly `1.0.0.0` has public key token
  `0edea2881bb8578c` and a verified manifest. Nominate a backup owner, create protected recovery
  storage and prove a recovery build before production use.
  Exact registration review covers API request/response schemas, privilege-sharing authorization
  sets, all 29 step identities and every pre-image column. The new Office Admin and Job Book Admin
  roles use the Basic User baseline plus only the reviewed custom grants; Delete/Assign/Share remain
  excluded. Pubudu is admitted as the third Office Admin rollout user and live Office Admin pilot and
  now holds `Service Operations - Office Admin` additively. Smoke-test that path before removing the
  broader `Service Operations` role; then run final denial tests with no Full/Coordinator overlap.
  Preserve unrelated platform roles and add Pubudu to the separately controlled Job Card reviewer
  allowlist only during its approved rollout.
  Durable cross-device recovery and cache retention remain.
  Existing Intake dispatch remains blocked; schema, migration and permission rollout stay
  approval-gated. See the [implementation sequence](docs/features/JOB_BOOK_INTAKE_DESIGN.md#unified-workflow-decision-3-october-2026).

- [ ] Deliver the restricted Job Card Admin review workflow for Nargiza and Jess using
  [`docs/features/JOB_CARD_ADMIN_REVIEW_IMPLEMENTATION_PLAN.md`](docs/features/JOB_CARD_ADMIN_REVIEW_IMPLEMENTATION_PLAN.md):
  immutable technician evidence, explicit office statuses/notes and audit, Active/History queues,
  the `ServiceOperations.JobCardAdmin` route role, least-privilege Dataverse access, and the
  server-side reviewer allowlist. Entra/Dataverse provisioning and assignments, environment-setting
  changes, deployment, and production pilot remain separate approval gates.

- [ ] Complete restricted Legacy Job Book rollout: create the Entra application roles
  `ServiceOperations.FullAccess` and `ServiceOperations.JobBookOnly`, approve the named user/group
  assignments, target-smoke the existing least-privilege `Service Operations - Job Book Only`
  Dataverse role across the exact Job Book Entry/Job/Equipment/Customer/Site/Contact/Staff reads and
  permitted writes, then enable `VITE_APPLICATION_ACCESS_CONTROL_ENABLED`. The Contact lookup and
  its Site Contact Read plus Contact Read/Append To grants are provisioned and verified; the client
  route boundary and development simulator are also complete.

- [ ] Implement the phased shared data-loading and multi-user synchronization architecture in
  [`docs/architecture/data-loading-and-synchronization.md`](docs/architecture/data-loading-and-synchronization.md).
  Request-generation guards, silent-token coalescing, shared Jobs/Equipment cache subscriptions,
  primary startup/reference continuation paging, and the app-shell Operational Data Client are
  complete locally. Equipment Job history is the first shared focused query with cancellation,
  bounded invalidation, prefetch, and short-window eviction. Main Jobs/Equipment list ownership is
  also migrated to versioned app-shell query keys while retaining the existing IndexedDB adapters.
  Canonical Job edit drawers now open immediately, refresh Job core independently, separate editor
  relationships from Quote/assignment readiness, and defer Job Card children/photos until that tab.
  Focused Job core and Job Card metadata now use shared query keys with bounded invalidation and
  eviction; full photo bytes load only when one photo is opened. Selected-Customer Dashboard Sites,
  Equipment, Jobs, and Service Plans now use bounded scoped queries and focused Equipment completion
  restores full linked history. The query client now exposes privacy-safe in-memory request/cache/
  duration/payload metrics. Scheduler now uses bounded visible-week queries with adjacent prefetch,
  and Job Map now uses a minimal status/location projection without global Job or Site reads. One
  app-shell SignalR provider now dispatches the currently published Job, Equipment, and Staff events,
  coalesces dependent query invalidation, performs bounded reconnect/visibility recovery, and shares
  successful local Job/Equipment invalidations across account/environment-scoped browser tabs.
  Job editor Equipment/Customer searches and dependent Site/Contact/Service Plan reads are now
  bounded and cancellable, and related-record creates no longer refresh whole tables. Canonical Job
  creation now renders supplied defaults immediately, shares the Staff directory, and exposes
  dependency-specific loading/retry state instead of waiting on a broad reference bundle. Job-drawer
  Quotes and Assignments now use separate tab-triggered focused Job queries, and Customer Dashboard
  Quotes use a selected-Customer query. Equipment drawers now render their supplied core immediately,
  load focused Service Plans only on Maintenance, and share focused Job history for usage evidence
  across Equipment, Customer Dashboard, and WOF. Scoped Jobs consumers no longer trigger implicit
  full Schedule Option or Office Update reads; Customer Dashboard and Scheduler supply bounded
  Job-ID-filtered projections. WOF startup now reuses shared Equipment plus shared, paged Inspection
  and referenced-Job Schedule Option queries, and defers editor-only directories and selected
  relationship reads until their workflows open. The Quote register and exact-record editor reads
  now use shared keys, defer editor support, reconcile same-scope tabs after local mutations, and
  use bounded abortable Job, Customer, and active Equipment selectors with exact-record hydration.
  Equipment Manager now renders from the shared Equipment projection without full Customer/Site/
  Service Plan startup reads, uses visible-page maintenance queries and bounded drawer relationships,
  and reserves complete reference loading for explicit Map/CSV needs. Quote Pricing and Staff now use
  independent shared keys reused across Pricing, Quotes, and Jobs. Job Book now shares Staff, uses
  bounded abortable Customer search, and loads Sites only for the selected Customer while retaining
  its deliberate lightweight Equipment index. The final `useJobs()` call-site audit is complete:
  linked WOF Job editing and Chargeable Invoice Job creation are scoped, completion reconciliation
  uses exact Job/Equipment plus focused history/plans, and only the primary Jobs register remains a
  deliberate global consumer. A development-only Sidebar diagnostic now exposes resettable
  privacy-safe query-family and route-to-useful-content timings for the five remaining primary
  registers. Next capture comparable signed-in cold/warm baselines, optimize the worst query family,
  then separately approve dedicated WOF Inspection, Schedule Option, and Site events
  or Dataverse watermark/delta recovery. New plugin events or Azure changes remain separately
  approved work.

- [ ] Approve, provision, and verify a Dataverse alternate key for non-empty Job Number so two
  simultaneous first-time creates cannot bypass the application duplicate preflight. Confirm the
  existing data set contains no duplicates before provisioning; this is a separate Dataverse change.
- [ ] Replace the client-side Equipment CSV administrator email restriction with an
  authoritative server or Dataverse permission boundary.
- [ ] Review non-atomic multi-record workflows outside Service completion and Technician
  submission; document recovery behaviour or make them atomic where business consistency
  requires it.
- [ ] Define cleanup and retention for retry-staged Job Photo rows when a technician never
  completes the submission.
- [ ] Add production monitoring for public portal authentication, submission failures, and
  repeated temporary errors without logging secrets or submission content.

## Priority 2 — Product improvements

- [x] Add office PDF export for Azure Job Card evidence and load historical Dataverse evidence only
  on demand. Do not remove Site Check dependencies or historical service records during cleanup.

- [ ] Make Equipment usage forecasting Site-aware. Use each historical Job's recorded Site to start
  a new forecast segment when Equipment moves, so usage from a previous operating environment does
  not determine the new Site's service forecast. Define an explicit fallback for legacy Jobs without
  a recorded Site and preserve all readings as history rather than rewriting or deleting them.

- [ ] Complete release validation for the provisioned Job `gr_hourmeterreadingtype` Choice and
  `gr_hourmeterrecordeddate` Date Only column: verify intended-manager read/write, smoke-test Actual
  and Estimated completion for every Job type, then separately approve the deployed
  `VITE_HOUR_METER_CLASSIFICATION_ENABLED` setting. Local development is enabled; deployment remains
  unchanged. See
  [`docs/hour-meter-reading-classification-schema.md`](docs/hour-meter-reading-classification-schema.md).

- [ ] Deliver the planned manager-only Chargeable Invoice Review workflow: Phases 1–6 and the Phase 7 local retention/recovery, release-guard and rollback baseline are complete; separately approve/provision the six whole-package Delete grants, run the de-identified target-environment manager/deletion/accessibility/performance smoke, then complete separately approved role assignment and release validation. See [`docs/features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md`](docs/features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md) and [`docs/chargeable-invoice-review-operations.md`](docs/chargeable-invoice-review-operations.md); role provisioning/assignment, deployment and flag changes retain explicit approval gates.
- [ ] Complete Staff Directory signed-in smoke testing and configure intended staff. All three Staff columns are provisioned and verified; verify Quote and Chargeable Invoice customer drafts include opted-in internal CCs without changing external Customer/Site PO routing. Amendment handoff continues to select an active internal recipient and suggest the sole Accounts record.
- [x] Implement Site Check temporary Equipment availability:
  enabled-Site-only marker, In Workshop/Temporarily Off-site exclusion, and occurrence
  exclusion snapshots; no catch-up Jobs.

- [ ] Deliver the approved Site Checks operational expansion in
  [`docs/features/SITE_CHECKS_IMPLEMENTATION_PLAN.md`](docs/features/SITE_CHECKS_IMPLEMENTATION_PLAN.md):
  cross-customer workspace, one-link bulk technician dispatch, versioned per-machine
  checklists, guided multi-machine submission, and reviewed findings. Phases 15–18 retain
  explicit schema/security approval gates.
- [ ] Add versioned Site Check checklist administration for
  `georger@liftrucks.co.nz`, including a dedicated least-privilege Dataverse role and
  immutable publish-new-version workflow; see Phase 19 of the Site Checks tracker.
- [ ] Complete persistent Customer creation and Customer-level information management;
  current Customer-level behaviour still includes local prototype boundaries.
- [ ] Decide whether Job Materials need quantity, part number, stock lookup, or inventory
  integration. Keep the technician label as **Parts** unless the user workflow changes.
- [ ] Consider technician/assignment grouping for time entries and submission evidence.
- [ ] Decide whether Further Work and Safety Issues should create reviewed office actions,
  Quotes, or follow-up Jobs. Do not automate these directly from technician input without
  an office approval step.

## Priority 3 — Quality and maintainability

- [ ] Add production-oriented end-to-end coverage for the highest-risk Job, WOF,
  maintenance, Equipment transfer, CSV import, and technician portal workflows.
- [ ] Review the current production bundle-size warning and introduce code splitting only
  where it materially improves load performance.
- [ ] Keep the modular knowledge base current and remove superseded limitations from release
  notes when their replacement is implemented.

## Backlog rules

- Add work here only when it is agreed, actionable, and not merely an architectural
  extension possibility.
- Link complex work to its authoritative architecture document rather than duplicating the
  design here.
- Move the currently active item to `CURRENT_STATE.md`.
- Remove completed items from this file and record user-visible results in `CHANGELOG.md`.
- Do not treat a checkbox as authorisation to provision, deploy, create credentials, send
  communications, or make destructive changes.
