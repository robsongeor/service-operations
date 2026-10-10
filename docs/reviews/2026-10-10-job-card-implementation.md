# Job Cards: office approval and recovery

Working-tree implementation, 10 October 2026. **Not deployed or approved for rollout.**
This updates the findings in the [initial review](2026-10-10-job-card-review.md), not the
separate [application-wide release gates](../../RELEASE_READINESS.md).

## Decisions

- Hour-meter readings affect the Job and usage predictions **only after office approval**.
- Office staff record corrections after speaking to the technician; original evidence remains
  unchanged. No technician addendum workflow is being introduced.
- **The signed-in technician app is parked at the owner's request.** Keep existing emailed
  single-job links and the current two-recipient pilot. No personal-account access, broader
  roster, new identity provider, licences or cloud resources have been provisioned.
- Filing a card in Completed confirms office GreenTree entry. It does not complete the
  operational Job, perform GreenTree entry or advance service/WOF history.

## Implemented locally

| Area | Behavior | Release boundary |
| --- | --- | --- |
| Meter approval | Mark complete asks for an approved reading, its actual recorded date and explicit confirmation. Corrections, lower readings and increases of 1,000+ hours require an explanation. | Backend gate remains off; new Dataverse column and writer permissions required. |
| Meter synchronization | Save the approval/actor/date durably in Azure, then conditionally patch only the Job's reading, date, Actual classification and approval reference. Show pending/failed updates and an explicit retry. | No Equipment, service-plan, WOF or operational-status write in this action. |
| Meter writer identity | Dedicated backend credentials and guard `1.0.2.0` bind the application, system user and role to the four-field operation before any broad-role bypass. | Locally implemented/tested; role, identity, reference column and guard upgrade are not deployed. |
| Prediction evidence | An approved, dated open-Job reading can contribute to existing usage calculations. The reference binds review ID, hours, date and equipment; later edits cannot inherit approval for different evidence. | Frontend meter flag off. Existing completed-Job calculations remain. |
| Correction notes | Append an attributed office correction, including on a filed card. Preserve original submission, original PDF, final outcome and history. | Notes do not automatically amend GreenTree or an already approved meter. |
| Follow-up | Resume entry from Needs follow-up or legacy On hold; retain previous notes in history. Display Last handled by, not an exclusive owner. | No locking or automatic technician messages. |
| Missing cards | Expired unreturned links stay in Open jobs with an explicit resend-needed label. | Explicit withdrawals/replacements are still distinct; no resend is sent automatically. |
| Expected returns | On-demand detail reads the current primary technician and active Job Assignments, then matches their latest Azure lifecycle. Missing, expired and received cards are distinct. | Read permission required. Incomplete/unavailable reads fail visibly; they never prove completeness. |
| Status recovery | Automatic Allocated → Completion Review also checks the authoritative roster. Retry discovery includes both pending and office-filed cards and advances a saved cursor. | No guarantee of an atomic assignment/status transaction; see remaining work. |
| Queue recovery | Optional bounded storage continuation and exact Job-number lookup reach beyond the old 500-card scan without loading the entire queue. | Client cursor flag off. Not a secondary index or global newest-first query. |
| Freshness | Refresh the queue on window focus; discard obsolete pagination responses. | Open review/draft notes are not replaced on focus. Scroll/page retention needs further work. |
| Existing emailed form | Capture meter-recorded date; restore text, time and parts after reloading the same tab. Hash the token for the session-storage key. | No stored photos, raw token, offline submission, cross-device or closed-tab draft recovery. |
| GT closure safeguard | GreenTree closure now routes non-complete Jobs to Completion Review instead of marking Complete or inventing a completion date. | Operations must use canonical type-specific completion. Existing Complete rows are not repaired automatically. |

## Meter integrity and failure handling

`jobCardMeterApproval.js` rejects malformed/future dates, invalid numbers, missing confirmation,
invalid source identity and mismatched Job/equipment. It reads the current Job and Equipment
baseline, uses the Job ETag and never retries a 412 as an unconditional overwrite. A newer Job
reading is retained; a different same-day reading, changed equipment or already-complete Job
requires operations reconciliation. Retrying an already applied approval is a no-op.

The saved reference format is `reviewId|hours|YYYY-MM-DD|equipmentId` (at most 95 characters).
It is provenance, not an authorization token. Authorization remains the reviewer identity,
server action and Dataverse policy. Azure retains the approver, time and reason.

