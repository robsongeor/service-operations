# Technician Job Cards and Office Review — End-to-End Map

**Working baseline:** 21 October 2026  
**Scope:** ordinary technician Job Cards, multi-technician returns and office review  
**Current architecture:** emailed single-Job links, private Azure evidence, authenticated office review

This map is the shared checklist for product review, implementation changes and acceptance testing.
It distinguishes the implemented source contract from deployed capability and from future design.
It does not replace the detailed security, storage or rollout documents.

## Status legend

| Marker | Meaning |
| --- | --- |
| **Current** | Implemented in the current source and part of the established workflow. |
| **Gated** | Implemented, but hidden or inactive unless the authoritative backend/feature flag supports it. |
| **Legacy** | Retained for history or compatibility; must not control a new ordinary Job Card. |
| **Separate** | Similar-looking workflow with a different service and rules. |
| **Open** | Product, rollout or reliability work remains. |

## Scope boundaries

### Included

- Primary internal technician and additional active Job Assignments.
- Secure-link creation, replacement, delivery tracking, expiry and withdrawal.
- Technician form, draft recovery, time/travel, parts, meter, observations and photos.
- Immutable submission evidence and private office access.
- Open jobs, Submitted, Needs follow-up and Completed office queues.
- Office audit, correction, follow-up, GreenTree-entry confirmation and optional approved meter sync.
- Conservative multi-technician completeness and the With Technician → Completion Review attempt.

### Deliberately outside this workflow

- **Site Checks:** separate occurrence link, Dataverse evidence and office controls.
- **External suppliers:** no Staff identity, Job Assignment, emailed technician card or expected return.
- **Legacy Dataverse Job Cards:** historical read-only evidence; never the current Azure lifecycle.
- **Technician workspace:** parked. A bearer link opens one Job only and cannot list assignments.
- **Operational completion:** office filing does not complete the Job. Current type-specific completion
  remains separate until the future Service/WOF card contract and atomic processor are accepted.
- **GreenTree data entry:** staff enter GreenTree separately; the app records office workflow only.

## Actors and authorities

| Actor/system | Owns | Must not do |
| --- | --- | --- |
| Coordinator / permitted office sender | Selects the intended internal technician, prepares and confirms dispatch. | Treat link creation as delivery or edit immutable evidence. |
| Email Dispatch + Power Automate | Delivery request, confirmed success/failure and completed time. | Change technician evidence or claim the card was opened. |
| Technician bearer-link browser | Completes one snapshotted Job/assignment card. | Receive Dataverse credentials, list other Jobs or write operational Job fields. |
| Azure Table/Blob Job Card store | Request lifecycle, immutable snapshot/evidence, private photos and office audit. | Become the operational Job or reference-data master. |
| Dataverse | Current Job, primary technician, active assignments and operational status. | Replace the immutable submitted snapshot with current mutable values. |
| Office reviewer | Reviews evidence and records office actions under a validated delegated identity. | Rewrite technician evidence, silently overwrite a concurrent action or imply GreenTree was updated. |
| Scheduled reconciliation | Retries eligible status/meter work using server identities and saved evidence. | Invent missing assignments/evidence or turn an incomplete read into success. |

Reviewer access requires both the application capability and authoritative backend allowlist. A visible
route alone is not authorization.

## Source-of-truth matrix

| Question | Authority |
| --- | --- |
| What work was sent? | Immutable Azure snapshot created when the secure link was generated. |
| Was the email actually sent? | Confirmed Email Dispatch result, not token creation. |
| Which technicians are currently required? | Current Dataverse primary technician plus active Job Assignments. |
| Did a technician return a card? | Latest matching Azure lifecycle for that primary/assignment scope. |
| What did the technician submit? | Immutable Azure evidence and private Blob originals. |
| What is the current Site Contact? | Separate minimal delegated Dataverse read in office review. |
| Where is office processing up to? | Azure office status, activity audit and ETag. |
| What is the operational Job status? | Dataverse `gr_status`; never inferred from office display labels. |
| Was GreenTree updated? | GreenTree itself. “Mark complete” records that an administrator says entry is complete. |
| Is a meter approved/applied? | Saved office approval plus the separate meter-sync status and bound Job provenance. |

## End-to-end primary path

