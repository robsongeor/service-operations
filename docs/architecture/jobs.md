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
and photos are drawer-only details and are fetched for the selected Job rather than for the entire
table.

The authenticated app shell also listens for bounded Staff invalidation events. An active Jobs
screen re-reads only `gr_mechanics` after a short debounce, so technician names and assignment
choices update across PCs without reloading the Job collection or the browser page.

Job invalidations are not replayable while a laptop is asleep or disconnected. The Jobs client
therefore performs one debounced authoritative refresh after SignalR reconnects and when a hidden
Jobs tab becomes visible. This closes missed-event gaps without background polling or constant
Dataverse queries.

Jobs startup is deliberately split into two phases. The table phase loads Jobs and Staff plus the
Schedule Options and Office Updates that directly drive visible table filtering and summaries. It
does not request the full Equipment, Customer, Site, Site Contact, Quote, Assignment, or Equipment
Service Plan collections. Those reference collections load only when a user first opens Job create,
Job edit, Equipment details, or a workflow that needs them. Concurrent opens share one in-flight
request, a successful result remains in memory for the page session, and a failed request can be
retried without opening a partially populated drawer.

Job create/edit drawers use shared drawer presentation and shared searchable selectors.
Their inline New Equipment panel accepts primary Fleet Number, alternate Fleet Number, and Serial;
any one identifier is sufficient for creation. Alternate Fleet input is normalized through the
canonical Equipment identifier rules and saved to the existing `gr_alternatefleetnumbers` column.
Scheduling and Customer Dashboard entry points reuse the Jobs workflow. Completion is routed
through the completion framework rather than screen-specific writes.
The Jobs-table email action opens the feature-owned Job Card composer instead of handing off to a
desktop email client. Recipient, subject, and optional email-only technician comments remain
editable, while a bounded preview shows the Outlook-safe HTML card. Technician comments are bounded,
escaped, stored only as part of the Email Dispatch body, and do not rewrite the Job description.
The composer uses an 840px desktop width with a viewport-safe responsive limit so subjects, comments,
contact details, and the card preview remain readable without changing shared dialog dimensions.
The email preview and delivered card use the same combined Fleet Number presentation as Job Book:
primary followed by normalized alternates separated by ` / `.
The Open Job Card action is temporarily rendered disabled, no secure link is generated, and no URL
is exposed in the email body. The preview and delivered card show the Job's linked Site Contact name,
phone, and email when those values exist, or state that no Site Contact is assigned. Confirmed sends create an Email Dispatch
request and return immediately; Power Automate performs delivery asynchronously and the table shows
Sending, Sent, or Failed. Existing unused links are left unchanged while online Job Cards are paused.
Job Card status changes only after confirmed delivery.
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
After any completion workflow succeeds, the Jobs collection is force-refreshed from Dataverse
rather than accepting a fresh local/device cache entry. The table therefore reflects the completed
status as soon as the completion dialog closes; opening the focused Job editor is not a refresh
prerequisite.
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
existing Unallocated default. The invoice entry point also awaits the same lazy Job reference-data
preparation before resolving an Equipment match or rendering the editor, with retry on failure.
The feature-owned Jobs table also owns Job Book clipboard exchange. A row click copies one
job-book row; its explicit multi-select controls copy selected, currently shown Jobs in the
visible sorted order as tab-separated rows. The existing Fleet Number cell contains the primary
Fleet Number followed by each normalized alternate Fleet Number, separated by ` / `, without
changing the Job Book column layout. The paired paste action reads one numeric Job
number per clipboard line and atomically assigns them to that same sorted selection. It
validates count, uniqueness, and ETags before any write, then refreshes the authoritative
Jobs projection.

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
snapshot for immediate repeat loads followed by a background refresh. Customer and Site suggestion
lists are not part of the initial Job Book load; they load only when the add-machine dialog opens.

## Important Business Rules

- Job descriptions support up to 4,000 characters across managed Jobs and Job Book Intake. The
  shared UI and service boundary enforce the same limit as the Dataverse columns.
- A non-empty Job Number must be unique across Jobs. The canonical create service performs an exact,
  authenticated Dataverse preflight for every creation entry point before POST; the main Jobs drawer
  also rejects a normalized duplicate from its loaded projection immediately. Blank Job Numbers
  remain allowed where the originating workflow permits them. The Active `gr_job_jobnumber_key`
  alternate key provides the hard guarantee against simultaneous duplicate submissions.
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
- Every newly completed Job must have linked Equipment and must capture its completion hour meter.
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
- Technician submission does not close the operational Job; office completion is
  authoritative.
- Generated Site Check Job status changes from both the Jobs table and Job drawer route
  through `siteCheckCompletionApi`. It reloads the parent and every sibling, blocks progress
  on expected-count mismatch, and atomically completes the final Job, occurrence, and
  Schedule rollover with ETags. Post-write reconciliation handles concurrent final Jobs and
  idempotent retry. Reopening a completed generated Job atomically reopens its parent
  occurrence but does not roll the recurring Schedule backward. Its technician may be
  reassigned, but its protected Job Type and original Site/Equipment
  relationships cannot be changed. Job Card Status remains outside this workflow.
- Generated Site Check Jobs may receive externally allocated numeric Job numbers through
  the Site Check details drawer. Exact-count/format validation and stable creation order are
  domain-owned; all numbers are written atomically with Job ETags and then reloaded.
- A duplicate allocation may be corrected from that same generated-Job list by clearing only the
  selected Job Number after explicit confirmation. The write is ETag-protected and preserves the
  generated Job, parent occurrence, expected count, Equipment relationship, status, and history.
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
  because only the newest token hash remains valid.
- Primary technician Job Card email uses the Email Dispatch/Power Automate delivery path from both
  the Jobs table and Job drawer. The table uses a non-blocking in-app composer and formatted HTML;
  assignment sends reuse the same formatted card. Generating a link does not change operational Job
  Status or Job Card Status. Sent is recorded only after dispatch confirmation succeeds.
- Technician Job Card submission stores pending story/hour-meter information and moves the
  Job Card Status to `Submitted`. It does not change operational Job Status, Completed Date,
  Equipment hour meter, maintenance state, or assignments.
- Managers review the immutable original submission timestamp, hour meter, and job story in
  the existing Job drawer's Job Card tab. Opening the drawer refreshes Jobs from Dataverse;
  viewing the submission performs no writes. A compact Submitted table action opens that
  same drawer directly on Job Card, while Jobs without authoritative submission evidence
  show a clear not-yet-submitted state.
- Expanded Job Card submissions keep time/travel and parts as append-only Job child records.
  Further-work and safety flags/details remain immutable submission metadata. The public
  service writes all child rows and the final token/status transition atomically and never
  turns those observations into Jobs, Quotes, tasks, notifications, or operational changes.
- Photos use the generic Job Photo child table and Dataverse File storage. Public submission
  tokens permit server-mediated upload only; authenticated office users download photos
  through Dataverse for read-only manager review. Do not create feature-specific photo
  tables for WOF, Quote, delivery, office, or customer upload extensions.
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
