# Jobs Architecture

## Purpose

Jobs are the operational backbone for breakdown, service, and workshop work. A Job records
what must be done, where it occurs, its operational state, and the relationships needed for
scheduling, assignment, dispatch, completion, quoting, and history.

## Architecture

The Jobs feature separates presentation components, workflow hooks, Dataverse services,
typed domain constants, and completion orchestration. Other screens may open the shared Job
editing workflow, but they must not maintain an independent version of Job rules.

Job Status, Office Action, technician assignment, scheduling, Job Card progress, and Quote
linkage are separate concerns. A change in one must not implicitly rewrite another unless a
documented workflow coordinates them.

Scheduling is an operational capability. Only Full Access and Service Coordinator users may
view or create schedule options. Job Book Admin, Office Admin/Job Card Admin, Job Book Only, and
denied modes must not render scheduling controls or submit schedule-option writes from Job Book.
Route visibility and drawer visibility use the same `canScheduleJobs` access capability.

Initial technician selection is a Job Book capability, not a scheduling or dispatch capability.
Every role admitted to Job Book may select a mechanic while creating or correcting an entry;
denied users may not. Selecting the mechanic does not grant access to Scheduling, technician
email dispatch, Job Card review, or the Service Coordination worklist.

## Admin corrections (3 October 2026, local implementation)

`canCorrectJobDetails` is separate from `canManageJobs`. `JobCorrectionsDrawer` adapts the canonical
`JobEditDrawer` in corrections-only mode, hosted by Legacy Job Book without navigating to `/jobs`.
`useJobCorrections` owns exact-record loading, bounded Customer/Equipment searches and scoped
Site/Contact choices. It never loads schedules, assignments, Quotes or submission evidence.

`jobCorrectionsApi` projects only changed description, order/PO, Equipment, Site and Contact
bindings. Customer is represented through Site; its consistency is validated, not separately
written. Address displays the selected Site's address, without editing a shared Site or moving
Equipment. Historical unchanged Contact links are retained; changed links must belong to the Site.
Opening does not auto-select a previously empty Contact or change Job state. The shared editor's
job number/type/status/service type/mechanic/office values never reach the correction PATCH.

Writes require the original exact ETag. A conflict blocks subsequent saves and offers explicit
reload/discard confirmation; no automatic retry or wildcard overwrite. A successful write with
failed readback is labelled saved and likewise requires reload. Successful saves invalidate shared
Job queries and replace the matching managed Job Book row; promoted Intake snapshots stay historic.
Technician snapshots/evidence, completion/maintenance history and operational children are untouched.
The ordinary coordinator editor retains its existing controls and save path. Dataverse write
authority and column-level enforcement remain separately approval-gated, not provided by UI roles.

Service Coordination treats every non-Void Dataverse Job in its worklist as operational. Its
Operational and specialist type tabs are client-side views of the same Jobs and always open the
canonical `JobEditDrawer`; they never invoke `JobCorrectionsDrawer` or require a **Manage job**
membership transition. The corrections-only adapter remains a restricted Job Book capability.

## Job Book quick actions (3 October 2026, local implementation)

Jobs and Legacy Job Book share `JobQuickActions`, `JobEmailComposer`, `usePrimaryJobEmail` and
`primaryJobEmailWorkflow`. The canonical numbered clipboard builder in `jobBookClipboard` copies
six tab-separated columns: technician, Job number, Fleet/alternate Fleets (or W/S), Customer,
blank, technician. Job Book adapts its existing row projection, including Intake snapshots;
copying does not fetch a directory, allocate a number, promote Intake or write a record.

Job Book presents one compact horizontal action row: **Edit entry** (including restricted managed-
Job corrections), icon-only copy/email controls and a permission-gated Void icon with a confirmation
dialog. Icons retain accessible labels and explanatory tooltips. Job Book retains its explicitly
permission-gated Intake handoff actions. The edit button styling is shared with Jobs. This
label/layout change does not unify Intake and managed-Job persistence or grant additional editing
authority.