| Step | User/system action | Authoritative result | Visible state |
| ---: | --- | --- | --- |
| 1 | A numbered ordinary Job has an internal primary technician and/or active additional assignments. | Dataverse roster identifies possible recipients. | Job remains **Staging** until confirmed dispatch. |
| 2 | An authorized sender opens the email composer. | Current Job/technician data is loaded; recipient is not freely caller-supplied. | Preview is editable only where permitted. |
| 3 | The server generates a request for one technician scope. | 32-byte token returned once; only SHA-256 hash and immutable snapshot are stored. | Existing active link requires explicit replacement confirmation. |
| 4 | The app queues Email Dispatch. | Power Automate sends asynchronously and records success/failure. | Sending → Sent or Failed. Token creation alone is not “Sent.” |
| 5 | Confirmed first dispatch is reconciled. | Only Staging/Unallocated may move to With Technician/Allocated. | Job shows confirmed technician ownership. |
| 6 | Technician opens `/portal/job/:token`. | Server validates token lifecycle and returns the minimum saved snapshot. | One Job Card; no authenticated application or other Jobs. |
| 7 | Technician completes evidence. | Text/time/parts draft may recover in the same tab; photos are uploaded privately and retry-safely. | Client and server enforce the same bounded rules. |
| 8 | Technician submits. | ETag-protected request becomes `pendingReview`; concurrent/replayed submit loses. | Success screen and editable local Job-sheet PDF. |
| 9 | Server sends review notice and attempts status reconciliation. | Notification/status failures never roll back accepted evidence. | Card appears in Submitted even if notification failed. |
| 10 | Every current required return is verified. | Only an Allocated Job may move to Completion Review; incomplete/unavailable checks block. | Multi-tech progress becomes all received/withdrawn. |
| 11 | Reviewer checks evidence and optionally starts GreenTree entry. | Azure office audit records actor/time; no evidence is changed and no lock is taken. | Pending → In review, shown under Needs follow-up. |
| 12 | Reviewer records follow-up/corrections as needed. | Required notes append to audit; Resume returns follow-up to In review. | Shared queue reflects latest ETag-protected action. |
| 13 | GreenTree entry is genuinely finished; reviewer marks complete. | Office outcome becomes Processed in GreenTree; optional approved meter is handled separately. | Card moves to Completed. |
| 14 | Operational completion occurs through its own accepted workflow. | Job completion and Service/WOF side effects remain separate. | Office filing alone never sets Job Complete. |

## State models

### 1. Request and evidence lifecycle

```text
active ──submit──────────────> pendingReview ──office final action──> reviewed
  ├────replace───────────────> superseded
  ├────withdraw + reason─────> withdrawn
  └────expiry time reached───> expired (derived display of unused active request)
```

- Replacement affects only the same primary/assignment scope.
- Submitted/reviewed evidence is never superseded or reopened; a later send creates another cycle.
- Invalid, superseded, expired, withdrawn and already-used links return distinct safe outcomes.

### 2. Office-review lifecycle

```text
pending ──Start GreenTree entry──> inReview
   │                                  ├──Needs follow-up──> needsClarification
   │                                  ├──legacy hold──────> onHold
   │                                  └──Mark complete────> processedInGreenTree
   └────────────Mark complete─────────────────────────────> processedInGreenTree

needsClarification/onHold ──Resume entry──> inReview
any active or terminal state ──Record office correction──> same state + audit note
```

- Starting is optional and is not a lock.
- Needs follow-up requires a note and sends no automatic technician message.
- Final outcomes cannot be reopened in the current UI.
- `noInvoiceRequired` and `legacyReviewed` are historical terminal outcomes only.

### 3. Operational Job lifecycle touched by Job Cards

```text
Staging (Unallocated)
  └──confirmed technician dispatch──> With Technician (Allocated)
                                         ├──all current returns verified──> Completion Review
                                         └──final active ownership withdrawn──> Staging

Completion Review ──separate accepted completion workflow──> Complete
```

- Assignment selection alone does not leave Staging.
- Action Required and unrelated statuses are not automatically overridden.
- Technician submission, office filing and GreenTree status cannot individually set Complete.

## Proposed roster-first dispatch interaction

**Status: proposed product design — not implemented.** This section records the desired interaction
identified during workflow mapping. It deliberately separates technician participation from email
composition so a later send cannot silently replace an earlier technician or their required card.

### What the current buttons do

- The Job Book/Service Coordination row email action opens a composer for the Job's current
  `gr_Mechanic`. Sending does **not** set that person as primary; the Job already stored them.