Azure and Dataverse are not one transaction. If the approval is saved but the Job write fails,
the office card can be filed while its meter update remains pending/failed. Retry and scheduled
reconciliation use the same immutable approval. A crash after the Dataverse write is safe to retry.
Conflicting or incorrect saved approvals are **not** silently editable: record an office correction
and have operations reconcile the Job. A dedicated versioned meter-correction action is future work.

Do not interpret an applied reading as reliable predictions on its own. Existing date span,
confidence, anomaly and reset rules still apply; a useful history of readings is required.

## Activation order — separate approval required

1. Resolve existing restricted-role policy and manifest/client-flag drift; retain production rollback
   artifacts. Local test/lint baseline is now clean; that is not live access approval.
2. Confirm which backend owns the live cards. V2 currently bridges to V1; upgrade the shared
   backend compatibly before releasing clients that call Resume, corrections or expected returns.
   Keep historical links, photo routes, legacy offset clients and Azure evidence intact.
3. Inspect/verify the Job schema. The existing schema script accepts `-IncludeJobCardApproval`:
   `gr_hourmeterreadingtype`, Date Only `gr_hourmeterrecordeddate`, and optional String(100)
   `gr_hourmeterapprovalreference`. Read-only inspection with the owner account hint now confirms
   the existing Choice and Date Only metadata; the reference column is missing. Provisioning was
   stopped at the approval gate before executing. No columns were created or published.
4. Follow the [dedicated-writer rollout checklist](../job-card-meter-writer-rollout.md): provision the
   separately approved identity/role, deploy signed guard `1.0.2.0`, then attach its exact secure tuple.
   Meter writes use only `JOB_CARD_METER_DATAVERSE_*`, never the shared GreenTree identity.
   Assignment/roster reads and ordinary status automation retain their existing separate identities.
   Do not disable guards, grant FullAccess or expose credentials in either browser.
5. Test actual reviewer and unauthorized accounts: denied approval, extra fields, stale ETag,
   competing administrators, invalid dates, changed machine, changed reading, lower/large jumps,
   already-complete Job, missing schema, failed writes and retry after a lost response.
6. Activate `JOB_CARD_METER_APPROVAL_ENABLED` on the authoritative backend only after checks.
   Activate `VITE_JOB_CARD_METER_APPROVAL_ENABLED` with verified schema so Job reads include the
   approval reference and date/type. Old clients cannot silently approve a meter when the backend
   gate is on: they must send explicit confirmation for a card containing a reading.
7. Activate `VITE_JOB_CARD_CURSOR_QUEUE_ENABLED` only with the compatible backend. Test >501 rows,
   sparse stage pages, page failure/retry, concurrent filing, account/stage changes and exact old Job lookup.
8. Rehearse server restarts/checkpoint cycling, failure alerting and two-browser operation before
   expanding office use. Keep the technician pilot unchanged unless separately approved.

Rollback: turn off client/new backend feature flags in a coordinated release; do not delete approved
readings, provenance, audit, checkpoints, schema or evidence. A legacy backend must not rewrite
new approval records without a verified round-trip compatibility test.

## Meter-writer security gate — implemented locally, not deployed

`getJobCardMeterDataverseApplicationToken` requires three dedicated backend settings and rejects
reuse of the configured general/GreenTree client IDs. There is no credential fallback. Interactive
review/retry and scheduled meter reconciliation use this identity; a failed acquisition cannot turn
into a meter write with the ordinary reconciliation token. Disabled meter processing acquires none.

Guard `1.0.2.0` accepts optional `meterrole`, `meteruser` and `meterapplication` secure settings only
as a complete tuple. Existing human profiles remain unchanged. The configured user or anyone with
the meter role enters the narrow policy before Full/Coordinator bypass. It checks the enabled
application user, exact role/application/user identity, exact four non-null fields, Actual reading,
valid nonfuture Date Only, bound provenance, active/non-void/non-complete Job and matching Equipment.
Older dates, changed same-day readings and mismatched replay evidence fail closed. The backend
also preserves its ETag and Equipment-baseline checks; the plugin does not inspect HTTP If-Match.

The [writer manifest](../../dataverse/access/job-card-meter-writer.json) grants only Job read/write,
Equipment read and user/role/team reads, with no baseline human role. Read-only live inspection
found no dedicated role and confirmed production guard `1.0.1.0` with 14 access steps. This is not
a successful live application-user test. No Entra application, credential, role/grant, secure config,
schema or production artifact was changed.

The read-only inspector and Plan-default configuration tool are ready for the separately approved
rollout. The configuration tool preserves the human map and saves rollback before updating all
14 guard references atomically; its live Apply path has not been exercised. Real-identity acceptance,
artifact/key recovery and explicit production approvals remain gates. Keep both flags off.