`canEmailAssignedTechnician` grants FullAccess and JobCardAdmin the separate Job Book row action.
JobBookOnly cannot email. It requires a numbered managed Job, a linked technician with a valid
email, and a non-Unconfirmed ordinary Job; Intake, Void and Site Check rows are not dispatched.
Admins can edit the subject and email-only comments, not the recipient or technician allocation.
The corrections drawer itself still has no dispatch controls. Coordinators retain their existing
Jobs composer recipient controls.

Opening a Job Book preview performs one focused current-Job read, with no link or dispatch writes.
Sending rereads that Job and checks its ETag, assignment/email and rendered message data against
the preview, rejecting stale details with a reopen instruction. This is a preflight check, not an
atomic server-side allocation lock. The existing dispatch service queues delivery and the shared
hook monitors it in the background; duplicate clicks are blocked while delivery is pending.
Ordinary Job sends never modify Job status, assignment, GT/Timecloud markers or saved evidence.
Existing pilot-recipient restrictions, secure-link replacement confirmation and localhost send
blocking remain intact. No sending was tested against live services.

Before live use, approval-gated role work must verify Email Dispatch Create/Read/relationship
privileges and secure-link API authority, including server-side assigned-recipient validation for
restricted Admins. Browser capabilities and the preflight check alone cannot enforce that boundary.
See [email delivery](../email-dispatch-flow.md) for transport ownership.

The local unified-workflow contract now adds `gr_QueueInitialJobDispatch`. Behind the disabled
`VITE_UNIFIED_JOB_WORKFLOW_ENABLED` gate, restricted Admin sends use a retained request ID and the
exact rendered message. The caller-scoped plugin rereads the Job and assigned technician, verifies
the Job row version and recipient, rejects Site Check/Void/unnumbered/Unconfirmed work and creates
one fingerprinted Email Dispatch row. Same-session uncertain retries reuse the identical request and
body. The Azure secure-link call remains separate, and no Custom API, fingerprint column, privilege,
step or role has been provisioned or live-tested.

## Job number safety foundation (3 October 2026)