- Clicking that row action again targets the same stored technician. For an unused active request,
  the server requires confirmation before replacing only that technician's secure link.
- The canonical Job drawer already has a Job Cards section where users can add a
  `gr_jobassignment`, then send that additional technician a separately scoped card.
- The row action does not expose that roster, its delivery/card states, or the add/withdraw flow.
- The first/“primary” Azure request currently has a blank assignment ID and is matched against the
  Job's *current* primary technician. Changing `gr_Mechanic` after dispatch can therefore make the
  earlier technician stop matching the current expected-return roster. This is the core data-model
  issue to resolve, not merely a label change.

### Recommended user model

Use **Assigned technicians** as the group and **First technician** as a chronological display label,
not a privileged ownership role. Every technician who is sent the Job remains a visible participant
with an independent delivery and Job Card lifecycle.

The row action should be contextual:

- Before any technician-card activity exists: **Email technician** opens the shared technician
  composer at its normal width for the selected first technician, preserving the fast first-send
  path.
- After any request, dispatch or submission history exists: clicking **Email technician** must first
  open the same composer widened with an **Assigned technicians** roster attached on the right. It
  must not jump directly to another send or replacement.
- After the dialog is opened, the row action may be relabelled **Technicians (n)** or **Manage
  technicians** so the continuing behavior is obvious.
- The pop-out is available from both Job Book and Service Coordination and uses one shared workflow.

The roster is a side-by-side extension of the existing email composer, not a separate, stacked or
replacement dialog:

```text
┌──────────────────── Email technician ────────────────────┬── Assigned technicians ──┐
│ To: Rick                                                  │ Mo   First · Awaiting     │
│ Subject: Job 147497                                       │ Rick Selected · Not sent  │
│ Message                                                   │ Sam  Withdrawn            │
│                                                           │                          │
│                                      [Cancel] [Send]       │ [+ Add technician]       │
└───────────────────────────────────────────────────────────┴──────────────────────────┘
```

- The left side remains the existing composer and always shows which technician the email will be
  sent to.
- The right-side roster shows every known technician and the valid actions for each lifecycle.
- Selecting a technician in the roster updates the recipient and content on the left; it does not
  open another dialog or hide the roster.
- Adding a technician adds and selects that participant, then prepares the left-side composer for
  them without replacing an existing participant.
- After a successful send, the composer remains open and the right-side status refreshes for the
  selected technician.
- Closing the window closes both sides together and returns focus to the originating Job row.

For Job Book specifically, the click sequence is:

1. Load the current Job version, current primary/assignments, bounded Azure Job Card history and
   relevant dispatch state.
2. If there is genuinely no technician-card activity, open the existing composer at its normal
   width for the selected first technician.
3. If any activity exists, open the composer with the **Assigned technicians** panel attached on
   the right and show the complete known list before another email is sent.
4. If roster/history cannot be verified, show a retryable error. Do not assume the Job is new and
   open a blank composer, because that could create an accidental replacement/duplicate cycle.

“Activity” is intentionally broader than confirmed email delivery. An active secure link, queued or
failed dispatch, expired link, withdrawal, submission or completed review must also trigger the
roster dialog, because each can affect whether a new send is safe.

Each technician row should show:

- name and optional **First technician** label;
- assignment/attendance state;
- delivery state: Not sent, Sending, Sent or Failed;
- card state: No card sent, Awaiting card, Expired, Received or Withdrawn;
- last sent/submitted time where known; and
- only the actions valid for that lifecycle.

```text
Manage technicians — Job 147497

Mo    First technician    Sent · Awaiting card
      Last sent yesterday                 [Resend] [No longer attending] [Withdraw]

Rick                       Not sent
      Added today                         [Compose and send] [Remove]

Sam                        Withdrawn · No card required
      Sick before attending

[+ Add technician]                                      [Done]
```

The roster panel's primary actions are:

1. **Add technician** — creates a stable participant/assignment without changing existing rows.
2. **Compose and send** — sends only the selected technician's assignment-scoped card.
3. **Resend** — sends the same technician again. Replacing an unused active link requires explicit
   confirmation; submitted evidence remains immutable and a new cycle is created.
4. **No longer attending** — stops future attendance but keeps the card required when the technician
   has already performed work and still owes evidence.
5. **Withdraw — no card required** — requires a reason, revokes an active link and removes that
   participant from required-return completeness without erasing the audit.
