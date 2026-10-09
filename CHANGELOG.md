# Changelog

## Unreleased

- Elevated Pubudu from Job Book Admin back to Office Admin in both Entra and Dataverse using
  replacement-first, exact before/after verification. Unrelated Dataverse roles and the existing
  legacy JobBookOnly application assignment were preserved.
- Added the Site's **GT Customer** to the Equipment register and search. Replaced its Customer filter
  with the shared searchable selector backed by a debounced, abortable, eight-result Dataverse
  search rather than rendering every Customer. Site filtering depends on first selecting a Customer,
  and the redundant State column and selector were removed while retaining the Equipment drawer's
  current-state indicator.
- Renamed the canonical Equipment drawer's **Primary Fleet Number** label to **GT Equipment No.**
  without changing the underlying Dataverse field, stored values, or alternate-number behaviour.
- Removed the direct Customer Dashboard **Add Site** action for now. Restored the canonical
  Site-level Equipment transfer drawer and connected its shared searchable selector to bounded
  Dataverse search, allowing existing Equipment from outside the selected Customer to be assigned
  to the destination Site without loading the full fleet or rewriting historical Jobs.
- Added an optional Site-level default GreenTree customer code/name, editable in the existing Site
  Settings drawer without changing operational Customer/Site/Equipment relationships. Added
  idempotent schema provisioning and an audit-first reviewed backfill; historical GreenTree Jobs and
  GreenTree itself remain unchanged.
- Added ad-hoc **Other supplier** assignment to the shared Job Book and Service Coordination Job
  drawers. Supplier details are stored separately from Staff, are mutually exclusive with the
  internal mechanic lookup, remain searchable/displayable, and do not create staff workload,
  technician email, Job Card assignment, or submission records. Added the matching guarded Job
  registration contract and documented the coordinated Dataverse/plugin/frontend rollout.
- Allowed every Job Book role, including Job Book Admin, to select the initial mechanic while
  creating or correcting an entry. Scheduling, technician email and operational-management
  permissions remain independently restricted.
- Restricted Job Book scheduling controls and schedule-option submission to operational users.
  Job Book Admin, Office Admin/Job Card Admin and Job Book Only users no longer see the Scheduling
  section or create schedules while adding a Job Book entry.
- Standardised the Equipment drawer Customer and Site selectors on the shared searchable dropdown.
  Customer selection now has the same arrow-key navigation, Enter selection, Escape handling,
  loading/error presentation and menu behaviour while retaining Customer/Site creation.
- Removed the obsolete **Manage job** split from Service Coordination. Every non-Void Dataverse Job
  is now treated as operational there, every type tab opens the canonical operational Job editor,
  and the Operational tab no longer depends on the migration-era coordinator-membership flag.
- Fixed the restricted Job Book correction drawer so its shared intake
  layout, spacing, metadata row, and field sizing no longer depend on first visiting Job Book.
- Added a bounded server-side retry of submitted Job Card status transitions to the existing
  15-minute GreenTree scheduler, allowing eligible Allocated Jobs to recover into Completion Review
  after a transient submission-time failure without requiring the technician to submit again. The
  Job Card retry still runs when the independent GreenTree poll is skipped by its API cooldown.
- Automated the operational Job lifecycle around technician dispatch and Job Cards. Successful
  dispatch keeps moving only Unallocated Jobs to Allocated; an Allocated Job now moves to Completion
  Review only after every current non-withdrawn technician assignment has submitted its Job Card;
  and GreenTree closure remains the sole automatic route to Complete. Renamed the existing
  Waiting-for-parts status in the UI to **Action Required** without changing its Dataverse value.
- Reused the Job Book intake drawer for editing existing Intake entries, with read-only Job Number,
  entry date, and regional ownership plus ETag-protected Dataverse updates. Job Book-only users keep
  a locked `Managed Job` status after promotion, while Full Access users retain `Open Job` routing
  into the canonical operational Job editor.
- Added an explicit **Equipment not known yet** choice to Legacy Job Book intake. It permits an
  entry to be allocated while flagging Equipment review, preserves manually selected Customer/Site
  context, and is cleared automatically when known Equipment is selected.
- Fixed the Legacy Job Book Customer control so selecting Equipment with a known linked Customer
  immediately displays that Customer as well as populating its Site and address.
- Fixed the Auckland Legacy Job Book returning zero rows after regional-book support was added.
  Auckland now uses a reliable bounded numbered-Job query and applies its exact numeric series
  classification client-side; WJ, HJ, CJ, and unclassified values remain excluded from Auckland.
