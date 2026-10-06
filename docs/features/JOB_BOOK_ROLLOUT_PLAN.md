# Job Book rollout — replacing Excel

Owner: George. Status: planning and local development; not approved for production rollout.
Prepared 3 October 2026. This plan covers Job Book and its connection to Service coordination.

## Outcome and release rule

Staff use Job Book to register work, obtain a regional number, correct permitted details and
record GreenTree/Timecloud entry. George and the other coordinator use Service coordination
to manage the same working Job. Historical spreadsheet entries remain identifiable history.

Do not move users until the acceptance checks below have evidence and George signs off.
Passing sample tests is not evidence that real permissions, numbering or integration work.
For each regional book, only one system may issue new numbers at a time. Excel becomes
read-only when the app takes over; do not run two live number allocators in parallel.

## Current position

| Area | Recorded position | Still required |
| --- | --- | --- |
| Job Book interface | Local entry, correction, markers, copy and Void workflows exist | User acceptance on the final connected version |
| Unified working Job | Works in the isolated sample; registration/allocation server source has offline tests | Real integration, deployment contract validation and target-environment tests |
| Manage job and registered-entry Void | Sample implementations | Production atomic operations and authorization |
| Regional books | Documentation records four tables and verified regional schema/keys | Fresh read-only verification, migration, reconciliation and number cutover |
| Restricted access | Local role/capability presentation exists | Verify/provision authoritative permissions, assign named accounts and test access |
| Recovery and scale | Sample has tab-session retry and bounded paging | Durable recovery, full-register filtering and cache/reconnect verification |

This is a repository-based status, not a fresh production audit. The existing normal application
and the sample walkthrough have different capabilities. Do not enable a sample flag in production.

## 1. George's preparation checklist

- [ ] Confirm one business owner for each regional book. Bruce and Andy are the named coordinators.
- [ ] List every proposed user: individual work email, region(s), duties, intended role and pilot wave.
- [ ] Confirm who only enters jobs and who also reviews returned Job Cards or emails technicians.
- [x] Office Admins may view and work across all four regions without regional restrictions;
  role-based action permissions still apply.
- [ ] Identify the authoritative Excel file for Auckland, Waikato, Hastings and Christchurch,
  its location, owner, number format, formulas/macros, other consumers and current allocation process.
- [ ] Confirm which history is imported and how older excluded history remains accessible.
- [ ] Supply copies for a migration rehearsal. Keep the live sheets operating normally until cutover.
- [ ] Collect representative examples: normal job, unknown machine, missing contact, workshop/outwork,
  duplicate/cancelled number, existing managed Job and a job already entered into GreenTree/Timecloud.
- [ ] Nominate pilot users, the support contact, a cutover window and the person allowed to halt rollout.

The agreed ten-user roster and role decisions are maintained in the
[user access plan](JOB_BOOK_ACCESS_PLAN.md). Office Admins have access across all regions; pilot waves remain to be confirmed.

## 2. User access and controls

Several people may have the same role, but each signs in with their own account for audit history.
These are application roles, not Microsoft tenant administrator privileges.

| User group | Agreed direction | Application role |
| --- | --- | --- |
| George only | Unrestricted application access | Existing `ServiceOperations.FullAccess` |
| Bruce and Andy | Same application capabilities initially; restrict separately later | Proposed distinct `ServiceOperations.ServiceCoordinator`, not implemented/provisioned |
| Jess, Nargiza and Pubudu | Office Admin: corrections, assignment/email, GT/Timecloud markers and review; same Customer/Site creation and Equipment move/detail-edit scope as Job Book Admin | Existing `ServiceOperations.JobCardAdmin` client profile; Pubudu is the admitted live pilot |
| Martin, Lance, Ranjani, Ashneel and Kaizer | Job Book Admin: entry, eligible-entry Void, factual corrections after handoff, Customer/Site creation, Equipment moves and detail edits; no assignment/email, markers or review | Proposed distinct `ServiceOperations.JobBookAdmin`, not implemented/provisioned |
| Job Book only | Not planned for this rollout | Retain existing implementation without rollout assignments |

ServiceCoordinator must remain a distinct role even while capabilities match FullAccess.
Do not give coordinators an additional FullAccess claim that would bypass later restrictions.
Job Card review is limited to George, both Service coordinators, Jess, Nargiza and Pubudu. The other
five Job Book Admins retain entry and correction duties without assignment/email, marker writes
or review access. Implementing this distinct profile is required before rollout.
Both Admin groups have separate Customers and Equipment screens under the agreed creation,
movement and detail-edit permissions. Job Book Admins do not gain review or coordination access.
See the access plan for intended users, unresolved decisions and implementation checks.

Before assigning users, the implementation owner and Microsoft environment administrator must:

- [ ] Verify each account can use this application and Dataverse in the target environment,
  including the organization's applicable access/licensing arrangements.
- [ ] Map the application role to the required Dataverse permissions. A hidden button or denied
  route does not prevent a direct API write.