6. **Remove** — available only for a never-sent assignment with no Azure or historical evidence.

### Example: parts arrive and another technician finishes

1. Mo was sent the Job and remains **Awaiting card**.
2. Office opens **Manage technicians**, adds Rick and sends Rick his own card.
3. The dialog shows Mo and Rick independently; neither send replaces the other.
4. Mo remains required because he performed work before the parts delay.
5. Rick also becomes required for his completion work.
6. Completion Review waits until both are Received, unless an authorized office user explicitly
   withdraws one as **no card required** with an audit reason.

### Example: planned technician is sick before attending

1. Mo was sent the Job but did no work.
2. Office opens **Manage technicians** and chooses **Withdraw — no card required** for Mo, recording
   “Sick before attending” (or another bounded reason).
3. Mo remains visible as Withdrawn; his link no longer works and no card is expected.
4. Office adds Rick and sends a separately scoped card.
5. If Rick is the only non-withdrawn participant, only Rick's return is required.

### Required identity change

The safest implementation is to give **every sent technician, including the first**, a stable Job
Assignment/participant ID and generate every new request with that ID. `gr_Mechanic` may remain the
current lead/scheduling shortcut, but it must not be the identity of an already-issued card.

Compatibility rules:

- Existing blank-assignment “primary” Azure cycles remain visible as an **Initial technician
  (legacy scope)** bound to their saved technician ID.
- Changing the current lead never relabels, transfers or hides an earlier request/evidence record.
- Migration/backfill must be deterministic and must not create duplicate required returns.
- The expected-return check uses stable active participant IDs plus explicit withdrawal state, not
  whichever person currently occupies `gr_Mechanic`.
- Delivery, evidence and withdrawal history remain immutable when the scheduling lead changes.

## Case catalogue

### A. Eligibility, identity and dispatch

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-A01 | Numbered managed ordinary Job, permitted internal technician, valid email | Composer may prepare one assignment-scoped card. | Current |
| JC-A02 | Intake, unnumbered, Void or unsupported Job | Dispatch is unavailable/rejected before link creation. | Current |
| JC-A03 | Site Check Job | Uses its separate occurrence-card workflow and status controls. | Separate |
| JC-A04 | External supplier | No technician card, assignment or expected return is created. | Current |
| JC-A05 | Missing technician or invalid/missing email | No secure link or dispatch is created. | Current |
| JC-A06 | Recipient outside approved pilot | Client disables and server rejects generation. | Current release restriction |
| JC-A07 | Localhost/loopback send | Rejected before token-dependent reads, link generation or dispatch. | Current |
| JC-A08 | Unauthorized sender/reviewer | Route/action is denied; valid sign-in alone is insufficient. | Current; live named-user acceptance remains open |
| JC-A09 | Primary versus additional technician | Each uses an independent scope; one cannot replace another's link/evidence. | Current |
| JC-A10 | Job or assignment changes while composing | Guarded workflow rejects stale version/details; reopen preview. | Current |
| JC-A11 | First confirmed send while Job is Staging | Move only Staging → With Technician after confirmed dispatch. | Current contract; deployed acceptance required |
| JC-A12 | Dispatch while Job already in another status | Preserve status; do not force an invalid transition. | Current |

### B. Link creation, delivery and ownership

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-B01 | Generate link | Save immutable snapshot and token hash; return raw token once. | Current |
| JC-B02 | Existing unused active link | Return conflict and require explicit replace confirmation. | Current |
| JC-B03 | Confirm replacement | Supersede only that technician's unused request; old token becomes invalid. | Current |
| JC-B04 | Resend after submitted/reviewed card | Create a new cycle without changing earlier evidence/outcome. | Current |
| JC-B05 | Dispatch accepted but flow pending | Show Sending; do not claim delivery or move status yet. | Current |
| JC-B06 | Flow confirms success | Record Sent/completed time and include in Open jobs until returned. | Current |
| JC-B07 | Flow fails/times out | Show Failed; do not include as confirmed Open or claim delivery. | Current |
| JC-B08 | Repeat confirmed sends | Deduplicate Open by Job + assignment + recipient, newest request first. | Current |
| JC-B09 | Link expires unused | Portal reports expired; Open retains resend-needed case when recovery backend supports it. | Gated recovery visibility |
| JC-B10 | Withdraw current active link | Require reviewer, reason and matching ETag; revoke access and retain audit. | Gated recovery control |
| JC-B11 | Final technician ownership withdrawn | Return only Allocated Job to Staging; failure produces an operational warning. | Gated recovery control |
| JC-B12 | Another current owner/submission remains | Withdrawal preserves allocation or may reconcile to Completion Review if all returns qualify. | Gated recovery control |