- Added separate, independently paged Auckland, Waikato, Hastings, and Christchurch Job Book
  registers backed by configurable Dataverse tables and independent AutoNumber formats. Regional
  views and allocation have separate disabled-by-default release gates, and the reusable schema
  utility now separates safe provisioning from migration-derived cutover seeding. Provisioned and
  published the three regional production schemas and granted both application roles their required
  table privileges; all three alternate keys verify Active, while the tables remain empty, unseeded,
  and hidden pending source spreadsheet migration.
- Enabled Legacy Job Book Contact selection using the same shared Customer, Site, and Site Contact
  controls as Create Job. Provisioned and published `gr_jobbookentry.gr_Contact`, granted the Job
  Book Only role the three required Contact-related privileges, and enabled local and Azure builds.
- Allowed saved Quotes to generate provisional quotation PDFs without a numbered linked Job. The
  persisted Quote number becomes the document number and Our Ref remains blank, avoiding placeholder
  Job numbers while preserving the existing numbered-Job output when authoritative Job context exists.
- Stabilized Customer Dashboard Job-child query identities so unchanged renders no longer repeat
  Schedule Option and Office Update cache/deduplication work, and routed full Equipment register
  loading through the shared operational request while retaining its existing IndexedDB
  stale-while-revalidate behaviour. The development diagnostics report can now attribute the
  previously opaque Equipment cold-start delay.
- Added a development-only Data diagnostics panel for signed-in loading baselines. It combines the
  existing privacy-safe query-family request/cache/deduplication/outcome/duration/payload metrics
  with route-to-useful-content timings for Jobs, Customer Dashboard, Equipment, Scheduling, and
  WOF, supports reset and copyable de-identified JSON, and does not change production data or APIs.
- Completed the remaining `useJobs()` broad-read audit. Linked WOF Job editing now hydrates one exact
  Job plus Job-filtered Office Updates and supplied Schedule Options, while Chargeable Invoice Job
  creation uses an empty scoped shell instead of starting global operational collections.
- Replaced whole-register Job-completion refreshes with bounded authoritative reconciliation of the
  completed Job, linked Equipment, that Equipment's full Job history, and its focused Service Plans;
  mounted global/scoped rows are patched from those results and failure recovery uses the same scope.
- Migrated Job Book Legacy to progressive relationship loading. Its Job/Equipment shell no longer
  waits for Staff, mechanic pickers reuse the shared account-scoped Staff directory, Customer
  selectors use debounced abortable bounded searches, and the add-machine dialog loads only the
  selected Customer's Sites with independent retry states.
- Split Quote Pricing and Staff support into independent shared queries. Pricing Catalogue and Quote
  editors now reuse one cancellable catalogue value, Quotes reuse the account-scoped Staff directory,
  and Staff failures block only PO-email recipient routing with a scoped retry rather than blocking
  the editor.
- Made canonical Job creation progressive across Jobs, Equipment Manager, Customer Dashboard, and
  Chargeable Invoice Review. Drawers now render supplied defaults immediately, reuse the shared Staff
  directory, and hydrate exact Equipment/maintenance, Customer Sites, and Site Contacts through
  cancellable dependency-specific loading and retry boundaries instead of a broad preload gate.
- Made the Staff directory progressive: people render without waiting for every Job or
  qualification type, open-Job counts use a lightweight allocation projection, and only the
  selected Staff member's active tab loads detailed Jobs. Qualifications and their failures are
  independent; Staff and Job mutations now refresh only the affected shared keys.
- Decoupled Equipment Manager first render from complete Customer, Site, and Equipment Service Plan
  directories. Register filters now derive from expanded Equipment relationships, maintenance
  summaries load through a shared visible-page query with explicit loading/failure states, and the
  canonical drawer uses bounded Customer search plus selected-Customer Sites. Equipment Map retains
  its required Site directory without loading plans, while CSV import loads full references only on
  demand.
- Replaced Quote editor full Job, Customer, and Equipment directory downloads with abortable,
  debounced `$top=8` Dataverse searches and exact linked-record hydration.
- Migrated the standalone Quote register to a continuation-safe account-scoped query, made editor
  support progressive, and changed cross-screen editing to fetch one exact Quote plus bounded lines.
  Quote create/update/delete now reconcile shared register/focused keys immediately and publish a
  content-free same-scope tab invalidation; dependent Job/Equipment events and recovery refresh
  observed Quote projections.
