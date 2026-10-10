# Job Card review: screens and functions

Reviewed and updated 10 October 2026 against `v2-deployment`.
This is a focused review plus the first queue/dialog improvement, **not live acceptance**.
The broader [application audit](2026-10-10-application-audit.md) and
[release gates](../../RELEASE_READINESS.md) still apply.

**Implementation update, later 10 October:** findings below preserve the original review baseline.
Several are now addressed locally; use the [implementation and activation report](2026-10-10-job-card-implementation.md)
for current status. Meter approval and continuation remain gated off. No live acceptance occurred;
the personal-account technician app is parked by the owner.

## Summary

The existing review components are a useful foundation; another review screen is not needed.
Preserve immutable technician evidence, server-verified reviewer identity, ETag conflict handling,
private downloads and the separation between office processing and operational Job completion.
Before expanding use, fix missing-backlog/retry behavior and complete named-user acceptance.

The technician assigned-jobs app is now a separate [TODO](../../TODO.md). Its future workspace
should reuse the existing forms and evidence service, but requires authenticated technician
identity and server-enforced assignment-scoped access. A single-job bearer link must not become
permission to browse every Job. The current online-link generation remains a two-recipient pilot.

## What the current screens actually do

| Screen | Current meaning | Important boundary |
| --- | --- | --- |
| Open jobs | Confirmed numbered email sends still awaiting a matching submission | Not every operational open Job; no direct Job/history action on these rows |
| Submitted | Saved technician cards ready for GreenTree entry | Opening a card in the review dialog does not start entry |
| Needs follow-up | GreenTree entry, Needs clarification or On hold | Formerly In progress; clarification/hold save a note only; no message, new link or follow-up Job |
| Completed | Processed in GreenTree plus explicitly labelled legacy outcomes | Manual office data-entry confirmation, not operational Job completion or a verified GreenTree API result |

An administrator may process a card directly from Pending. That is current behavior, not a claim
that the evidence has been checked automatically. The reference is optional; final outcomes
cannot be reopened in the UI. Keep this separate from the owner's decision that a GT-closed Job
with missing required operational evidence must remain in **Completion Review**.

## Verified office process and screen intent

1. A numbered Job is sent to the technician and remains in **Open jobs** until a saved submission
   can be matched to that dispatch.
2. The technician performs the work and submits the Job Card. Digital submission is intended to
   replace late, handwritten and hard-to-read paper cards; it is evidence, not a completion answer.
3. **Submitted** is the office administrator's GreenTree entry work queue. Opening a row keeps the
   queue and its filters in place and displays the saved card in a centred review dialog. Its scan
   strip surfaces technician, submission time, labour, travel, evidence counts and reported flags.
4. **Start GreenTree entry** records who began handling the card. It coordinates the shared queue
   but does not lock the record.
5. Incorrect/missing time or parts are placed in **Needs clarification** or **On hold** with a note
   while the administrator contacts operations, the technician or parts staff outside this system.
   The current action does not itself send a message.
6. **Mark complete** is selected only after office data entry is complete. It records the existing
   **Processed in GreenTree** outcome and archives the
   office card record; it does not prove operational Job completion or rewrite technician evidence.

The dialog/wording change above is implemented in the working tree. The queue-index, communication,
resume and tracking changes below remain outstanding.

## Findings and proposed changes

### JC01 — High: expired unreturned links disappear from the awaiting queue

`cycleIsOpen` accepts only an absent lifecycle or an unexpired active link. A successfully sent
card with no submission therefore disappears when its link expires. It does not move to another
review stage. Per-Job history can still show it as expired; evidence is not deleted.

**Recommendation:** keep outstanding dispatches visible with an **Expired link — resend needed**
state. Distinguish expiry from an explicit withdrawal/replacement. Link to canonical Job/history
controls subject to the user's existing permissions, rather than adding a second dispatch UI.

Evidence: [jobCardOpenJobs.js](../../api/services/jobCardOpenJobs.js),
`cycleForDispatch`, `cycleIsOpen`, `listOpenJobs`; existing stage tests explicitly cover exclusion.
An offline probe also confirmed the expired/no-submission predicate.

### JC02 — High: queue search and paging cannot reliably cover the backlog

Azure lifecycle reads collect at most 501 matching storage rows and sort that subset; they are
not a global newest-first query. The API exposes at most 500 source rows, filters Submitted/Review
after slicing, and the UI searches only rows already loaded. Thus a stage page can be empty while
later pages contain matches, and some records cannot be reached through this queue at all.
The UI does warn about limited/loaded results; that warning does not make the backlog complete.

Offset paging also moves when another administrator finalizes an earlier card. An offline
four-row example loaded A/B, processed A, then loaded offset 2: it returned D and skipped C.
Refresh restores visibility within the scan, but deduplicating loaded IDs cannot recover a skipped row.

