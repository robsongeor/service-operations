# Current State

Branch: `codex/legacy-job-book-job-cards-integration`

## Job Card Admin Review Phases 1–3 (implemented locally)

- The Azure-backed review service now owns explicit Pending, In review, Needs clarification, On
  hold, and Processed in GreenTree states. GreenTree data entry is the sole final workflow stage.
  No invoice required has been retired as an action; any existing outcome remains read-only in
  Completed alongside legacy Reviewed records and is never relabelled as GreenTree processing. Notes,
  optional GreenTree reference, authoritative administrator identity/timestamps, bounded activity,
  immutable technician evidence, and ETag conflicts are enforced server-side.
- The office screen has separately loaded Open jobs, Submitted, Review and Completed tabs, with
  job type as a secondary filter. Open jobs requires a numbered Job and a recorded successful
  technician dispatch, excludes accepted/legacy submitted cards, and never includes unsent staging.
  Needs clarification remains status and notes only, without technician contact or another link.
  Queries are bounded with explicit incremental-loading/scan-limit notices. Review detail exposes
  explicit confirmation actions, workflow context/history, and
  conflict recovery while retaining the immutable evidence and read-only associated Quote drawer.
- The client recognizes `ServiceOperations.JobCardAdmin`, lands it on Job Card reviews, and exposes
  only Job Card reviews, Legacy Job Book, Quotes, Equipment, and Customers. Quotes, Equipment,
  Customers, Sites and Contacts remain read-only outside the approved Intake location exceptions.
  Admin managed-Job corrections now use **Edit entry** within Job Book; Equipment,
  Customer/Site, Contact, description and PO are editable, and address follows Site. Factual
  managed-Job GT/Timecloud ticks are permitted. Coordinator controls, allocated number and original
  submissions remain protected. `/jobs` and Intake **Manage job** remain coordinator-only.
  The shared Job editor uses a narrow correction API with exact ETags and explicit conflict reload.
  JobBookOnly cannot correct managed Jobs. Live column-level authorization remains approval-gated.
- Development can simulate `job-card-admin`. Entra/Dataverse role provisioning and assignment,
  production reviewer allowlist/settings, deployment, and named-user smoke testing remain the
  approval-gated Phases 4–5 and have not been performed.
- `npm run dev:job-card-walkthrough` starts an isolated, sample-only walkthrough on loopback port
  5180, using the real app and review service with in-memory storage and synthetic identities.
  It does not load normal Vite configuration or environment files. The walkthrough exposed and
  fixed confirmation-dialog keyboard focus, in-dialog conflict refresh/draft preservation, and
  long office-state badges overlapping adjacent queue cells. See the implementation plan for the
  repeatable walkthrough steps and the remaining live-security verification boundary.
- Open jobs adds a read-only dependency on Email Dispatch and Job Assignment. Verify these grants
  during approval-gated role preflight; no live roles or settings were changed. Existing identifiers
  and timestamps correlate sends/returns; unrecorded off-system returns cannot be inferred.

## WOF due-list email copy (implemented locally)

- WOF Table Settings now copies every Due Soon and Expired road-registered Equipment row as a rich
  email-ready table with a tab-separated plain-text fallback. The copy is independent of the active
  tab and search and includes Equipment, REGO, Customer, Site, expiry, due status, and the linked Job
  Number when one exists.
- The export reuses the already-loaded WOF register projection and current table sort, performs no
  Dataverse read or mutation, and reports clipboard success or failure inside the settings dialog.

## Unlinked Quote provisional PDFs (implemented locally)

- A saved Quote can now generate its provisional quotation without a numbered linked Job. Numbered
  Jobs retain the existing Invoice No and Our Ref output; otherwise the persisted Quote number is
  used as Invoice No, Our Ref is blank, and the filename falls back to the Quote number.
- This removes the incentive to enter placeholder Job numbers and does not create or change a Job,
  Dataverse schema, Quote persistence contract, cloud configuration, or business data.

## Legacy Job Book restricted access (implemented locally)

