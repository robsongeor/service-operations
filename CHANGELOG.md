# Changelog

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
