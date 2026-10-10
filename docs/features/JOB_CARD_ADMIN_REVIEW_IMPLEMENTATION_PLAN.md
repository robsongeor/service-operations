# Job Card Admin Review implementation plan

## Planning status

**10 October follow-up:** the [focused screens/functions review](../reviews/2026-10-10-job-card-review.md)
records queue completeness, expired-link tracking, operational retry, multi-technician and Resume
gaps. Its fixes are pending; the historical implemented phases below do not clear those findings.

- [x] Existing technician dispatch, mobile submission, Azure evidence storage, authenticated
  review queue, photo/PDF download, and current `Mark reviewed` behaviour inspected.
- [x] Product owner confirmed that the technician's original submission must remain unchanged.
- [x] Product owner selected a manual GreenTree handoff for V1; no GreenTree integration or
  field-by-field transcription checklist is required.
- [x] Product owner selected the office outcomes and confirmed that `Needs clarification` is
  status and notes only; it does not contact the technician or generate a replacement link.
- [x] Local-walkthrough decision: GreenTree is the data-entry system. `Processed in GreenTree`
  is the only final action; `No invoice required` is retired, not an alternative completion path.
- [x] Workflow tabs replace job-type tabs: Open jobs, Submitted, Review and Completed. Clarification
  remains status and notes only; the requested workflow does not send anything to the technician.
- [x] Initial named administrators recorded as `nargiza@liftrucks.co.nz` and
  `jessamynb@liftrucks.co.nz`; both require individual access and audit identity.
- [ ] Implement the phases and complete the separately approved identity, Dataverse, deployment,
  and production-smoke steps below.

Historical implementation baseline (2 October): Phases 1–3 were locally implemented.
Later access/rollout records document role assignments, reviewer configuration and plugin deployment;
the earlier blanket “nothing provisioned/deployed” statement is obsolete. Phase completion is still
not proof of named-user acceptance. Use the [current access plan](JOB_BOOK_ACCESS_PLAN.md) and
[release gates](../../RELEASE_READINESS.md). The 10 October audit found restricted correction and
post-delivery status writes that conflict with the server guard.

The walkthrough/test counts below are dated evidence, not the current suite result; the current
baseline is 835/838 Node tests and six lint errors. Original technician evidence must remain immutable.

### Repeatable local walkthrough

