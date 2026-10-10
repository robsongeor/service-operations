# Job Book Intake safety model

## Scope and current-state correction — 10 October 2026

This document preserves the historical Intake safety model and staged unified-workflow design.
Descriptions below of “local only”, “unregistered”, “not provisioned” or “flag off” belong to those
dated stages; they are **not current V2 deployment instructions**. V2 now builds unified registration
and workflow enabled and plugin/role provisioning is recorded. Number-invariant activation,
regional migration and named-user acceptance remain separate gates.

Use [Jobs architecture](../architecture/jobs.md) for the current intended lifecycle,
[current state](../../CURRENT_STATE.md) for build/deployment evidence, and the
[application audit](../reviews/2026-10-10-application-audit.md) for known implementation gaps.
Do not disable current safeguards or provision historical missing items merely to match this plan.

## Historical Intake/managed split

The following sections describe the earlier Intake/managed split. The
[unified workflow decision](#unified-workflow-decision-3-october-2026) supersedes that product model
for enabled V2 paths. Existing records must not be treated as migrated merely because screen labels
or build flags changed.

Job Book entries are not Jobs. They are intake/number-ledger records that may later create one managed `gr_job` record.

This prevents incomplete daily Job Book entries from appearing in Breakdown, Service, Workshop, WOF, or Site Check workflows. There is no `Unset` Job Type. A Job Type is selected deliberately during promotion.

Regional allocation is described in [`REGIONAL_JOB_BOOKS.md`](REGIONAL_JOB_BOOKS.md). Auckland,
Waikato, Hastings, and Christchurch use separate Intake tables and AutoNumber sequences while
sharing this screen and data contract.

## Record lifecycle

1. **Intake** — a number has been allocated and the incoming work is recorded. It can be corrected by admins but is excluded from managed Job workflows.
2. **Promoted** — one `gr_job` has been created and linked. The Intake record becomes historical/read-only except for separately approved administration fields.
3. **Legacy** — imported historical ledger data that is not expected to become a managed Job.
4. **Void** — an allocated number that must not be reused. The record and reason remain auditable.

### Mark as void (implemented locally)

Job Book users, including restricted Admin/Intake users, may mark only a saved, unpromoted
Intake entry as Void. **Either GT Entry or Timecloud Entry being ticked blocks the action**;
the user must handle cancellation in the owning system. Promoted/managed Jobs, linked Intake
records and imported Legacy rows are not eligible. This is not an operational Job cancellation.

The row action opens the shared `EditDrawerFormDialog` through `JobBookVoidDialog`. It shows
the Job number, Customer and original description and requires a non-blank reason (at most
1,000 characters, matching `gr_voidreason`). A duplicate should name the original Job, e.g.
`Duplicate of Job 123456`. Cancel/Escape makes no change. There is no restore action in V1.

`jobBookEntryWorkflow.ts` owns eligibility, required-reason and read-only presentation rules.
`useJobBookVoid` owns confirmation/save/recovery state; `jobBookApi.ts` owns persistence.
Before a mutation, the service reads the exact regional record without cache and checks the
displayed ETag and authoritative eligibility. Voiding PATCHes only `gr_stage=122830003` and
trimmed `gr_voidreason`, with the original `If-Match` ETag. A concurrent tick, edit or promotion
therefore fails rather than being overwritten. Conflict recovery reloads that one record,
preserves the typed reason and requires explicit confirmation again if still eligible.

The number, snapshots, description, relationships and both factual markers are retained. The
row stays visible with a VOID badge and reason, read-only markers, and no Edit/Manage/Open Job
action. Older Void records without a reason display an explicit historical missing-reason
message; neither their reasons nor their marker history is invented or cleared. Search includes
stage and reason. Number allocation still belongs solely to Dataverse; nothing is deleted or reused.

Ordinary edit saves no longer write `gr_stage`; only creation sets Intake. Marker saves use a
separate single-column PATCH, so permitted historical/promoted marker updates do not reset the
stage. All Intake mutation services recheck the saved record and ETag and reject Void records.
JobBookOnly cannot change linked/promoted managed-Job markers; JobCardAdmin can update these
factual administrative markers under the 3 October corrections decision. The same implementation
uses all four regional table configurations without adding tables, columns or permissions.

These are application workflow/concurrency checks over delegated Dataverse access, not a new
server-side authorization boundary for arbitrary external Dataverse clients. Existing role and
deployment approval gates remain; no live business data, roles or settings were changed. The
existing Dataverse platform owns modification metadata; no separate immutable Void audit-log
schema is introduced by this change.

The Job Book Legacy view now reads Intake and managed Job rows from Dataverse. New Intake entries and subsequent row edits are saved directly to Dataverse; obsolete browser-only draft rows and overrides are no longer loaded or written.

Clicking an Intake row's orange **Equipment not configured** tile opens the same **Edit entry**
drawer, prefilled with the complete saved entry and its existing Job number. Equipment selection,
inline machine details, Customer/Site/Contact and the final **Save changes** all use that drawer.
Cancel discards the draft without changing the saved entry. The old standalone machine dialog
and two-step inline row editor have been removed. Non-Intake records do not expose this shortcut;
managed Jobs continue through their existing permission-gated **Open Job** route.

The shared Equipment selector receives a display-only fallback from the entry's saved Fleet,
Serial, Make and Model. This restores the selected tile when reopening snapshot-only equipment
(no master lookup), or a linked machine absent from the loaded directory. The fallback keeps the
original Equipment ID, including an empty ID; it never matches a machine by label, creates a
master link, enters the search results, or replaces saved Customer/Site/Contact. Change still
opens the replacement search and dismissal restores the saved tile.

Opening an existing entry with saved Customer and Site displays the same `JobLocationSummary` tile
as New entry, with Customer/Site fields hidden until **Edit** is chosen, including when Equipment
is unknown or not configured. Snapshot-only Customer/Site names also qualify without master lookups.
The tile uses the entry draft's
saved Customer/Site/address, not a fresh Equipment-location read, and Contact remains available
when Customer and Site are selected.
Entries missing Customer or Site still expose the relationship fields. Changing Equipment or reopening
an entry resets the explicit-edit choice. Site choices load only when the selectors are needed.
Location corrections in an existing entry remain draft-only until **Save changes**; they do not
implicitly move Equipment or rewrite another historical Job.

The register loads managed Jobs and Intake entries in independent 100-record pages ordered by Job
Number. It follows only trusted Dataverse continuation links and requests the next pages when the
user nears the bottom of the loaded register. Active client filters pause automatic paging so an
empty filtered result cannot pull the entire history into memory; the user can explicitly load more
history to continue searching.

## Provisioned Dataverse table

The organization-owned `gr_jobbookentry` / `gr_jobbookentries` table was provisioned, published, and verified in `ServiceOperationsNew` on 16 August 2026 with:

- `gr_jobbookentryid` — primary key
- `gr_jobnumber` — required AutoNumber primary name using `{SEQNUM:6}`; alternate key `gr_jobbookentry_jobnumber_key` is Active
- `gr_entrydate` — required date/time, server assigned
- `gr_stage` — required choice: Intake, Promoted, Legacy, Void
- `gr_mechanic` lookup plus `gr_mechanictext` for custom/outwork values
- `gr_equipment` lookup; equipment may be absent only when `gr_equipmentreviewrequired` is true
- `gr_customer` and `gr_site` lookups where known
- snapshot text for fleet, serial, make, model, customer, site, and address
- address verification/not-found flags
- `gr_description` — required
- `gr_customerpo`
- `gr_entered` (displayed as **GT Entry**) â€” independent marker that the admin team has entered the job into Greentree
- `gr_timecloudentered` (displayed as **Timecloud Entry**) â€” independent marker that the admin team has entered the job into Timecloud
- `gr_promotedjob` — optional lookup to `gr_job`
- `gr_promotedon`, `gr_promotedby`
- `gr_voidreason` — required when Void

The first Intake allocation is seeded at `145969`, one above the highest numeric Job Number observed during provisioning. Dataverse assigns the value as part of Intake creation; the browser never calculates or submits it.

The Service Operations role has organization-depth Create, Read, Write, Append, and Append To on the Intake table. Delete, Assign, and Share were not granted; a mistaken allocation must be retained and moved to Void.

The `gr_job_jobnumber_key` alternate key was provisioned and verified Active after the latest preflight found no duplicate values among 399 numbered Jobs. No existing Job was changed.

Contact selection uses the provisioned optional `gr_jobbookentry.gr_Contact` lookup. Contacts are discovered through the existing
`gr_sitecontact` junction for the selected Site, while managed Jobs store the underlying Contact in
their direct `gr_Contact` lookup. Job Book Entry therefore requires its own optional `gr_Contact`
lookup to retain the same selection before promotion. The lookup is published and
`VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED=true` enables the Intake projection and Contact selector.

Snapshots preserve what was known when the number was allocated; lookups support later reconciliation.

Managed `gr_job` records carry the same two independent administrative markers in `gr_gtentered` and `gr_timecloudentered`. They are not derived from Job status and neither marker implies that the other task is complete.

## Atomic promotion contract

Promotion must be a single server-side operation (custom API/plugin or equivalent transaction), not two independent browser writes:

1. Lock/read the Intake record and require Stage = Intake.
2. Validate Job Number, description, equipment decision, address decision, and selected standard Job Type.
3. Create exactly one `gr_job` using the already allocated Job Number.
4. Set `gr_promotedjob`, promotion audit fields, and Stage = Promoted.
5. Return the created Job ID.

Use the Intake ID as an idempotency key and enforce unique Job Number values so retrying cannot create a second Job. WOF and Site Check remain protected specialist creation workflows and are not standard promotion choices.

## Jobs screen behaviour

- The standard Jobs tabs query only `gr_job`; Intake records cannot appear in type tabs.
- The Jobs header provides a direct route to Job Book Intake.
- Promoted rows can open their linked managed Job.
- A future combined “All work” view may display both record kinds, but it must label the source and never treat Intake as a Job.

## Restricted Job Book operators

The client supports the Entra application role `ServiceOperations.JobBookOnly`. When application-
role enforcement is enabled, that role sees only the Legacy Job Book, lands on `/job-book`, cannot
navigate to a managed Job, and receives Access Denied for every other management path. Full users
use `ServiceOperations.FullAccess`.

`ServiceOperations.JobCardAdmin` also uses this route for permitted Intake work. The 3 October
decision adds **Edit entry** on managed rows via `canCorrectJobDetails`, plus factual managed
GT/Timecloud marker updates. It opens the canonical Job drawer in corrections-only mode within
Job Book, not the operational Jobs route. Equipment, Customer/Site, Contact, description and PO
are correctable; the address follows the selected Site. No shared Site address or Equipment
location is silently rewritten. Job number/type/status/service type, technician allocation,
scheduling, deletion and technician submissions remain protected. Original promoted
Intake snapshots are not rewritten by corrections to their linked Job. ETags prevent lost edits;
explicit conflict reload discards unsaved corrections only after confirmation.
The matching Dataverse role remains authoritative, and live column-level enforcement must be
verified before release. No live permission change is included in this local implementation.

Job Book rows also reuse the Jobs **Copy for order number book** and **Email to technician**
actions. Non-Void numbered Intake and managed rows can be copied using the canonical six-column
format. Email requires an already-numbered managed Job and its assigned technician; it does not
promote Intake or allocate work. Admin recipients are locked while subject/comments are editable;
JobBookOnly cannot email. Current-Job/assignment preflight rejects stale previews, and local sample
sites cannot send. See [Job Book quick actions](../architecture/jobs.md#job-book-quick-actions-3-october-2026-local-implementation)
for shared owners, validation, transport and approval-gated security requirements.

The Intake-row **Manage job** action (formerly Prepare promotion) belongs to service coordination,
not the restricted Admin or Job Book-only roles. It uses the shared `canManageJobs` capability,
currently granted only by `ServiceOperations.FullAccess`; there is no separate coordinator role.
Both the entry-point handler and preparation dialog are guarded, while **Edit entry** remains
available for permitted Intake work. FullAccess still takes precedence for users holding multiple
roles. The action reviews the future managed-Job handoff; **Create managed Job** stays disabled
until the atomic server operation below is implemented and verified. Client presentation does not
replace the future operation's server/Dataverse authorization.

This route boundary is not Dataverse authorization. The existing `Service Operations - Job Book
Only` Dataverse role owns the restricted permissions. Contact enablement added organization-depth
Read on Site Contact, plus Read and Append To on Contact; the schema utility verifies these grants.
The full role still needs a target-user smoke test across the complete Job Book read/write contract.

The Legacy Job Book and standard Create Job drawers share the Equipment, Customer, Site, and
Contact relationship controls. Selecting Equipment pre-fills Customer and Site; changing Customer
clears the dependent Site and Contact, and changing Site clears Contact. Site and Contact choices are
loaded only for the selected parent record.

New Intake now also uses the canonical `JobEquipmentLocation` tile/editor for persisted Equipment.
New entries initially show only Equipment in this section. Customer/Site/Contact appear after a
machine is selected or the operator explicitly chooses **Equipment not known yet**. **Change**
opens and focuses the shared Equipment search without clearing the current selection or its
Customer/Site/Contact. Clicking outside or pressing Escape restores the selected tile; Escape closes
the search, not the drawer, and returns focus to Change. Only selecting a replacement, an explicit
unknown/no-equipment option, or successfully adding Equipment changes the entry's selection.
Hidden relationship controls do not initiate Site/Contact reads.
Customer changes preserve the unknown-equipment decision and local machine snapshots. Existing
Intake editors continue exposing recorded relationships even when Equipment is absent.
For **new** Intake with Equipment not known yet, Customer, Site and a non-empty Site address are
required, using the [shared creation-location rule](../architecture/jobs.md#shared-components-and-apis).
Site and its read-only address are hidden until a Customer has been selected or created. Contact
appears once both Customer and Site are selected and stays optional. The shared
`JobSiteContactFields` owns this presentation in Jobs, Intake, and the Equipment-location editor;
clearing a Customer hides the dependent controls again without weakening required-field checks.
The inline Customer/first-Site creation panel still collects its Site details as one workflow.
Both submit validation and the
Intake create service reject missing values before a Job number is allocated. Inline Customer/Site
snapshots remain valid without creating master records. Existing incomplete entries and marker
updates are not retroactively subject to this creation-only rule.
The selected machine stays selected when moving between Customers/Sites. Saving the location writes
the current Equipment Site immediately, separately from allocating the Intake number; cancelling
the new entry afterwards does not reverse that save. Existing Intake edits remain snapshot/history
editing, not implicit master-data transfers. Unknown/local Equipment retains the prior lookup flow.
`JobBookOnly` and `JobCardAdmin` may use this narrow move action and create a Customer/first Site
from its inline location editor; general Equipment and existing Customer/Site editing remain
restricted. Live permission changes and enforcement of Site-only writes remain approval-
gated; see [Equipment architecture](../architecture/equipment.md#equipment-location-during-job-creation).

Customer input uses the canonical `JobCustomerField`, existing `CustomerRelationshipPicker`, and
shared `useCustomerSearch` hook, with the same styling as the Job create/edit drawers. Intake seeds
only its exact selected Customer, not every Customer from the Equipment index. Results are filtered
and capped at eight; remote searches require an open dropdown and at least two characters, wait
250ms after typing, and use the existing bounded Customer service. Changing the query or closing
the dropdown cancels obsolete requests; failed searches offer Retry rather than showing an empty
directory. Equipment-selected Customers still display immediately. The inline Customer/Site panel
retains Intake snapshot-only behaviour for unknown/local machines and historical entry editing.
Its confirmation button is **Create customer**. Successful inline Customer/first-Site creation
switches Customer/Site/address to the existing `JobLocationSummary` tile, even before the new
Intake entry is saved. **Edit** explicitly reopens those controls; Contact remains separate.
Cancelled/failed creation does not confirm the location, and opening another entry resets this
presentation state. The label change does not create master records in this snapshot-only path:
the form keeps its explanatory text, and the entry's final Save/Cancel still owns persistence.
The persisted-machine **Edit** panel instead creates real master Customer/Site records
using the same shared workflow as standard Job creation; see Equipment architecture for immediate
save, retry, and permission semantics.
Its Site dropdown includes **Add new site** for the selected Customer, reusing the canonical Jobs
inline Site form and retaining the separate explicit Equipment-location save.

Mechanic selection also reuses the Jobs drawer's existing `SearchableMechanicSelect` and styling.
The account-scoped cached Staff directory supplies at most eight matching active, assignable staff,
searched by name, email, or phone; typing does not trigger extra Dataverse reads. Unassigned clears
both the lookup and saved name. Intake explicitly opts into a custom/outwork text choice (empty
Mechanic lookup), while normal Jobs remain lookup-only. Existing saved names remain visible even
when their Staff row is unavailable or no longer assignable. Outside clicks, moving focus, opening
another relationship dropdown, and Escape close the list; Escape leaves the entry drawer open.

## Earlier promotion release gate

Implement and verify atomic promotion. Do not enable the prototype's Create managed Job button before the server-side promotion operation and its idempotency tests exist.

## Unified workflow decision (3 October 2026)

The product owner has approved continuing locally with **one authoritative working `gr_job`**,
independent number allocation, and separate coordinator-worklist membership. Job Book and Jobs
are screens over that work, not independently editable copies. Four regional number-ledger tables
remain; they are not four regional copies of the operational Jobs schema.

Target screen membership:

- **Job Book:** numbered work, including retained historical and Void allocations.
- **Jobs / Staging:** unnumbered work. Do not equate this with the existing Unconfirmed status.
- **Jobs / Operational:** work deliberately placed in the coordinator worklist, independent of
  whether it has a number. Existing specialist WOF/Site Check creation boundaries remain.
- **Jobs / All jobs:** basic registered work, staging and coordinator-managed work, with suitable
  labels. Historical ledger-only entries must not be silently turned into operational Jobs.

Admin and coordinator can use the same simple Job Book creation drawer. Admin can choose the
**initial technician** and send a numbered Job to that technician. Later reassignment, scheduling,
Job types, operational status and opting into coordinator management remain coordinator-only.
Corrections and factual GT/Timecloud ticks retain their existing separate capabilities. Sending
does not automatically make a Job coordinator-managed or mark it entered in another system.

### Implementation sequence and gates

1. **Number-safety foundation (implemented locally):** the canonical Job editor and Jobs table
   no longer edit saved Job numbers. Generic and completion PATCH builders omit the number;
   partial-field saves reject explicit number writes. Ordinary bulk paste is first-allocation
   only, checks the exact authoritative number/version in bounded reads, then uses one conditional
   changeset. The existing migration-era paste path accepts numeric/WJ/HJ/CJ strings up to the
   existing 30-character limit, without numeric coercion or fixed digit width. It is not an
   automatic allocator. Normal Job deletion rejects numbered records and uses a current ETag for
   unnumbered deletion, protecting a concurrent allocation. Shared owners and tests are documented
   in [Jobs architecture](../architecture/jobs.md#job-number-safety-foundation-3-october-2026).
2. **Atomic registration/allocation (server package deployed; feature flag remains off):**
   `dataverse/job-registration/JobRegistrationPlugin.cs` implements new basic Job registration and
   allocation to an existing unnumbered ordinary Job in an ambient Dataverse transaction. The
   guarded client adapter, replay/concurrency tests and number-invariant plugin are described below.
   The browser never calculates max+1 or performs independent ledger-create/Job-update writes.
   No migration seed is inferred or changed. Metadata, privileges, the signed `1.0.1.0` assembly,
   APIs and restricted-access steps are deployed. Unified feature enablement, named-user transaction
   tests and number-invariant activation remain approval-gated.
3. **Unified screens/local walkthrough (implemented only in the isolated fixture):** reuse the current simple entry drawer,
   canonical corrections/editor controls and assigned-technician email workflow. Jobs creation
   saves staging without requiring a number. Service Coordination displays Job numbers as immutable
   text and does not expose allocation; numbering remains confined to the regional allocation
   system. **Manage job** changes coordinator membership on the same record, never
   creates another Job or number. Job Book reconciles linked rows by authoritative IDs, displaying
   current details from Job and preserving ledger snapshots separately. Both queries remain bounded.
   See the sample-only walkthrough section below; this is not a production release switch.
4. **Approved schema/migration/security rollout (not authorized):** verify actual nullable Job Type
   metadata and choose an explicit membership column; do not invent an Unset type. Basic Jobs must
   not enter type-dependent completion/maintenance/scheduling until configured by a coordinator.
   Preserve existing Jobs, unlinked Intake, historical/Void numbers, snapshots and evidence. Prepare
   a reviewed mapping/backfill plan with duplicate/conflict reporting; do not automatically create
   Jobs for historical ledger rows or silently remove current Jobs from the operational worklist.
   Provisioning, seeds, role grants, deployment and production testing require approval.

The target server must enforce number immutability across **all** callers, including direct
Dataverse writes and specialist Site Check clear-number/allocation/deletion paths. The local
`JobNumberInvariantPlugin` supplies the number/ledger guard, but is not registered. Specialist
paths are now adapted to the guarded allocator, but it remains unregistered and target-untested.
Frontend restrictions are not column-level authorization. Existing direct manual
number input during creation/import and the spreadsheet allocation workflow remain transitional
until the automatic operation and migration plan are ready; they must not be presented as the new
regional allocator. The ordinary shared save builder no longer carries a stale number even when
used by a specialist completion workflow.

The first specialist reconciliation slice now fails closed behind the disabled unified gate:
manual create/import/paste writes cannot reach Dataverse, Site Check numbers cannot be cleared,
numbered Site Check Jobs cannot be deleted with their occurrence, WOF updates omit the number, and
new WOF work stays unnumbered. The ordinary runtime is unchanged. This closes bypasses but deliberately
does not enable rollout. Site Check and WOF Jobs now use the reviewed per-Job regional allocator from
their Jobs tabs, preserving specialist data while creating the same immutable ledger snapshot.

Ledger linkage is not coordinator membership. Do not reinterpret every old Promoted stage as the
new management flag, or overwrite historical promotion audit data to implement the new link.
The local proposed column/API contract below is still unprovisioned.
Likewise, the revised Void operation must preserve the allocated number and reason and continue
blocking either GT or Timecloud tick; once a working Job is linked, it must update the intended
non-operational state atomically rather than invoke the old unpromoted-Intake action blindly.

The ordinary runtime remains the existing split: new Intake is not yet a working Job, email still
requires a linked Job, and **Create managed Job** remains disabled. No live data, schema, roles,
settings, emails, deployment, commit or push is part of this local continuation.

### Transactional registration implementation (local only)

`dataverse/job-registration/contract.json` is the proposed, **unprovisioned** deployment contract.
It is not a provisioning script. Existing regional tables and AutoNumbers are reused. Proposed
additions are `gr_registeredjob` (Job lookup) and `gr_registrationfingerprint` (64-character text)
on each ledger, Registered stage `122830004`, and `gr_job.gr_coordinatormanaged` (Boolean).
Historical `gr_promotedjob` and promotion audit fields are untouched. Existing-record membership
must be migrated deliberately; a new field's default must not silently remove existing work.

Two global, synchronous Custom API Actions share `JobRegistrationPlugin`:

- `gr_RegisterJobBookJob`: accepts a stable request GUID, region, description, PO, saved Site,
  optional Equipment/Contact/initial technician and an explicit unknown-Equipment decision. It
  creates one basic Job, sets coordinator membership false, and leaves Job Type unset. Initial
  system status is Allocated if a technician was chosen, otherwise Unallocated. These are not
  request-controlled operational fields. Creating basic Jobs without a type requires verification
  that metadata/defaults and dependent server automation support it before release.
- `gr_AllocateJobBookNumber`: accepts a stable request GUID, region, existing Job ID and exact
  RowVersion. It changes only the Job number, not status, assignment, type, coordinator membership,
  current master data, schedules or evidence. The same reviewed operation accepts WOF and Site Check
  Jobs; their source links and specialist evidence remain untouched. No existing Intake
  promotion/adoption is implemented by this action.

The caller creates and retains its request GUID **once** at confirmation. That GUID becomes the
ledger primary ID and, for new work, the Job primary ID. A SHA-256 fingerprint covers normalized
request values, operation and initiating caller. A matching persisted ledger returns the original
Job/number on replay, including after later corrections or Void; it never reapplies the first draft.
Reusing the same request for different details/caller/region is rejected. Replays do two bounded
reads without reloading master directories. Native Dataverse Created By/Created On/Modified By
metadata records identity and time; the request cannot impersonate an administrator or supply dates.

All SDK writes use the initiating user's service within the same synchronous transaction.
Transaction/context/impersonation checks fail closed. New registration creates a numberless Job,
creates the linked regional ledger using Dataverse AutoNumber, then conditionally records that
number on the Job. Existing allocation uses the supplied original RowVersion. An exception escapes
the transaction, and no service fault is caught and followed by more writes. Primary IDs, unique
number keys and conditional Job updates resolve racing requests; retry after a lost response uses
the **same** request, never another number. An AutoNumber sequence may have gaps after a rolled-back
request; gaps do not authorize reuse, reseeding or browser arithmetic. This code does not set seeds.

New relationships must reference real records: Site has an active Customer and address; Contact
belongs to Site; selected Equipment and technician are active and the technician assignable.
Ledger display snapshots come from those authoritative records, not request-supplied names. The
operation does not move Equipment, create master data, send email or claim that an address was
verified. Existing snapshot-only Intake/customer creation must be reconciled in the next UI/migration
adapter; do not silently substitute prototype IDs or auto-create master records to bypass validation.

`JobNumberInvariantPlugin` is a separate synchronous PreOperation guard for Create/Update/Delete
on Jobs and the four ledgers. It rejects manual Job numbers, replacement/clearing of allocated
numbers, deletion of numbered Jobs or ledger history, and editing/relinking registered snapshots.
Only a matching parent registration API context may perform initial allocation; a browser parameter
cannot supply that context. Its required `Before` images and registration details are in the JSON
contract. **Do not install it now**: legacy imports/direct Intake creation, registered-entry Void,
cascade/bypass behavior and target plugin ordering need a coordinated cutover and approved platform
checks first. The specialist direct paths now fail closed and specialist allocation uses the guarded
API, but neither plugin is registered. The plugin does not implement general Admin field-level
authorization for existing Job corrections, reassignment or scheduling.

Both APIs require a verified `ExecutePrivilegeName`, resolved from actual published privilege
metadata during approved provisioning. Register uses the existing Job Book Create capability plus
caller table rights. Existing-Job allocation requires a coordinator-only privilege (proposed source:
Schedule Option Create). If Admin also holds that privilege, **stop** and resolve the security design;
do not deploy an unrestricted action. UI roles, mocked users and the client release flag are not
security tests. No SYSTEM service or elevated application identity is used by these plugins.

`jobs/services/jobRegistrationApi.ts` prepares strict parameter allowlists and sends one Action
request. It is disabled by default behind `VITE_UNIFIED_JOB_REGISTRATION_ENABLED=false` and is not
connected in the ordinary runtime. The isolated walkthrough now connects it to both screens.
It has no table-write fallback, number arithmetic, automatic
retry, login, email or per-call request-ID generation. Responses must match request/Job/ledger IDs,
region, number format and version. Unknown/network/malformed responses remain unconfirmed and
instruct retaining/retrying the same request. The walkthrough hook retains that command in
account/origin-scoped session storage before sending, including across navigation and refresh.
It clears only after authoritative reconciliation; retries preserve the exact ID and payload.
This is tab-session recovery, not durable recovery after clearing browser storage or losing a device.

### Unified screen walkthrough (3 October 2026; sample data only)

Run `npm run dev:job-card-walkthrough -- --port=5199 --unified` and open
`http://127.0.0.1:5199/job-book`. Use the **Sample role** selector for Admin or Service coordinator.
The separate server does not read normal environment files, authenticate to Microsoft, connect to
Dataverse, or deliver email. Data lives in memory until that server stops. Other walkthrough ports
and their sample rows are not reset or migrated. Regional counters starting at 910000 are arbitrary
fixture values, never proposed migration seeds.

Implemented in this mode:

- New Job Book entry uses the existing shared Equipment/Customer/Site/Contact/Mechanic controls,
  saved sample master IDs, and one registration command. It creates one basic working Job and one
  immutable allocation snapshot/link; it does not opt into coordinator management. Initial
  technician selection remains available to Admin. Newly created sample master records persist
  independently if the entry is cancelled, matching the shared location editor's warning.
- Jobs creation saves an unnumbered staging Job. Number allocation is not available from Service
  Coordination; its table displays existing numbers as immutable text. The regional allocation
  system remains the only number writer. **Manage job** independently adds that same record to Operational.
  Neither sends email or marks GreenTree/Timecloud. New basic Jobs have no invented Job Type.
- Create and edit drawers do not render a Job-number input. Service Coordination and Job Book
  creation both use the shared scheduling fields; Job Book retains its guarded atomic regional
  registration path while Service Coordination retains the standard Job save path.
- Both creation drawers also use the canonical Equipment/location selector and Job details fields.
  Customer, Site and Contact remain hidden until Equipment is selected or the user explicitly
  chooses **Equipment not known yet**. Service Coordination adds only Job type and Status controls.
- Service coordination uses one tab row: Operational, Breakdown, Service, Workshop, WOF,
  Site Check, Unconfirmed and All jobs. Operational uses explicit coordinator membership;
  Unconfirmed retains its status meaning. All jobs includes read-only unlinked ledger history
  alongside working Jobs, without creating or converting historical records. An unnumbered managed Job can belong to both Staging and
  Operational. Older Jobs lacking the new membership metadata keep their existing managed fallback.
  Coordinator settings are configured after Manage job. The legacy spreadsheet allocation controls
  and row-click spreadsheet export are absent from the Jobs table; explicit copy actions are retained.
- Job Book merges only explicit registered-ledger/Job links. Current details, corrections and
  factual markers come from Job; ledger snapshots remain unchanged. No number-based merging,
  historic backfill or automatic conversion of old Intake/Legacy/Void entries occurs. Older Intake
  still uses its old editing/Void path and cannot be dispatched or automatically promoted.
- Sample Void requires a linked, non-managed entry, a reason, exact Job and ledger ETags, and both
  GT/Timecloud markers explicitly false. It preserves number, snapshot and technician, stamps the
  sample actor/time, and makes the Job read-only. Marker, management or version conflicts block it.
- Recovery banners reopen retained registration/allocation requests, including when a successful
  allocation's response was lost and the Job already shows its number. The region/payload stay
  frozen; retry replays the original request without reapplying later corrections. A confirmed
  concurrency rejection requires reloading before discarding that rejected allocation request.
- Jobs fetches 100 records per page with explicit Load more. The disabled production gate now applies
  server-side Operational, Unconfirmed and Job Type filters and accepts only same-environment Jobs
  continuation links. Job Book retains incremental paging. Exact post-save reads and bounded refreshes
  replace global all-Jobs loads. Durable cache/retention policy remains rollout work.

`VITE_UNIFIED_JOB_WALKTHROUGH` is a separate development-only flag, set by this fixture launcher.
Do not set it in normal configuration or treat role simulation as security verification.
The sample `/__walkthrough/jobs` endpoints remain fixture-only. The proposed
`gr_registrationvoid` / `gr_registrationvoidreason` Job fields and transactional Manage job/linked
Void Custom API contracts now have local C# plugin source, exact-version rollback/replay tests and
caller-context access-guard integration. A strict client adapter is disabled by default behind
`VITE_UNIFIED_JOB_WORKFLOW_ENABLED=false`; enabling it also selects the bounded production Jobs
worklist, but the flag remains off and the required target schema is not provisioned. The operations are
**not** provisioned, registered or live-authorized. The same local contract now includes replay-safe
initial dispatch: the server resolves the assigned technician, verifies the exact Job version and permits
only its exact Email Dispatch child write. The gated client retains one request/body for uncertain retries
within the active session; Azure secure-link creation remains a separate service boundary. General Admin
field restrictions and integration with real completion/scheduling remain unfinished.
Maintenance completion is deliberately blocked in this focused fixture. Do not install the local
number invariant guard until the specialist Site Check paths and approved migration are reconciled.

Manual QA covered Admin creation/correction and marker-blocked Void; coordinator unnumbered
creation, regional allocation, same-record management and type correction; and a simulated
post-commit 503 followed by page refresh and same-request recovery without a second number.
Automated fixture and rendered-component tests cover all regions, strict payloads, role boundaries,
snapshots, legacy reconciliation, ETags, session recovery, read-only Void presentation, and staging.
Validation for this slice: 756 full-suite app tests plus 32 compiled plugin tests pass. Production
build, focused lint and diff checks pass; full lint retains three pre-existing errors in
EquipmentDrawer/MaintenanceBookingScreen and the build retains its existing large-chunk warning.
These tests do not substitute for target-environment transaction, schema or permission testing.

Local validation commands:

```powershell
npm run test:job-registration
npm run test:job-registration-plugin
```

The first runs portable client tests and is part of `npm test`. The second compiles the actual C#
sources against the already installed Power Apps CLI SDK using Windows PowerShell, then runs an
isolated in-memory transaction harness. It does not install/download dependencies, connect to
Dataverse, sign an assembly, create keys or deploy. Its process-scoped execution-policy override
does not change the machine policy. The harness covers rollback, lost-response replay, competing
allocation/creation, retained historical records, caller-context checks and server number guards;
it does **not** prove live Dataverse isolation, metadata, access depth, cascade behavior or role grants.

Platform basis: [Custom API and execute privileges](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/custom-api),
[transaction scope](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/scalable-customization-design/database-transactions),
and [SDK optimistic concurrency](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optimistic-concurrency).