### C. Technician portal and validation

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-C01 | Valid active token | Return saved minimum Job/Equipment/Customer/Site/technician context. | Current |
| JC-C02 | Invalid or superseded token | Generic invalid-link result; no existence leak. | Current |
| JC-C03 | Expired token | Explicit expired message; no submission. | Current |
| JC-C04 | Submitted/reviewed token | Explicit already-submitted message; replay blocked. | Current |
| JC-C05 | Withdrawn/otherwise unavailable token | Unavailable message; no submission. | Current |
| JC-C06 | Same-tab reload before submit | Restore text, meter, time and parts from token-hashed seven-day session draft. | Current |
| JC-C07 | Closed tab/different device | No recovery guarantee; photos always require reattachment. | Current limitation |
| JC-C08 | Missing Job story | Block submission. Maximum 10,000 characters. | Current |
| JC-C09 | Service Job with linked Equipment and no meter | Meter is required. Other cards may omit it. | Current |
| JC-C10 | Meter date | Required/sent only when backend advertises support and a reading exists; future/invalid dates fail. | Capability-gated |
| JC-C11 | Reading below saved current meter | Require explicit technician confirmation; server rechecks. | Current |
| JC-C12 | Time/travel | Require 1–50 real dates, positive hours up to 24 and whole non-negative kilometres. | Current |
| JC-C13 | Parts/materials | Allow 0–100 entries; description and positive bounded quantity required. | Current |
| JC-C14 | Further work or safety selected | Matching details become required; flags do not block office processing automatically. | Current |
| JC-C15 | Photos | Allow 0–20 JPEG/PNG/HEIC/HEIF files, each 1 byte–10 MiB, with signature checks. | Current |
| JC-C16 | Interrupted/repeated identical upload | Content-derived ID reuses the private Blob safely. | Current |
| JC-C17 | Photo from another token/missing Blob/duplicate reference | Final submission rejects it. | Current |
| JC-C18 | Concurrent/repeated final submission | Exactly one ETag-protected submission succeeds. | Current |
| JC-C19 | Review notification fails | Evidence remains accepted and visible; authorized office may retry notification. | Current |
| JC-C20 | Post-submit PDF | Technician may download an editable local PDF; it does not alter stored evidence. | Current |

### D. Multi-technician completeness and status recovery

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-D01 | Primary plus multiple active assignments | Treat each as a separately required scope. | Current |
| JC-D02 | Required technician never sent a card | Show No matching card sent and block Completion Review. | Gated expected-return view; server rule implemented |
| JC-D03 | Active unsubmitted request | Show Awaiting card and block Completion Review. | Current |
| JC-D04 | Expired unused request | Show Expired link and block until resent/withdrawn. | Gated recovery view |
| JC-D05 | Explicitly withdrawn required scope | Show Withdrawn; it is not awaited. | Gated recovery view |
| JC-D06 | Submitted or office-filed scope | Show Received; filing does not erase return evidence. | Current |
| JC-D07 | Primary technician changed after send | Old lifecycle no longer matches; new current technician is Not sent. | Current conservative rule |
| JC-D08 | Assignment added/changed after other cards return | New/current unmatched assignment blocks Completion Review. | Current conservative rule |
| JC-D09 | Assignment removed | Removal is blocked when Azure history is unknown/truncated or references the assignment. | Current fail-closed rule |
| JC-D10 | Roster/history read denied, failed or ≥501 rows | Do not claim completeness or change Job status. | Current fail-closed rule |
| JC-D11 | Every current scope is Received or Withdrawn and Job is Allocated | Attempt Allocated → Completion Review under current Job ETag. | Implemented; deployment/reliability acceptance open |
| JC-D12 | Job changed concurrently | Refresh/re-read; never unconditional overwrite. | Current |
| JC-D13 | Submission-time status update fails | Preserve evidence; scheduled reconciliation retries later. | Implemented; monitoring acceptance open |
| JC-D14 | Office card is already filed before retry | Retry discovery still includes it. | Implemented locally/shared-backend rollout required |
| JC-D15 | Action Required, Complete, Void or other non-Allocated state | Do not automatically move it to Completion Review. | Current |