- Replaced WOF route startup reads of global Jobs and editor-only Customer, Site, Site Contact,
  Staff, Provider, Qualification, and Equipment Service Plan collections with progressive loading.
  Inspection history and referenced-Job Schedule Options now use shared bounded query keys;
  Inspection reads follow all Dataverse continuation pages, accept cancellation, and reconcile on
  related mutations, Job/Equipment events, reconnect, and visibility recovery. WOF editors and Job
  creation load only the directories and selected relationships they need.
- Opened the Job drawer Scheduling section by default so its saved visit or add-schedule form is
  available immediately.
- Added a lazy, reusable Quote editor overlay for Jobs, Customer Dashboard, Scheduler, WOF, and
  Chargeable Invoice Review, preserving the underlying screen instead of navigating to Quotes.
- Retained the compact Quote-line column header and truncated oversized Quote-register and selected
  Job values with an ellipsis while retaining the full hover title.
- Expanded the Quote title across the remaining desktop editor row beside Author.
- Added confirmed permanent Pricing Item deletion with visible Dataverse relationship/permission
  failure handling.
- Removed implicit full Schedule Option and Office Update reads from scoped Jobs consumers.
  Customer Dashboard now filters both collections to its selected Customer's Jobs, and Scheduler
  filters Office Updates to the Jobs referenced by the visible week.
- Moved the accepted main Jobs and Equipment list values into the account-scoped Operational Data
  Client so mounted screens and route changes reuse and reconcile one in-memory result while
  preserving the existing generation-aware memory and IndexedDB stale-while-revalidate loaders.
- Added shared operational-list query keys and functional query-data updates so local Job/Equipment
  mutations are visible to every mounted consumer without waiting for another full cache commit.
- Replaced Job drawer full Quote and Assignment reads with independent, shared per-Job queries that
  start on their respective tabs, enforce 50-row safety bounds, and refresh Assignments after focused
  mutations. Customer Dashboard Quotes now load only for the selected Customer when that tab opens.
- Made Equipment drawers render the selected editable Equipment core immediately, load only the
  focused Equipment's Service Plans when Maintenance opens, and reuse the shared focused Job history
  for usage evidence and History across Equipment Manager, Customer Dashboard, and WOF.
- Made canonical Job edit drawers open immediately from their selected summary, refresh the exact
  Job independently, load relationship/service-plan and Quote/assignment data behind separate
  boundaries, and defer Job Card children and photos until the Job Card tab is selected. Scoped
  errors no longer blank or unnecessarily block unrelated drawer sections.
- Shared focused Job core and Job Card metadata across drawer entry points with bounded cache
  lifetimes and mutation/realtime reconciliation. Job Card detail now loads photo metadata first and
  downloads only the individual full photo that an operator opens.
- Replaced Customer Dashboard's global Jobs and Equipment startup reads with progressive
  selected-Customer Sites, Equipment, Jobs, and Service Plan queries using bounded Dataverse
  filters, shared cache lifetimes, and mutation/realtime invalidation.
- Preserved moved-Equipment completion correctness by loading the focused Equipment's full linked
  Job history and service plans before hour-meter and maintenance calculations.
- Added privacy-safe in-memory Operational Data Client metrics for cache use, deduplicated requests,
  request outcome/duration, and estimated payload size without retaining business identifiers.
- Replaced Scheduler's global Jobs and Schedule Option startup reads with shared seven-day window
  queries, batched referenced-Job loading, adjacent-week prefetch, and bounded mutation/Job-realtime
  reconciliation while preserving the canonical progressive Job drawer.
- Replaced Job Map's global Jobs and Sites startup reads with a continuation-safe minimal
  status/location projection, exact status-set query keys, reusable cached subsets, and bounded
  mutation/Job-realtime reconciliation while preserving map filters, selection, and navigation.
- Replaced route-local Job, Equipment, Job Map, and Staff SignalR connections with one authenticated
  app-shell dispatcher. Bounded events now invalidate focused records immediately, coalesce affected
  shared query refreshes after bursts, and reconcile observed Job/Equipment and Staff data after
  reconnect or visibility return without polling.
- Added an account/environment-scoped `BroadcastChannel` invalidation path. Successful local Job or
  Equipment mutations now mark matching queries and disposable list snapshots stale in other open
  tabs without sharing record IDs, business content, access tokens, or creating an offline write
  queue; received invalidations are coalesced and never rebroadcast.