- [ ] Enforce narrow allowed Job corrections and markers without granting unrestricted Job editing.
- [ ] Enforce any approved Equipment Site-only move and Customer/Site creation exceptions.
- [ ] Restrict coordinator membership, later technician changes, scheduling, number operations and Void.
- [ ] Review users' existing roles/team membership for broader grants that would defeat restrictions.
- [ ] Configure the separate Job Card reviewer allowlist only for users who need review access,
  preserving existing authorized reviewers. An app role or Staff record alone is insufficient.
- [ ] Assign George and both coordinators their distinct verified roles before enabling application-role enforcement;
  retain a tested authorized support account and test an unassigned account is denied.
- [ ] Reconcile older permission wording in the Admin implementation plan with the later approved
  corrections/marker/dispatch scope before producing the final permission manifest.

## 3. Engineering work before user acceptance

Implementation owner completes these locally, then uses a separately authorized test environment:

- [ ] Connect registration/number allocation to the real transactional server operations.
  A new entry creates one working Job and its ledger link, not two editable copies.
- [ ] Implement authorized coordinator membership and atomic registered-entry Void.
- [ ] Ensure initial technician assignment/dispatch follows the agreed Admin scope while later
  reassignment and scheduling stay coordinator-only. The ordinary runtime still blocks unlinked Intake dispatch.
- [ ] Reconcile Site Check numbering, clearing and deletion, historical imports and ordinary
  creation before installing the number-invariant guard. Do not install that guard early.
- [ ] Implement durable lost-response recovery: retrying confirmed or uncertain work must never
  allocate a second number, create a duplicate Job or overwrite later corrections.
- [ ] Make All jobs and regional searches/filtering correct across the whole register, with visible
  pagination and no suggestion that a loaded subset is the full result.
- [ ] Verify cross-user updates, reconnect/refresh behavior and retained cached data with real volumes.
- [ ] Preserve existing coordinator jobs, assignments, schedules, Quotes, technician evidence,
  maintenance and WOF/Site Check workflows. Do not infer management membership from a ledger link.
- [ ] Keep historical ledger-only rows historical; deduplicate linked display by authoritative IDs,
  never by guessing from matching number text alone.
- [ ] Build a repeatable migration/reconciliation process with restart handling and a reviewed
  duplicate/conflict report. Review the existing cutover utility against the new unified contract.

## 4. Acceptance checks — evidence required before go-live

Run the final version with George, the second coordinator and at least one intended office Admin,
using individual accounts and two browsers/devices. Use controlled test records in an approved
environment. Record release commit, environment, tester/date, expected/actual result and evidence.
Mark each check Pass / Fail / Not run; a unit test alone does not close a live integration check.

| Check | Required result |
| --- | --- |
| Sign-in and access | Each intended user can perform their duties; unassigned users are denied; direct URLs/API calls cannot bypass restrictions |
| Create entry | Correct regional book, relationships and required fields; a single working Job/ledger link; reopening shows saved values |
| Unknown Equipment | Agreed Customer/Site/address requirements work; missing information fails clearly without consuming a successful allocation |
| All four number formats | Correct prefix and padding, leading zeros preserved, growth beyond minimum width works; no collision with history or managed Jobs |
| Simultaneous allocation | Two people allocate at once without duplicate numbers; gaps are acceptable, number reuse is not |
| Double click / connection loss | Refresh/retry confirms the same operation and number, without duplicate work or lost corrections |
| Edit collision | Two people edit one record; the later stale save prompts recovery instead of silently overwriting the first |
| Coordinator handoff | Manage job moves the same record into Operational without another Job/number; type, scheduling and assignments work afterward |
| Views and search | Operational contains managed work; Unconfirmed is status-based; All jobs and Job Book find the expected records across all pages/history |
| GT / Timecloud markers | Values persist, audit identities are correct and stale updates cannot clear another person's work; ticks do not claim automated external entry |
| Void | Reason required; number and history retained; already-entered or otherwise protected work is blocked; no ordinary delete/reuse escape |
| Technician dispatch, if in launch scope | Correct recipient and current details; explicit authorized send produces one tracked dispatch; retry does not duplicate it; local sample never sends |
| Job Card review, if in launch scope | Intended reviewers can read/review; unauthorized users cannot; original technician evidence stays unchanged |
| Master-data exceptions | Permitted Customer/Site creation or Equipment movement works; unauthorized fields and unrelated records remain protected |
| Existing coordinator work | Open and historical Jobs, Quotes, assignments, schedules, completion, maintenance, WOF and Site Checks retain their established behavior |
| Scale / interruptions | Agreed response targets met on representative volume; sleeping laptop, sign-out, failed request and reconnect produce clear, recoverable states |
| Audit and support | Creation, corrections, allocation, Void and workflow actions identify the actual user; support can trace a failed operation without exposing secrets |
| Migration reconciliation | Every source row accounted for as imported, explicitly linked or rejected for resolution; numbers and snapshots preserved; no unexplained duplicates |

Agree measurable response-time expectations during rehearsal and record the results. For release,
require zero unresolved defects involving numbering, lost data, unauthorized access or core daily
workflow. George may accept minor presentation defects only with a documented workaround/owner.

## 5. Rehearsal and pilot