- Unified-workflow direction is agreed: one working Job linked to a regional number ledger,
  independent coordinator-worklist membership, and Admin initial-technician selection/send with
  later reassignment/scheduling reserved for coordinators. The first number-safety slice is local:
  existing Job numbers are read-only in the canonical editor/table, generic/completion saves omit
  them, ordinary bulk allocation rejects numbered/stale records and uses bounded preflight plus
  exact ETags, and ordinary deletion retains numbered Jobs. Tests cover concurrent allocation and
  deletion. Transactional registration/allocation now has local C# plugin source and an offline
  SDK-backed test harness, plus a disabled typed client adapter and unprovisioned deployment
  contract. The server number/ledger invariant plugin is also local and unregistered. Neither
  screen is connected in the ordinary runtime. An isolated `--unified` walkthrough now connects
  registration/allocation to both screens, preserves retained requests across refresh, distinguishes
  Staging/Operational/All jobs, reconciles explicit links without converting old Intake, and models
  same-Job management and registered-entry Void. Membership/Void endpoints and Job Void fields are
  fixture-only; production implementations and general Admin server-field authorization remain unfinished. Site Check
  specialist number-clear/allocation/deletion paths must be adapted before the guard can be installed.
  Current creation/import and first-allocation spreadsheet paste remain transitional. No live
  schema, seed, role, data, email or deployment changes were made. See the
  [implementation sequence](docs/features/JOB_BOOK_INTAKE_DESIGN.md#unified-workflow-decision-3-october-2026).
  Validation: all 730 tests pass, including 17 number-policy tests and shared drawer rendering;
  build, changed-file lint and diff checks pass. Full lint retains the same three unrelated
  EquipmentDrawer/MaintenanceBookingScreen errors; build retains the known large-chunk warning.
  The subsequent registration slice adds 9 client tests (739 full-suite tests now pass) plus 32
  separate compiled C# tests. Build and focused lint pass; the same three full-lint errors remain.
  No live transaction, privilege or schema validation has been performed and no signed assembly,
  API/step registration or deployment was produced. The ordinary sample walkthrough retains its old
  contract. The opt-in unified walkthrough uses a separate port with an Admin/coordinator role switch;
  no user sample rows were reset or migrated. See the detailed sample-only scope and QA steps in
  the Job Book design. Live schema, seeds, permissions and rollout remain approval-gated.
  Unified-walkthrough validation: 756 app tests and all 32 compiled plugin tests pass; focused lint,
  production build and diff checks pass. Full lint still reports the same three unrelated existing
  EquipmentDrawer/MaintenanceBooking errors; the known large-chunk build warning remains.
  Browser QA also confirms regional identity, new saved master records, marker-blocked Void,
  coordinator configuration, and same-request recovery after a simulated post-commit 503/refresh.

- Job Book now shares the Jobs order-number-book copy and technician-email controls. It uses
  a compact horizontal action row with Edit entry and icon-only copy/email/Void controls rather
  than stacked text buttons. Existing permission/confirmation rules are unchanged. Copy supports
  non-Void numbered Intake and managed rows. Admin email is restricted to the already-assigned
  technician of a numbered managed Job, with editable subject/comments and current-version/detail
  preflight; allocation stays coordinator-only. No Intake promotion, Job-state/marker mutation,
  live sending or permission changes were added. Local sending remains blocked. See
  [Jobs architecture](docs/architecture/jobs.md#job-book-quick-actions-3-october-2026-local-implementation)
  for shared owners and the approval-gated server/Dataverse authorization requirements.
  Validation: 712 full-suite tests pass; build, changed-file lint and diff checks pass. Full lint
  retains only the three pre-existing EquipmentDrawer/MaintenanceBookingScreen errors. The build
  retains the known large-chunk warning. Sample-only browser checks verified copy success,
  assigned-recipient preview, Intake blocking and local send blocking; no real email was sent.

- Mark as void now requires a reason and is limited to unpromoted Intake with neither GT Entry
  nor Timecloud Entry ticked. It retains the number and evidence in a visible read-only VOID row.
  Exact-record preflight and conditional saves prevent competing edits/ticks from being overwritten;
  explicit conflict reload retains the reason. Ordinary edits no longer reset stage, and marker
  saves are single-column updates. Shared confirmation and domain rules cover all four regional
  tables. No live data, permissions or settings were changed; see the Intake design for boundaries.
  Local checks: 115 focused Job Book tests and full suite pass; build/focused lint pass. Full lint
  retains the same three unrelated errors below. Isolated browser checks verified each marker
  blocks voiding, Cancel, required reason, concurrent tick/reload, and a retained read-only Void row.

- The orange Equipment not configured shortcut now opens the existing Intake edit drawer, keeping
  the full entry and Job number together with one Save changes/Cancel boundary. The old machine
  popup and inline row editor were removed; managed-Job access remains unchanged. The sample-only
  browser check verified equipment selection followed by Cancel/reopen preserves the saved entry.
  Saved locations in that edit drawer now reuse New entry's read-only Customer/Site tile with
  an explicit Edit action. Saved entry relationships stay authoritative; entry corrections do not
  implicitly move Equipment. The tile also applies to unknown/unconfigured machines and snapshot-only
  locations; entries missing Customer or Site retain their relationship controls.
  Saved machine details now also populate the shared Equipment tile when the entry has no master
  Equipment link or its linked machine is absent from the directory. This is display-only: it does
  not infer a lookup, change saved relationships, or create Equipment. Change/dismissal still works.

- Intake's Prepare promotion action is now **Manage job**, guarded by the shared `canManageJobs`
  capability for FullAccess service coordinators only. Restricted Admin/Job Book users retain
  Edit entry but cannot open the preparation dialog. Managed Job creation remains disabled;
  no live role/permission changes were made. See the Job Book Intake design for the access mapping.

- New Job/Intake creation now shares an Equipment Customer/Site tile and explicit location editor.
  The linked Customer/Site is automatic; moving preserves the Equipment selection, updates only its
  Site using ETag conflict protection, and leaves historical Jobs and maintenance unchanged. Pending
  edits block Job creation. Unknown/local Equipment retains the previous flow. Both restricted roles
  have `canMoveEquipment` without general Equipment editing. The live Site-only Dataverse security
  boundary/privileges remain approval-gated; no provisioning or production moves were performed.
  See Equipment architecture for save semantics, cache behavior, and release requirements.
  New Job Book Intake hides Customer/Site/Contact until Equipment is selected or explicitly marked
  unknown. Equipment Change now opens/focuses search without clearing the current selection or its
  Customer/Site/Contact. Outside click/Escape restores the tile; only an explicit selection changes
  the draft. The fix is in the shared picker used by both drawers. Existing-entry editing still
  exposes its recorded relationships.
  Both location editors reuse the inline Customer/first-Site create form. The narrow
  `canCreateEquipmentDestination` capability permits this for restricted roles without enabling
  existing Customer/Site editing. Creation persists independently of the explicit Equipment move;
  duplicate checks and partial Site-failure recovery reuse confirmed records. Live Create privileges
  remain separately approval-gated. See Equipment architecture for the sequential-save boundaries.
  The tile action is now Edit. The Site selector also offers Add new site for the selected Customer,
  reusing the Jobs inline Site form with verified addresses. Site creation selects the destination
  without moving Equipment; cancel preserves the previous selection. Site-only creation shares the
  destination permission, duplicate checks, pending-save guards, and existing Site API.
  New jobs without Equipment (including Intake's Equipment not known yet) now require a Customer,
  Site and non-empty Site address, displayed using the same shared fields and validation rule.
  The address comes from the selected Site; Contact stays optional. Create services enforce the
  rule before writes/number allocation, while old entries remain editable. A sample-only browser
  check confirmed blocked incomplete submission and address autofill without saving test data.
  Shared relationship controls now reveal Site/address only after Customer selection or creation,
  and Contact after Site selection. Clearing Customer hides dependent fields again; existing
  required-location checks and inline Customer/first-Site creation remain unchanged.
  Successful inline Customer/Site creation for local/unknown Equipment now returns to the shared
  read-only tile with Edit, including unsaved new Intake entries. Its button is Create customer;
  snapshot-only persistence is unchanged and the confirmation state resets between entries.
  Local verification: 643 tests pass, build and focused lint/diff checks pass; full lint retains the
  three unrelated EquipmentDrawer/MaintenanceBooking errors. Sample browser walkthroughs cover both
  creation drawers, linked/unlinked machines, a successful move, and stale-version rejection/recovery.

- Job create/edit and Legacy Job Book Intake now use one canonical `JobCustomerField` and shared
  Customer-search hook. Intake no longer expands the entire Equipment index into Customer options:
  it seeds only the selected Customer, renders at most eight filtered matches, and starts bounded
  remote searches after two characters with a 250ms debounce, cancellation, and retry. Both drawers
  reuse the existing Customer picker styling and inline panel; Intake permissions and snapshot-only
  creation remain unchanged. See the reusable-component inventory and Job Book Intake design.

- Mechanic selection now reuses the existing Jobs `SearchableMechanicSelect` too: eight eligible
  Staff matches, shared styling/keyboard/outside-click handling, and no per-keystroke reads.
  Intake retains its custom/outwork text option and saved names without broadening managed-Job
  assignment or changing persistence/permissions.

- A central Entra application-role access profile now supports full application,
  Job Book-only, and denied modes. Enforcement remains disabled by default so deploying the code
  cannot lock out existing users before roles are assigned.
- `ServiceOperations.JobBookOnly` lands on `/job-book`, renders only that navigation item, blocks
  direct access to every other management route, and removes the Legacy table's managed-Job link.
  `ServiceOperations.FullAccess` takes precedence when both claims exist.
- Development builds can simulate `full`, `job-book-only`, or `denied` access with a persistent
  warning. Production ignores the simulation setting.
- No Entra application role, user/group assignment, Dataverse role, privilege, configuration,
  deployment, or business-data change has been made. The dedicated least-privilege Job Book role
  and target-user security smoke remain separately approved work.
- The Legacy page now uses one compact top header. Row/Equipment/loading status and the Legacy View
  badge sit beside the page title, and the duplicated inner Operations/Job Book header has been
  removed to return that vertical space to the intake and register workflows.

## Customer Site Equipment export (implemented locally)

- Every Customer Dashboard Site card has a direct Export CSV action for all Equipment currently
  assigned to that Site, including inactive records. Empty Sites keep the action disabled.
- The Excel-compatible UTF-8 CSV is Fleet-sorted and contains Fleet Number, Serial Number, Make,
  Model, Operational Status, Customer, Site, Address, Last Known Hours, and Reading Recorded Date.
  Relationship fields come from Equipment → Site → Customer and missing meter values remain blank.
- Export uses the dashboard's already-loaded bounded Equipment projection and performs no extra
  Dataverse read or business-data mutation.

## Spreadsheet Job import (implemented locally)

- `/job-import` accepts the seven supplied Excel clipboard columns, converts New Zealand Date Only
  values, and stages every source row for review without accepting a spreadsheet file upload.
- Review matches primary/alternate Fleet Numbers and Staff against existing app records, derives
  Customer only through Equipment → Site → Customer, and ignores spreadsheet Model and Customer
  because Equipment is authoritative. Equipment without a Site or Customer remains blocked. Review
  allows row corrections plus an issues-only filter covering errors and warnings. Existing Job
  Numbers are blocked during review and rechecked directly before creation. Multi-Fleet and
  missing-Equipment rows remain blocked because one managed Job owns at most one Equipment lookup.
- Selected ready rows create historical Complete Breakdown or Workshop Jobs through one Dataverse
  changeset after a batched duplicate preflight. The operation is atomic and does not synthesize
  hour-meter evidence or run current Equipment maintenance completion effects.
- No Dataverse schema, role, cloud configuration, deployment, credential, or live business-data
  change has been made. Signed-in review and import smoke testing remains outstanding.

## Data loading and multi-user synchronization foundation (implemented locally)

- The current React hooks, Dataverse services, Jobs/Equipment IndexedDB caches, focused drawer
  workflows, and SignalR invalidation paths have been traced across Jobs, Equipment, Customer
  Dashboard, Scheduler, Job Map, WOF, and related consumers.
- [`docs/architecture/data-loading-and-synchronization.md`](docs/architecture/data-loading-and-synchronization.md)
  records the current data flow, concrete stale/race/loading problems, and the approved target shape:
  one account-scoped Operational Data Client, bounded query keys, progressive drawers, scoped screen
  queries, guarded mutations, app-shell realtime, reconnect recovery, and cross-tab invalidation.
- Jobs and Equipment now reuse one generation-aware scoped cache primitive. Invalidated requests and
  older non-authoritative reads cannot overwrite a newer mutation/refresh or repopulate IndexedDB;
  accepted commits notify every mounted hook subscriber in the same account/environment scope.
- Concurrent silent Dataverse token requests now share one MSAL request per account and refresh
  intent. Forced and ordinary acquisition remain separate.
- Customers, Sites, Site Contacts, Job Assignments, Job Schedule Options, Job Office Updates,
  Equipment Service Plans, Mechanics, Quotes, and Quote Job lookups now follow Dataverse continuation
  links through one reusable pager.
- Staff now renders from its own shared directory key without downloading the complete Jobs
  collection. Open counts use a minimal allocation projection, detailed Jobs are scoped to the
  selected person and tab, qualifications fail independently, and qualification types are deferred
  until an existing assignable person is edited. Job events and mutations invalidate only Staff
  workload keys; Staff writes patch the directory immediately.
- One environment/tenant/account-scoped Operational Data Client now lives above authenticated routes.
  Its `useSyncExternalStore` registry deduplicates typed queries, exposes independent loading/error
  states, cancels superseded requests, rejects obsolete results, invalidates bounded keys, and evicts
  unobserved focused data after a configured cache window.
- One account-scoped Operational Realtime Provider now sits beside that client above authenticated
  routes. It owns the only SignalR connection in an app shell, validates bounded Job, Equipment, and
  Staff events, immediately invalidates a matching focused record, and coalesces dependent query
  invalidation after bursts. Reconnect and visibility return trigger bounded recovery of observed
  Job/Equipment queries and active Staff consumers without polling. Successful local Job and
  Equipment cache invalidations are also broadcast to other tabs in the same hashed account/
  environment scope; receiving tabs coalesce bounded authoritative refreshes without echoing the
  message or sharing record IDs, business data, or credentials.
- The main Jobs and Equipment arrays now have one app-shell owner under versioned operational-list
  query keys. `useJobs()` and `useEquipmentManager()` retain their existing Dataverse,
  generation-aware memory, IndexedDB stale-while-revalidate, and mutation workflows, but
  accepted values and local mutation patches reconcile every mounted route through the shared
  client. Navigating between Jobs, Equipment, Customer Dashboard, Scheduler, and other consumers can
  reuse the last accepted list immediately instead of beginning with an empty route-local array.
- Equipment Job history is the first migrated focused query. Equipment Manager and Customer
  Dashboard share the same query contract, start loading as soon as the drawer opens, retain a fresh
  result for 30 seconds, and release it 60 seconds after the last drawer closes. Job mutations and
  atomic Service completion invalidate open Equipment histories and refresh them without a whole-page
  reload.
- The canonical Equipment drawer now treats its selected editable Equipment row as immediate core
  data. Equipment Manager, Customer Dashboard, and WOF load only that Equipment's Service Plans when
  Maintenance is selected, with an independent loading/retry boundary and one-minute unobserved
  retention. The already-focused Job history supplies both usage evidence and the History tab, so
  opening Equipment no longer requires route-owned Job or plan child collections.
- Equipment Manager no longer blocks its register on complete Customer, Site, and Equipment Service
  Plan directories. It derives filters from the expanded Equipment projection, shares a 30-second
  query for visible-page maintenance summaries, and deliberately expands that plan query only for
  Data Status sorting. Its create/edit drawer uses abortable eight-result Customer search and
  selected-Customer Site reads. Equipment Map retains all Sites but skips plans; authorised CSV
  import loads its complete Site/plan references only when a file is selected. Supporting-plan
  failures are shown as Unavailable rather than false Not Configured results.
- Canonical Job edit drawers now open immediately from the selected summary instead of awaiting
  Equipment, Customer, Site, Contact, Quote, assignment, service-plan, submission, and photo reads.
  An exact Job-core refresh runs independently before editing/saving unlocks; relationship/service
  data and Quote/assignment data have separate readiness and retry boundaries; Job Card time, parts,
  submissions, and photos load only when the Job Card tab is selected. Jobs, Scheduler, Customer
  Dashboard, and WOF entry points use the same progressive contract.
- Canonical Job creation now follows the same progressive contract. Jobs, Equipment Manager,
  Customer Dashboard, and Chargeable Invoice Review render the drawer and supplied exact defaults
  immediately instead of waiting on a broad reference-data preparation gate. Staff choices reuse the
  shared account-scoped directory query; exact Equipment/maintenance data, selected-Customer Sites,
  and selected-Site Contacts load independently with cancellation and scoped retry messages. A
  secondary lookup failure no longer blanks the whole create workflow or silently presents an empty
  dependent selector as authoritative.
- Exact Job core and Job Card metadata now have stable shared query keys across those entry points.
  Concurrent drawers deduplicate requests, matching mutations and Job realtime events invalidate the
  active focused keys, and unobserved results are evicted after bounded cache windows. Job Card
  detail queries return photo metadata only; an individual full Dataverse File body is downloaded
  when that photo is opened and is never written to IndexedDB.
- Customer Dashboard no longer starts the global Jobs or Equipment collections. Selecting a
  Customer progressively loads only its Sites, bounded Site-filtered Equipment and Jobs, and bounded
  Equipment-filtered Service Plans through shared query keys. Schedule Options and Office Updates
  are now additionally filtered to that Customer projection's Job IDs instead of reading either
  complete child table. Mounted mutations and matching
  realtime events invalidate that selected-Customer projection instead of broadly reloading Jobs or
  Equipment. Before Job completion, the focused Equipment's exact record, full linked Job history,
  and plans are loaded so moved Equipment retains correct chronological meter and maintenance rules.
- Scheduler no longer starts the global Jobs collection or reads every Schedule Option. Its visible
  Monday-to-Sunday range loads only matching Schedule Options and the unique referenced Jobs through
  shared bounded query keys; Office Updates are filtered to those same Job IDs. The previous and
  next weeks prefetch into a five-minute memory
  cache. Schedule writes and Job mutations/realtime recovery refresh the active projection without
  clearing reference data already loaded by an open canonical Job drawer. A dedicated cross-client
  Schedule Option event remains future work.
- Job Map no longer starts the global Jobs or Sites collections. It loads only the selected
  Allocated, Unallocated, and Waiting for parts statuses through a minimal Job/Site-location
  projection, reuses a complete cached status result while an exact subset revalidates, and follows
  Dataverse continuation links. Job mutations and realtime recovery refresh the active status key;
  application Site and Equipment mutations invalidate affected map projections. The app-shell
  Equipment event path now refreshes Job Map across users; a dedicated Site event remains future
  work.
- Job create/edit relationship loading no longer reads the complete Equipment, Customer, Site,
  Site Contact, and Equipment Service Plan tables. Equipment and Customer searches are debounced
  and capped at eight Dataverse results; Customer Sites, Site Contacts, exact Equipment, and plans
  load only for the selected parent with cancellation. Results merge into the open editor, and
  related-record creates reconcile the returned/scoped rows instead of refreshing a whole table.
  Equipment-originated Job creation is seeded from the selected Equipment and does not start the
  global Jobs or Equipment registers.
- Scoped `useJobs()` instances no longer silently fall back to the complete Schedule Option or
  Office Update tables. Screens that need those children supply their own bounded projections;
  smaller focused consumers receive empty supporting collections until they explicitly load them.
- WOF no longer starts global Jobs or its editor-only Customer, Site, Site Contact, Staff,
  Provider, Qualification, and Equipment Service Plan collections. The register reuses shared
  Equipment and account-scoped WOF Inspection/Schedule Option keys with a 20-second stale window and
  two-minute unobserved retention. Inspection history is abortable and continuation-safe; Schedule
  Options are keyed only to referenced Jobs. Job/Equipment events and reconnect/visibility recovery
  invalidate the relevant observed keys. Inspection-editor directories load when that editor opens;
  WOF Job creation loads Staff and only the selected Site/Equipment relationships. Equipment
  maintenance save performs a focused service-plan read before synchronisation.
- Opening an existing linked WOF Job now hydrates one exact Job plus Office Updates filtered to that
  Job and reuses only its supplied bounded Schedule Options. Chargeable Invoice Job creation also
  uses an empty scoped Jobs shell. The final call-site audit confirms that only the primary Jobs
  register invokes global `useJobs()` loading; explicit Equipment Map/CSV reference reads remain
  documented workflow requirements.
- Successful Job completion no longer reloads the global Jobs, Equipment, and Service Plan
  collections. It authoritatively reconciles the exact completed Job, exact Equipment, that
  Equipment's complete linked Job history, and its focused Service Plans, then patches mounted
  global or scoped rows and recalculates due dates. Completion recovery uses the same bounded scope.
- Job-drawer Quotes and technician Assignments now load through separate shared focused Job keys.
  Each Dataverse request is filtered to the opened Job and capped at 50 rows; Quotes start only on
  the Quotes tab, Assignments only on the Job Card tab, and Assignment actions refresh only that
  focused key. Customer Dashboard's Quotes tab now independently loads the selected Customer's
  bounded Quote projection instead of relying on the Job editor's former full collection.
- The standalone Quotes register now uses one continuation-safe account-scoped query and renders
  without waiting for editor-only support. Cross-screen editing fetches one exact Quote and its
  bounded lines. Pricing and Staff now start as independent shared queries only when an editor is
  requested: the Pricing screen and Quote editors reuse one catalogue key, while Quotes reuse the
  account-scoped Staff directory already used by Jobs. Staff failure no longer blocks Quote editing;
  it disables only PO email routing and provides a scoped retry. Job, Customer, and active Equipment
  selectors use debounced `$top=8`
  Dataverse searches plus exact-ID hydration for saved selections and Job-originated creates.
  Superseded searches abort. Quote mutations patch shared register/focused keys
  immediately and publish content-free same-scope tab invalidation. Job/Equipment changes and
  reconnect/visibility recovery refresh observed dependent Quote projections; a dedicated Quote
  server event remains future work.
- The Operational Data Client now exposes privacy-safe in-memory metrics for request count,
  cache hits, concurrent-request deduplication, success/failure/abort, duration, and estimated
  payload bytes by normalized query family. Development builds expose those metrics through a
  Sidebar Data diagnostics panel together with route-to-useful-content timings for Jobs, Customer
  Dashboard, Equipment, Scheduling, and WOF. The panel supports a resettable cold/warm baseline and
  copyable privacy-safe JSON; it stores no record IDs, account scope, business content, response
  bodies, or tokens. Exported telemetry and event-to-visible latency remain future work.
- The first signed-in diagnostic baseline measured Customer Dashboard at about 465 ms, Scheduling
  at 287 ms, and Equipment at 2,435 ms. Customer Schedule Option and Office Update query keys are
  now stable across unchanged renders, removing repeated cache/deduplication churn. Full Equipment
  register reads now use the shared `equipment:operational-list` request as well as its existing
  memory/IndexedDB cache, so Equipment Manager and Equipment Map deduplicate the load and the next
  report can attribute the remaining cold-start delay directly.
- Job drawer Scheduling content now opens immediately, exposing the existing visit or add-schedule
  form without a second disclosure click.
- Quote editing remains feature-owned but is available as a lazy app-shell overlay from Jobs,
  Customer Dashboard, Scheduler, WOF, and Chargeable Invoice Review. Those screens retain their
  current state underneath the editor; an originating Job drawer closes first. Quote rows retain their compact visible column header,
  oversized register or selected Job values truncate with an ellipsis while retaining the full hover title, and the Quote title consumes
  the remaining desktop editor row beside Author.
- Pricing catalogue rows now support explicit confirmed deletion through the existing Dataverse
  service. Referential-integrity or permission failures remain blocking and visible; no schema or
  security-role changes were made.
- Focused data-loading tests, the complete regression suite, targeted lint, build, and diff
  validation pass. Full-repository lint remains blocked only by the existing unrelated React rules
  in `src/Sidebar.tsx` and `src/alpha/equipment-photos/EquipmentPhotoUploadScreen.tsx`.
  No Dataverse schema, role, plugin, Azure configuration, credential, deployment, or communication
  change has been made. Capturing the signed-in cold/warm baseline, server watermark/delta recovery, exported
  instrumentation, and replacement of the deliberate primary-register full-list adapters remain
  phased backlog work.
## Full-width Job Card review detail (approved for commit/push, 2 October 2026)

- Replaced the narrow stacked detail with a full-workspace desktop layout: compact horizontal
  actions, a three-column saved Equipment / saved Customer-Site / current Contact summary, then
  Story alongside private Photos and compact time/travel/parts tables. The hour meter and both
  reported attention sections stay visible and prominent; nothing is truncated or collapsed.
- The existing quote and photo-save drawers, delegated reads, immutable snapshot, PDF export and
  local read-only safeguards are retained. No API, schema, cloud, email or operational writes.
- Local browser checks use the real sidebar with synthetic evidence. The normal fixture fits a
  1920 × 920 desktop workspace; a smaller desktop retains all sections with natural page scrolling
  when needed. Long-story / 20-photo / 12-part and empty states have no horizontal overflow or
  nested vertical clipping. Same-screen quote expansion and filename prompt/focus restoration pass.
- Full `npm test`, lint, build and diff checks pass, including regression coverage for full long
  stories, all photos/parts, semantic evidence tables, missing data and disabled local write controls.
- The full application on `http://localhost:5173/` receives the draft through HMR. The isolated
  sample remains at `http://127.0.0.1:5181/output/job-card-review-preview.html`. The owner approved
  the design and requested commit/push to the feature branch. Production deployment remains separate
  and is not authorized by that request; do not update `v1-deployment`.

## Return to Legacy Job Book work

- The newer Legacy Job Book work is intact and uncommitted in the original checkout,
  `C:/Users/George Robson/Documents/Github/service-operations`, on
  `codex/data-loading-architecture-review`, not this separate Job Card worktree.
- The existing task **Review app docs and roadmap** (`01a09d47-14e3-7d83-83d3-39af0566e43c`)
  contains the latest creation/editing drawer and Full Access / Job Book-only boundary work.
  Regional books and their gated migration/cutover are documented in that checkout.
- Preserve its unrelated uncommitted changes. Do not merge, reset, commit that checkout wholesale,
  enable regional allocation, or provision roles as part of the Job Card commit/push.
- Port 5173 currently serves this worktree via `output/start-local-app.mjs`. Returning its preview
  to the original checkout requires stopping this specific server before starting the original app
  on the same port with its existing local settings. No environment files should be copied.

## Local development setup (2 October 2026)

- The full application preview runs at `http://localhost:5173/` with the normal `vite.config.ts`.
  The ignored machine-local launcher `node output/start-local-app.mjs` reads the existing primary
  checkout's development settings in memory; no credentials are copied or committed. Restart this
  launcher after changing those settings. No interactive sign-in is initiated automatically.
- The isolated synthetic preview uses `127.0.0.1:5181`, not the full application's sign-in port.
  The earlier `undefined` Microsoft authority/client/scope error came from opening the full app
  through that synthetic server in a worktree without its own local environment settings.
- The owner approved read-only access to live Job Cards from localhost. The launcher now installs
  `scripts/dev/jobCardReadOnlyProxy.mjs` ahead of the ordinary API handler and runs with network
  access. The prior sandbox network restriction caused the local identity check to fail with 503;
  the local settings also lacked Azure storage/reviewer configuration.
- Only authenticated `GET /api/jobcardreviews` reads (queue, history, detail and photos) go to the
  fixed existing live Azure API. All other review methods are rejected locally with 405. Tokens
  remain request-scoped; no Azure keys, cookies or arbitrary headers are forwarded or stored.
  The development-only UI notice identifies live data, disables Mark reviewed/email retries and
  leaves view/download controls available. Other application areas retain normal permissions.
- Existing local settings remain unchanged. No production credentials, authentication bypasses,
  production deployment, review mutation or email were introduced. Restart with
  `node output/start-local-app.mjs`; the server needs outbound HTTPS access.
- Full tests, lint, build and diff checks pass. Actual localhost checks confirmed unsigned 401,
  locally blocked write 405, live API rejection of a deliberately invalid token (401, not a network
  error), no-store responses and the enabled read-only client flag. The owner's signed-in browser
  needs a refresh for the final authorized queue display check; no private tokens were extracted.

## Pending Job Card review table (deployed, 2 October 2026)

- Replaced the pending card list with a desktop Jobs-style table using shared table panel, toolbar,
  filter pills and sort controls extracted into `src/alpha/shared/table/` and reused by Jobs.
  Existing Job-type tabs/badges and searchable selectors are reused; operational Jobs logic is unchanged.
- Review filters cover Job type, search, Customer, Technician and technician-reported attention.
  Sortable saved details include Job, submission, Customer, Technician and photo count. Job/Review
  columns stay visible during horizontal scrolling; returning from detail restores queue filters.
- The authorized queue adds saved snapshot fields only, with no per-row Dataverse lookup. The
  existing 100-record bound now explicitly warns when more pending rows exist. Search/filter/sort
  apply to the loaded subset. Empty/loading/failure/no-match states remain distinct.
- The ignored read-only synthetic preview is available while Vite runs at
  `http://127.0.0.1:5181/output/job-card-queue-preview.html`, including a Jobs reference and state
  selector. It blocks real network requests and writes. Mobile-specific review work is deferred.
- Full `npm test`, lint, build and diff checks pass. Added queue filter/sort/query-state tests,
  shared-control Jobs/review rendering checks, safe return-link coverage and bounded private API
  assertions. Local browser checks cover combined selectors, type/search/sort, retained filters,
  sticky actions and loading/empty/error/limited states, plus the shared Jobs reference controls.
- The owner approved commit, push and production deployment after reviewing the localhost draft.
  Release `024685e` was pushed to the feature and `v1-deployment` branches. Azure deployment
  [run 36984892511](https://github.com/robsongeor/service-operations/actions/runs/36984892511)
  completed successfully. The live page returns 200, its entry bundle contains `024685e`, and an
  anonymous `/api/jobcardreviews` request returns 401. No email, operational mutation or Azure
  configuration change was made.
- The live review-queue tab is open but currently requires Microsoft sign-in. The owner has been
  asked to sign in for the remaining read-only queue verification. Do not create submissions or
  mark evidence reviewed just to populate this smoke test; synthetic populated states passed locally.

## Job Card review presentation and downloads (deployed and verified, 2 October 2026)

- The review now leads with Job number/description, saved Equipment and Customer/Site details,
  address, and separately labelled current Job contact. The story section emphasises the submitted
  hour meter and groups Job story, further work and safety issues; time/parts and private photos follow.
- **Download all photos** opens an editable filename prompt and builds one original-photo ZIP named
  `JobNumber - Job description - dd-mm-yyyy.zip`, using the submission date in Pacific/Auckland.
  Supporting browsers offer native Save As; others use the configured browser Downloads location.
  Failed/incomplete photo reads do not produce a partial archive. Account/review changes abort downloads.
- **Associated quotes** opens a read-only same-screen drawer using the existing bounded Job quote
  and quote-line readers. It does not open the editor, navigate away, or mutate Job/Quote state.
- Full tests, lint, build and diff checks passed. New synthetic coverage checks layout, zero/missing
  meter readings, contact/photo/quote read contracts, ZIP bytes/names/bounds, cancellation and failures.
  Local browser checks covered desktop/390px layout, quote expansion/empty/error/retry, focus restoration,
  and the photo filename prompt. Native writes were simulated locally; live save verification follows.
- The owner approved deployment. Production code `6e18efb` deployed successfully through GitHub
  Actions run `36982115515`; both the live bundle and signed-in application displayed this version.
  The site returned 200 and an anonymous private-review request returned 401.
- Signed-in verification of the existing reviewed test card for Job 142314 confirmed the redesigned
  detail, saved address/equipment/customer and current contact. Associated quotes opened within the
  screen and correctly reported no linked Quotes for this Job; populated lines were covered locally.
- The native save completed as `142314 - Hydraulic slow - 02-10-2026.zip`. The downloaded archive
  contains the exact unchanged 8,568-byte original company-logo test photo with a numbered JPEG name.
  No email, Job/Quote edits, review-state mutation, schema, settings or credential changes were made.
  The verified live review is left open; no deployment work remains for this change.
- An ignored synthetic preview is available while the local Vite process runs at
  `http://127.0.0.1:5181/output/job-card-review-preview.html`. It replaces authentication and all
  backend reads with fixtures and rejects mutations; it is not a deployed application or real evidence.

## Old Job Card office controls — cleanup (deployed, 2 October 2026)

- Ordinary Jobs now open Azure request/submission history from the Job Card tab. The same approved
  reviewer boundary protects the new bounded per-Job history read; no new schema or settings are needed.
- Removed the legacy manual status selector, legacy submission-count/progress display, old Submitted
  table badge, and status-based email lockout for ordinary Jobs. The table uses a neutral Job cards action.
- Replacement confirmation uses the Azure server's current state. Successful ordinary Job dispatch no
  longer writes legacy Job/assignment Card Status; Email Dispatch remains the delivery audit source.
- Old submitted/closed evidence, photos and PDFs remain in a labelled read-only historical section.
  Site Check status controls, submission service and dispatch status updates retain their existing path.
- Azure link history distinguishes link creation from email delivery, exposes saved review links,
  refreshes after sends, and does not disguise errors as an empty history. Assignment removal stays
  unavailable when history is unknown, truncated, or contains references to that assignment.
- Full tests, lint, build and diff checks passed; synthetic component-render tests verify both workflow
  branches. The owner approved publication and signed-in, read-only verification.
- Azure review details now offer a browser-local paginated saved-submission PDF. The export uses
  the saved snapshot and all structured evidence; photos are listed and stay separately authenticated.
  A synthetic six-page export was rendered and visually checked, with end markers and totals verified.
- Ordinary Job drawer reads defer old Dataverse time, parts, submissions and photo files until the
  historical section is opened. Strict archival loads follow verified Dataverse paging, expose failures
  and retry, and keep assignment removal unavailable until both histories are complete. Site Check
  loading retains its existing path. Account/Job changes do not expose the preceding archive or PDF.
- Production code `5d309a2` deployed successfully in GitHub Actions run `36978875188`. The signed-in
  application displayed this version. Job 142314 showed Azure Reviewed history, no old office-status
  controls, and its archive loaded on demand with no historical submissions recorded for that Job.
- The saved Azure review PDF downloaded successfully to the browser's Downloads location. Its rendered
  page and extracted content verified the snapshot, synthetic story, time/travel, parts and photo manifest.
  Anonymous history and review requests returned 401. No test emails, Job edits, review mutations,
  schema changes or settings changes were performed during this verification.
- Site Check Job 145496 retained its old progress and office-status controls. Ordinary Job 142314
  remained Complete with its original description; the verification did not alter operational records.

## Azure Job Card cutover (deployed and verified, 2 October 2026)

- Integrated onto production baseline `9c5be8e`, preserving current pilot, validation, parts
  quantities, PDF, resend and localhost email behaviour. New evidence is in `/job-card-reviews`.
- The owner approved storage/email creation, backend configuration, and replacing unused links.
  Notifications and reviewer access target `georger@liftrucks.co.nz`.
- Resource deployment `CustomDeployment-20261002192950` completed successfully in ServiceOperations.
  Backend settings deployment `CustomDeployment-20261002194447` completed with existing settings
  preserved. Credentials were resolved inside Azure, with no secret outputs.
- Production code `c8d325a` deployed successfully in GitHub Actions run `36975098954`.
- Live smoke test on owner-approved older Job 142314 passed: the test-only dispatch arrived at
  George's inbox, the technician form saved explicitly synthetic story/time/parts and one harmless
  company-logo photo, the authenticated office queue displayed the evidence, and the Azure-managed
  review notification arrived in George's inbox with the correct authenticated review link.
- The office photo loaded successfully. Invalid links returned 404; anonymous review/photo requests
  returned 401; anonymous Blob listing returned 409; the used technician link rejected reuse.
- The synthetic review was marked Reviewed and retained for audit. Operational Job 142314 remained
  Complete with its original description; no operational completion or evidence import was performed.
- Site Check assignment links, their photo service and confidential credentials remain unchanged.
- Full local tests, lint, build, focused security tests and the local Azurite adapter contract passed.
- The existing two-recipient online Job Card pilot remains. New evidence is reviewed in the separate
  Job Card reviews screen; unused legacy links must be regenerated. No retention deletion or
  automatic Dataverse import is enabled.

## Local Job Card email guard (deployed)

- Job Card previews remain available on localhost, but the shared composer and Job Card workspace
  disable primary and additional-technician sends on localhost, subdomains of localhost, IPv4
  loopback, and IPv6 loopback hosts.
- The Jobs workflow independently rejects a local send before secure-link generation or Email
  Dispatch creation. Production and non-loopback deployed hosts retain the existing delivery flow.
- No Dataverse schema, role, API, route, credential, or cloud configuration change is required.

## Deterministic Static Web App client deployment (deployed)

- The Azure workflow now builds the client explicitly with Node 20, `npm ci`, and `npm run build`,
  then uploads `dist` with Azure's automatic application build disabled. The managed API build stays
  unchanged.
- This recovers from successful run `32116835069`, which published the repository development
  `index.html` and raw `/src/main.tsx` instead of the Vite production artifact. Production-safe
  inspection confirmed the invalid entrypoint before this correction; no business data or real
  communication was used.

## Technician Job Card resend cycles (deployed)

- Resending a Job Card after the same technician's latest card is Submitted or Closed now creates
  a fresh pending submission cycle instead of returning a conflict. The earlier submission and its
  time, parts, photos, meter, and story remain immutable, read-only manager-visible evidence under
  Previous submissions.
- Resending an unused pending card still replaces only that pending token. Job Card progress follows
  the newest cycle for each technician, so a fresh resend returns to awaiting-technician state.
- No Dataverse schema, role, credential, routing, or cloud configuration change is required.

## Technician Job Card entry validation (deployed)

- The public Job Card permits a non-negative whole hour-meter value below the Equipment's previous
  reading only after the technician sees the two readings and explicitly confirms the lower value.
  The API requires the same confirmation flag and continues to reject malformed meter values.
- Every submission now requires at least one Time & Travel row with a valid date, positive total
  hours, and non-negative whole kilometres. The form starts with one row and prevents removing the
  final required entry; the API independently enforces the same minimum.
- No Dataverse schema, role, routing, credential, or cloud configuration change is required.

## Job Map (deployed feature; scoped loading implemented locally)

- `/job-map` displays Allocated, Unallocated, and Waiting for parts Jobs at each Job's recorded Site.
- Independent status, Customer, Site, and text filters reuse shared status-scoped queries and the
  existing Site coordinate/geocoding cache. Unmapped Jobs remain explicitly counted.
- Selecting a Job opens the canonical Job drawer. No Dataverse schema, security, provider, or cloud
  configuration change is required.

## Online Job Card pilot (deployed)

- Secure online Job Card links are enabled only when the actual recipient is Mouhib
  (`nzmouhib@yahoo.co.nz`) or George's manually entered test address (`georger@liftrucks.co.nz`).
  All other recipients retain the disabled action and receive no portal URL.
- The authenticated server link-generation endpoint enforces the same allowlist, so changing or
  bypassing the browser preview cannot generate a link for another recipient.
- The pilot portal offers its editable, prefilled field-service Job sheet PDF only after a successful
  Job Card submission. Generation remains local to the browser and does not persist a document.
- The authenticated Job drawer can download the same editable PDF for each submitted technician,
  including the office-visible Site Contact details when present.

## Usage-authoritative maintenance scheduling (deployed)

- Equipment service recommendations now use the machine-usage forecast as the authoritative time
  interval at 40% confidence or higher, whether that schedules earlier or later than the saved profile.
- The Default Maintenance Profile remains the fallback below 40% confidence, or when the forecast is
  unavailable or unsafe because of invalid history or a confirmed meter reset.
- The Equipment maintenance drawer labels the active source and applies the same rule to the displayed
  next-due date and maintenance status.
- Customer Dashboard Equipment rows and maintenance summary counters now use the same shared
  forecast-adjusted projection from the Jobs already loaded by the dashboard, so a trusted usage
  forecast cannot be contradicted by an expired fallback profile date.
- Completing any Job now recalculates the Equipment's usage forecast from the refreshed authoritative
  history and persists every active service plan's effective Next Due Date. Trusted forecasts store
  the projected hour-threshold date; unavailable or sub-40% forecasts restore the profile-derived
  fallback date. Service Jobs still reset their applicable service history and due-hour baselines.

## Scheduler Job drawer parity (deployed)

- Scheduled items now open the shared Job drawer through the authoritative focused-refresh
  workflow, so linked Equipment and editor reference data are populated consistently with Jobs.
- The Scheduler drawer now supports Office updates and Office attention changes through the
  existing Job Office services.

## Deployment status

- Version `v1.3.0` contains Technician Job Card Submission Phases 1 and 2 and the modular
  architecture knowledge base.
- The expanded Dataverse schema, relationships, and least-privilege role updates were
  provisioned, published, verified, and passed a second idempotency run on 25 July 2026.
- Version `v1.3.0` is the current tagged release. The production Static Web App is temporarily
  running the unreleased Chargeable Invoice Review testing release from `v1-deployment`.
- Production server-only portal settings must be present for public submission endpoints to
  authenticate to Dataverse.
- Chargeable Invoice Review deployment commit `c9ef102` reached `v1-deployment` on 12 August
  2026 but Azure build run `31527984996` failed before publication because Vite eagerly loaded the
  API-only `pdf-lib` dependency during the root build. The local middleware now loads that service
  only when a development/preview server starts; corrected run `31528610871` published `3cdec08`
  successfully and both new API routes returned safe unauthenticated `401` responses. Azure's
  managed Functions runtime is Node 20.20, so the release pins audited `pdfjs-dist@5.4.624`
  rather than the incompatible 6.x line. Final deployment run `31529175752` published `8119fd7`
  successfully; `/`, `/chargeable-invoices`, preview API and approval API post-deploy checks
  returned `200`, `200`, safe `401` and safe `401` respectively. Authenticated business-flow
  smoke testing remains outstanding.
- The completed Chargeable Invoice Review workspace and customer-PO evidence workflow were
  published from commit `4cba35e` by successful Azure run `31584260343` on 12 August 2026.
  Production-safe verification returned `200` for `/` and `/chargeable-invoices`, found the exact
  `4cba35e` version marker in the deployed client asset, and confirmed the anonymous preview API
  boundary still returns safe `401`. No Dataverse provisioning, role assignment, server-setting
  change or real communication was performed. Authenticated target-role and business-flow smoke
  testing remains outstanding, so this is an unreleased testing deployment rather than a tagged
  production-readiness declaration.
- Version `v1.6.0` was published from commit `757d11a` by successful Azure run `31682024031` on
  13 August 2026. Production-safe verification returned `200` for `/` and
  `/chargeable-invoices`, found the exact `v1.6.0` marker in the deployed client asset, and confirmed
  both Chargeable Invoice APIs still reject anonymous requests with safe `401` responses. The release
  includes Staff Directory, customer/site PO routing, Quote provisional quotations and email drafts,
  Chargeable Invoice PDF/layout and workflow improvements, Ready recovery, and amendment-handoff
  readiness. No Dataverse role assignment, permission change, server-setting change, credential, or
  real communication was performed during deployment. Signed-in role/business-flow smoke remains.
- Version `v1.7.0` was published from commit `438aba6` by successful Azure run `31799755036` on
  15 August 2026. Production-safe verification returned `200` for `/` and `/equipment-map`, found
  the exact `v1.7.0` marker in the deployed client asset, and confirmed the Equipment geocoding API
  rejects anonymous requests with a safe `401`. The release includes Customer Dashboard selection
  persistence, Equipment Map, searchable Equipment relationships, all-Job hour-meter completion,
  date-aware meter history and estimates, machine-usage forecasts, usage-adjusted service intervals,
  compact maintenance summaries, Equipment Job counts/history, and duplicate Job Number protection.
  The deployed hour-meter classification flag remains unchanged. The production server-only
  `GEOAPIFY_API_KEY` Static Web App environment variable was configured manually on 15 August 2026;
  its value remains outside source control and client configuration. Signed-in Equipment Map and
  business-flow smoke testing remain outstanding. No Dataverse provisioning, role assignment,
  credential creation, or real communication was performed.
- The Jobs device-cache and realtime client testing release was published from commit `e7b24dc` by
  successful Azure Static Web Apps run `31906700019` on 16 August 2026. Production-safe verification
  returned `200` for `/` and `/jobs`, found the exact commit marker plus the Jobs realtime and
  IndexedDB cache code in the deployed bundle, confirmed production negotiate CORS with `204`, and
  confirmed anonymous negotiation and an unkeyed Dataverse receiver request are rejected with `401`.
  The existing Flex Consumption receiver was migrated to Node v4 registration and deployed directly;
  Azure indexed both functions and accepted a protected synthetic Job invalidation with `202`.
  Three enabled asynchronous PostOperation `gr_job` Create/Update/Delete steps were then registered
  and independently verified. The synthetic event contained no real Dataverse record and performed
  no Dataverse write. Signed-in multi-client Job update smoke testing remains outstanding.
- The Job Book integration, route-loading improvements, and shared Equipment Map coordinate cache
  were published from commit `e408a49` by successful Azure Static Web Apps run `31915757368` on
  16 August 2026. Production-safe verification returned `200` for `/`, `/equipment-map`, `/job-book`,
  and `/jobs`, found the exact commit marker in the deployed client asset, and confirmed the
  geocoding API still rejects anonymous requests with `401`. The five optional Site geocode fields
  were provisioned and verified before deployment; signed-in localhost smoke populated every one of
  the 142 addressed Sites with assigned Equipment, while six empty Sites were intentionally skipped.
  Signed-in production Job Book and cross-device map smoke testing remain outstanding.
- Jobs on-demand reference loading, Equipment alternate Fleet Numbers, and the 4,000-character Job
  description limit were published from commit `f6441c4` by successful Azure run `31918720953` on
  16 August 2026. The follow-up production Job Card authentication fix was published from commit
  `9780b5a` by successful run `31918842475`. Job Card link generation now sends delegated Dataverse
  authentication through the Static Web Apps-safe dedicated header, which also restores the Jobs
  table email action because it generates the secure link before opening the draft. Production-safe
  verification returned `200` for `/jobs`, found the exact `9780b5a` marker and dedicated header in
  the deployed lazy Jobs bundle, and confirmed anonymous generation remains rejected with `401`.
  One signed-in Job Card generation/email smoke test remains outstanding; no email was sent during
  deployment verification.

- The Job Map, accumulated Equipment/Customer/Job workflow fixes, usage-authoritative maintenance
  scheduling, restricted Online Job Card pilot, and completed Job sheet PDF workflow were published
  from commit `a92f15d` by successful Azure Static Web Apps run `32012070076` on 17 August 2026.
  Production-safe verification returned `200` for `/`, `/jobs`, `/job-map`, and the technician portal
  route, and found the exact `a92f15d` marker in the deployed client asset. No Dataverse provisioning,
  cloud-setting change, business-row mutation, credential creation, or real communication was
  performed during deployment verification. Signed-in Job Map and recipient-controlled Job Card/PDF
  business-flow smoke testing remains outstanding.

- Technician Job Card entry validation and safe resend cycles were published from commit `604e9d9`
  by successful Azure Static Web Apps run `32069714685` on 18 August 2026. Production-safe
  verification returned `200` for `/` and `/jobs` and found the exact `604e9d9` marker in the
  deployed client bundle. Existing Submitted/Closed evidence is preserved when a fresh resend cycle
  is created; unused pending links are replaced in place. No Dataverse provisioning, cloud-setting
  change, credential creation, business-row mutation, or real communication was performed during
  deployment verification. A signed-in resend and recipient submission smoke test remains.

- The localhost Job Card email guard and deterministic Static Web App build were published from
  commit `f94167b` by successful Azure run `32121286297` on 18 August 2026. Production-safe
  verification returned `200` for `/` and `/jobs`, confirmed the root references hashed `dist`
  assets rather than raw `/src/main.tsx`, and found both the exact `f94167b` version marker and the
  localhost-send guard in the deployed client bundle. No Dataverse provisioning, cloud-setting
  change, credential creation, business-row mutation, or real communication was performed.

## Recently deployed work and remaining validation

- Creating a Job from Customer Dashboard or its Equipment workspace no longer runs a broad dashboard
  reload after the shared Job workflow succeeds. The selected Customer, expanded Site, scroll
  position, and retained Equipment drawer stay in place, while the new Job is merged into that
  Equipment's history from the refreshed Jobs collection.

- Customer Dashboard Equipment Job History now reconciles its focused lazy rows with the
  authoritative Jobs collection after completion. Completion also reloads the dashboard's separate
  Equipment and service-plan projection, so Job status, hour meter, and maintenance due dates update
  inside the retained workspace without a browser refresh.

- Job completion dialogs now place Hour Meter at Completion before and alongside Job Completion Date.
  Hours receives initial focus and Date is next in keyboard order across standard, Service, and WOF
  completion; estimate controls follow the pair and calculated hours remain read-only.

- All Job completion paths now force an authoritative Jobs refresh after the Dataverse mutation, so
  the Jobs table immediately reflects Complete instead of retaining a cached earlier status until
  the focused Edit drawer is opened.

- Customer Dashboard Equipment Job History cards now open the canonical Job editor by mouse or
  keyboard. The selected Job is refreshed through the full reference-data workflow before opening,
  so status completion and all relationship, scheduling, quote, assignment, office, Job Card, and
  maintenance controls have their required data. Failed loads offer retry/cancel.

- Customer Dashboard maintenance counters and Equipment rows now use the same effective A/B/C plan
  hierarchy and hour-plus-date status calculation as the Equipment drawer. This removes stale raw
  lower-plan thresholds such as FN1692's incorrect A-Service overdue display.

- Average Machine Usage now uses a 360-day forecast window and includes a concise evidence-based
  confidence explanation. It identifies the actual limiting factors such as too few readings inside
  that window, insufficient span,
  stale history, inconsistent usage, anomalies, resets, or estimates; Job type and Site remain
  irrelevant to confidence.

- Customer Dashboard Create Job actions now wait for shared Job reference data before opening the
  drawer. Customer-level creation retains the selected Customer and sole Site, while Equipment-level
  creation retains the selected Equipment, current Site, derived Customer, and sole Site Contact.
  Failed preparation offers retry/cancel without discarding the source Equipment context.

- Chargeable Invoice Review's unmatched-invoice Job creation now also waits for the same lazy Job
  reference data before matching or rendering Equipment, Customer, and Site fields, with retry on
  failure.

- Creating a Job from Equipment Manager now waits for shared Job editor reference data before
  rendering, so the selected Equipment, current Site, derived Customer, and sole Site Contact are
  populated automatically.

- Customer Dashboard and Equipment Manager drawers now open immediately while their focused
  Equipment Job history loads through the shared Operational Data Client. The History tab exposes
  loading and retry states; switching Equipment changes query keys, and closing the final observer
  releases the result after a short cache window while cancellation/generation guards prevent data
  leaking between Equipment records.

- Historical maintenance baselines now honour the A/B/C hierarchy: C refreshes C, B, and A;
  B refreshes B and A; A refreshes only A. The Equipment drawer also resolves existing older
  independent plan rows through that hierarchy and recalculates each lower service's own due
  thresholds.

- The Quote editor desktop dialog now uses a wider, viewport-bounded layout so the existing
  line-item grid has room for its GST and removal controls without changing mobile behaviour.

- Inline Equipment creation from New/Edit Job now accepts an alternate Fleet Number and can create
  the Equipment when that is the only known identifier. It normalizes and persists the value through
  the existing Equipment alternate-fleet column.

- Jobs action notifications now include an accessible close control and automatically clear after
  five seconds using one replacement-safe timer.

- Job Book clipboard exports now append normalized alternate Fleet Numbers to the primary Fleet
  Number within the existing fleet cell, separated by ` / `. Single-row, bulk, and explicit
  spreadsheet copy paths use the same formatting. The technician email preview and delivered HTML
  now reuse that combined Fleet Number presentation.

- The Jobs-table technician email composer now accepts optional email-only comments, displays them in
  the bounded preview, and safely escapes them into the Email Dispatch HTML without changing the Job
  description. Its desktop dialog is widened to 840px while remaining viewport-bounded. Open Job Card
  remains visibly present but temporarily disabled in both preview and
  delivered HTML; secure-link generation is bypassed while the feature is paused, so localhost can
  still queue the email without calling the Job Card link endpoint. The linked Site Contact name,
  phone, and email are shown in the preview and delivered card when available.

- Site Checks now supports cadence rollover without waiting for every Job in the previous
  batch: an overdue row keeps **Open previous** and exposes **Start next batch**, late
  completion closes only the replaced occurrence, and future due dates remain anchored to
  the configured cadence. This is deployed and locally verified. A true
  one-off Site Check is still outstanding; it needs an explicit ad-hoc occurrence contract
  rather than storing a false Weekly/Fortnightly/Monthly frequency.

- The active Dataverse **Job Email Dispatch** Power Automate flow was upgraded in place on
  16 August 2026 to use the existing WSSOperations Office 365 Outlook connection. It now sends the
  stored HTML body before marking Email Sent, and records a safe failure result on Outlook failure
  or timeout. The corresponding Jobs-table in-app composer, formatted Job Card, clickable secure
  link, non-blocking queue behaviour, and background Sending/Sent/Failed state are deployed and await
  one deliberate recipient-controlled delivery smoke test.

- Job Book Intake now has a provisioned, published, and verified organization-owned
  `gr_jobbookentry` Dataverse ledger in `ServiceOperationsNew`. Its primary Job Number is an
  AutoNumber with Active alternate key, seeded at `145969`; the Service Operations role has only
  organization-depth Create/Read/Write/Append/Append To. The local Intake screen creates records
  without submitting a number and accepts only Dataverse's returned allocation; ETag-protected
  editing is implemented locally. `gr_jobbookentry.gr_entered` is displayed as GT Entry, while
  Timecloud Entry remains a separate boolean. Managed `gr_job` records now have matching independent
  `gr_gtentered` and `gr_timecloudentered` booleans; the Job Book Legacy table reads and saves both
  with ETag protection. Obsolete browser-only draft rows and overrides are no longer loaded or
  written, and the Reset local drafts control has been removed. Its initial Equipment request now
  uses a lightweight account/environment-scoped IndexedDB picker index instead of the full Equipment
  management payload; Customer and Site suggestions load only when the add-machine dialog opens.
  On 16 August 2026, the latest preflight found 399 numbered Jobs with no
  duplicate Job Numbers, and `gr_job_jobnumber_key` was provisioned and verified Active without
  changing an existing Job. The optional `gr_jobbookentry.gr_Contact` lookup is now provisioned,
  published, and enabled in local and Azure builds. The shared Customer → Site → Site Contact control
  stores the underlying Contact exactly as Create Job does. The `Service Operations - Job Book Only`
  role has verified Site Contact Read plus Contact Read/Append To privileges. Promotion remains
  disabled until its atomic server operation exists. Separate Waikato, Hastings, and Christchurch
  table configurations, independently paged views, and reusable schema/cutover tooling are complete
  locally. On 14 September 2026, all three regional production tables, columns, six relationship
  lookups, active Job Number keys, and Full Access / Job Book Only role privileges were provisioned,
  published, and independently verified. Their view and allocation gates remain false; the tables
  contain no migration rows and no regional production sequence has been seeded or consumed.

- All management and public portal feature screens are now route-level lazy imports. The measured
  local production entry bundle fell from approximately 1.79 MB minified / 540 KB gzip to 465 KB /
  134 KB gzip, while initial CSS fell from approximately 258 KB to 5 KB. Feature code and styles now
  load when their route is opened; authentication, routing boundaries, and the Sidebar remain eager.

- Jobs now follows the Equipment data-loading model locally. An account/environment-scoped
  IndexedDB snapshot gives the Jobs table an immediate first render, an in-memory cache deduplicates
  same-session requests, and a complete paged Dataverse refresh replaces the snapshot in the
  background. The table projection no longer downloads every Job Card time entry and material;
  those child rows and photos load only for the selected Job drawer. The protected realtime receiver
  now routes bounded Equipment and Job events through Node v4 registration and was deployed to the
  existing Flex Consumption Function App on 16 August 2026. A protected synthetic Job event returned
  HTTP 202. Three enabled asynchronous PostOperation `gr_job` Create/Update/Delete steps were created
  against the existing service endpoint and independently verified. Dataverse remains authoritative;
  SignalR messages contain only the changed record ID, operation, and event time.

- Staff realtime invalidation was published from commit `0adbe3d` on 16 August 2026. The
  authenticated app shell opens one Staff notification listener, and active Staff, Jobs, Quotes,
  and Job Book consumers reuse the same account-scoped Staff directory query. A debounced
  `gr_mechanic` event therefore re-reads one shared directory rather than one copy per screen. The
  notification contains only Staff ID, operation, and event time. Azure indexes the
  `equipmentchanged` and `negotiate` Functions; authenticated negotiation returned HTTP 200 and a
  protected synthetic Staff event returned HTTP 202. Three enabled asynchronous PostOperation
  `gr_mechanic` steps were registered and independently verified: Create
  `d5d1b607-1799-f111-b8db-6045bde57026`, Update
  `d7d1b607-1799-f111-b8db-6045bde57026`, and Delete
  `d9d1b607-1799-f111-b8db-6045bde57026`.

- Job Book Legacy now renders its Job/Equipment shell independently of Staff. Customer selection
  performs bounded, debounced and abortable Dataverse searches; the add-machine workflow preserves
  a selected Customer label and loads only that Customer's Sites. Staff, Customer search, and Site
  failures keep the existing row and expose scoped retries instead of reloading or blanking the
  legacy table. The Equipment picker continues to use its deliberate account/environment-scoped
  lightweight index and IndexedDB snapshot because legacy paste/intake work requires immediate
  cross-customer Equipment lookup.

- Local Job Card link generation now reloads its CommonJS API service per Vite request. This prevents
  the hot-reloaded browser client and long-running localhost middleware from disagreeing about the
  delegated Dataverse authentication header and returning a false `401` until Vite is restarted.

- Jobs realtime recovery now performs one debounced Dataverse reconciliation after SignalR
  reconnects and when a hidden Jobs tab becomes visible. This handles laptop sleep/background-tab
  gaps without polling; ordinary connected changes continue to use bounded `jobChanged` events.

- The published Service Job completion hour-meter dialog now uses bounded responsive columns so Equipment
  labels, maintenance summaries, and numeric inputs cannot overlap or escape the modal at narrow
  widths or increased browser scaling. It also blocks incomplete maintenance schedules before
  submission and lets the user configure and synchronize the Equipment maintenance setup directly
  in the completion dialog before retrying. Plan-dependent schedule, hour-meter, effects, and
  completion controls remain hidden until synchronization succeeds.

- All Job types in the published application now require linked Equipment and an hour-meter reading
  when moving to Complete.
  Breakdown, Workshop, and Site Check use the general completion dialog; WOF captures hours with its
  expiry; Service retains its additional plan checks and atomic maintenance updates. Completion
  readings are stored on both the Job and the Equipment so machine usage can inform service timing.

- Published Equipment create and edit drawers now share the searchable Customer/Site relationship
  workflow.
  Either mode can create a Customer and its first Site inline with duplicate-name protection; the
  Equipment record continues to persist only its authoritative Site lookup.

- Equipment Map is published on `/equipment-map`. It groups Equipment by current assigned
  Site, resolves Site addresses through an authenticated server-only Geoapify boundary, and renders
  a Leaflet/OpenStreetMap view. Addresses resolve and cache in 20-Site batches; an individual provider
  failure settles as Not mapped instead of blocking the batch, and markers fit once after the initial
  pass to avoid repeated map movement. Nearby markers cluster and split/spiderfy during zoom so dense
  areas remain readable; Site and Equipment details open in a closable floating map window, and the
  desktop map fills the remaining viewport beneath the filters.
  Account/environment-scoped IndexedDB now restores coordinates before geocoding begins. Five
  optional derived geocode fields on `gr_site` were provisioned, published, and verified on
  16 August 2026; the authenticated geocoding endpoint writes them with bounded Dataverse concurrency so
  unchanged Site addresses are shared across devices. Exact source-address matching invalidates a
  stored coordinate after an address edit, while the authoritative `gr_address` is never rewritten.
  Signed-in localhost smoke testing on 16 August 2026 populated shared coordinates for all 142
  addressed Sites with assigned Equipment. Six addressed Sites without Equipment were intentionally
  left unresolved. The smoke also verified direct derived-field read-back, non-RFC Dataverse GUID
  handling, bounded independent writes, and continuation after an individual provider failure.
  The separately created `GEOAPIFY_API_KEY` was added manually to the production server-only Static
  Web App environment variables on 15 August 2026. Signed-in verification that markers resolve in
  production remains outstanding. No role, business record, credential, deployment, or cloud
  configuration was changed by the shared-cache work.

- Staff Directory is published in `v1.6.0`: the UI is renamed from
  Mechanics to Staff, `/mechanics` redirects to `/staff`, Department, `Can be assigned Jobs`, and
  `CC on customer emails`
  are editable, non-assignable office staff are excluded from technician workflows, and active
  emailed staff can be selected for Chargeable Invoice amendment handoff. Explicitly opted-in active
  emailed staff are deduplicated into CC on Quote and Chargeable Invoice customer PO drafts. The existing
  `gr_mechanic` table and relationships are preserved. The approved `gr_department` and
  `gr_jobassignmentenabled` columns were provisioned, published, and verified in one interactive
  Dataverse connection on 13 August 2026. The separately approved `gr_customeremailccenabled`
  column was then provisioned, published, and verified through one deliberate interactive connection
  after its no-prompt preflight stopped safely. Signed-in Staff and email-draft smoke testing remains;
  no role, record, deployment, credential, or cloud configuration was changed.

- Quote provisional-quotation generation is published in `v1.6.0` inside the saved Quote editor. It
  reuses the approved GreenTree-style template and Liftrucks logo, uses the live editor lines and
  totals, copies Quote Notes into the provisional document's `Work Required` section, and displays the linked Job number in both the
  original template's `Invoice No` and `Our Ref` fields. The generated PDF downloads locally and does
  not persist a document, send an email, or change Quote/Job workflow state. The shared single-page
  renderer and editor now support up to 20 lines, including the previously blocked 16-line quote;
  dense rows retain a 7.5 pt minimum. Deployment and a
  signed-in browser smoke test remain outstanding.
  Its party box now stacks Customer, linked Job Site name and linked Job Site address on the left.
  Generation opens the browser's native Save File dialog when supported, with a standard-download
  fallback for other browsers. Its suggested filename is `Equipment - Job number.pdf`, preferring
  Fleet and falling back to Serial or Make/Model.
  The saved Quote editor can also open an editable PO request email using the linked Job Site's PO
  recipient override or the Customer default, including configured CC recipients. Unconfigured routing
  opens a draft with the recipient blank; the user attaches the saved PDF manually and nothing is sent
  or recorded automatically. Active Staff explicitly opted into customer emails are appended as
  deduplicated internal CC recipients. The draft uses a concise human service-manager template:
  request the order number, include Quote Notes as the work explanation, and state that work awaits
  PO approval rather than repeating a system-style field list.
  Quote titles are composed from protected Job number, Equipment fleet/serial and Job description
  context, followed by optional user wording; Job selection displays both number and description.
  Selecting or reopening a linked Job populates the Quote Customer and Equipment from the Job when
  those relationships are available, while saved direct Quote lookups remain authoritative on open.
  Saving a new or existing Quote refreshes its persisted header and line identities without closing
  the editor; close remains an explicit user action.

- Customer/Site Purchase Order Recipient configuration is published in `v1.6.0`: Customer defaults
  contain one Primary plus optional CC Contacts, complete Site overrides replace that default, and
  managers can create and immediately select a new emailed Contact inline using the existing Site
  Contact workflow. Chargeable Invoice Review resolves the effective set into an editable unsent email draft. Approved
  Dataverse table, relationships, and required organisation-depth Service Operations and Chargeable
  Invoice Manager permissions were provisioned, published, and verified on 13 August 2026. A
  signed-in save/resolution workflow smoke test remains. No role assignment was changed.

- Chargeable Invoice Review Phases 1–6 and the Phase 7 local release-readiness baseline are
  complete. Explicitly gated target-environment smoke, role assignment and release validation
  remain. The approved staging
  columns are provisioned and verified; release flags remain disabled and the manager role remains
  unassigned. One explicitly approved interactive read-only verification passed again on
  12 August 2026 without any Dataverse write.
  Ready reviews now have a confirmed `Return to In Progress` recovery action. It clears only the
  mistaken Ready disposition under the Review ETag, retains all review evidence and decisions, and
  appends an audited Manual Note; Do Not Process remains terminal.
  Active amendments now provide their own Ready handoff path to Accounts: undecided PO/photo fields
  do not block that path, while any requirement explicitly set to Yes remains enforced.
- Permanent Chargeable Invoice package deletion is implemented locally after the 12 August 2026
  product decision. Provisioning and verifying organisation-depth Delete on the six review tables
  remains separately gated; the currently unassigned manager role still has only its original 30
  non-destructive grants.
- Approve and provision the minimum Site Check deletion privileges, then smoke-test the
  in-app occurrence deletion action as the intended Service Operations role.

- Run a Site Checks Site Settings smoke test as an assigned non-admin Service Operations user.
- Run the combined Site Checks Phase 8 target-environment validation: verified maximum-Site
  request observation, non-admin creation/completion, manual accessibility, and rollback
  review. Use one existing signed-in session and do not automatically retry authentication.
- Confirm the four server-only `DATAVERSE_*` settings are present in the production
  Static Web App / Function environment.
- Run a production-safe Technician Job Card smoke test.

## Recent milestone

The manager-only Chargeable Invoice Review implementation plan is approved for phased work.
Four representative, single-page GreenTree PDFs were visually and structurally inspected
without modifying the originals. They confirm stable labelled invoice/header/equipment/totals
regions but variable optional PO, story, meter and service content. The plan now records four
real workflow fixtures: Waiting on Sales with a possible Do Not Process disposition, technician
photo/PO approval, part-price correction plus new Labour/Consumables lines, and a technician-
verified Date of Job correction. Extracted Order No remains source evidence and never
automatically proves PO receipt. No Dataverse, application, cloud or email mutation occurred.

The approved Chargeable Invoice Review Dataverse preflight then completed through one
interactive connection after the no-prompt attempt safely stopped. It confirmed all six proposed
table names and ten relationship names are unused; required User-owned reference contracts and
the unmanaged target solution are present; Service Operations has global reference access; the
dedicated Chargeable Invoice Manager role does not yet exist; and the organisation upload limit
is 5 MiB. A detailed User-owned schema and dedicated manager-role proposal is documented. No
metadata, privileges, assignments, business rows, files or configuration were changed.

The product owner approved the proposed six User-owned tables, dedicated unassigned manager
role, 5 MiB V1 file limit, immutable history, approval-PDF wording and file allowlists. The
original malware-scanning release-gate decision was explicitly withdrawn on 12 August 2026;
V1 now has no malware-scanning integration or setting. This confirms the Phase 1 contract but is
not itself authorisation to provision Dataverse or create/grant the role.

The first local Phase 2 foundation slice is implemented: named Choice constants and typed Review,
Line and Correction contracts plus pure primary-queue, Waiting, Ready-to-Process and Do-Not-
Process rules. Five focused tests cover explicit review start, Waiting precedence, terminal
history, PO/photo prerequisites and required no-charge reasoning. Full regression tests, lint,
production build and whitespace validation pass. No route, UI, service, Dataverse metadata,
role or business record was created by this slice.

After separate explicit external-write approval, the six-table schema, Restrict relationships,
three alternate keys and 5 MiB File contract were provisioned and published. The unassigned
manager role has the approved 30 organisation-depth grants and no new-table Delete/Assign/Share
grants. A later read-only verification confirmed active keys, the full schema/role contract and
zero user/team assignments. No business rows were created.

The remaining Phase 2 pure domain foundation is now implemented. A structured GreenTree
extraction boundary normalises whitespace, currency, Date Only values, line categories and
stable line keys into immutable Revision/Line drafts while preserving raw evidence. It reports
required-field, malformed-number and totals/GST mismatches without inventing or repairing
values. Outstanding header, story, changed-line, added-line and removed-line corrections compare
conservatively against a later revision; duplicate candidate lines remain Not Made rather than
being falsely matched. Ten focused tests pass with de-identified synthetic evidence.

Phase 3 preview foundations are implemented locally. The authenticated Azure Function validates
the delegated identity once, verifies access to the new Review table, enforces PDF signature,
MIME, exact byte count, 5 MiB, five-page and bounded-text limits, extracts positional text through
server-side PDF.js, and performs one exact bounded Job Number query using Our Ref. It returns no
write payload and creates no business row or File. Client validation rejects unsupported files
before encoding. Both server release flags remain disabled. Local read-only parsing of all four
supplied PDFs extracted their invoice/reference, Labour/Parts lines and totals with zero domain
validation issues; the originals were not modified or copied into the repository.

The new `/chargeable-invoices` batch screen is also wired locally in the main route/sidebar. It
reuses Page Header and Metric Strip, accepts at most 20 PDFs, acquires one silent token per batch
action, runs at most two previews concurrently, and keeps valid results usable when another file
fails. Duplicate invoice numbers require an explicit revised-import or skip decision; incomplete
imports are retryable, and unmatched rows offer a bounded exact Job Number recovery. Import
re-parses and revalidates server-side, stages Review/Document metadata, uploads the immutable PDF,
then atomically creates Revision/Lines/Activity and activates the Review. No live import was run.

Phase 19 Checklist Administration is implemented locally and its approved Dataverse
least-privilege boundary is provisioned. The admin-only `/site-checks/checklists` route
loads ICE/Electric definitions, edits validated local drafts, and atomically publishes a
new immutable version while deactivating the previous version with ETag protection.
`georger@liftrucks.co.nz` is the sole assignee of the new unmanaged **Site Check Checklist
Administrator** role. Service Operations retains Template/Item Read and operational Append
To but no longer has Create, Write, Delete, or Append. Same-session verification passed
without schema/business-row changes or an interactive sign-in prompt. Signed-in admin UI
and separate non-admin direct-write denial smoke tests remain.

The product direction for the next Site Checks expansion is approved and recorded as
Phases 14–18 in the authoritative tracker. Phase 14 is complete: the authenticated
`/site-checks` workspace shows enabled Sites across Customers, defaults to All enabled Sites,
supports state metrics plus combined operational filters, and reuses the existing
Run/details drawers. It uses one silent token, paged Site/technician references, bounded
100-Site Schedule scopes, batched occurrence/progress reads, and lazy per-Site Equipment;
it does not load global Jobs or Equipment. Customer, Job, and Equipment links reach their
canonical management context. A signed-in desktop smoke loaded three enabled Sites, verified
Due and technician filters, opened the active Summary drawer, loaded the three-machine
creation review without submitting it, and verified Escape/focus return. No authentication
prompt or Dataverse write occurred.
Technicians will receive one occurrence-level assignment experience while retaining one
independent Job and Job Card per Equipment. Future checklist definitions will be versioned
and snapshotted, technician submission will remain separate from operational completion,
and findings will require explicit office review before creating follow-up Jobs or Quotes.
No new schema is approved or provisioned by this design decision; bulk access, checklist,
and findings schema/security changes retain explicit approval gates.

Phase 15 local inspection and the consolidated live read-only preflight are complete. The
preflight used one
cached `LoginPrompt=Never` connection and made no changes. It confirmed that the four
proposed Site Check token columns/key and Email Dispatch Site Check relationship are absent,
that Email Dispatch Job is currently required, that Service Operations already has the
necessary Organisation-depth relationship privileges, and that Public Portal Service
currently has no Site Check privilege. The proposal adds four optional token-lifecycle
columns plus a token-hash alternate key on Site
Check, adds an optional Site Check lookup to Email Dispatch, and changes its required Job
lookup to optional with an application-enforced exactly-one-owner rule. Public Portal
Service would receive only Organisation Read on Site Check. At the preflight stage no
schema, role, flow, server, email, or application mutation had been performed.

Phase 15 schema/security provisioning was then explicitly approved. The four token fields,
published optional Email Dispatch Site Check relationship, Active token-hash key, and only
Organisation Read on Site Check for Public Portal Service are now provisioned and verified.
Email Dispatch Job remains Application Required: Dataverse returned success for three
required-level update attempts but retained the old value, despite reporting the column as
unmanaged, updateable, and changeable. No further blind retries should be made. This is no
longer a Phase 15 blocker: the working Jobs-table email action was traced to secure-link
generation followed by a `mailto:` handoff, and the product owner selected that mechanism
instead of Power Automate. The optional Email Dispatch Site Check relationship is unused;
no separate dispatch table should be provisioned. Phase 15 application implementation has
started locally: the shared Site Check assignment service, Azure Function wrapper, and Vite
middleware implement authenticated link generation/revocation and anonymous minimal
occurrence/Job lookup. The client reuses the Jobs-table email validator and `mailto:`
builder with Site Check-specific subject/body. The manager **Send to technician** action and
unauthenticated read-only `/portal/site-check/:token` assignment list are wired. Six focused
tests, lint, and production build pass.

The product owner resolved the Static Web App Contributor/RBAC and missing environment
configuration and then confirmed the client secret exposed in a supplied screenshot was
rotated and replaced in the Static Web App environment. Never copy the old or current value
into source, documentation, logs, or responses.

Post-rotation full regression tests, lint, and production build pass. The localhost public
route rendered its safe temporary-error response because the local API process does not
have the rotated server identity. The management tab was signed out after reload; no token,
Dataverse write, mailto handoff, or real communication was created. Live validation remains
pending one user-initiated localhost sign-in plus local server identity configuration or a
deployed endpoint.

The subsequent signed-in manager smoke verified **Send to technician** on both active
Cardinal Site Checks. Drury's 17 Jobs and Puhinui's two Jobs were correctly blocked because
their generated Jobs do not all have numeric Job Numbers. No token, Dataverse write, mail
client, or communication was created. Successful end-to-end link validation awaits a
genuinely numbered in-progress occurrence; production Job Numbers must not be assigned only
to facilitate a test.

Phase 16 schema, proposed Choice values, initial organisation-wide template scope, and the
least-privilege security model were explicitly approved and provisioned on 26 July 2026.
One cached, no-prompt preflight confirmed the four table names and two extension lookup names
were unused and inspected only metadata/role grants. A second single cached connection
created and published the versioned Template/Item, occurrence Snapshot Item, per-Job
Response, Schedule Template selection, and optional Job Photo Response relationship.
Same-session structural, Choice, relationship, key-definition, and role-grant verification
passed without creating or changing business data. All four alternate keys were initially
Pending; one later cached, read-only `VerifyChecklist` check confirmed all four Active and
reverified the schema/security contract. No checklist content was seeded; actual prompts
and item-level required/comment/photo rules remain a separate product approval before
application integration.

The first Phase 16 application-foundation slice is complete locally. It adds typed Template,
Template Item, Snapshot Item, Response, response-type, and choice-answer contracts; strict
paged Dataverse reads using the four metadata-confirmed entity sets; active-template and
item-integrity validation; and deterministic immutable snapshot payload construction.
Schedule reads now include the optional selected-Template lookup. It does not add template
administration, seed checklist content, change occurrence creation, change technician
submission, or write business data. The focused 52-test Site Checks suite, lint, and
production build pass.

The two supplied legacy fortnightly check sheets have been extracted and compared without
modifying the originals. The product owner clarified that one technician link opens all
machine Jobs, but each Job must receive the checklist selected from its Equipment Service
Data. Existing `gr_equipment.gr_powertype` (ICE/Electric/Other or Unknown) is authoritative.
The unseeded content proposal defines separate complete ICE and Electric Templates. Its
required schema correction was approved and provisioned on 26 July 2026: Snapshot Item now
has a required Job lookup and Job + Item Key alternate key while retaining Site Check for
occurrence reads. A cached no-prompt preflight confirmed zero Snapshot rows and the required
Service Operations relationship privileges before the old key was replaced; structural
verification passed without creating business rows.
The replacement alternate-key definition exists but its Dataverse index remained `Pending`
at the final no-prompt read-only check. Do not repeatedly poll; confirm `Active` in the next
relevant Dataverse session before occurrence integration.
A later single cached no-prompt verification confirmed it `Active` and all Phase 16
schema/security contracts passed. Local Snapshot Item types, reads, and creation payloads
now require the generated Job binding. A pure domain resolver selects Electric only for
Electric Power Type and selects ICE for ICE, Other / Unknown, and missing values, with the
latter cases labelled **ICE checklist (defaulted)**. Focused tests and lint pass.
The exact Phase 16 checklist v1 content and rules were explicitly approved and provisioned
on 26 July 2026. A cached no-prompt preflight found zero matching rows. One subsequent
cached no-prompt connection atomically created `SITE_CHECK_ICE` v1 with 23 Items and
`SITE_CHECK_ELECTRIC` v1 with 22 Items, then verified every row against
`scripts/site-check-checklist-v1.json`. Answers are required, failed inspection items
require comments, photos are optional, and the service-meter reading is a required Number.
No operational or customer business rows were created or changed. The next implementation
slice was completed locally: authoritative creation loads and validates the required active
Templates, selects per Equipment Power Type, and adds every per-Job immutable Snapshot Item
to the same atomic change set as the occurrence and generated Jobs. The Run review labels
each machine's checklist and explicitly marks ICE fallback. Missing or invalid content
blocks before writing. The verified 22-machine ICE case produces 530 operations within the
enforced limits. The focused 54-test suite, lint, and production build pass. No occurrence
was created during this validation.

Phase 17 has started locally. The secure Site Check assignment endpoint now loads Snapshot
Items and returns only those attached to Jobs still authorised by the occurrence token and
assigned technician. The portal now has a machine selector and grouped immutable checklist
display with response-rule hints. It remains intentionally read-only until checklist
Responses, Job Card fields, and token/job replay protection are committed through one
canonical server-side per-Job transaction. Six assignment tests and lint pass.
That transaction is now implemented locally: each request revalidates the occurrence token,
technician, Job membership/state, and Snapshot ownership; validates every required answer,
numeric meter reading, and failed-item comment; then atomically creates Responses and marks
only Job Card Status Submitted using the Job ETag. Operational Job Status is untouched.
Replay/concurrent writes are rejected by ETag and alternate keys, and the portal advances
to the next unsubmitted machine. Time, parts, photos, search, unsaved-change warnings, and
an end-to-end portal smoke remain. Eight focused assignment tests and build pass.
Canonical time entries and Job Materials now join checklist Responses and the Job Card
update in the same atomic transaction. The portal also supports machine search, automatic
continue-to-next, and an unsaved-input confirmation when switching machines. Optional photo
upload, whole-page navigation guarding, accessibility/recovery/browser validation, and an
end-to-end portal smoke remain. Eight focused assignment tests, lint, and build pass.
Optional photos now reuse the canonical Job Photo preparation, validation, idempotent
upload-key, Job relationship, and file-column upload path. A whole-page `beforeunload`
warning complements machine-switch confirmation, and preview URLs are released on reset.
Live authenticated portal/file smoke validation remains outstanding.
The complete repository regression suite, lint, production build, and `git diff --check`
pass. Release preparation excludes the unrelated untracked `docs/wiki/` directory. The
branch is ready to push; deployment and production-safe authenticated/manual validation
remain separate explicit actions.
A localhost assignment-link 503 was diagnosed as an unnecessary public Mechanic expansion:
the least-privilege portal identity correctly lacked Mechanic Read and Dataverse returned
403. The public projection no longer expands or exposes Mechanic; GUID-based assignment
authorization is unchanged and no new privilege is required. Local middleware now includes
the `submitJob` route and safe console diagnostics. Tests/build pass. The environment had
zero Snapshot rows, so the existing pre-integration occurrence must be recreated to test
the checklist itself.
The product owner decided missing and Other/Unknown Power Type defaults to the ICE Template
without changing Equipment Service Data; preview and technician UI must show **ICE checklist
(defaulted)**. Checklist content and comment/photo rules still await explicit approval.
No Dataverse business rows or application behaviour changed.

Starting a Site Check is now one compact review flow. The drawer selects the technician,
collapses included Equipment, keeps unavailable exceptions visible, and allows persistent
availability changes inline. Those Equipment updates now share the existing atomic
occurrence/Schedule/Job/exclusion transaction. Successful creation opens directly on Jobs &
Equipment for immediate Job Book copy/paste.

Enabled Site headers now use one context-aware Site Check details action instead of separate
current and history buttons. In progress opens the current occurrence Summary; other enabled
states open History through the same details drawer.

Phase 13 temporary Equipment availability is implemented locally. The Equipment marker is
available from the Customer Dashboard Equipment drawer only when the current Site has an
enabled recurring Schedule. In Workshop and Temporarily Off-site Equipment are excluded
after Schedule scope filtering, snapshotted in the same atomic occurrence transaction, and
reconsidered only at the next normal occurrence after returning; no catch-up Job is created.
The schema is provisioned and published, its composite key is Active, and the approved
Service Operations Create/Read/Delete/Append/Append To privileges are verified at
Organisation depth. Run preview and occurrence history expose exclusion reasons.

A signed-in desktop target smoke on Air New Zealand / Can Park Auckland passed on 26 July
2026 without another authentication prompt. With a temporary Weekly Schedule, FN1579 marked
In Workshop, and Anura assigned, preview showed two included machines and one unavailable
machine. Creation produced exactly two Jobs and one immutable FN1579 exclusion snapshot;
the details drawer showed `0/2`, both Jobs, and the In Workshop reason. The in-app atomic
delete then removed the occurrence, two Jobs, and exclusion. FN1579 was restored to Available
at Site and the temporary Schedule was disabled, returning all Customer summary counts to
zero and removing Site Check content from the Site header.

Disabled Site Check Schedules now render no Site Check summary or actions in the Site header,
including History. Stored occurrences and Jobs remain unchanged and become accessible again
if the Schedule is re-enabled.

Controlled in-app Site Check deletion is implemented locally. The details drawer confirms
the permanent action, loads all generated Jobs, then atomically clears an active pointer and
deletes Jobs before the occurrence using ETags. Schedule cadence, scope, and manual
selections remain. Service Operations does not currently have Site Check Delete privilege;
provisioning remains a separate explicit approval gate.

At the user's explicit request, the current Site Check test occurrence and its generated
Jobs were permanently removed on 26 July 2026. One cached, no-prompt transaction cleared
one active Schedule pointer, deleted one Site Check occurrence and three Site Check Jobs,
and verified zero occurrences and Site Check Jobs remained while preserving the existing
Schedule. The administration tool now has a narrow `PurgeOccurrences` mode so future
occurrence cleanup cannot inadvertently delete Schedule settings or manual selections.
A later repeat cleanup removed one newly created occurrence with no generated Jobs, cleared
its active pointer, and again verified zero occurrences and Site Check Jobs while preserving
the Schedule.

Site Check Job Book allocation is implemented locally. The details drawer loads every
generated Job in stable creation order, copies the requested eight headerless TSV columns,
accepts one numeric Job number per line, validates the exact mapping, and writes every
number in one ETag-protected atomic change set before authoritative reload. It reuses the
existing comma-separated Site address convention, silent authentication, and generated-Job
query; no schema or sign-in flow changed. Newly generated Jobs use the shared occurrence
description `<Frequency> checks for <Monday week-start date>` calculated from the start time
in New Zealand.

The approved Manual Site Check Equipment selection schema was provisioned and published on
26 July 2026 using one cached `LoginPrompt=Never` connection. Schedule Equipment Scope now
includes Manual Selection `122830002`. The new organisation-owned
`gr_sitecheckscheduleequipment` table has required Schedule and Equipment lookups with
Restrict behavior and a composite Schedule + Equipment alternate key. Same-session
structural verification passed; an immediate read-only check found the new key Pending and
the next cached verification confirmed it Active. A read-only privilege audit confirmed the
Service Operations role initially had no access to the new table. After separate explicit
approval, Create, Read, Delete, Append, and Append To were added and verified at Organisation
depth. Write, Assign, Share, user assignments, data rows, and other privileges were unchanged.

Manual Selection application integration is complete locally. The Site Checks coordinator
loads all Schedule selections in one batched request using the existing silent token. Site
Settings reuses the shared searchable multi-select and removable selected summary. Schedule
and selection additions/removals save in one ETag-aware Dataverse change set. Run preview
and authoritative creation both intersect saved IDs with current Site Equipment, so stale
transferred-away rows cannot create Jobs and zero current matches are blocked. Focused Site
Checks and Customer Dashboard tests, lint, and production build pass.

A signed-in desktop smoke on Air New Zealand / Can Park Auckland verified that Manual
Selection exposes exactly the three current-Site machines and that selection/removal updates
the summary. The smoke caught and corrected a hidden-panel JSX placement error before any
save. The completed write check created one enabled Weekly Schedule due 26 July 2026 with
FN1579 as its only manual selection. Reload preserved the Schedule and selection, Customer
summary showed one Due Site, and Run Site Check preview showed one included machine, two
excluded machines, and one Job to be created. The preview was cancelled, so no occurrence or
Job was created. Phase 10 is complete.

At the user's explicit request, all Site Checks test data was permanently removed on
26 July 2026. One atomic transaction cleared one active Schedule pointer and deleted two
Schedules, two occurrences, and three parent-linked Site Check Jobs. A second idempotent
verification widened the Job predicate to include both the parent lookup and Job Type
`122830004`; it confirmed zero Schedules, zero occurrences, and zero Site Check Jobs remain.
The schema, Choice columns, relationships, and application implementation remain intact.

Equipment Ownership and Site Check Equipment Scope application integration is complete.
The canonical Equipment drawer reads and writes Not classified, Customer owned, and
Liftrucks rental through `gr_ownershiptype`; create, normal edit, bulk create, and CSV edit
paths preserve the nullable classification. Site Settings reads and writes
`gr_equipmentscope` through the existing ETag-aware Schedule workflow. One shared inclusion
policy filters both the Run drawer preview and the authoritative preflight; rental-only
scope excludes Customer-owned and Not classified Equipment and blocks creation at zero
matches. Existing/null scope remains All Equipment and historical occurrences are
unchanged. Full tests, lint, and production build pass.

The Equipment ownership/Site Check scope schema extension was approved, provisioned,
published, and verified on 26 July 2026 through the existing single-connection,
`LoginPrompt=Never` tool. Equipment now has optional `gr_ownershiptype` (Customer Owned or
Liftrucks Rental; null is Not classified), and Site Check Schedule has optional/default-All
`gr_equipmentscope` (All Equipment or Liftrucks Rentals Only). No data rows, privileges,
relationships, or historical records changed. The first idempotent pass created Equipment
Scope and exposed a wrapped DateTimeBehavior comparison bug before publish; the corrected
retry recognized that compatible column, created Equipment Ownership, published both
tables, and passed same-session verification.

The approved target-environment Site Checks lifecycle passed for Air New Zealand / Can Park
Auckland on 26 July 2026. The signed-in session created and reloaded an enabled Monthly
Schedule, created one occurrence with exactly three Equipment Jobs assigned to Anura, and
completed FN1579, FN2461, and FN2464 through operational Job Status. The final Job
atomically completed the occurrence and rolled the Schedule to 26 August 2026. Customer
summary counts became Up to date `1`, Due `0`, Overdue `0`, and In progress `0`; History
retained a Complete `3/3` entry. Operational Jobs excluded the Site Check records, the
dedicated Site Check view retained all three completed Jobs, and Scheduler continued to
exclude Site Checks. This proves the lifecycle for the signed-in account but does not by
itself prove that account is least-privilege non-admin.

Site Checks Phase 8 offline hardening is complete. Request budgets, 22-Equipment transaction
size, batching, paging, N+1 avoidance, silent-token coalescing, disabled-history
preservation, and absence of interactive authentication/DELETE paths are locally tested.
The new operations guide owns the single-session smoke test and non-destructive rollback.
Phase 8 remains In progress for target-environment and manual accessibility validation.
An existing authenticated Codex-browser session completed a no-write pass without another
sign-in prompt: disabled-Schedule dashboard exclusion, the Site Checks settings surface,
Operational/Site Check/All Jobs semantics, Scheduler type exclusion, and initial labelled
drawer focus were rendered successfully. The 390 CSS-pixel audit found document-level
horizontal overflow (444 pixels on Customer Dashboard and wider on Scheduler), but the
product owner confirmed mobile/narrow responsive layouts are not supported and this is not
a release blocker. Manual desktop Tab/Escape, screen-reader, and 200% zoom validation
remains open alongside the non-admin write/completion, maximum-Site, and rollback checks.
Authenticated desktop validation also found and fixed Site Settings focus return: Escape
closes the drawer and focus now returns to the exact invoking Site settings button. Focused
Customer Dashboard and Site Checks tests pass; manual Tab traversal, screen-reader reading
order, and desktop 200% zoom remain open.
The Site Checks tracker was reconciled with its status summary, the Customer Dashboard
architecture now records focus return, and the Unreleased changelog records the completed
subsystem work and remaining release gates.

Site Checks Phase 7 and the final Phase 4 navigation item are complete locally. Current,
post-start, completed, and permanent disabled-Schedule history access share an accessible
Site Check details drawer with Summary, Jobs & Equipment, and History tabs. History and
generated rows use continuation-safe 25-record pages; Job rows expand Equipment and current
technician without N+1 requests. Canonical Job and Equipment drawers retain the parent and
restore focus. Concurrent initial reads coalesce silent token acquisition, with no
interactive sign-in path.

Site Checks Phase 6 is complete locally. Both Jobs table and drawer operational-status
mutations now route generated Jobs through one Site Check completion service. It performs
authoritative parent/sibling reads, expected-count integrity validation, ETag concurrency,
atomic final Job/occurrence/Schedule rollover, NZ Date Only cadence calculation, and 412/retry
reconciliation. Reopening a completed generated Job now atomically clears its completion
date and reopens its parent occurrence without rolling back or changing the recurring
Schedule. Job Card Status remains independent.
Jobs and mounted dashboard projections refresh after mutations. Focused and full regression
tests, lint, and production build pass without live Dataverse access or sign-in prompts.

Site Checks Phase 5 is complete locally. Jobs now defaults to Operational, which excludes
Site Check Type; a dedicated Site Checks tab and explicitly unfiltered All jobs remain.
Versioned view/default migration maps legacy All to Operational while preserving existing
status, search, office/schedule, sort, reset, and sticky-column behavior. A shared Jobs-owned
Scheduler eligibility rule excludes Unconfirmed and Site Check Jobs from projection and
create/confirm/update mutations. Scheduler tabs omit Site Check, while historical erroneous
options remain stored, hidden, and counted for review. Focused tests, lint, and build pass.

Site Checks Phase 4 is complete locally. The canonical Job create mapping is reusable and
Site Check Job Type creation is protected from ordinary/WOF entry points. The atomic
creation service builds occurrence, ETag schedule lock, and all Equipment Jobs in one
Content-ID change set. The representative largest-Site fixture is 24 operations and 15,820
bytes, including inactive Equipment, with a conservative 4 MiB fail-before-request guard.
Authoritative preflight now reloads schedule, selected mechanic, and all Site Equipment with
one supplied silent token. Success and unknown outcomes reconcile request key, schedule
pointer, and exact Job count; retry never creates sequential partial records. Focused tests,
lint, and build pass. Due/Overdue Sites now open the Run Site Check drawer with Customer,
Site, cadence, required active technician, all Equipment/inactive labels, and Job count.
The drawer retains one UUID and start timestamp across retries and blocks double-clicks.
Replay avoids Equipment/mechanic reads and duplicate request-key lookups. Tests now cover
same-key replay, unknown outcomes, concurrent-manager pointer conflicts, inactive mechanics,
nested transaction failure, and partial-Job integrity mismatch. Confirmed success opens the
authoritative current-details view.

Site Checks Phase 3 Customer Dashboard status is complete locally. One customer-scoped,
focused Site Checks load now serves dashboard summaries and Site Settings without N+1 or
additional sign-in flows. Enabled Sites show compact status/progress; interactive Up to
date, Due, Overdue, and In progress counts filter, expand, announce, and focus the Sites
view. Disabled and invalid schedules are excluded from totals. Domain and accessibility
contract tests, the full suite, lint, and production build pass.

Site Checks Phase 2 Site Settings is implemented locally. The combined drawer now includes
independent enablement, frequency, and next-due editing; key-enforced creation; ETag updates;
authoritative refresh; and active-occurrence disable confirmation. Local tests, lint, and
build pass. Non-admin permission validation remains open.
The corrected cached read-only role audit completed without prompting or writes. Service
Operations is the only actively assigned unmanaged human role. The approved ten Site Check
grants were added and verified at organisation depth in one cached, no-prompt connection.
No destructive privilege or user assignment was added.

Site Checks Phase 1 is complete. Its foundations include verified Choice/type contracts, strict
Date Only cadence calculations, schedule validation/state, Job progress/integrity, and late
history rules. Focused Dataverse reads batch and deduplicate Site/occurrence scopes, while a
tested coordinator shares one silent token and coalesces concurrent identical loads.
The Site Checks hook resolves the active account, uses silent authentication only, rejects
stale results, and exposes explicit interaction-required state. Duplicate-active and
request-key replay validation is also implemented. The full regression suite, lint, and
production build pass.

The approved Site Checks Dataverse schema was provisioned and published on 26 July 2026
through one cached, no-prompt connection. Both tables, approved columns and relationships,
Job Type `122830004`, and alternate keys were created, and structural read-back verification
passed. A later single cached read-only verification confirmed both alternate keys Active.
The Service Operations role now has the verified non-destructive Site Check privileges.

The local expanded smoke test passed against Dataverse on Job 145408 with two Time & Travel
entries, three Job Materials, two downloadable Job Photos, Further Work, Safety Issue, and
one-time replay protection. Operational Job Status, Completed Date, Equipment relationship,
Equipment hour meter, maintenance, and assignments remained unchanged. The test identified
and fixed the required Dataverse change-set `Content-ID` headers.

## Next task

Chargeable Invoice Review Phase 2 is complete. On 11 August 2026 the explicitly approved six
user-owned tables, columns, Restrict relationships, three alternate keys and 5 MiB File column
were provisioned and published. The unassigned `Chargeable Invoice Manager` role was created
with the approved 30 organisation-depth Create/Read/Write/Append/Append To grants and no
Delete/Assign/Share grants; verification confirmed no user or team assignments. No business
rows were created and the organisation upload limit and `Service Operations` role were not
changed.

Phase 3 is complete locally, and the approved Review Import Status plus Document Upload
Status/Error columns are provisioned and verified. The next gated work is a de-identified
manager-role smoke covering new import, revised import, failure recovery and access denial
before enabling either release flag. Manager role assignments, deployment,
enabling File-write flags, server dependency/configuration changes and all real
communications retain separate explicit approval gates. The remaining Site Checks release
gates, production server-settings verification and Technician Job Card smoke test remain
separate outstanding release work.

Chargeable Invoice Review Phase 4 has started locally. The route now defaults to a bounded
Active-only review queue with derived New/In Progress/Waiting/Ready/History filters and search;
PDF intake remains an explicit sibling mode. An accessible focus-return workspace loads current
revision fields, lines, retained documents, corrections and append-only activity. Start Review
and Waiting changes use one ETag-protected Review + Activity change set. Staging/Failed imports
and operational Job mutations are excluded. Deliberate PO/photo decisions and explicit Ready to
Process / Do Not Process confirmations are also implemented under the same concurrency/audit
boundary; extracted Order No is never adopted automatically, Ready rechecks unresolved
corrections, and Do Not Process requires a reason. The Invoice tab loads the current Revision's
immutable source PDF only on deliberate request through delegated Dataverse access, validates its
byte count and revokes its local object URL when replaced or closed. The workspace now uses the
planned desktop split-screen: the source PDF remains visible in an independently scrolling left
pane while extracted fields, lines and correction controls remain visible on the right; narrower
screens collapse to the existing accessible tab sequence.
The workspace now also offers typed-confirmation permanent deletion. One bounded, ETag-guarded
Dataverse changeset disconnects the Restrict relationship cycles and deletes Activity, Correction,
Line, Revision, Document/File and Review in dependency order. Any nested failure rolls back the
whole operation; linked Job, Customer, Site, Equipment and Mechanic records are never included.
The source and documentation target six additional manager-role Delete grants, but no role,
metadata or live business data has been changed.
Correction-dialog inputs now capture their DOM values before invoking React functional state
updates. This fixes the requested-value crash that previously threw after `currentTarget` became
null and blanked the page; all header, story and line-correction fields share the safe updater.
Ready to Process now follows the approved correction-handoff rule: Outstanding/Not Made
corrections no longer disable Ready, a fresh bounded server read counts up to 200 instructions,
and the ETag-protected Ready Activity records that they were handed to Nargiza / Accounts. The
corrections remain structured and visible for processing and later revision comparison.
Chargeable Invoice intake navigation is simplified: the queue alone shows `Import PDFs`; intake
shows `Back`, relies on the empty-state `Choose PDFs` action, and reveals `Add PDFs` only after a
selection. Newly selected PDFs are checked automatically; the separate `Check PDFs` action was
removed. The non-persisting check and deliberate confirmed-import boundary remain unchanged.
After every selected PDF imports successfully, intake returns to the freshly mounted review queue.
If any selected import fails, the user remains in intake with the per-file safe error visible.
An unmatched intake row can now open the canonical Job-create drawer. Our Ref prefills Job Number;
the editable Job Description uses the concise final GreenTree headline segment (`Oil leak` for
invoice `144849`) rather than the Work Completed narrative. This invoice-recovery entry point now
defaults Status to Complete and prefills a meaningful extracted Order No (`4508217044` on invoice
`145156`) while dropping punctuation-only placeholders. Ordinary Job creation remains Unallocated.
Job Type, Customer, Site and optional Equipment remain
deliberate authoritative selections. Extracted fleet/serial first search the loaded Dataverse
Equipment projection; one exact compatible record automatically selects that Equipment and its
authoritative Customer/Site. Multiple or conflicting matches remain unselected. No exact identifier match
opens the shared new-Equipment panel with fleet, serial, make and model prefilled for explicit
creation. No Equipment is created silently. After Dataverse Job creation, intake reruns its existing exact
server lookup and binds the created Job; PDF import remains a separate confirmed action.
GreenTree layout parser v3 fixes the two-column equipment rows confirmed by invoice `144849`:
adjacent Service Meter Reading, Date of Job, Service Interval and Next Service Due labels now end
the Fleet, Make, Model and Serial values instead of being appended to them. Written dates such as
`02 July 2026` normalise to Dataverse date-only values. The parser also extracts the line directly
above Fleet No as the headline instead of the invoice table's Description column heading. The supplied PDF was read locally for this
regression; no invoice or Equipment record was created.
Structured correction storage remains compatible with supported header/story and line correction
types, while the manager workspace now focuses authoring on the two operational correction areas.
The workspace navigation is task-based: Amendments (default invoice evidence and corrections),
Requests (two compact PO/photo requirement decisions followed by the relevant technician-photo and
customer-PO email workflows),
Waiting (blocking party/note plus ready checks), and History. The former generic Summary tab and
duplicative Invoice label are removed. Waiting guidance gives concrete Sales trade-in,
technician-photo/date and customer-invoicing examples without persisting new schema.
The Amendments tab ends with an `Amendment handoff` built only from active Outstanding/Not Made
Corrections. It shows readable numbered actions for Nargiza, excludes Matched/Superseded history,
and can open or copy an email-ready greeting, invoice/Job context, active actions and revised pricing
totals. The email action deliberately leaves `To` blank for the manager to add, opens an editable
draft and never sends automatically. The explanatory email note is hidden when no handoff exists.
Its working order mirrors the invoice-review sequence: Work completed first, amended/removed source
lines by their immutable invoice sort order, then requested new lines by creation order. Any retained
legacy non-line correction follows those current amendment areas.
Nothing is sent automatically; full correction/activity history remains retained in History.
`Add amendment` expands an inline editor beneath the immutable original Work completed narrative;
`Amend line` inserts one compact editable table row beneath the selected source line, with Type,
Description, Qty, Rate, live Total and actions aligned horizontally; `Add new line` uses the same
row at the bottom of the table. Saved additions remain inside Invoice lines as green `New line`
rows with their requested type and status. A source row with an attached change correction remains
as immutable evidence above its replacement and is struck through. A removal instead transforms the
source into a single compact red row, avoiding duplicate evidence rows.
The table
now uses compact 30px controls and a 620px bounded layout that fits the normal full-window detail
pane. Its action column is pinned at the right edge whenever overflow remains, keeping Save/Cancel
visible without scrolling; narrow screens retain horizontal scrolling for the evidence columns.
The Invoice lines section now compares the immutable revision's extracted Subtotal, GST amount
(including the extracted rate in its label), and Total against live `After amendments` values.
Revision and adjusted-total displays label the final amount `Total (incl. GST)`, and the extracted
header uses the concise `Order number` label while retaining its evidence-only business semantics.
The domain calculation starts with source Subtotal, applies the latest active change/remove per
source line plus every active requested new line, reapplies the extracted GST rate and displays the
overall pricing delta. Missing quantity/rate inputs make the adjusted result explicitly unavailable
rather than misleading. Per-source-line edit actions use compact pencil icons with explicit tooltips
and accessible labels instead of repeated `Amend line` button text.
Correction editing uses a single-target pattern: the source row offers a pencil only until an active
amendment exists, after which the pencil moves onto that amendment. Work completed amendments and
requested new lines follow the same rule. Work completed amendments also expose the same restore
action as invoice-line amendments; cancelling one restores the immutable original narrative while
superseding the amendment for audit rather than deleting its history. Saving an edit atomically marks the prior Correction
Superseded under its ETag, creates one replacement retaining the immutable Revision/Line evidence,
and appends a `Correction changed` Activity bound to the replacement. Working views and amended
pricing use active Outstanding/Not Made records only, avoiding visible duplicates while retaining
Superseded audit history. Untouched source lines expose pencil and red trash-can actions; active
removal requests transform that source into one explicit red `Remove` row. Red trash
icons remove source/requested-new lines. A green curved restore icon on active amendments and
removal instructions explicitly cancels that instruction and restores the immutable source; its
accessible label and hover title state the result. Restore/withdraw operations ETag-check and supersede
the active Correction plus append Activity rather than deleting audit evidence, and adjusted totals
immediately return to the active working state. Highlighted active rows no longer repeat the
space-consuming `Outstanding` text; exceptional comparison states remain visible.
While an inline correction editor is open or a correction request is saving, Add new line and all
row actions remain rendered in their fixed positions but are disabled. This prevents competing
editors/duplicate requests without shifting table or section-header content.
Editing an existing Work completed or invoice-line amendment expands the editor after that exact
amendment rather than before it, so the clicked row and its icons remain anchored in place.
Inline editors and newly created amendment/add/remove rows use restrained 160–180ms fade/translate
entry motion. Withdrawing/restoring an active correction plays a 160ms exit before the Dataverse
request and disables all correction actions during that interval. `prefers-reduced-motion: reduce`
removes these animations.
Compact invoice-line editors use fixed 30px X and save-icon controls instead of text Cancel/Save
buttons, retaining explicit accessible labels and hover titles while reducing action-column pressure.
Red removal rows mirror the green New line presentation: `REMOVE` sits above the source line type,
and the removed source description, quantity, rate and total remain visible on that same source row.
The description, quantity and rate are crossed out in place. Total is rendered as a negative currency
amount, matching the domain calculation that subtracts the original extended price before GST.
Pricing change uses green for a positive delta, red for a negative delta, and neutral styling for zero.
Correction authoring no longer obscures
the side-by-side invoice in a modal. No-op line amendments are rejected. Correction creation,
an ETag-enforcing Review sentinel update and append-only Activity commit atomically. New corrections
begin Outstanding and remain attached when Ready hands the invoice to Accounts; they do not block
that terminal transition. Later revisions match a Work completed amendment when the revised Work
completed narrative contains the attached amendment without requiring replacement of the original.
The Chargeable Invoice review workspace now fills the available viewport beside the persistent main
menu, tracking its expanded (280px), collapsed (76px) and narrow open (220px) widths. The PDF/detail
two-pane layout therefore uses the full desktop working area; the existing accessible single-pane
responsive behavior remains below its practical content width. Other shared drawers are unchanged.
Phase 4 is complete locally.

The Amendments tab now includes a read-only `Related quotes` section for the matched Job. The review
loads at most 50 directly linked Quote headers, prioritises Accepted and Sent commercial context,
and shows status, revision, date, author, GST-inclusive total and the difference from the current
invoice. Quote notes and at most 200 ordered Quote Lines load only when expanded. The full Quote opens
in a new tab so invoice-review state remains intact. This reuses the existing Quote relationships,
types, status/category labels and line service; it adds no schema, Quote/Job mutation or readiness rule.
A Quote-read failure is contained in the panel and cannot make the invoice workspace unavailable.

The first Phase 5 slice is complete locally. Revised imports now re-evaluate at most 200 unresolved
Outstanding/Not Made Corrections on the server against the newly parsed immutable Revision. Exact
normalised header/story matching, stable source-line keys and unique structured added-line matches
avoid false positives. Revision/Lines, document activation, Review current revision, ETag-protected
Correction outcomes and a Revision Compared Activity commit atomically; unknown outcomes retain the
existing immutable Review/revision reconciliation. Matched rows identify their Revision, Not Made
rows remain unresolved for the next revision, and both states are visible in the workspace. No live
invoice was imported, no role was assigned, no release flag was enabled and no communication was sent.

The next Phase 5 slice is also complete locally. An opened workspace loads a bounded active
Mechanic list; deliberate technician selection, photo-request preparation and their Activities use
ETag-protected Review transitions. Prepare opens a validated editable `mailto:` draft and records
preparation only. Supporting-photo upload accepts at most 20 retained JPG/PNG/HEIC/HEIF files per
Review at 5 MiB each, verifies byte signatures and SHA-256 duplicates, stages Review Documents,
writes File bytes, then atomically completes the documents, records Photos Received and appends
Activity. Known failures retain safe Failed staging; uncertain finalisation reconciles without
automatic retry. Only Complete documents download. Focused tests cover mail composition, validation,
atomic finalisation and failed staging. No live file was uploaded and no email was sent.

Phase 5 is now complete locally. The workspace generates deterministic consolidated correction
instructions for clipboard copy or plain-text download from loaded immutable Review/Revision and
structured Correction evidence. Outstanding and Not Made items include explicit current/requested
header, story or line details; Matched and Superseded history is excluded. Malformed historic line
snapshots use a safe unavailable label. Generation creates no Dataverse mutation or Activity and
states that nothing was sent automatically. Focused tests cover filtering, evidence wording,
requested values, filename and workspace actions.

The Chargeable Invoice Review Phase 6 endpoint re-reads the current immutable
Review/Revision/Lines and active Corrections, rejects stale, terminal and non-PO states, applies
active Work completed and line amendments, recalculates pricing, and renders the familiar Liftrucks
approval layout with the prominent `PROVISIONAL QUOTATION` marker. The
versioned `pdf-lib` renderer produces
extractable A4 PDFs; a canonical SHA-256 snapshot hash reuses an existing matching Complete
document. New output stages as a Review Document and atomically completes with an Approval PDF
Generated Activity under the Review ETag. The workspace can generate and download the document.
De-identified extracted-text and visual render checks pass. No live document was generated, no
release flag was enabled and no deployment or communication occurred.

Chargeable Invoice Review Phase 6 is complete locally. The workspace loads a bounded Site Contact
list only for the Review Site, supports deliberate Site Contact or manual recipient entry, and gates
PO-request preparation on a current Complete Customer PO Approval PDF plus received supporting
photos when required. It saves those supporting documents for manual attachment before opening an
editable `mailto:` draft. The Review
ETag transition records preparation timestamp and safe Activity only; recipient/body are not
persisted and no email is sent. First confirmed PO receipt now records the dedicated PO Received
Activity as downstream Accounts state. Preparing a required PO request—not receiving the PO—is the
manager Ready prerequisite. No live data, files or communications were created.

The Requests workspace has since been simplified around the two real manager decisions: whether a
customer PO is required and whether supporting photos are required. PO receipt and photo progress
are no longer exposed as unrelated top-level inputs. Approval-document generation/download now sits
inside the Customer PO workflow, while received-photo upload remains inside Technician photos; the
separate generic Documents card is removed, and each workflow is hidden unless its requirement is
set to Yes. The photo recipient defaults from the matched Job's
primary active Mechanic, can be changed for the uncommon case where another technician completed
the work through the shared keyboard-accessible searchable selector. The assigned technician is
labelled in the results and remains separately visible beside the chosen request recipient, making
an override explicit. The assigned option is pinned first and uses the shared selector's optional
authoritative-option emphasis; all other technicians retain their loaded order. The selection is
persisted automatically when the manager opens the editable photo-request email or
uploads received photos. The PO flow continues to use Site Contacts or a manual fallback and makes
the missing customer-recipient configuration explicit. Browser `mailto:` drafts cannot attach files,
so the approval copy still requires deliberate download, attachment confirmation and sending by the
manager; no communication is automatic.
Requests uses a compact workflow layout: the assigned technician appears once in the selector,
assignment detail appears separately only for a genuine override, preparation/photo counts share a
single metadata row, and email/upload actions carry short inline explanations. Customer PO uses the
same compact metadata/action treatment and avoids repeating `Customer` inside its own section.
The compact layout retains moderate breathing room: status values use small neutral tiles and email,
document and photo-upload actions sit in lightly bordered groups rather than one compressed line.
The technician workflow is named `Photo evidence`; its selector and envelope action share one
explicit row labelled `Technician to email` and `Request photo evidence`. Preparation time and
received-photo counts are left to History/evidence rather than repeated in this task surface. Both
the UI introduction and editable email ask for clear images showing the reported
fault or damage and, where available, the completed repair.
The two requirement selectors capture their DOM value before entering React's functional state
updater. This prevents the cleared-event `currentTarget` crash that previously blanked the Requests
workspace when Customer PO required or Supporting photos required changed.
Both selectors now persist immediately on change and no longer require a separate Save action.
While the ETag-protected update is running both selectors are disabled; a failure restores the prior
choice and exposes the safe workspace error. New Review creation explicitly writes PO Required,
Photos Required and Photos Status as null, so absent future Customer defaults appear as `Choose`
rather than being inferred as Yes or No.
PO Required no longer means the manager waits for the customer PO. If it is Yes, readiness requires
the current customer PO-request draft to be prepared; PO Number and PO Received On are downstream
Accounts state and do not block Ready. The Ready confirmation states that Nargiza / Accounts owns
customer follow-up from that point. Adding Nargiza to CC remains blocked on an authoritative internal
email address/configuration source—the repository contains her name only, and no address is guessed.
Photo evidence now includes a compact preview strip. Newly selected JPG/PNG files receive local
thumbnails before upload; after Dataverse finalises the upload, Complete retained JPG/PNG Documents
load through the existing delegated, byte-count-checked document service and display as clickable
thumbnails. HEIC/HEIF use labelled file tiles where browser rendering is unavailable. Temporary
object URLs are revoked on selection/workspace cleanup, and the existing 20-photo bound is retained.
Retained photo thumbnails now have an explicit trash action and permanent-deletion confirmation.
The ETag-protected Dataverse changeset deletes only the selected Complete Supporting Photo
Document/File, updates Photos Status and writes a filename-free Manual Note Activity atomically.
One or more remaining photos keep Received; deleting the last returns the review to Requested when
its request was prepared (otherwise Not requested), so required evidence blocks Ready again.
Historical reviews and non-photo documents are rejected, and no Job Photo or linked operational
record is included. Runtime use still depends on the separately gated Document Delete role grant;
no role or Dataverse metadata was changed.
The Received photos heading also offers `Remove all` for an accidentally selected batch. One
confirmation shows the number of permanently deleted files; one bounded changeset ETag-checks every
retained photo, deletes the full set, resets Photos Status once and writes one aggregate Activity.
It does not loop through individual deletes with a stale Review ETag.

The Customer PO Approval workflow now creates a separate provisional document from the current
immutable GreenTree Revision plus active Work completed and line amendments. Changed, removed and
added lines are applied to a deterministic `liftrucks-manager-template-v8` snapshot and its Subtotal,
GST and GST-inclusive Total are recalculated. The generated PDF uses the product-owner-supplied
`invoice template.pdf` as its authoritative visual layout. Because that flat template retained hidden
text from its source invoice, the application asset is a sanitized raster of its visible appearance;
the remaining example headline is cleared and all current reviewed values are rendered into the intended
blank locations. This preserves the supplied rules, labels, spacing and bank details while preventing
old source values remaining as recoverable PDF text. The output is labelled `PROVISIONAL QUOTATION`;
its top-right document table intentionally omits the GreenTree Invoice No and retains Date, Page,
Our Ref/Job and Order No. It embeds the same Liftrucks JPG, 170-point width and top-left placement
used by the Requests-tab GreenTree evidence export; GreenTree remains the final tax-invoice authority
and its source PDF is not modified.
Generated approval text follows the measured GreenTree scale used by Quote approval PDFs: 10.92 pt
for header fields and totals, 12 pt for the Customer name, and 9.96 pt for narrative and ordinary
invoice-line content. Totals flow beneath the populated lines, while unusually dense line sets reduce
line text only as required to stay inside the template body.
After generation, the client validates and retains the completed Document returned by the authenticated
server while refreshing the remaining workspace. It no longer falsely reports failure when Dataverse's
immediate follow-up list query has not yet exposed the newly completed Document.
Local Vite approval middleware reloads its CommonJS approval service and renderer for each request;
client hot reloads can therefore no longer expect a newer template version than the cached local API.
GreenTree parser v4 now retains the complete two-column customer/account and Site postal blocks in
the immutable Revision snapshots. Approval template v8 renders those lines in their original party
box positions. Existing revisions recover the same blocks from their retained positional extraction
JSON, so they do not require re-import; linked Dataverse Customer and Site records remain unchanged.
Photo and PO request work can proceed with active amendments, but an approval copy
created before the latest correction activity is stale and must be regenerated.
The Amendment handoff now ends with a `Generate and save PDF` action that fills the approved
template directly from the current Revision and active amendments, then sends the PDF to the
browser's download/save workflow. A current generated document can also be downloaded again or
regenerated in place. The workspace selects only the current `liftrucks-manager-template-v8`
document, so an older unbranded approval PDF cannot be presented as the current amended invoice.
Generation requires a started active review but no longer
requires `PO Required = Yes`; the separate customer PO email workflow still retains that requirement
and all of its recipient, photo and preparation checks.
Customer PO reads as the actual manager task: choose the responsible customer/site recipient,
generate the current approval PDF, use one always-visible `Save supporting documents` action for it
and every required supporting photo, then open
an editable customer PO email and attach those files manually. Chrome/Edge opens the native folder
picker so the manager can create or choose a Windows folder; existing same-named files are preserved
with a numbered filename, and unsupported browsers fall back to their normal downloads.
The vague Prepared tile, generic
`Create invoice attachment` label, repeated per-file Download buttons and redundant attachment
checkbox are removed. Future authoritative
recipient defaults remain tracked separately; no recipient schema or automatic communication was added.

Chargeable Invoice Review Phase 7 now has an authoritative local operations baseline. V1 retains
immutable Complete evidence and recoverable Pending/Failed staging with no automatic cleanup;
Active evidence is removed only through the deliberate typed-confirmation whole-package action. The
operator checklist defines explicit role/deployment/flag gates, de-identified business and access
smoke tests, keyboard/screen-reader/zoom checks, bounded performance evidence, content-safe
monitoring and flags-first non-destructive rollback. Static release guards protect the disabled
defaults, least-privilege role, silent authentication, reusable accessible workspace and request/
file bounds. No role was assigned, flag changed, deployment performed, live row written or
communication sent.

Chargeable Invoice V1 no longer has malware-scanning integration or a readiness setting, by
explicit product-owner decision on 12 August 2026. Authenticated preview and Job lookup remain
available without a flag. Confirmed import and approval generation each retain their own disabled-
by-default server switch before creating or uploading Dataverse File evidence. Manager access,
strict file allowlists, bounded parsing/rendering, staged recovery and ETag protections remain;
none of those controls are represented as malware detection.

The Phase 7 release preflight reverified the live Dataverse metadata and role contract on
12 August 2026 through one explicitly approved interactive `Verify` session. All six tables,
staging fields, relationships, alternate keys, the 5 MiB File contract and all 30 organisation-
depth grants passed. That verification predates the approved deletion feature: the manager role
remains unassigned and still has no Delete, Assign or Share until the six new Delete grants receive
separate provisioning approval. No
schema, configuration, role assignment or business row was changed.

The local branch now contains an hour-meter evidence and usage-forecast workflow. Every completed
Job type contributes equally; ordinary readings are accepted by default, estimates are explicitly
marked, isolated suspect readings are ignored, and sustained lower readings form a confirmed reset
segment. Equipment Maintenance shows average daily/weekly/monthly usage, evidence signals, and a
confidence score. Completion can offer a clearly marked estimated value only when
`VITE_HOUR_METER_CLASSIFICATION_ENABLED=true`.

The gated completion option now explicitly reads “Technician did not record hours — estimate from
previous Jobs”. It enables only when usable previous completed Job evidence exists, populates a
read-only estimate, and states that the saved Job will remain labelled Estimated. If no previous Job
reading is available, the disabled control explains that an estimate cannot be generated rather than
using a misleading zero. This remains gated until the proposed Dataverse Choice and Date Only fields
are provisioned and verified.

The supporting Job Choice `gr_hourmeterreadingtype` and Date Only
`gr_hourmeterrecordeddate` were provisioned, published, and structurally verified in
`org0d4246d7.crm6.dynamics.com` / `ServiceOperationsNew` on 14 August 2026 through the approved
idempotent combined schema workflow. Exact Choice values Actual `122830000` and Estimated
`122830001`, optionality, local Choice ownership, and Date Only behavior were read back successfully.
The local development gate is enabled. No role was broadened, no business row was changed, and no
application deployment or real-Job completion smoke was performed.

A signed-in read-only local smoke on 14 August 2026 confirmed the general Breakdown completion
dialog renders the effective Job Number, linked Equipment, Job Type, current meter, required
completion meter, and update summary without overlap. The Equipment Manager then loaded all 358
current records with the classification gate disabled. No completion was submitted and no
Dataverse row was changed. Estimated-reading persistence remains intentionally unavailable until
the proposed Choice is provisioned and the gate is separately enabled.

The gated hour-meter schema and completion UI now also include a Job `gr_hourmeterrecordeddate`
Date Only value. Its initial value is the Job created date, not the office completion timestamp, and
the manager may correct it before completing. Forecasts sort by this date. Late-entered older readings
remain Job history but do not overwrite a newer Equipment current reading or newer Service Plan state.
Legacy/null rows continue to fall back to Job Completed Date. The columns are now provisioned and
the local development build includes them; deployed builds remain unchanged pending smoke testing.

Current-meter comparison is date-aware and completed Job evidence is authoritative. When usable
completed Job readings exist, the latest dated Job supplies the Last Known Hour Meter value and date
for the Maintenance display, completion comparisons, service-due calculations, and forecasts. The
Equipment current-meter snapshot is a fallback only when no completed Job reading exists. A stale
snapshot is not appended to forecast evidence, so it cannot make later valid Jobs appear anomalous;
one isolated suspect reading also does not cascade into the following reading.

Because Job completion supplies a Date Only value rather than an event timestamp, readings separated
by only a day may represent much less or more than 24 elapsed hours. They remain visible evidence, but
average usage and service-date projections now wait until accepted readings span at least seven
calendar days, preventing an ambiguous overnight pair from producing a misleading daily rate.
Both the average and its consistency score weight intervals by elapsed days, so a longer observation
period has proportionally more influence than a next-day reading.

Equipment Maintenance now keeps Average Machine Usage prominent immediately after Last Known Hour
Meter, then introduces a separate Service History and Due Dates section. The former Edit History
action is renamed Set Historical Baseline and explains that it is only a bridge for maintenance not
represented by Jobs, particularly newly entered Equipment. Its dialog is titled Historical Service
Baseline; when completed Job meter evidence exists, it states that the Job-authoritative current
meter will not be replaced and hides the fallback meter inputs.

New Job creation now rejects non-empty duplicate Job Numbers. The main Jobs drawer compares a
trimmed, case-normalized value against its loaded Jobs for immediate feedback, and the canonical
Dataverse create service performs an exact authenticated duplicate query before every Job POST so
WOF, Equipment, Customer Dashboard, Chargeable Invoice, and other shared-drawer entry points receive
the same protection. Query failure fails closed without creating a Job. No schema was changed; the
remaining exact-simultaneous-create race requires a separately approved Dataverse Job Number
alternate key and is recorded in the authoritative backlog.

The Equipment current-meter write also enforces that chronology using the latest completed Job date
when Job evidence exists, otherwise the re-read Equipment date. Standard and WOF completion paths
re-read the Equipment row immediately before PATCH, skip Equipment mutation for older-dated readings
while retaining them in Job history, and use the Equipment ETag with one safe retry. Service
completion retains the same Job-authoritative date rule inside its atomic transaction.

All shared Job completion dialogs now show a required Job Completion Date instead of silently using
the office submission timestamp. It defaults to the current New Zealand date, rejects future or
invalid dates, and persists to the existing Job Completed Date for Standard, Service, and WOF
completions. WOF additionally uses the selected completion date as its Inspection date while keeping
the WOF expiry and optional hour-meter reading date as separate business dates.

Equipment Job History cards now label their existing header date as the Job Created date and add
Completed Date and Hours Recorded fields. Incomplete or legacy Jobs show explicit Not completed or
Not recorded values, and estimated meter evidence remains visibly marked. Job descriptions now sit
beside the Job number, truncate with an ellipsis, and expose their full text on hover. The operational
Job Status badge is colour-coded with the established status palette; the neighbouring Job Type and
Job Card status badges remain neutral.
The linked-history deletion explanation has moved from persistent footer text to an accessible
hover/focus tooltip on the disabled Delete Equipment control, preventing footer overlap.

Shared Job completion dialogs now use a wider bounded desktop layout. Current hour-meter values and
their recorded dates render on separate lines, completion summaries span the full dialog in readable
columns, and both the WOF fields and summaries collapse to one column on narrow screens.

When the separate hour-meter reading-date schema is gated off, Job Completion Date now supplies the
effective reading date. A lower reading dated before the Equipment's current recorded date is saved
as historical Job evidence without showing a reset warning or replacing the current Equipment meter.