- Made Job Card review details full-width on desktop, with a three-column context summary,
  horizontal actions and side-by-side story/evidence panels. Compact photo thumbnails retain the
  complete image; long submissions remain fully readable without nested scrolling or truncation.

- Added an opt-in localhost read-only Job Card proxy using existing delegated authentication,
  explicit live-data notice, blocked review/email writes and private bounded evidence downloads.
  Azure credentials and production configuration remain unchanged.

- Added a desktop Jobs-style pending Job Card review table with shared toolbar/filter/sort
  components used by both screens, saved Equipment/Customer/work details, searchable Customer/
  Technician filters, Job types and reported-attention filters. Review navigation preserves filters;
  bounded queue results and failures are explicit.

- Redesigned Job Card review details around Job number, Equipment/Customer/contact/address, and a
  clearer story section with a prominent submitted hour meter, further work and safety issues.
  Added an all-original-photos ZIP save prompt and read-only associated Quotes within the same screen.

- Added a paginated PDF export of saved Azure Job Card evidence and deferred historical Dataverse
  evidence/photo loading until explicitly opened. Archive errors stay visible and block assignment
  removal; Site Check loading and historical records remain intact.

- Retired legacy Job Card status controls and email lockouts for ordinary Jobs, added private
  per-Job Azure history/review links, and kept old evidence in a labelled read-only history section.
  Ordinary dispatch no longer updates legacy Card Status; Site Check behaviour is retained.

- Moved job-level technician links and submitted evidence to private Azure Table/Blob
  storage, with immutable Job snapshots, replay-safe submission, bounded photo uploads,
  and no anonymous Dataverse access or operational Job updates.
- Added authenticated Job Card Reviews, private photo access, explicit office review,
  and Azure email notifications with retry. Existing Site Check storage remains unchanged.
- Added reproducible Azure resource/configuration templates, deployment documentation,
  concurrency/security tests, and an opt-in local Azurite adapter contract test.

## v1.7.0 — 15 August 2026

- Added an Equipment Map that groups Equipment at their assigned Site address, clusters dense
  locations, and opens Site and Equipment information in a closable map panel through a
  server-only geocoding boundary.
- Preserved the selected Customer Dashboard context while navigating between screens and focused
  Customer search when the screen opens without a selection.
- Added searchable Customer selection and inline Customer/Site creation to the Equipment drawer.
- Required linked Equipment and an hour-meter reading when completing every Job type, with an
  explicit Job Completion Date and date-aware protection for late-entered historical readings.
- Added clearly labelled estimated readings when technicians did not record hours and sufficient
  previous Job evidence exists, while keeping the production classification flag gated.
- Added Equipment machine-usage forecasts with weighted evidence, confidence scoring, anomaly and
  meter-reset handling, and usage-adjusted service intervals that can shorten but never extend the
  selected maintenance profile.
- Simplified Equipment maintenance summaries around effective A/B/C intervals, last completed
  dates, linked Job hours, and next-due dates, with supporting calculations available on expansion.
- Added completed dates, recorded hours, descriptions, and colour-coded status to Equipment Job
  History, plus a sortable linked-Job count on the Equipment table.
- Prevented duplicate non-empty Job Numbers through immediate drawer validation and the canonical
  Dataverse create service; an alternate key remains the separate concurrency-hardening backlog item.
- Improved Job completion dialog responsiveness, Job-number visibility, inline maintenance setup,
  WOF completion consistency, and chronology-aware current-meter updates.

## v1.6.0 — 13 August 2026

- Added inline PO Contact creation to Customer-default and Site-override recipient settings, with
  Main customer ownership by default, optional location-specific Site ownership, required name/email
  validation, and immediate Primary or CC selection before routing save.

- Added a saved-Quote action that generates and downloads a Liftrucks-branded customer PO-request
  invoice from the current editor lines, recalculated totals, linked context, and Notes as Work
  Completed, without sending communications or changing workflow state.
- Aligned generated Quote invoice typography with the measured GreenTree source sizes and made
  subtotal, GST, and total flow directly beneath the populated invoice lines.

- Kept API-only Chargeable Invoice PDF packages out of Vite's production config-load path so the
  Azure root build and managed Functions dependency builds remain correctly separated.
- Pinned the server PDF parser to audited `pdfjs-dist@5.4.624`, compatible with the deployed
  Azure Functions Node 20.20 runtime.