### E. Office queues and review detail

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-E01 | Open jobs | Only confirmed delivered, numbered ordinary Jobs still awaiting the applicable return. | Current |
| JC-E02 | Generated-but-unsent, failed/pending dispatch, placeholder number or Site Check | Exclude from Open. | Current |
| JC-E03 | Submitted | Office status Pending only. | Current |
| JC-E04 | Needs follow-up | In review, Needs clarification and legacy On hold. | Current |
| JC-E05 | Completed | Processed in GreenTree plus immutable legacy terminal outcomes. | Current |
| JC-E06 | Empty filtered page with more source rows | Continue bounded scan; do not report the whole queue empty. | Current |
| JC-E07 | Legacy offset reaches 500-row boundary | Label finite scan limit; never imply global completeness. | Current limitation |
| JC-E08 | Cursor paging enabled | Opaque bounded continuation and exact server Job-number lookup; other filters remain loaded-page-only. | Gated/off in released build |
| JC-E09 | Queue refresh/focus while detail open | Do not replace the open form/draft; stale requests cannot cross account/stage. | Current; scroll/page retention open |
| JC-E10 | Open review detail | Reading alone makes no change. Saved snapshot and live Site Contact stay distinctly labelled. | Current |
| JC-E11 | Missing current contact versus failed contact read | Display distinct states; do not invent contact data. | Current |
| JC-E12 | Photo view/download | Reviewer-authenticated private, no-store attachment; no public Blob URL. | Current |
| JC-E13 | Associated Quotes | Lazy, read-only bounded Job Quote view; no Quote mutation. | Current |
| JC-E14 | Job Card PDF | Generate only from saved snapshot/evidence; no current-data substitution. | Current |
| JC-E15 | Download photos / all documentation | Validate every file and save no partial ZIP; cancellation and account changes abort. | Current |
| JC-E16 | Local read-only review mode | Disable mutations/retries while retaining viewing/downloads. | Development-only |

### F. Office actions, concurrency and meter handling

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-F01 | Start GreenTree entry from Pending | Record verified actor/server time; move to In review; no lock. | Current |
| JC-F02 | Start again/from wrong state | Reject as conflict. | Current |
| JC-F03 | Needs follow-up | Require bounded note; retain immutable evidence. | Current |
| JC-F04 | Resume from Needs clarification or On hold | Return to In review and retain prior notes/activity. | Gated recovery control |
| JC-F05 | Record office correction | Append attributed note in active or terminal state; never rewrite evidence/PDF/GreenTree. | Gated recovery control |
| JC-F06 | Mark complete from an active office state | Optional GT reference; atomically record terminal actor/time/activity. | Current |
| JC-F07 | Retired No invoice required action | Reject new action; preserve existing outcome as read-only history. | Current |
| JC-F08 | Existing reviewed row without recorded outcome | Display Reviewed (legacy outcome not recorded), not Processed in GreenTree. | Legacy compatibility |
| JC-F09 | Attempt to reopen terminal outcome | Unavailable/rejected in current UI/API. | Current; structured reopen undecided |
| JC-F10 | Stale ETag/two reviewers | Reject write, keep local draft, require refresh before deciding again. | Current |
| JC-F11 | Unsupported fields/actor spoofing/activity overflow | Fail closed. Server authors identity/time. | Current |
| JC-F12 | Card has a meter but approval feature is off | Complete office filing without silently approving/writing the meter. | Current release behavior |
| JC-F13 | Meter approval enabled | Require explicit confirmation and valid recorded date; correction/lower/large jump needs reason. | Gated/off in released build |
| JC-F14 | Meter write succeeds | Patch only bound Job reading/date/type/reference under ETag; no completion/maintenance fields. | Gated |
| JC-F15 | Meter write fails after approval saved | Show pending/failed and allow idempotent retry; office evidence remains filed. | Gated |
| JC-F16 | Newer reading, changed Equipment, completed Job, same-day conflict or provenance mismatch | Do not overwrite silently; require operations reconciliation. | Gated fail-closed rule |