**3 October Job Book quick-action decision:** Admins may email the already-assigned technician
for a numbered managed Job; broader coordination remains restricted. Mechanic selection is now permitted to all admitted Job Book roles. This is a separate Job Book row
action, not part of the corrections drawer or the clarification status workflow. Jobs and Job Book
reuse the email composer, queue/delivery hook and six-column order-book clipboard builder. Admins
cannot change the email recipient, and Intake/Void entries cannot be sent. Local sample sending
remains blocked. Current details/version are checked before queueing; production server-side
recipient enforcement and Email Dispatch privileges remain Phase 4 approval gates. See
[Jobs architecture](../architecture/jobs.md#job-book-quick-actions-3-october-2026-local-implementation).

For local verification, copy a Job Book row and paste into a blank scratch sheet, then open
**Email to technician** on managed sample 900001. The recipient is read-only; subject/comments are
editable; **Sending disabled locally** remains disabled. Cancel creates no link or dispatch.
Quick-action validation: 712 full-suite tests pass, including 16 new action/workflow/presentation
tests; build, changed-file lint and diff checks pass. Full lint retains the three unrelated errors
listed below. Sample-only browser checks verified the copy confirmation and locked-recipient
preview without sending; approval-gated live security and delivery tests remain outstanding.

**3 October correction-scope decision (supersedes the earlier managed-Jobs-read-only rule):**
Admins may correct Equipment, Customer/Site, Contact, description and order/PO on a managed Job,
and its factual GT/Timecloud ticks, from Legacy Job Book. Use **Correct details** on the managed
row (now labelled **Edit entry**). The canonical Job editor locks job number, type, status, service type and mechanic assignment;
scheduling, dispatch, deletion and operational tabs are unavailable. Address follows the selected
Site and does not alter the shared Site or move Equipment. Technician evidence is unchanged.
`canCorrectJobDetails` is separate from coordinator-only `canManageJobs`. JobBookOnly is unchanged.
ETag conflicts require explicit reload/discard confirmation, not silent overwrites. Associated
Quotes and reference screens remain read-only; the five-area Admin navigation is unchanged.
Phase 4 must validate enforcement of the correction-column allowlist in Dataverse/server controls;
client capabilities alone are not a security boundary. No live settings or roles changed.

Corrections validation: 144 focused Job Book tests and 696 full-suite tests pass; build and focused
lint pass. Full lint retains the three unrelated EquipmentDrawer/MaintenanceBookingScreen errors.
Sample-only browser checks verified save/reopen, protected coordinator controls, stale-save
rejection, explicit reload confirmation, Customer/Site/address correction without moving Equipment,
factual marker changes, and unchanged technician evidence. This is not a live authorization test.

Run `npm run dev:job-card-walkthrough`, then open
`http://127.0.0.1:5180/job-card-reviews`. No Microsoft sign-in is needed. This standalone harness
uses the real application and review service, memory-only review records, synthetic Dataverse
responses, and clearly labelled sample administrators. It does not load `.env` files or the normal
Vite configuration, binds only to loopback, blocks outbound service fetches, and blocks browser
connections to live services. Reviewer allowlist values exist only in that local process and use
`example.invalid` addresses. It cannot send technician messages or mutate real records.

1. Open sample **900001**: it stays Pending until an explicit action. Start review, try Needs
   clarification / On hold with and without a note, then Processed in GreenTree. The reference is
   optional. Safety/further-work warnings remain visible and do not prevent completion.
2. Open **900002**, choose Processed in GreenTree, and leave the reference blank. Confirm that the
   administrator, timestamp and activity appear and the card moves from Submitted to Completed.
3. For a conflict, open **900003** in two tabs. Choose Jess in the second tab's sample-administrator
   selector, which is tab-local. Save a different action there, then save from the stale first tab.
   The first save is rejected; its dialog retains the draft and offers Refresh review. Check the
   latest saved administrator/state/note before confirming again. If the other administrator
   recorded a final outcome, the stale dialog cannot submit after refresh.
4. Completed includes an explicit legacy Reviewed sample; it must not imply GreenTree processing.
5. The Sidebar contains only the five approved areas. Reference screens and associated Quotes
   stay read-only. Job Book Intake edits remain usable. On managed sample **900001**, use
   **Edit entry**, change description/PO, save and reopen. Verify job number/type/status,
   service type and mechanic stay locked, with no scheduling/dispatch/delete actions. Correct
   Customer/Site and check the address follows Site, without moving Equipment. Open this Job in
   two tabs, save different corrections, and confirm the stale save is rejected with explicit
   reload/discard recovery. GT/Timecloud markers are editable, independently of Job status.
   **Manage job** remains coordinator-only and its creation action remains disabled.
6. Try `/jobs` directly: access is denied. Use Tab/Shift+Tab in an office confirmation dialog to
   check focus stays inside; Escape cancels, and focus returns to the action or outcome heading.
7. Open jobs shows **900020** and **WJ123456**, both successful numbered sends. Sample unsent,
   unnumbered and already-submitted jobs are excluded. There are no managed-Job mutation actions.
   Submitted initially has three cards, Review one On hold card, Completed three historical cards.
   Change a Submitted card to Needs clarification with a note: it moves to Review without email
   delivery or a new link. Check arrow-key stage navigation and the secondary Job type filter.

Use **Reset sample cards** to restart (resets sample Intake changes too). The local-only
`/__walkthrough/report` endpoint reports original-evidence comparison, review activity and request
results. All sample changes disappear when the server stops. The fixture is intentionally not a
Dataverse emulator: it does not reproduce full query/filter semantics, Azure persistence, private
photo delivery, licensing, or tenant permissions.

Initial browser walkthrough performed locally on 2 October 2026: explicit status changes, required
notes/reason, optional GreenTree reference, non-blocking warnings, final outcomes/History,
legacy labelling, stale-ETag rejection and in-dialog recovery, immutable evidence comparison,
read-only reference screens/associated Quotes, permitted Intake edit, restricted direct route,
and confirmation-dialog keyboard focus were checked. This is not a named-user access or live
security test and does not satisfy approval-gated Phases 4–5. The subsequently retired no-invoice
path was part of that initial walkthrough; it is no longer offered or accepted by the API.

Post-walkthrough validation: all 553 repository tests passed; production build, focused lint on
the walkthrough and changed review/dialog files, and `git diff --check` passed. Repository-wide
lint still reports the three existing errors in EquipmentDrawer (`preserve-caught-error`) and
MaintenanceBookingScreen (two `set-state-in-effect` errors), not new walkthrough errors. The
production build contains no sample identity or walkthrough entry point. Build-size warnings
remain non-blocking.

GreenTree-only completion follow-up (3 October 2026): 50 focused tests and all 554 repository tests
passed; build, focused lint and the diff check passed. Full lint still reports only the same three
pre-existing errors. Regression coverage rejects the retired action without a record change,
preserves historical outcomes, and verifies the current controls expose only GreenTree completion.

Workflow-stage follow-up (3 October 2026): Open jobs, Submitted, Review and Completed replace the
primary job-type/Active-History navigation; job type remains a filter. All 568 repository tests
pass, including 43 focused queue/workflow/storage/UI tests. Focused lint, production build and
the diff check pass; full lint still reports only the three previously documented unrelated errors.
The isolated browser walkthrough checked all four stage contents, arrow-key focus after remount,
and a sample Pending -> Needs clarification transition moving from Submitted into Review with
the sample administrator and note. The local report confirmed unchanged original evidence and
only the explicit office-state POST, with no send or replacement-link action. No live data,
privileges, configuration or deployment was involved. Sample data now includes successful sends,
an unnumbered staging Job, a failed send and an already-submitted Job for exclusion checks.

## Goal and V1 scope

V1 gives Nargiza and Jess a shared office queue for reviewing technician Job Cards, manually
transcribing the required information into GreenTree, and recording a durable outcome. It replaces
the informal paper/spreadsheet handoff without changing the accepted technician evidence.

The restricted Admin role can use:

| Area | V1 authority |
| --- | --- |
| Job Card reviews | Read evidence, download PDF/photos, and manage the office review workflow. |
| Legacy Job Book | Use the existing operational Job Book workflow. Reference master records remain bounded by the Dataverse role. |
| Quotes | Read-only, including associated Quotes opened from a Job Card review. |
| Equipment | Read-only general editing; the subsequently approved `canMoveEquipment` exception permits an explicit Site move during new Job Book entry. See Equipment architecture. |
| Customers | Read-only, including Sites and Contacts needed for context. |
| Other application areas | Hidden and route-blocked. |

This role is distinct from the existing unrestricted `ServiceOperations.FullAccess` and restricted
`ServiceOperations.JobBookOnly` roles. V1 does not automatically write Job Card values to GreenTree,
Dataverse Jobs, Equipment hour meters, Quotes, invoices, follow-up Jobs, safety workflows, or emails.

## Agreed workflow

The persisted office state is:

| State | Queue behaviour | Rule |
| --- | --- | --- |
| `Pending` | Submitted | Initial state after a successful technician submission. |
| `In review` | Review | Set only by the explicit **Start review** action; opening a card changes nothing. |
| `Needs clarification` | Review | Requires an office note. No email, technician notification, or new link is created. |
| `On hold` | Review | Requires an office note. |
| `Processed in GreenTree` | Completed | Terminal V1 outcome after the administrator confirms manual GreenTree processing. |

GreenTree is the data-entry system. Confirming that data entry is complete there is the only final
workflow action, regardless of subsequent invoicing treatment in GreenTree. The retired
`No invoice required` action is rejected. Any previously saved outcome retains its original note,
administrator, timestamp and activity in read-only Completed as **No invoice required (retired
outcome)**. Never rewrite those historical records to claim GreenTree processing.

`In review` records the current administrator but is a coordination indicator, not a lock. Either
authorised administrator may open or continue the review. Every mutation uses the loaded ETag; a
second administrator acting on stale data receives a refresh-and-review conflict instead of
silently overwriting the first change.

Completed outcomes require deliberate confirmation. Reopening a terminal review is excluded from
the first implementation unless a tested, audited correction action is approved during delivery.
This avoids turning history into an untracked editable state. Full-access users and restricted
admins follow the same review-state rules.

## Evidence and office-data boundary

The accepted technician submission is immutable evidence. These fields must never be changed by an
office workflow action:

- Job, assignment, technician, customer, Site, Equipment, and dispatch snapshots;
- submitted story and hour meter;
- time, travel, and Parts entries;
- further-work and safety answers/details;
- submitted photo references and submission time.

Office workflow data is stored separately on the existing Azure Table entity:

| Field | Contract |
| --- | --- |
| `officeStatus` | One allowlisted office state. An absent value derives as `Pending` when `status=pendingReview`; an existing terminal row with no value is presented separately as legacy `Reviewed`, never as a claimed GreenTree outcome. |
| `officeNote` | Current bounded office note; required for `Needs clarification` and `On hold`. |
| `reviewStartedOn` / `reviewStartedBy*` | First explicit Start review audit identity and time. |
| `officeActionOn` / `officeActionBy*` | Latest office transition identity and time. |
| `greentreeReference` | Optional bounded reference entered deliberately by the administrator. |
| `outcomeOn` / `outcomeBy*` | Terminal outcome identity and time. |
| `officeActivitiesJson` | Bounded append-only audit entries containing transition, safe note/reference snapshot, actor, and server timestamp. |

Actor fields retain the verified Dataverse system-user ID, display name, and normalized work email
returned during server authorization. The client never supplies authoritative actor or timestamp
values. Notes and references have explicit length limits, are plain text, and are never written to
logs or notification emails.

The submission lifecycle field remains compatible with the public-link service:

- non-terminal office states retain `status=pendingReview`;
- `Processed in GreenTree` sets `status=reviewed` only after the office
  fields and activity are prepared in the same ETag-protected Table replacement;
- existing public replay protection continues to treat both values as used submissions.

Do not infer that an existing legacy `status=reviewed` record was processed in GreenTree. Present it
as **Reviewed (legacy outcome not recorded)** in Completed. New records always carry an explicit
`officeStatus`. No bulk rewrite is required for release.

The activity list is capped by validated payload and entry-count limits that remain comfortably
within Azure Table's property/entity limits. A transition that cannot append its audit entry fails
as a whole; it must not update only the current status.

## Review experience

### Workflow tabs

The Job Card review route has four primary views, loaded independently:

- **Open jobs**: allocated Job number and a recorded successful send to a technician, awaiting
  submission. Generated links alone, unsent staging, unnumbered Jobs and Site Checks do not qualify.
- **Submitted** (default): Pending technician submissions awaiting office action.
- **Review**: In review, Needs clarification, and On hold. Clarification is notes/status only.
- **Completed**: Processed in GreenTree and legacy reviewed submissions, plus any previously saved
  retired No invoice required outcomes (read-only compatibility, not a selectable action).

Job type is a secondary searchable filter, not a main tab. Search, customer, technician, sort and
refresh are shared. Submission views retain reported attention/administrator filters; Review and
Completed also have office-state filters. Open jobs shows Sent/Awaiting submission without invented
evidence or review links. Submission warnings remain visible and non-blocking. Completed shows
outcome, actor, outcome date and an optional GreenTree reference without falsifying legacy outcomes.

Server queries remain bounded. API views are `open`, `submitted`, `review` and `completed`; older
`active`/`history` requests remain compatible. Sorting applies to the bounded returned population,
not globally to all retained records. Pages advance over source rows before stage filtering, so
an empty page can still have more matches to check. At most 100 rows per request and 500 source
rows per scan are exposed; the 501st is an overflow sentinel. The UI distinguishes Load more,
scan-limit, empty, error and stale results. Stage/account changes discard old queue ownership.

Open jobs uses minimal delegated Email Dispatch reads (`gr_emailsent=true`, valid requested/sent
timestamps), linked Job number/details and legacy primary/assignment submission timestamps. Number
formats are digits or WJ/HJ/CJ followed by digits, with no four/five-digit ceiling. Sends are
deduplicated by Job/assignment/recipient; Azure submissions are matched in batches using those
identifiers and submitted-on >= requested-on. It does not read email bodies/subjects, generate
links, contact technicians, or update Jobs. Recorded legacy submissions remove already-returned
cards without copying or changing their evidence. Evidence overflow/access errors fail visibly.

This correlation uses existing fields, not an exact new dispatch-to-request relationship. Manual
off-system returns without recorded submission dates cannot be inferred. Preflight must verify
actual delivery-flow timestamps, retained-history coverage and required read privileges before
release; the sample walkthrough does not verify a live tenant.

### Review workspace

Keep the existing immutable evidence presentation, on-demand private-photo loading, ZIP download,
submission PDF, live Job contact, and associated Quotes drawer. Replace **Mark reviewed** with an
office workflow panel containing:

- current state and current handler;
- **Start review** from Pending;
- status choice for Needs clarification or On hold with required note;
- **Processed in GreenTree** confirmation with optional GreenTree reference and optional note;
- a chronological office activity list.

Opening a record is read-only. Transitions use a confirmation surface that describes their effect,
keeps the technician submission unchanged, prevents double submission while busy, returns focus,
and announces success/failure accessibly. A 409/412 response preserves the administrator's entered
text, explains that another user changed the review, and requires refresh before retry.

The associated Quotes drawer must receive the role's read-only capability so it cannot expose
create, edit, pricing, PO-request, or other mutation actions. Equivalent read-only presentation is
required in the standalone Customer and Equipment routes.

## Application-access model

Add the Entra application-role value `ServiceOperations.JobCardAdmin`. Full Access continues to take
precedence if an account has more than one supported role.

Replace route decisions based only on `canUseFullApplication` with explicit capabilities, including:

- `canReviewJobCards`;
- `canUseJobBook`;
- `canViewQuotes` and `canEditQuotes`;
- `canViewEquipment` and `canEditEquipment`;
- `canViewCustomers` and `canEditCustomers`;
- `canUseFullApplication` for the existing unrestricted shell.

The new role lands on `/job-card-reviews`. Its Sidebar contains only Job Card reviews, Legacy Job
Book, Quotes, Equipment, and Customers. Direct navigation to any other management route returns an
access-denied page with a safe link back to Job Card reviews. Development simulation adds a
`job-card-admin` mode with its persistent warning; simulation validates presentation and routing
only, never Dataverse or API authorization.

Every affected mutation component must consume an explicit capability/read-only contract. Do not
use hidden navigation as the security boundary. Read-only screens must also remove keyboard,
deep-link, drawer, bulk-import, related-record creation, delete, upload, and nested mutation paths.

## Authoritative permissions

Three independent controls are required:

1. **Entra application role** controls the management routes and presentation.
2. **Dedicated Dataverse security role** authoritatively restricts operational data.
3. **`JOB_CARD_REVIEWER_EMAILS`** authorises the separate Azure Job Card API and private photos.

The intended reviewer allowlist is normalized and includes:

```text
nargiza@liftrucks.co.nz,jessamynb@liftrucks.co.nz
```

Preserve any existing authorised reviewer, including George, unless the product owner separately
approves removal. Being listed in the Staff directory does not itself grant application, Dataverse,
or Azure-review access.

The proposed `Service Operations - Job Card Admin` Dataverse role grants only the table privileges
needed to:

- read Jobs and the bounded related records required by Job Card context and the combined Job Book;
- read Email Dispatch and Job Assignment delivery/submission metadata for Open jobs; no send,
  Create/Write/Delete privileges on these tables are needed for this projection;
- create/read/write the dedicated Job Book Intake records used by the existing Job Book workflow;
- read Quotes and their required child/reference records;
- read Equipment, Customers, Sites, Contacts, Staff/Mechanics, and required relationship tables;
- use the minimum Append/Append To grants required for permitted Job Book Intake lookups.

Subsequent approved exception (local implementation only): both restricted roles may move Equipment
between Sites through the shared creation panel, and create a Customer/first Site there using
`canCreateEquipmentDestination` without enabling existing master-data editing. Phase 4 must review
Customer/Site Create and relationship privileges as well as Equipment Write/
Append and Site Append To with a server-enforced Site-only boundary. Do not simply add broad
Equipment Write and claim that UI capability checks restrict API callers. See
[Equipment architecture](../architecture/equipment.md#equipment-location-during-job-creation).

Apart from those separately gated move and destination-creation exceptions, the proposed role does not grant Create/Write/Delete/Assign/Share on Quotes, Quote lines, Equipment, Customers,
Sites, Contacts, operational Jobs, or unrelated feature tables. Because Dataverse table Write is
not a field-level permission, the restricted role must not update `gr_job` GT/Timecloud markers on
managed-Job rows. The Admin-mode Job Book disables those managed-Job mutations; Intake-table
updates remain available. If the business later requires restricted managed-Job marker writes,
design a separately authorised narrow server operation or an approved field-security model rather
than granting broad Job Write.

Before provisioning, a read-only preflight must enumerate the exact OData tables, lookups, and
privileges exercised by all five allowed areas. Provisioning, role assignment, environment-setting
changes, and deployment are separate approval-gated operations. Assign only the two verified user
accounts after the role itself has been inspected and verified unassigned.

## Server API contract

Retain `/api/jobcardreviews` as the single authenticated boundary. Extend it with allowlisted,
server-validated operations rather than a generic patch body:

- `startReview`;
- `setNeedsClarification`;
- `setOnHold`;
- `completeGreenTreeProcessing`.

The retired `completeNoInvoiceRequired` action must return 400 without changing the record, even
when an old client submits it with a current ETag and a reason.

Every mutation requires the current ETag. The server:

1. validates the delegated token and the configured reviewer allowlist;
2. reads the authoritative Dataverse user identity;
3. validates the current-to-next state transition, note/reference requirements, and lengths;
4. copies the existing record and changes only allowlisted office fields plus the lifecycle status;
5. appends the server-authored activity;
6. performs one ETag-protected Table replacement;
7. returns the safe updated review projection.

Unknown fields, client-supplied actor/timestamp values, unsupported transitions, and terminal
record changes are rejected. `retryNotification` remains limited to the original new-submission
notification and does not notify technicians about office statuses.

GET queue requests accept only allowlisted view/filter/sort/page values. Photo retrieval continues
to require the same reviewer check and review/photo ownership validation. Responses and logs never
expose token hashes, blob names, bearer tokens, storage credentials, or unbounded raw entities.

## Delivery phases

### Phase 1 — Domain contract and server tests

- Add office-state constants, transition validation, note/reference limits, activity serialization,
  safe actor projection, and legacy-state derivation.
- Add storage methods for bounded Active and History queries without weakening current token and
  photo behaviour.
- Replace `markReviewed` with the explicit ETag-protected transition actions while retaining a
  deliberate compatibility decision for any already-deployed client.
- Extend API/unit/integration tests for every valid and invalid transition, required notes,
  immutable evidence, legacy rows, stale ETags, actor spoofing, terminal records, paging, and access
  denial.

Exit: server tests prove that no office action can alter submitted evidence or complete only half of
a transition/audit update.

### Phase 2 — Review queue and workspace

- Add Open jobs/Submitted/Review/Completed views, office-state filters, outcome columns, current-handler context, and
  bounded paging/truncation messaging.
- Add the explicit Start review and completion/status-note confirmations.
- Add the office activity timeline and conflict recovery.
- Retain PDF/photo/Quotes behaviour and verify keyboard, focus, screen-reader labels, 200% zoom, and
  narrow desktop fallback.

Exit: local fixtures cover both administrators working from the same queue, including a stale-write
conflict, without locking or overwriting.

### Phase 3 — Restricted application role

- Add `ServiceOperations.JobCardAdmin`, capability resolution, route guards, landing route, Sidebar,
  access-denied copy, and development simulation.
- Make Quotes, Equipment, Customers, and nested cross-feature drawers read-only for this capability.
- Keep allowed Job Book Intake actions but remove managed-Job and master-data mutations.
- Add route/menu/rendering tests covering Job Card Admin, Full Access, Job Book Only, Denied, and
  accounts carrying multiple roles.

Exit: the simulated role exposes only the agreed five areas and no visible or direct routed
mutation path outside Job Card review and permitted Job Book Intake work.

### Phase 4 — Dataverse role and environment preparation

- Run an approved read-only privilege/table preflight.
- Create and verify the unassigned `Service Operations - Job Card Admin` Dataverse role with the
  exact least-privilege matrix.
- Create the Entra `ServiceOperations.JobCardAdmin` app role if absent.
- Verify Nargiza and Jess resolve to the intended tenant users; do not rely only on display names or
  Staff rows.
- Prepare, but do not yet apply, the merged reviewer allowlist and access-control settings.

Exit: the unassigned roles and intended configuration are reviewable, and no user or production
setting has changed without explicit approval.

### Phase 5 — Assignment, pilot, and rollout

- With approval, assign both named users the Entra and Dataverse roles and apply the merged server
  reviewer allowlist.
- Deploy the tested application/API changes through the normal release process.
- Run a target-user smoke with Nargiza first, then Jess, using clearly identified test or approved
  low-risk Job Cards.
- Pilot five real Job Cards, reconcile each recorded outcome against GreenTree, and collect workflow
  feedback before declaring the paper/current handoff replaced.
- Record rollback steps for app deployment, role assignments, and environment settings. Do not
  delete submitted records during rollback.

Exit: both users can complete the intended workflow and are denied every out-of-scope mutation;
GreenTree reconciliation matches the five-card pilot.

## Test and release matrix

At minimum, verify:

- a technician submission appears as Pending and remains byte/field equivalent through every
  office transition;
- opening a review does not claim or mutate it;
- Start review records the verified administrator and timestamp;
- Needs clarification and On hold reject blank notes and send no message;
- Processed in GreenTree accepts an optional reference and requires confirmation;
- the retired No invoice required action is absent from controls and rejected by the API, while
  any previously recorded outcomes remain immutable and visible in Completed;
- further-work and safety flags remain visible but do not block V1 completion;
- terminal outcomes leave Submitted/Review and appear in Completed with actor/time;
- stale ETags cannot overwrite another administrator's action;
- Full Access retains existing behaviour; Job Book Only remains Job Book-only;
- Job Card Admin can use permitted Job Book Intake changes and cannot mutate managed Jobs, Quotes,
  Equipment, Customers, Sites, Contacts, or any hidden feature;
- direct URLs and nested drawers enforce the same capabilities as the Sidebar;
- unauthorised authenticated users cannot list reviews or download private photos;
- Nargiza cannot see or edit anything beyond the role when tested with her own account, and the
  same independent smoke passes for Jess;
- a five-card pilot can be reconciled against GreenTree with no missing or double-processed card.

Run the relevant focused tests throughout, followed before release by the standard repository test,
lint, build, and diff checks. Production mutation testing must use approved records and must not
expose real submission contents in screenshots, logs, or release evidence.

## Operational decisions deferred from V1

These are explicitly not blockers for the initial manual workflow:

- automatic GreenTree integration or a field-by-field transcription checklist;
- technician messaging or corrected resubmission from Needs clarification;
- automated follow-up work from `furtherWorkRequired`;
- mandatory escalation or processing blocks for safety reports;
- hard assignment/locking between Nargiza and Jess;
- editing Customers, Sites, Equipment, or Quotes;
- updating Dataverse Job/equipment values from accepted technician evidence;
- retention deletion automation.

The existing evidence-retention recommendation remains in
[`../azure-job-card-storage.md`](../azure-job-card-storage.md). Before any automated deletion is
introduced, the business must approve a service-record retention period and paired Table/Blob
cleanup policy.

## Definition of done

The feature is complete only when the code, server workflow, restricted application role,
least-privilege Dataverse role, reviewer allowlist, named-user assignments, target-user access
smokes, five-card GreenTree reconciliation, accessibility checks, deployment evidence, and rollback
record are all complete. Local implementation alone is not the digital Job Card operational
cutover.