**Recommendation:** indexed stage/job lookup with stable continuation and bounded server-side
search/filtering. Keep each response small; do not fix this by loading every card. Add tests for
more than 501 rows, sparse stage matches, concurrent stage changes and locating a specific old Job.

Evidence: [jobCardStorage.js](../../api/services/jobCardStorage.js), `collect` and
`AzureJobCardStore.listByLifecycleStatus`; [jobSubmissionService.js](../../api/services/jobSubmissionService.js),
queue branch in `handleReviewRequest`; [useJobCardReviews.ts](../../src/alpha/job-card-reviews/useJobCardReviews.ts), `loadMore`.

### JC03 — High: office processing can remove an unresolved status-update retry

Public submission saves evidence first, then attempts Allocated → Completion Review. A failure
is logged and submission still succeeds, correctly preserving the evidence. However, the scheduler
discovers retry candidates from `listPending`, which reads only `pendingReview` records.
**Processed in GreenTree** changes the card lifecycle to `reviewed`, without retrying or recording
the operational update. If all of a Job's cards are processed before recovery, that Job drops out
of this retry path and can remain Allocated until a separate action changes it.

An offline memory-store probe confirmed eligible reviewed evidence exists while reconciliation
checks zero Jobs. This extends application-audit A04/A05; it is not a new live incident claim.

**Recommendation:** persist operational reconciliation work independently of office card status.
Show pending/failed automation to operations, retain retry ownership until success or an explicit
no-op decision, and never delay or roll back accepted technician evidence because Dataverse fails.

Evidence: [jobSubmissionService.js](../../api/services/jobSubmissionService.js),
`handlePublicPost`/`reconcileCompletionReview`; [jobCardOfficeReview.js](../../api/services/jobCardOfficeReview.js),
terminal transition; [jobOperationalStatusAutomation.js](../../api/services/jobOperationalStatusAutomation.js),
`reconcilePendingCompletionReviews`; [jobCardStorage.js](../../api/services/jobCardStorage.js), `listPending`.

### JC04 — High: multi-technician completeness is not an authoritative assignment check

The automation checks the latest Azure request lifecycle for each known primary/assignment key.
It waits for multiple known card requests, but cannot detect a required Dataverse technician
assignment for which no Azure request was created. No source read reconciles that expected roster
in this decision. The review detail also lacks a sibling-card/expected-return summary.

**Recommendation:** derive expected returns from an explicit, authoritative assignment/dispatch
policy and display **received / still awaited / withdrawn / link expired** beside each Job.
Reuse the per-Job history service, but extend it rather than pretending it already knows all
required assignments. Do not make technician “work complete” answers determine Job completion.
This is the same underlying gap as application-audit A05.

Evidence: [jobOperationalStatusAutomation.js](../../api/services/jobOperationalStatusAutomation.js),
`latestTechnicianLifecycles`/`allRequiredTechnicianSubmissionsReceived`;
[JobCardReviewDetail.tsx](../../src/alpha/job-card-reviews/JobCardReviewDetail.tsx);
[JobCardHistoryPanel.tsx](../../src/alpha/job-card-reviews/JobCardHistoryPanel.tsx).

### JC05 — Medium: blocked reviews cannot return to In review

Start review is offered and accepted only from Pending. On hold and Needs clarification can move
between those states or finish processing, but cannot resume In review. This was confirmed in
both the API transition rules and the sample browser's held card.

**Recommendation:** add an explicit **Resume review** action for those two states, recording the
actor/time and retaining the prior note in audit history. Keep final outcomes immutable unless a
separate correction policy is agreed. “Current administrator” presently means the last office
actor, not a reserved owner; rename it **Last handled by** unless actual ownership is wanted.

Evidence: [jobCardOfficeReview.js](../../api/services/jobCardOfficeReview.js),
`applyOfficeTransition`; [JobCardReviewDetail.tsx](../../src/alpha/job-card-reviews/JobCardReviewDetail.tsx).

### JC06 — Medium: stale screens and ambiguous labels slow office work

- **Implemented locally:** Review is now labelled **Needs follow-up** (previously In progress);
  Pending/In review are displayed as **Ready for entry / GreenTree entry**. Stage membership is
  unchanged. The primary action is **Mark complete**; review rows open in a centred popout over
  the mounted queue; detail time uses Auckland explicitly.
- Decide with users whether **Open jobs** should become **Awaiting cards**. Consider
  **Processed / archive** for Completed while preserving legacy outcome badges. The final
  confirmation still says “History,” a former tab label, and the read-only notice still mentions
  the retired “Mark reviewed” action.