### G. Compatibility, failures and security

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-G01 | V2 client | Uses fixed V1 shared-backend bridge; arbitrary upstream destination is rejected. | Current compatibility |
| JC-G02 | Backend lacks recovery capability | Hide Resume/corrections/returns while retaining established review and downloads. | Current compatibility |
| JC-G03 | Backend lacks meter-date capability | Do not render, validate or send the new meter date. | Current compatibility |
| JC-G04 | Anonymous review/photo request | Reject. Public token authorizes only its own active submission flow. | Current |
| JC-G05 | Authenticated user outside reviewer allowlist | Reject even if identity/token is otherwise valid. | Current |
| JC-G06 | Hosted server tries memory-store/local bypass | Fail closed. | Current |
| JC-G07 | Upstream/shared backend unavailable | Show unavailable/error, not an empty queue/history. | Current |
| JC-G08 | Per-Job history exceeds bound | Return explicit truncation and block destructive assignment decisions. | Current |
| JC-G09 | Legacy evidence exists | Show in labelled historical read-only section; never merge into Azure state. | Legacy |
| JC-G10 | Secrets/tokens/photos | Raw token returned once; no token/hash/Blob path in review payload, DOM, archive or logs. | Current security boundary |

### H. Proposed technician-roster interaction

| ID | Case | Expected behavior | Status |
| --- | --- | --- | --- |
| JC-H01 | Open row action before any activity | Open the existing composer at normal width for the selected first technician. | Proposed |
| JC-H02 | Open row action after one or more activities | Open the composer widened with the roster attached on the right, showing every participant and independent delivery/card state. | Proposed |
| JC-H03 | Add Rick after Mo was sent | Create a separate stable participant; Mo remains visible and required. | Proposed |
| JC-H04 | Send Rick | Generate and dispatch only Rick's assignment-scoped card; never replace Mo's link/evidence. | Proposed |
| JC-H05 | Resend Mo with unused active link | Confirm replacement of Mo's link only. | Existing server rule; proposed roster UI |
| JC-H06 | Resend after Mo submitted | Preserve Mo's earlier evidence/outcome and create a new Mo cycle. | Existing server rule; proposed roster UI |
| JC-H07 | Mo stops attending but performed work | Keep Mo as required; mark attendance ended without withdrawing the owed card. | Proposed |
| JC-H08 | Mo is sick before attending | Withdraw with reason, revoke link and exclude Mo from required returns; keep audit visible. | Existing withdrawal rule; proposed roster UI |
| JC-H09 | Remove a never-sent technician | Delete only when no request, dispatch or historical evidence exists. | Partially current; proposed shared UI |
| JC-H10 | Attempt to remove a sent/received technician | Offer lifecycle-safe actions instead of deletion; never erase history. | Proposed |
| JC-H11 | Change current lead after dispatch | Earlier participants remain matched by stable IDs and do not disappear/rebind. | Required architecture change |
| JC-H12 | Existing blank-assignment primary cycle | Display as legacy initial participant and preserve its saved technician identity. | Required compatibility design |
| JC-H13 | Job Book versus Service Coordination | Both open the same technician pop-out and invoke the same guarded assignment/send actions. | Proposed |
| JC-H14 | Mixed states | Dialog may show Mo Awaiting, Rick Sent, Sam Withdrawn and prior received cycles without collapsing them. | Proposed |
| JC-H15 | Job Book first send with no history | Email button opens the existing composer at normal width for the selected first technician. | Proposed |
| JC-H16 | Job Book click with any existing activity | Email button opens the composer and attached roster together; no replacement occurs and the recipient is explicit before sending. | Proposed |
| JC-H17 | Existing failed/pending dispatch or active/expired link | Treat as activity and show the roster even when confirmed delivery is absent. | Proposed safety rule |
| JC-H18 | Roster/history check fails or is truncated | Show retryable unavailable state and do not fall back to direct compose. | Proposed fail-closed rule |
| JC-H19 | Select, Resend or Add from roster | Keep both panels visible and update the composer recipient/context on the left; do not open a second dialog. | Proposed |
| JC-H20 | Change selected technician | Update the composer for the selected row while retaining the full roster and its statuses on the right. | Proposed |
| JC-H21 | Successful send from composer | Keep the combined window open and refresh that technician's delivery/card state in the right-side roster. | Proposed |

## Known open decisions and gaps