## Still needs work

- **Production acceptance:** shared-backend deployment, schema, effective roles, server identity,
  versioned rollout and independent-browser tests are not verified. Nothing in this report is live sign-off.
- **Queue indexing:** native Table continuation fixes reachability, not scan cost or global ordering.
  Exact Job lookup is a server filter, not an index. Other filters/sorts apply to loaded pages.
  Open jobs/dispatch history and per-Job lifecycle history still have finite bounds.
- **Automation monitoring:** expose aging and failed reconciliation to operations; the current
  cursor revisits saved records (including filed ones), not a dedicated indexed pending-work queue.
  Verify scheduler overlap/checkpoint behavior and actual backend timing before rollout.
- **Assignment concurrency/policy:** all active technician assignments are conservatively expected;
  unknown/missing assignments block. No optional-assignment policy exists. A Job ETag protects a
  changed primary Job, but an assignment changed between roster read and status write is not an
  atomic transaction. Add a server-side assignment/version invariant before broad automation use.
- **Historical/void/reopen rules:** GT-closed existing Complete records with missing maintenance/WOF
  side effects need a controlled audit/repair. Define voided, unconfirmed and GT-reopened behavior;
  the safeguard is not a complete lifecycle reconciler. No bulk historical corrections were made.
- **Corrections:** notes are auditable but not a rewritten technician PDF, automatic GT update or
  structured post-approval meter amendment. There is no reopen-final-outcome control.
- **Technician workspace:** parked. Full offline/photo persistence, personal sign-in, assignment-scoped
  browsing, notifications and broad-device acceptance are not implemented.

## Personal accounts / licensing note

Personal sign-in could use an external identity provider and an Azure API, but authentication pricing
does not establish Dataverse usage rights. Microsoft's [multiplexing guidance](https://www.microsoft.com/licensing/guidance/multiplexing)
describes licensing implications of indirect/automated access. An Azure copy or proxy must not be
assumed to eliminate those requirements. [External ID pricing](https://learn.microsoft.com/en-us/entra/external-id/external-identities-pricing)
is a separate concern. Revisit with written licensing confirmation if the technician app resumes;
no no-cost or no-per-technician-licence claim has been made.

## Verification

- Full `npm test`: **890 passed, 0 failed** across the configured scripts. Production build/typecheck
  and full ESLint pass locally; schema definition validates offline. Vite still warns that the
  main application chunk is about 543 kB before gzip.
- New automated coverage includes approval/conflict/idempotency boundaries, bound prediction
  evidence, draft isolation/expiry, unsent assignments, missing permissions/versions, >501 records,
  concurrent filing and retry discovery after office completion. Registered in npm test scripts.
- Headless Chrome sample check passes approval, visible failure/retry, terminal correction,
  expected returns and narrow-screen overflow. All writes intercepted in the browser; no cloud writes.
- **114 offline restricted-access policy tests pass**, including caller identity and meter-field
  boundaries; **47 registration tests pass**. Unsigned offline assembly `1.0.2.0` builds and the
  deployment dry-run passes. This is not a live service-identity permission test.
- Local assembly source, deployment-plan version and package verification now agree on `1.0.2.0`;
  live remains `1.0.1.0`. Read-only defaults, explicit provisioning, acceptance/rollback blockers and
  no automatic deployment/assignment assertions remain. The human roster/grants were not changed.
- Cleared the six original lint findings without suppressions. Equipment filtering now uses the
  shared two-character, 250 ms, eight-result Customer search; abandoned transfer searches cannot
  merge late responses. Maintenance details stay inside the visible queue, workspace state resets
  per signed-in user, and site contacts use account/environment-scoped queries with explicit retry.
  Tests cover hidden selection and late-site/account isolation. Retired Site Check numbering
  endpoints remain fail-closed.
- Read-only cloud inspection succeeded using an explicit account hint: Choice/Date Only metadata
  valid; approval reference and dedicated role missing; 14 guards on `1.0.1.0`. New role/app branches
  and configuration Apply are not live-tested. No production setting or data changed.

Primary implementation: `api/services/jobCardMeterApproval.js`, `jobCardExpectedReturns.js`,
`jobCardReviewPaging.js`, `jobOperationalStatusAutomation.js`, `jobSubmissionService.js`,
`src/alpha/job-card-reviews/`, `src/alpha/portal/jobCardDraft.ts`, and
`src/alpha/equipment/servicePlans/equipmentUsageForecast.ts`.