- Queue data refreshes on mounting/manual refresh, not polling or a visibility/realtime event.
  The new drawer preserves the mounted queue and query filters; add scoped freshness, a
  last-refreshed indicator, post-transition refresh and deliberate scroll/focus restoration.
- Detail shows context and the whole office activity history before the technician story. In the
  narrow browser panel, useful evidence was below the initial viewport. Keep a compact status/action
  strip, put evidence first, and make the audit history expandable without hiding safety/further-work
  observations. Keep the existing wider-screen two-column evidence layout.
- Queue tables require horizontal scrolling; review rows have a 1370px minimum width. Prioritize
  Job, technician, age and office state, with secondary details available without creating another
  competing table implementation.
- Queue, drawer detail and ZIP names explicitly use Auckland time. History still uses the browser's
  timezone and the PDF prints the saved ISO timestamp; finish standardizing display timezone/labels
  while retaining the original stored value.

Evidence: [queue model](../../src/alpha/job-card-reviews/jobCardReviewQueueModel.ts),
[queue component](../../src/alpha/job-card-reviews/JobCardReviewQueue.tsx),
[queue CSS](../../src/alpha/job-card-reviews/JobCardReviewQueue.css),
[review hook](../../src/alpha/job-card-reviews/useJobCardReviews.ts),
[detail](../../src/alpha/job-card-reviews/JobCardReviewDetail.tsx),
[screen](../../src/alpha/job-card-reviews/JobCardReviewsScreen.tsx),
[history](../../src/alpha/job-card-reviews/JobCardHistoryPanel.tsx),
[PDF](../../src/alpha/job-card-reviews/jobCardReviewPdf.ts).

## Keep and reuse

- Existing queue/dialog-detail split, shared action dialogs, searchable selectors, table/sort controls
  and filter pills. Consolidate duplicated review button styles through established shared styles.
- Server-authored office audit, bounded notes, required hold/clarification notes, explicit final
  confirmation and stale-ETag rejection. Starting review is not a lock; do not advertise it as one.
- Immutable saved equipment/customer/site and technician evidence; label current contact separately.
  Neither review processing nor GT account matching should rewrite operational reference data.
- Lazy authenticated photos, cancellable sequential ZIP downloads, filename/size validation,
  PDF from saved evidence only and lazy read-only associated Quotes. No additional download
  implementation is needed. Photo previews/downloads and office audit remain distinct from evidence.
- Existing legacy evidence and separate Site Check workflow; do not delete their tables or services
  as part of this tidy-up.

## Delivery order and acceptance

1. Fix JC01–JC04 tracking/recovery and add regression tests. Decouple office processing from
   operational retry discovery; do not infer that a processed card means a completed Job.
2. Complete Resume entry, evidence-first layout and remaining agreed terminology using existing components.
3. Test two reviewers, missing/expired second-technician links, no-link assignments, failed automatic
   updates, more than 501 cards, old-Job searches, stale tabs and return-to-list behavior.
4. Verify real Office Admin/reviewer access and denial paths on the backend actually serving V2.
   Frontend app-role admission is separate from `JOB_CARD_REVIEWER_EMAILS`; V2 currently proxies
   these requests to V1. Simulated roles are not proof of tenant privileges or deployed configuration.
5. Design the technician workspace separately. Confirm identity/Staff mapping, assignment visibility,
   dispatch vs assignment semantics, pilot expansion and draft/resubmission rules before building.
   Offline mode, notifications and native-app packaging remain undecided, not assumed requirements.

## Validation performed

- **100/100 existing focused tests passed:** queue, office transitions, workflow UI/stages,
  photo archives, proxies, submission/authentication and technician-submission domain tests.
- **5/5 offline diagnostic probes reproduced current limitations:** no resume, expired-link
  exclusion, lost processed-card retry discovery, mutable-offset skip, and the 501-row scan ceiling.
  These probes assert current defects; they are not desired-behavior regression tests.
- Sample-only browser walkthrough inspected all four tabs, Pending and On hold details, and the
  GreenTree confirmation (cancelled without saving). Saved context, live-contact distinction,
  evidence placement, legacy labels and absence of Resume were observed. No live records or
  cloud configuration were accessed or changed. Existing user tabs were left open.
- No new live photo/PDF download, real-user authorization, mobile-device, scheduler or deployment
  acceptance was performed. Automated download tests do not replace those checks. The earlier
  full-suite/lint failures remain; this focused passing suite does not clear broad rollout gates.

- **First implementation pass:** production build and focused technician-submission/review tests pass
  after introducing the centred review dialog, query-preserved opening, GreenTree-entry wording and
  Auckland detail timestamps. No cloud deployment or live record mutation was performed.

The queue dialog/wording changes are implemented locally. JC01–JC05, remaining JC06 work and
deployment are outstanding.