| ID | Decision/gap | Why it matters |
| --- | --- | --- |
| JC-O01 | Broaden or replace the three-recipient pilot. | Determines who can actually use the mapped technician path. |
| JC-O02 | Confirm authoritative shared-backend version and enable recovery capabilities. | Source implementation is ahead of the released capability surface. |
| JC-O03 | Queue indexing/global ordering beyond bounded scans. | Older cards can be reachable without providing globally ordered/searchable results. |
| JC-O04 | Assignment-version invariant across roster read and Job status write. | Current ETag protects the Job, not an assignment changed between reads. |
| JC-O05 | Operations monitoring for aging cards, failed notifications and reconciliation failures. | Automated retry without visible ownership/alerting is not operationally complete. |
| JC-O06 | Terminal review reopen and structured post-approval amendment. | Current corrections are notes only; final outcome/evidence remains immutable. |
| JC-O07 | Void, withdrawn, GreenTree-reopened and historical repair policy. | These cases need explicit lifecycle rules before broad automation. |
| JC-O08 | Type-specific Service/WOF Job Card fields and atomic completion processor. | Required before office-reviewed evidence can safely replace manual completion dialogs. |
| JC-O09 | Technician authenticated workspace, offline/photo persistence and notifications. | Parked; do not infer requirements or licensing from the bearer-link workflow. |
| JC-O10 | Named-user, multi-browser, mobile and service-identity acceptance. | Automated tests do not prove live permissions, deployment or device behavior. |
| JC-O11 | Stable participant model for the first technician. | Must be decided before implementing the roster dialog; a label-only change leaves the primary-scope identity bug intact. |

## Acceptance walkthrough set

Use disposable test Jobs and record the Job number, assignment IDs, review IDs and exact result for
each run. Never use production evidence mutation merely to prove a UI state.

1. Primary technician happy path, including confirmed delivery and office completion.
2. Two technicians: one received/one awaiting, then both received.
3. Additional assignment added after the first submission.
4. Missing link, expired link, replacement and explicit withdrawal.
5. Dispatch failure followed by safe retry; confirm no duplicate Open row.
6. Portal reload draft recovery, lost-photo behavior and concurrent submit.
7. Lower meter confirmation, absent meter on Service, invalid date and photo failure.
8. Notification failure with evidence still present in Submitted.
9. Two reviewers acting from the same ETag, preserving the losing draft.
10. Follow-up → Resume → completion, retaining the full audit.
11. Terminal office correction without rewriting the PDF/evidence.
12. Status automation failure followed by scheduled recovery after office filing.
13. Assignment/history permission failure and ≥501-history fail-closed behavior.
14. Legacy Dataverse evidence beside a current Azure cycle.
15. Gated meter approval: success, failed write/retry, newer reading and changed Equipment.
16. Narrow/mobile portal and office review, private photo/PDF/ZIP downloads, cancellation and account switch.
17. Parts handover: Mo remains Awaiting while Rick is added/sent; both returns remain independently required.
18. Sick before attendance: withdraw Mo with a reason, add/send Rick and verify Mo remains visible but not required.

## Automated coverage anchors

- Link, submission, photos, withdrawal, concurrency and operational transitions:
  `tests/jobsubmission.test.cjs`
- Technician form and draft rules: `tests/technicianSubmission.test.ts`,
  `tests/jobCardDraft.test.ts`
- Office state transitions: `tests/jobCardOfficeReview.test.cjs`
- Current roster and expected returns: `tests/jobCardExpectedReturns.test.cjs`
- Recovery and continuation: `tests/jobCardRecovery.test.cjs`
- Queue/search/stages/Open projection: `tests/jobCardReviewQueue.test.ts`,
  `tests/jobCardWorkflowStages.test.cjs`
- Review UI/detail/download boundaries: `tests/jobCardWorkflowUi.test.mjs`,
  `tests/jobCardPhotoDownload.test.mjs`
- Meter approval/write safety: `tests/jobCardMeterApproval.test.cjs`
- V2 bridge/private proxy: `tests/jobSubmissionProxy.test.cjs`,
  `tests/jobCardReviewsProxy.test.cjs`

## Related documents

- [Technician Job Card Submission Architecture](../architecture/technician-job-submission.md)
- [Multi-technician Job Cards](../architecture/multi-technician-job-cards.md)
- [Office Job Card review](../wiki/Office-Job-Card-Review.md)
- [Azure Job Card Storage](../azure-job-card-storage.md)
- [Job email dispatch](../email-dispatch-flow.md)
- [Job Card implementation and activation report](../reviews/2026-10-10-job-card-implementation.md)
- [Current state](../../CURRENT_STATE.md)

