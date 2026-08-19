# Changelog

## Unreleased

- Moved the accepted main Jobs and Equipment list values into the account-scoped Operational Data
  Client so mounted screens and route changes reuse and reconcile one in-memory result while
  preserving the existing generation-aware memory and IndexedDB stale-while-revalidate loaders.
- Added shared operational-list query keys and functional query-data updates so local Job/Equipment
  mutations are visible to every mounted consumer without waiting for another full cache commit.
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