The [unified Job Book decision](../features/JOB_BOOK_INTAKE_DESIGN.md#unified-workflow-decision-3-october-2026)
separates registration, numbering and coordinator membership. Its first local implementation
protects existing numbers without switching persistence or requiring unprovisioned columns.
The next server/client slice now exists as local source and offline tests; see the authoritative
[transactional registration contract](../features/JOB_BOOK_INTAKE_DESIGN.md#transactional-registration-implementation-local-only).
It is not provisioned and stays disabled by default. The production feature gate now wires the same
screen boundary to 100-row Dataverse pages, validates continuation links, and applies server-side
Operational, Unconfirmed and Job Type filters. The
[isolated unified walkthrough](../features/JOB_BOOK_INTAKE_DESIGN.md#unified-screen-walkthrough-3-october-2026-sample-data-only)
retains its fixture endpoints and shared creation/correction controls. This is not a substitute for
the remaining schema, privilege, migration and specialist-workflow rollout.

`jobNumberPolicy` owns allocated-number detection, immutable editor checks, first-allocation
eligibility, retained-number deletion protection and the transitional regional import format.
`JobCoreFields` makes the number read-only for existing Jobs, and `JobsTable` no longer writes it
on blur. `buildJobUpdateFields` deliberately omits it for ordinary and completion saves;
`updateJobFields` rejects attempts to include it. Optimistic Job state never replaces the saved
number from an editor draft. Creation/import still preserves its existing initial-number contract.

`jobNumberGuard` reads only ID, number and ETag in batches of at most 40 selected IDs. Ordinary
bulk allocation is limited to 100 rows and rejects already-numbered, missing or changed Jobs before
the existing atomic changeset. Every PATCH still uses the displayed exact ETag, so a race after
preflight returns a conflict with no automatic retry. Dataverse's existing unique number key is
still required to reject a number already used by a different Job. Number strings retain leading
zeros and allow regional sequences to grow beyond four/five digits, up to the schema's 30 characters.

The canonical drawer hides ordinary Delete for numbered Jobs. The API rereads the exact record
and rejects numbered deletion; an unnumbered deletion uses that current ETag, protecting a concurrent
allocation. This is not a new cancellation action. When the unified runtime gate is enabled, remaining
direct number paste/create/import paths fail closed, Site Check number clearing is unavailable, and an
occurrence containing a numbered Job cannot be deleted. WOF corrections omit the number field and new
WOF Jobs remain unnumbered. Both specialist types use the same guarded per-Job regional allocator from
their Jobs tabs; allocation preserves type, evidence and source relationships while creating the ledger.
No new server-side immutable-column enforcement is active. The registered invariant steps remain
disabled during the V1/V2 shared-Dataverse overlap because V1 still needs its existing manual-number
workflow; V2 is frontend-blocked only. Enable and verify the invariant steps only as a separate V1
retirement or migration cutover. `tests/jobNumberPolicy.test.ts` covers
payload exclusions, permissions presentation, regional formats, bounded preflight, stale callers,
allocation/deletion races and fail-closed responses; drawer rendering is also covered by the
corrections UI tests.

## Major Dataverse Relationships


- A Job references a Customer and Site.
- Equipment is optional.
- The primary technician remains on the Job.
- Additional technicians are represented by Job Assignment child records.
- Schedule options and Office Updates are child records.
- Quotes may link to Jobs without becoming required for Job creation.

Detailed tables, columns, and relationship names belong in the relevant schema documents.

## Shared Components and APIs

The Jobs table restores an account- and Dataverse-environment-scoped IndexedDB snapshot for a fast
first render, while Dataverse remains authoritative. It refreshes every paged Job row in the
background and replaces the saved snapshot after success. SignalR carries bounded invalidation
events only; clients debounce those events and refresh from Dataverse. Technician time, materials,
and photos are selected-Job details rather than table-wide reads. Ordinary Jobs defer old evidence
until Historical submissions is opened; Site Check drawers retain eager evidence loading.

The authenticated app shell owns one connection for bounded Job, Equipment, and Staff invalidation
events. An active Jobs screen re-reads only `gr_mechanics` after a short debounce for a Staff event,
so technician names and assignment choices update across PCs without reloading the Job collection
or the browser page.

Job invalidations are not replayable while a laptop is asleep or disconnected. The app-shell
provider therefore invalidates currently observed Job-dependent queries after SignalR reconnects and
when a hidden tab becomes visible; a mounted legacy global Jobs list performs one debounced
authoritative refresh. This closes missed-event gaps without background polling or constant
Dataverse queries.

Jobs startup is deliberately split into progressive phases. The table phase loads Jobs plus the shared,
account-scoped Staff directory and the Schedule Options and Office Updates that directly drive visible
table filtering and summaries. It
does not request the full Equipment, Customer, Site, Site Contact, Quote, Assignment, or Equipment
Service Plan collections. Job create opens immediately from its supplied context; its Staff selector,
exact Equipment refresh, maintenance plans, selected-Customer Sites, and selected-Site Contacts each
have independent loading/error/retry state. Job edit
opens immediately from the selected summary, refreshes one exact Job independently, loads Equipment,
Customer, Site, Site Contact, and Service Plan editor data through bounded search or selected-parent
queries, loads at most 50 linked Quotes only when the Quotes tab opens, loads at most 50 linked
Assignments only when the Job Card tab opens,
and fetches Job Card child rows and photo metadata only when that tab is selected. The exact Job core
and Job Card metadata are shared by stable focused query keys across Jobs, Scheduler, Customer
Dashboard, Equipment, and WOF entry points. A photo body is fetched only when the operator opens that
photo and is released shortly after the preview is no longer observed. Core, editor-reference,
Quote, Assignment, Job Card metadata, and photo-body failures have scoped retry states. Save is unavailable until exact Job
core and relationship choices are ready, preventing a partial reference load from clearing a valid
Dataverse relationship. Concurrent reference opens share their respective in-flight request and
focused values use bounded stale and cache windows rather than route-local lifetime.

Scoped `useJobs()` consumers do not inherit those two full-table reads. Customer Dashboard supplies
Schedule Options and Office Updates filtered to its selected Customer's loaded Job IDs, while
Scheduler supplies its visible-window Schedule Options and Office Updates filtered to the Jobs in
that window. A smaller scoped consumer that supplies neither receives empty supporting collections
instead of silently requesting every Schedule Option and Office Update in Dataverse.

Job create/edit drawers use shared drawer presentation and shared searchable selectors.
Creation additionally composes the shared Equipment location tile/editor: choosing a machine
fills its current Customer/Site; explicit location edits update the asset before Job creation.
See [Equipment location during Job creation](equipment.md#equipment-location-during-job-creation)
for concurrency, immediate-save semantics, history preservation, and restricted-role boundaries.

For new Jobs without Equipment, Customer, Site and the Site's non-empty address are required.
`jobCreationLocationErrors` is the shared rule used by Create Job and new Job Book Intake.
The existing Customer and Site components expose required labels and field errors; the address
is shown read-only from the selected Site rather than collected as duplicate Job data. Changing
Customer clears the dependent Site/address. Contact remains optional. Before a single managed
Job is written, `createJob` reuses the exact Site reader to verify its Customer and address;
failed verification prevents the POST. Equipment-linked creation adds no extra location read.
Existing Job/Intake edits and batch historical imports are unchanged. These client service guards
are not a Dataverse security boundary or a new table-level requirement.

Their Equipment and Customer comboboxes debounce remote Dataverse search and cap results at eight;
Customer Sites, Site Contacts, the exact selected Equipment, and its Service Plans load only after
their parent is selected. Superseded requests abort, the source screen's exact Equipment/Customer/Site
defaults render immediately, and a secondary dependency failure does not blank or close the drawer.
The shared Staff directory is reused across mounted Job consumers instead of being fetched separately
by every drawer entry point. Existing relationships remain visible while scoped results merge into
the editor.
The Scheduling tab expands its canonical schedule section immediately: an existing visit is shown
without another click, while an unscheduled Job opens directly on the add-schedule fields.
Their inline New Equipment panel accepts primary Fleet Number, alternate Fleet Number, and Serial;
any one identifier is sufficient for creation. Alternate Fleet input is normalized through the
canonical Equipment identifier rules and saved to the existing `gr_alternatefleetnumbers` column.
Scheduling and Customer Dashboard entry points reuse the Jobs workflow. Completion is routed
through the completion framework rather than screen-specific writes.
The Jobs-table email action opens the feature-owned Job Card composer instead of handing off to a
desktop email client. Recipient, subject, and optional email-only technician comments remain
editable, while a bounded preview shows the Outlook-safe HTML card. Technician comments are bounded,
escaped, stored only as part of the Email Dispatch body, and do not rewrite the Job description.
On localhost and other loopback hostnames, the composer remains available as a preview but every
primary and additional-technician send path is disabled before link generation or Email Dispatch
creation. Operators must open the deployed application to send a real Job Card, preventing local
origins or development configuration from reaching technicians.
The composer uses an 840px desktop width with a viewport-safe responsive limit so subjects, comments,
contact details, and the card preview remain readable without changing shared dialog dimensions.
The email preview and delivered card use the same combined Fleet Number presentation as Job Book:
primary followed by normalized alternates separated by ` / `.
The secure technician portal includes a client-side **Download filled Job sheet PDF** action. It
reuses the tracked interactive template and current unsaved technician form values without changing
Job state or storing a generated document.
Open Job Card is enabled as a bounded pilot only when the actual email recipient is Mouhib
(`nzmouhib@yahoo.co.nz`) or George's manually entered test address (`georger@liftrucks.co.nz`).
Every other recipient remains disabled, generates no secure link, and receives no portal URL. The
authenticated server endpoint enforces the same allowlist. Editing the recipient away from an
approved address disables the action immediately. The preview and delivered card show the Job's linked Site Contact name,
phone, and email when those values exist, or state that no Site Contact is assigned. Confirmed sends create an Email Dispatch
request and return immediately; Power Automate performs delivery asynchronously and the table shows
Sending, Sent, or Failed. Existing unused links for non-pilot recipients remain unchanged while
broader online Job Card access is paused.
Email Dispatch owns confirmed delivery. Ordinary Job dispatch no longer writes legacy Job Card
Status; Site Check dispatch retains its existing status updates. Azure link creation alone is not
evidence of successful delivery.
Jobs action feedback is announced as a bottom-right toast, can be dismissed explicitly, and clears
automatically after five seconds. A new message replaces the previous timer safely.
Every transition into Complete requires linked Equipment and a whole-number hour-meter reading.
Every completion dialog also displays a required Job Completion Date, initially today and editable
to a valid non-future date. The selected calendar date is stored in the existing Job Completed Date
column for every Job type. That same calendar date is stored as the Job's meter-recorded date, so the
completion dialog does not ask for a duplicate date. The latest dated completed Job with usable meter evidence is the operational current
reading. The Equipment current-meter fields are used only when no completed Job reading exists.
For every completion type, the hour-meter input is the first editable field and receives initial
focus. Job Completion Date is the adjacent field immediately after it in DOM and keyboard order, so
Tab moves directly from Hours to Date. Estimate controls follow that primary pair; an active estimate
is displayed in the hour field as read-only.
Completion advances the Equipment snapshot only when the new reading date is the same as or later
than that operational date; meter value and form-submission order do not determine which reading is current.
Before a non-Service completion updates Equipment, the shared write service re-reads the Dataverse
row and uses its ETag so a stale browser or concurrent completion cannot replace a newer-dated
reading. Breakdown, Workshop, and Site Check completions use the general hour-meter dialog; WOF
collects the hour meter alongside its new expiry; Service additionally updates maintenance history
and plans. Generated Site Check Jobs retain their occurrence/schedule completion orchestration.
After any completion workflow succeeds, reconciliation is bounded to the completed Job and its
Equipment. The client re-reads the exact Job, exact Equipment, that Equipment's complete linked Job
history, and only that Equipment's Service Plans; it then recalculates due dates and patches the
matching row in any mounted Jobs register. Error recovery uses those same focused reads. This keeps
historical hour-meter and maintenance calculations authoritative without reloading the global Jobs,
Equipment, or Service Plan collections, and the completed status is visible without reopening the
focused Job editor.
When the optional Hour Meter Reading Type schema is enabled, a manager may use a clearly marked
estimate when a physical reading is unavailable. Actual is the default; estimated values remain in
history and forecasting with a confidence penalty. Both columns are provisioned in the target
Dataverse environment, but the application still omits them unless its release gate is enabled.
The completion control is worded for the operational case where a technician did not record hours.
It is enabled only when an accepted previous completed Job reading exists. With sufficient history
the value is projected to the completion date; with limited history the last accepted Job value is
carried forward conservatively. With no usable prior Job evidence the application refuses to invent
an estimate. One combined control owns this choice and, when selected, displays the calculated value,
confidence, non-editable state, and Estimated classification together. The classification remains
visible in later history. Both actual and estimated readings use the selected Job Completion Date.
The same gated schema stores that value as a Date Only meter-recorded date, and—not Job number or
office processing order—it owns forecast chronology. A late-entered historical Job is retained
without replacing a newer Equipment current reading.
When that optional schema gate is disabled, the visible Job Completion Date is also the effective
meter reading date. Lower readings from an earlier completion date are therefore accepted as
historical evidence without a reset warning or regression of the Equipment current meter.
The completion dialog shows the value and date from the latest dated completed Job reading. It falls
back to the Equipment current-meter snapshot only when no completed Job has usable meter evidence.
  The Service completion hour-meter dialog uses a bounded two-column layout at normal widths and a
  single-column layout on narrow viewports; long Equipment labels and native number inputs must shrink
  inside the dialog rather than expanding its grid tracks. It displays the effective Job Number as a
  prominent full-width reference so office users can match the completion to external systems; an
  unsaved edited Job Number takes precedence over the last loaded Dataverse value.
It preflights every service-plan level that the selected service will satisfy. Missing plans disable
completion and expose the canonical Power Type, Service Programme, Maintenance Profile, and custom
configuration controls inline. Saving patches only those Equipment maintenance fields and runs the
shared service-programme synchronizer; the dialog remains open and enables completion only after all
required active plan rows exist. Until then, plan-dependent content—including the schedule summary,
hour-meter entry, completion effects, and completion action—is not rendered.
Chargeable Invoice intake also reuses the canonical Job-create drawer when an extracted Our Ref
has no exact Job match. That entry point requires a Job Number, leaves authoritative relationship
selection with the manager, and returns the created Job through the invoice feature's existing
exact-match API before the invoice can be imported. Extracted equipment identifiers initialise the
shared Equipment selector: one exact compatible fleet/serial match automatically selects the
existing Equipment and its authoritative Customer/Site; ambiguous or conflicting matches remain
unselected. No exact identifier match opens the existing new-Equipment panel with invoice values
prefilled for confirmation. Neither path silently creates Equipment. Its initial Job Description
uses the concise final segment of the extracted GreenTree headline rather than Work Completed. This
historical invoice-recovery entry point defaults Job Status to Complete and copies only a meaningful
extracted GreenTree Order No into the editable Job Order Number; standard Job creation retains its
existing Unallocated default. The invoice entry point awaits a bounded Equipment identifier lookup
before resolving a match or rendering the editor; it does not load the global Equipment register.

Spreadsheet Job Import is a separate authenticated management screen at `/job-import` for controlled
historical migration. It accepts the seven-column Excel clipboard contract Job Number, Date,
Mechanic, Model, Fleet, Customer, and Description. The browser parses Date Only values without a
timezone conversion and reviews every row against the authoritative Jobs, Equipment, and Staff
collections before any write. Fleet matching covers primary and alternate Fleet Numbers. Customer
is always derived from the matched Equipment's Site; spreadsheet Customer and Model values are
ignored because the matched Equipment record is authoritative. Equipment without a Site or Customer,
plus missing, ambiguous, or duplicate relationships, block a row. The spreadsheet Job Number is a
read-only source reference and is never written to the new Job. Review can
be filtered to every non-imported row containing either an error or warning. Row-level correction
remains available for Date, Fleet, Mechanic, and Description.

Selected ready rows are created as unnumbered historical Complete Breakdown or Workshop Jobs in one
Dataverse changeset. All selected creates succeed or none do. Only the regional allocation system may
later assign their permanent Job Numbers. Spreadsheet Date becomes
Completed Date. This controlled migration does not synthesize hour-meter evidence or run current
Equipment maintenance completion effects; it therefore must not be used in place of the normal
Job-completion workflow. A source row containing several Fleet Numbers remains blocked because one
managed Job can reference only one Equipment and the importer never invents Job-number suffixes.

The Jobs table does not accept copied or pasted Job Numbers. Existing numbers remain visible and
searchable, while all new permanent numbers are assigned only by the regional allocation system.

Job Book Intake is a separate organization-owned Dataverse ledger, not an Unset Job type. Creating
an Intake row atomically receives its Job Number from the `gr_jobbookentry.gr_jobnumber` AutoNumber;
the browser never calculates the next number. Intake, Legacy, Void, and Promoted stages remain
outside managed Job type tabs. GT Entry and Timecloud Entry are independent administrative booleans
on both Intake and managed Job records; neither is inferred from Job status or from the other marker.
The Job Book Legacy table saves them individually with ETag concurrency protection. Promotion is
intentionally disabled until one server-side idempotent operation can create the Job and mark the
Intake row Promoted together; both Job Number alternate keys are Active.

Job Book uses a dedicated lightweight Equipment picker projection rather than the full Equipment
management payload. That index contains Equipment identity plus its authoritative Site/Customer
display context, is scoped by Dataverse environment and signed-in account, and uses an IndexedDB
snapshot for immediate repeat loads followed by a background refresh. Staff is an independent shared
query and cannot block the Job/Equipment shell. Customer selectors issue debounced, abortable bounded
searches and seed the currently saved Customer so a delayed response cannot clear it. The add-machine
dialog loads Sites only after a Customer record is selected, cancels superseded Customer/Site reads,
and exposes independent retries. Free-text Customer details remain permitted for unconfigured legacy
intake, but Site suggestions require a linked Customer.

## Operational Job Status Lifecycle

| Status | Meaning | Automatic entry rule |
| --- | --- | --- |
| Unallocated | The Job has not yet been successfully dispatched to a technician. | New operational Jobs begin here. A final technician withdrawal may return an Allocated Job here when no current technician assignment remains. |
| Allocated | At least one technician has been successfully sent the Job. | A confirmed email dispatch moves only an Unallocated Job to Allocated. Selecting a mechanic without dispatching does not allocate the Job. |
| Action Required | Office or coordinator action is needed before work can progress. | This is the user-facing name of the existing `Waiting for parts` Dataverse option. It remains coordinator-controlled and its numeric option-set value is unchanged. |
| Completion Review | All current, non-withdrawn technician assignments have submitted Job Cards, but the Job is not yet complete. | The final required submission moves only an Allocated Job here. Active or expired links, replacement lifecycles, incomplete histories, and any other outstanding technician assignment prevent the transition. |
| Complete | GreenTree has closed the Job. | The shared GreenTree reconciliation scheduler sets this when the matching GreenTree Job reports `IsClosed=true`. Technician responses and Job Card submission never set Complete. |

These automatic transitions are intentionally narrow and never overwrite another status selected by
a coordinator. Technician answers such as further work or safety responses remain evidence for office
review; they do not decide operational status. Submission attempts the Completion Review transition
immediately, and the shared 15-minute server scheduler re-evaluates a bounded pending-card queue so a
temporary Dataverse or credential failure cannot leave an eligible Job Allocated indefinitely. This
queue is reconciled before the GreenTree polling checkpoint, so the GreenTree API cooldown never
suppresses Job Card lifecycle recovery.

Job Number allocation and GreenTree confirmation are separate events. Admin may need time to create
the newly numbered Job in GreenTree, so allocation must not immediately interpret a GreenTree `404`
as a meaningful failure. GreenTree delta reconciliation is shared by Job Book and Service
Coordination. A future delayed direct-lookup/retry policy will provide an explicit grace period;
absence from a `modifiedSince` delta response is never evidence that a Job does not exist.

## Important Business Rules

- Job descriptions support up to 4,000 characters across managed Jobs and Job Book Intake. The
  shared UI and service boundary enforce the same limit as the Dataverse columns.
- Opening a Job from Jobs, Scheduler, Customer Dashboard, Equipment history, or WOF displays the
  canonical drawer immediately from the available summary. The drawer then refreshes the exact Job;
  editing and saving unlock only after that authoritative core arrives, preserving complete
  Customer/Site/Equipment context without delaying the shell for unrelated lookups or photos.
- Ordinary creation and historical import must submit an empty Job Number. Existing numbers are
  read-only and permanent. The regional allocation system is the only approved writer, and the
  Active `gr_job_jobnumber_key` alternate key remains a uniqueness safeguard.
- Breakdown, Service, and Workshop Jobs may exist without Equipment.
- Site Check is a protected Job Type created only by the Site Check workflow. It is excluded
  from ordinary Job creation options, requires Equipment, and reuses the canonical Job
  payload mapping inside an atomic Site Check transaction.
- The default Operational Jobs view excludes Site Check Type. Site Checks has a dedicated
  type tab, while All jobs is explicitly unfiltered by type. Versioned current/default view
  migration maps legacy `all` to `operational` and preserves status, search, sorting,
  office/scheduled filters, reset behavior, and sticky-column preferences.
- Job Status and Job Card Status are never interchangeable.
- Completion Review is not completion.
- Every Job completed through an operational completion workflow must have linked Equipment and
  capture its completion hour meter. Controlled historical spreadsheet migration may create a
  completed record without meter evidence, but never updates Equipment meter or maintenance state.
- Completed Job readings are accepted by default. Sequence analysis may display an isolated value
  as Potentially incorrect, an unresolved drop as Possible reset, or a sustained lower increasing
  sequence as Confirmed reset; these assessments are derived and do not rewrite history.
- Unconfirmed Jobs are visible history but unavailable for allocation and scheduling.
- Moving allocated work to Unconfirmed removes allocations and schedules through existing
  APIs before changing status.
- Office attention is independent of operational Job Status, and Office Update history is
  append-only.
- Assignment instructions, dispatch state, and Job Card state are assignment-specific.
- Dispatch state changes only after successful dispatch.
- Successful dispatch moves only an Unallocated Job to Allocated. When the latest lifecycle for
  every non-withdrawn technician assignment has submitted evidence, an Allocated Job moves to
  Completion Review. Active, expired, replacement and truncated lifecycle histories block that
  transition conservatively. Technician answers never determine the operational outcome, and a
  technician submission never marks the Job Complete; GreenTree closure is authoritative.
- Generated Site Check Job status changes from both the Jobs table and Job drawer route
  through `siteCheckCompletionApi`. It reloads the parent and every sibling, blocks progress
  on expected-count mismatch, and atomically completes the final Job, occurrence, and
  Schedule rollover with ETags. Post-write reconciliation handles concurrent final Jobs and
  idempotent retry. Reopening a completed generated Job atomically reopens its parent
  occurrence but does not roll the recurring Schedule backward. Its technician may be
  reassigned, but its protected Job Type and original Site/Equipment
  relationships cannot be changed. Job Card Status remains outside this workflow.
- Generated Site Check Jobs remain unnumbered until the regional allocation system assigns their
  permanent numbers. The Site Check drawer cannot paste, replace or clear Job Numbers.
- New Site Check Jobs share an occurrence description in the form
  `<Frequency> checks for <dd/mm/yyyy>`, where the date is the Monday starting the
  occurrence's New Zealand-local week. Historical descriptions are not backfilled.
- A confirmed Site Check occurrence deletion removes all of that occurrence's generated
  Jobs atomically before removing the parent. It does not use ordinary per-Job deletion and
  cannot partially preserve a generated set.
- The public technician Job Card route is `/portal/job/:token`. It validates a random token
  through the server API and returns a deliberately minimal Job projection. The browser
  never receives Dataverse credentials or direct anonymous Dataverse access.
- Existing technician email actions generate a fresh secure submission link before
  preparing or dispatching the email. The primary technician's existing email address is
  required before token generation. Replacing an active unused link requires confirmation
  because only the newest token hash remains valid. Resending after a technician has already
  submitted or the office has closed their card preserves that immutable evidence and creates
  a new submission cycle for the same Job and technician; it never reopens or overwrites the
  earlier card.
- Primary technician Job Card email uses the Email Dispatch/Power Automate delivery path from both
  the Jobs table and Job drawer. The table uses a non-blocking in-app composer and formatted HTML;
  assignment sends reuse the same formatted card. Generating a link does not change operational Job
  Status. Azure owns ordinary Job Card lifecycle; legacy Sent updates are retained only for Site Checks.
- Ordinary technician submissions retain story, hour meter, time/travel, parts and observations in
  Azure Table with private Blob photos. Submission creates pending-review evidence without changing
  Dataverse Job Status, legacy Card Status, Completed Date, Equipment hours, maintenance or assignments.
- The neutral Job cards table action opens the canonical Job drawer. Its ordinary Job Card tab shows
  authenticated Azure link/submission history and links to the office review screen, without a legacy
  status selector, legacy submission counter or status-based email lockout. Old Dataverse submissions,
  photos and PDFs remain explicitly historical and read-only. See
  [Technician Job Card Submission](technician-job-submission.md) for the API and lifecycle contract.
- Site Check occurrence submissions retain their separate Dataverse child records, File photos and
  existing office controls. Their service identity and schema are not retired by the ordinary Job Card
  cleanup. No historical evidence or generic Job Photo capability is deleted.
- Historical Jobs and their relationships are preserved.

## Extension Points

Add new Job types, completion workflows, assignment capabilities, or office actions through
typed domain modules and shared orchestration. Extend all entry points together when a rule
is cross-feature.

## Implementation Constraints

Use named Dataverse Choice constants. Keep Dataverse requests in services and multi-record
transitions in workflow APIs. Update local state after mutations. Do not duplicate completion,
allocation, or schedule logic inside tables or drawers.
Job creation must call the shared duplicate-number preflight; feature entry points must not issue a
Job POST directly.

## Related Files and Documents

- [`../../src/alpha/jobs/JobsScreen.tsx`](../../src/alpha/jobs/JobsScreen.tsx)
- [`../../src/alpha/jobs/hooks/useJobs.ts`](../../src/alpha/jobs/hooks/useJobs.ts)
- [`../../src/alpha/jobs/services/jobsApi.ts`](../../src/alpha/jobs/services/jobsApi.ts)
- [`../../src/alpha/jobs/components/JobEditDrawer.tsx`](../../src/alpha/jobs/components/JobEditDrawer.tsx)
- [Technician Job Card Submission](technician-job-submission.md)
- [Scheduler](scheduler.md)
- [Dataverse](dataverse.md)
- [Hour-meter reading classification schema](../hour-meter-reading-classification-schema.md)