- Removed the Chargeable Invoice malware-readiness setting and gate by explicit product decision;
  import and approval retain independent disabled-by-default server switches and file validation.
- Allowed authenticated, bounded Chargeable Invoice PDF preview and Job lookup before File-upload
  readiness while keeping confirmed import and approval generation fail-closed.
- Added the Chargeable Invoice Review release operations contract with no-cleanup V1 retention,
  de-identified access/business/accessibility/performance smoke tests, safe monitoring,
  non-destructive rollback and executable disabled-flag/least-privilege/bounded-request guards.
- Added the cross-customer Site Checks workspace with a Needs Attention queue, interactive
  state totals, combined filters, direct Start/Open/History actions, and canonical record
  navigation without loading the global Jobs or Equipment collections.

### Site Checks

- Added optional per-Site weekly, fortnightly, or monthly Site Check schedules in the
  combined Site Settings drawer, with customer and Site dashboard status summaries.
- Added atomic, replay-safe Site Check creation that produces one protected Site Check Job
  per Site Equipment record and initially assigns every generated Job to one technician.
- Added operational progress and atomic final-Job rollover while keeping Job Status
  independent from Job Card Status.
- Added dedicated Site Check Jobs filtering, Operational-default exclusion, Scheduler
  exclusion, current details, permanent history, and canonical Job/Equipment navigation.
- Provisioned and verified the Site Check Dataverse schema, alternate keys, Choice value,
  relationships, and least-privilege Service Operations role grants.
- Added silent-token request coalescing, bounded paging, concurrency safeguards,
  non-destructive rollback guidance, and desktop drawer focus restoration.
- Added explicit Customer-owned/Liftrucks-rental Equipment classification and per-Site
  Site Check Equipment scope, including authoritative rental-only exclusion of
  Customer-owned and Not classified Equipment.
- Added per-Site Manual Selection scope with the shared searchable multi-select, atomic
  Schedule/selection persistence, current-Site enforcement, and replay-safe authoritative
  filtering. Newly assigned Equipment is not selected automatically and transferred-away
  Equipment cannot generate Site Check Jobs.
- Added temporary Site Check Equipment availability for enabled Sites. In Workshop and
  Temporarily Off-site machines are excluded from the current occurrence, recorded with an
  immutable reason snapshot, and reconsidered at the next normal occurrence without catch-up
  Jobs.
- Target-smoked temporary availability on Can Park Auckland: two Jobs and one In Workshop
  exclusion were created, displayed, and atomically removed without another sign-in prompt.
- Consolidated the Site header's current Site Check and history actions into one
  context-aware button backed by the existing details drawer.
- Streamlined Site Check creation into one review drawer with inline persistent Equipment
  availability, collapsed included machines, prominent exceptions, atomic creation, and
  direct post-create access to Job Book allocation.
- Target verification saved and reloaded a Weekly Manual Selection Schedule for Air New
  Zealand / Can Park Auckland with FN1579 only; the Run preview correctly showed one
  included Equipment and two excluded without creating an occurrence or Jobs.
- Added a headerless Excel Job Book export for generated Site Check Jobs and an atomic,
  order-preserving paste-back workflow for allocated numeric Job numbers.
- Generated Site Check Job descriptions now identify the Schedule frequency and Monday
  start date of the occurrence week.
- Added an explicitly confirmed, atomic in-app action for deleting one Site Check occurrence
  and all generated Jobs while preserving its Schedule and Equipment selection settings.
- Disabled Site Check schedules no longer render Site Check status or actions in Site
  headers; their stored history remains unchanged.

### Remaining validation

- Assigned non-admin settings/create/completion smoke testing, maximum-Site runtime
  observation, manual desktop accessibility, historical disable/re-enable review, and
  deployment rollback review remain release gates.

## v1.3.0 — 25 July 2026

### Major Features

- Added secure Technician Job Card submissions with expiring one-time links, public
  mobile-first entry, time and travel, Job Materials, Further Work, Safety Issues, generic
  Job Photos, read-only manager review, and replay protection.
- Reorganised project documentation into a modular architecture knowledge base with a
  standard Codex pre-prompt and subsystem-specific reading routes.

- Added multi-machine Equipment transfers to Customer Dashboard Sites with searchable
  cross-customer multi-selection, a persistent removable selection summary, explicit
  confirmation, partial-failure reporting, and safe retries that preserve historical Job
  locations.