1. Rehearse import from retained copies; resolve duplicate numbers, unknown regions, missing fields,
   and overlap with existing Jobs. Re-importing the same input must not duplicate records.
2. Produce counts by region and stage plus row-level exceptions; have each regional owner reconcile
   representative entries, highest used numbers, markers and historical snapshots.
3. Run the acceptance matrix with real intended roles in the approved test environment.
4. Train pilot users on create/edit, number permanence, markers, handoff, Void and conflict recovery.
   Provide a short guide with the production URL, sign-in, support contact and outage procedure.
5. Pilot with sample/test data first. A live regional pilot is itself a cutover for that region:
   freeze its Excel allocator and follow every step below. Do not create real work in both systems.

Suggested pilot group: George, the other coordinator and one office Admin. Expand after a normal
working cycle and an agreed observation period pass without unresolved release-blocking defects.
If regions are phased, verify the release controls actually support per-region write enablement;
the existing regional allocation flag is shared and does not establish independent regional gates.

## 6. Cutover day — George's go/no-go checklist

Proceed only after explicit approval for the specific production changes and migration package.

- [ ] Confirm the exact tested release, account/permission manifest, migration files and rollback owner.
- [ ] Notify affected users of the write-freeze window, new URL and support contact.
- [ ] Stop new allocation/editing in each affected Excel book. Confirm no workbook copies,
  automations or existing app paths can still issue numbers for those books.
- [ ] Take a dated final export and recoverable pre-change application data/configuration backup.
  Verify the final export includes changes since rehearsal; choose final import or validated delta.
- [ ] Import/reconcile historical rows and approved links without generating replacement numbers
  or automatically creating operational Jobs for every spreadsheet line.
- [ ] Establish the next sequence from the reconciled final ledger, existing working Jobs and all
  confirmed allocations/reservations during the freeze. Investigate conflicts before seeding.
  Never use fixture counters or a remembered spreadsheet maximum.
- [ ] Validate the reviewed schema, keys, server operations, guards and roles as one compatible release.
  Coordinate import and guard activation so protection neither blocks migration nor leaves an open gap.
- [ ] Run controlled production checks with the authorized pilot accounts. Retain/void any test
  allocation appropriately; do not delete it or reset the sequence to hide it.
- [ ] Confirm George and the second coordinator still see their existing operational work.
- [ ] Enable only the reviewed production gates. The unified flag alone is not a completed integration.
- [ ] Record GO / NO-GO, date/time, region(s), release, reconciliation evidence and George's sign-off.
- [ ] On GO, make the app the sole writer/allocator; keep Excel as a clearly labelled read-only archive.
- [ ] Check the first real entries, numbers, handoffs and concurrent-user edits with pilot users.

Do not enable regional allocation simply because the regional tables exist. Follow the detailed
[regional migration procedure](REGIONAL_JOB_BOOKS.md), reviewed for this unified release. Auckland
also needs reconciliation and an explicit cutover decision because it already has an allocation path.

## 7. Stop, recovery and rollback

Stop new entries immediately for duplicate/wrong numbers, missing saved work, unauthorized access,
unreconciled imports or failure of a core workflow. George or the nominated alternate owns the stop.

1. Disable affected writes/allocation while preserving read access where safe; communicate the hold.
2. Retain error evidence and inventory every successful or uncertain post-cutover allocation.
3. Reconcile those numbers and records against the authoritative server before any retry or fallback.
4. If resuming Excel is necessary, an authorized owner first records every app-issued number and
   establishes a safe next allocation under a single writer. Never simply reopen the old spreadsheet.
5. Never reseed downward, reuse Void numbers or restore an old database over newer business work.
   A code rollback must remain compatible with the new schema and history; rehearse that path.
6. Verify both coordinators' work and communicate which system is authoritative before resuming.

During an outage, capture requests in a controlled unnumbered holding list for later entry unless
a separately reviewed emergency numbering process exists. Do not invent another live number series.

## 8. After launch and ownership

- George: go/no-go decisions, regional owner/user list, acceptance and business reconciliation.
- Implementation owner: connected code, migration tooling, automated tests, deployment/rollback evidence.
- Microsoft environment administrator: verified identities, environment access, permissions and approved configuration.
- Regional owners/pilot users: source-sheet sign-off, representative workflow testing and training feedback.

During the agreed observation period, check numbering exceptions, failed saves, permission denials,
duplicate attempts and support reports daily. Reconcile each region's new entries and external-entry
markers. Expand user access only after the pilot passes. Keep historical exports recoverable and
read-only under the company's retention arrangements.

## Immediate next actions

1. George supplies the proposed users/duties/regions and identifies the authoritative spreadsheets.
2. Walk through one complete job with both coordinators and an office Admin; confirm the launch scope.
3. Finish the production integration and security work in section 3 before scheduling migration.
4. Rehearse migration and complete the acceptance record; then choose a cutover date.

Related owners: [Job Book design](JOB_BOOK_INTAKE_DESIGN.md),
[Admin review plan](JOB_CARD_ADMIN_REVIEW_IMPLEMENTATION_PLAN.md),
[regional books](REGIONAL_JOB_BOOKS.md), [backlog](../../TODO.md).