- Turned WOF / REGO into an operational WOF Management queue with lifecycle statuses,
  contextual Job actions, in-place shared Job creation and editing drawers, scheduling
  visibility, office expiry administration, and active-Job duplicate protection.
- Added configurable Equipment Maintenance Profiles and ICE, Electric, and Custom Service Programmes with fixed hour intervals, shared time intervals, programme-aware due calculations and completion cascades, Electric A/C scheduling, and preserved historical B records.
- Added Equipment Road Compliance Management with Road Registered, Deregistered, and Off Road states; protected deregistration; guided re-registration; operational WOF filtering; and Road Registered-only dashboard WOF summaries.
- Added the protected WOF / REGO workflow, including WOF Jobs and Inspection records, internal qualification filtering, external providers, editing, operational due-state views, and protected orphan-Inspection cleanup.
- Added a shared Job Completion framework with a dedicated Service workflow for immutable completion hour readings, Equipment hour updates, maintenance-plan progression, validation, and large-increase confirmation.
- Added Customer Dashboard Site bulk Equipment import with immutable Customer/Site context, TSV review, date-only normalization, explicit duplicate overrides, per-row selection, sequential creation, and retry protection.
- Added the global Unconfirmed Job status with a dedicated Jobs tab, persisted default-view support, status styling, and allocation/Scheduling protection.
- Added technician qualification summaries and create, edit, and deactivate management from the Mechanics page.

### Improvements

- Provisioned the Equipment Compliance Status Choice and safely backfilled all 189 existing Equipment records (24 Road Registered, 165 Off Road) with no ambiguous records.
- Made WOF table Equipment values open the shared authoritative Equipment drawer and added the confirmed `gr_regoexpiry` field to shared editing, display, and persistent sorting.
- Added accessible collapsible Customer Dashboard Site sections with smart defaults, per-Customer/Site state, and Expand All/Collapse All controls.
- Improved shared Equipment creation with REGO/WOF normalization, searchable Customer-filtered Sites, Customer Dashboard Site actions, and date-only WOF expiry persistence.
- Opened Customer Dashboard Add Site directly on the reusable Customer drawer Sites tab and persisted new and edited Sites to Dataverse without changing their Customer relationship.
- Added Registration and current WOF Expiry to Customer Dashboard Site Equipment tables.
- Replaced the Customer Dashboard's separate search and customer controls with the shared searchable selector.
- Split Quote relationships into Equipment, Job, Customer, and Author columns and added immutable Author visibility to the Quote editor.
- Added an account-scoped Jobs "Freeze columns through" preference with shared calculated sticky-column offsets.
- Added WOF Customer and expiry sorting, shared inline Equipment creation, and account-scoped Due Soon settings.

### Bug Fixes

- Fixed cumulative maintenance completion so higher-level Services atomically reset every
  satisfied active plan and stale lower-level due or overdue state is cleared.
- Replaced separate Service completion writes with one authoritative Dataverse `$batch` change set so Job, Equipment, and service-plan updates commit atomically with ETag concurrency protection and idempotent retry checks.
- Fixed Edit WOF cleanup by loading the authoritative Inspection detail and allowing only planned Inspection records with no linked Job or compliance outcome to be deleted.
- Fixed shared Equipment edit initialization so Current WOF Expiry remains visible and is preserved when Equipment is edited from Customer Dashboard Sites.
- Fixed create-Equipment WOF auto-enabling so controlled Registration value changes are handled consistently.
- Standardized production Dataverse hooks on the active MSAL account instead of cached-account array order.
- Removed unfinished Job API Test and non-routed Settings entries from production navigation.

### Security

- Secured the server-held Lift Trucks Job lookup proxy by requiring a Dataverse bearer token and validating it through `WhoAmI` before reading credentials or calling the upstream service.
- Replaced raw upstream error forwarding with non-sensitive proxy errors and added automated anonymous, invalid-token, authenticated, configuration, and upstream-error tests.

### Known Limitations
- Customer creation and Customer-level information remain local prototypes; only existing and new Site name/address changes are persisted from the Customer drawer.
- Passing a WOF does not yet update Equipment Current WOF Expiry or Last WOF Completed because the cross-record completion workflow is not transactionally safe.
- Multi-record Dataverse workflows outside Service Job completion can partially succeed when a later request fails and require live failure-path testing and operational recovery guidance.
- Bulk Equipment Import authorization is a client-side email restriction only and must not be treated as a Dataverse security boundary.
- Automated unit, integration, and end-to-end regression tests are not yet established.
