# Technician Job Card Submission Architecture

## Boundary and workflow

Job-level links at `/portal/job/:token` use Azure Table snapshots and private Blob evidence.
Licensed office generation reads Dataverse using the caller's delegated token through
`X-Dataverse-Authorization` and a `WhoAmI` check. Authenticated office review may separately read
current contact/Quote context with the active account's delegated Dataverse token. Anonymous lookup
and photo upload do not call Dataverse. The technician browser receives no Dataverse credential.
After saving final evidence, the server currently obtains its application token and attempts an
Allocated → Completion Review update after checking both Azure lifecycles and the current primary/
active-assignment roster. This is not evidence import or operational completion. Local recovery
and office-approved meter changes are described in the [implementation report](../reviews/2026-10-10-job-card-implementation.md);
deployment, assignment concurrency and durable monitoring still require acceptance.

V2-only releases remain compatible with the older shared backend: detail responses must explicitly
advertise `officeRecoveryAvailable: true` before Resume, correction or technician-return controls
appear. Public lookup must advertise `meterRecordedDateAvailable: true` before the form displays,
validates or sends a meter date. These are compatibility signals, not authorization; server checks
remain mandatory. Original filing/follow-up and document exports do not require the new signals.

Site Check occurrence links remain a separate existing workflow, using
`siteCheckAssignmentService.js` and `siteCheckPhotoStorage.js`. Retain their credentials.

1. The existing office email composer requests a secure link for an approved pilot recipient.
2. The server reads the minimum authoritative Job/Equipment/Site/Customer/technician snapshot.
3. A 32-byte opaque token is returned once; only its SHA-256 hash is stored.
4. A per-Job/assignment sentinel and the new request are committed in one Table transaction.
   Confirmed replacement supersedes only that technician's unused request. Resends never overwrite
   submitted/reviewed evidence.
5. The technician sees the immutable snapshot and uploads photos before final submission.
   Content-derived identifiers and conditional Blob creation make interrupted uploads retry-safe.
6. Final submission checks the token, photo ownership/type/size and Table ETag, then atomically
   saves all structured evidence as pendingReview. Concurrent submissions accept only once.
7. ACS sends a minimal review notice. Failure never rolls back evidence; office review offers a
   notification retry using the same email operation identifier.
8. Approved office reviewers open `/job-card-reviews` or the emailed link, load private photos,
   and explicitly move the office workflow under the loaded ETag. The server records authoritative
   administrator identity/time and never edits the technician evidence.

## Preserved form and rules

The mobile form and browser-local editable Job sheet download remain. Parts retain description and
quantity. Public PDF data includes equipment make/model/serial, order number and Site address;
Site Contact is not exposed. Limits are 50 Time & Travel entries, 100 Parts, 20 photos of 10 MiB
each, and 10,000 characters for each story/observation. At least one real date, positive hours
(up to 24) and non-negative whole kilometres is required. Lower meter readings require explicit
technician confirmation, independently checked by the server.

The form now captures the meter-reading date separately from submission time. Text, time and parts
recover after same-tab reload using token-hashed session-storage keys. Drafts expire after seven
days and are removed after submission; closing the tab loses them. Photos must be reattached.
This is not offline or cross-device support. The personal-account assigned-jobs app is parked.

JPEG, PNG, HEIC and HEIF signatures are checked; this is not a malware-scanning claim.
Office photos load only on demand. HEIC/HEIF are downloadable even without browser image support.
The adapter splits large Table string properties into bounded chunks.

The online pilot remains restricted client- and server-side to `nzmouhib@yahoo.co.nz` and
`georger@liftrucks.co.nz`. The localhost email guard and existing non-portal dispatch remain.

## Review authorization and operational invariants

Review requires a validated delegated identity whose authoritative Dataverse email/domain name
matches `JOB_CARD_REVIEWER_EMAILS`. Missing configuration denies access. Blob responses are
authenticated, private/no-store, attachment-only and nosniff; no credentials or Blob URLs are public.

Azure submission/review does not change Dataverse Job Card Status, complete a Job, change Completed
Date, Equipment hours, maintenance or assignments, or create follow-up work/Quotes. With the new
meter gate enabled, explicit office completion/approval separately updates the Job's meter fields;
technician submission alone never does so. Original evidence remains unchanged.
The local meter writer uses only dedicated backend `JOB_CARD_METER_DATAVERSE_*` credentials,
including in scheduled retry; it cannot fall back to the general/GreenTree token. Guard `1.0.2.0`
binds its role, application and system user to the four-field Job patch. The human reviewer still
authorizes the action and Azure records attribution. The [writer rollout checklist](../job-card-meter-writer-rollout.md)
owns live schema, identity, configuration and acceptance gates; this path is not yet deployed.
Submission's separate server-side Completion Review attempt can change `gr_status`; office review
actions themselves do not. A failed attempt preserves the accepted submission. Local retry discovery
now includes pending and filed cards and saves continuation progress; verify the actual scheduler,
shared store, permissions, overlap behavior and alerts before claiming reliable production recovery.
Ordinary Job dispatch records delivery through Email Dispatch and does not write legacy Job or
assignment Card Status. Site Check dispatch retains its existing Sent updates. Future Dataverse
import requires an explicit authorized office action and the schema/permission gates in the report.

## Office review workflow

Opening a review does not mutate it. Submitted contains Pending, displayed as Ready for entry;
Needs follow-up contains In review (displayed as GreenTree entry), Needs clarification (displayed as
Needs follow-up), and existing On hold records.
This is a display rename of In progress; the `review` route/API value and stage membership are unchanged.
Start GreenTree entry identifies the administrator but does not lock the
shared queue. One **Needs follow-up** button replaces the clarification/hold buttons and requires a
note about missing information or blockers. It uses the existing `setNeedsClarification` action;
no status migration is needed. It does not contact the technician or create a new link. Existing
On hold records and activity remain intact; the API keeps `setOnHold` compatible with older clients.
Resume entry returns either follow-up state to In review, retaining notes in history.
Last handled by identifies the last office actor, not an exclusive owner. Office corrections append
audited notes, including after filing; they do not edit technician evidence, PDFs or GreenTree. Completed contains
Processed in GreenTree and legacy Reviewed. GreenTree is the data-entry system, and confirming
completed data entry there is the sole final workflow action; its reference is optional. The retired
No invoice required action is rejected by the server. Any existing records with that outcome remain
read-only in Completed with their original audit, not relabelled as GreenTree processing. Further-work
and safety reports stay prominent but do not block V1 processing.

All changes use explicit server actions and the loaded ETag. Conflict responses preserve the local
dialog text and require refresh before retry. Activity history is server-authored and bounded.
Existing reviewed records without the new outcome remain labelled `Reviewed (legacy outcome not
recorded)` and never imply GreenTree processing.

## Office screens after legacy-control retirement

The review queue has four separately loaded workflow tabs: **Open jobs**, **Submitted** (default),
**Needs follow-up**, and **Completed**. Shared drawer tabs, table/toolbar, sort controls, attention pills and
searchable selectors are reused. Job type is a secondary filter, not a main tab. Columns display saved Job number,
NZ submission date/time, type, Equipment, Customer/Site, work required, Technician, reported flags
and photo count. Job and Open links display the saved review in a centred, accessible review dialog while
the queue stays mounted behind it. Job number leads the header, with fleet/description underneath
and submission date alongside status. Technician/order metadata precede compact Customer/Site and
Equipment details; the submitted meter sits with Equipment. Work performed, observations and compact
time/parts tables are on the left; photos, document/quote actions and office workflow on the right.
The live Site contact is grouped with saved Customer/Site and remains distinct from immutable evidence.
Narrow screens stack the columns. Filters and sort remain
query-state when the dialog closes. Direct legacy
`/job-card-reviews/:reviewId` links remain supported. No operational status/scheduling filters, edits,
bulk actions or emails are exposed in the queue. Reported attention is not Job office status.

The optional `VITE_JOB_CARD_CURSOR_QUEUE_ENABLED` client flag selects the new `paging=cursor`
protocol for submitted/review/completed queues. The backend returns at most 100 summaries plus
`nextCursor`; exact `jobNumber` filtering runs on the server. Native Table continuation can reach
past 500 records, but it is not an index or a global newest-first query. Other UI filters/sorts
remain loaded-page-only. The flag stays off until the shared backend is upgraded and verified.
Open jobs retains bounded dispatch paging. The queue refreshes on focus without replacing an open
review form; full loaded-page/scroll retention remains to be improved.

The compatible legacy `GET /api/jobcardreviews` protocol accepts `view`, `offset`, and `limit`, returns at most
100 summaries per request, and exposes `hasMore`/`nextOffset` for visible incremental loading.
Views are `open`, `submitted`, `review`, and `completed`. Legacy API `active`/`history` requests
remain compatible; old UI `history` bookmarks open Completed and `active` opens Submitted.
Offsets advance over source records, not visible matches. An empty stage page can still have more
records to check; it must not claim the entire queue is empty. Offset is 0–499 and limit is 1–100,
clamped at the 500-record scan boundary. Overflow at the boundary is labelled and stops Load more.
Azure lifecycle queries sort the same bounded 501-row population before taking each page prefix,
so changing the page size does not reorder earlier prefixes; this is not a transactional cursor.
Type/description/Equipment identifiers come from the existing saved
snapshot, not per-row Dataverse reads. No schema migration or public-portal response change is
required. The Azure scan is bounded and is not a global newest-100 selection: search, filters and
newest-first sorting apply only to the returned subset, and overflow is visibly labelled. Older
snapshots with missing fields remain visible under All job types with unrecorded-value fallbacks.
Loading, empty, no matches, failed refresh and stale retained rows have separate visible states.

**Open jobs** is a read-only projection of `gr_emaildispatchs` with confirmed `gr_emailsent=true`,
valid requested/completed timestamps and a linked numbered Job. Number formats are Auckland
digits or WJ/HJ/CJ plus digits, without a four/five-digit ceiling. Unnumbered/placeholder Jobs,
failed/pending sends, generated-but-unsent links and Site Checks are excluded. The query selects
minimal delivery metadata and expands Job/Equipment/Site/Customer and assignment submission
timestamps; it never reads email bodies/subjects or sends email. Related permissions are read-only.
Repeat sends are deduplicated by Job + assignment + recipient, newest requested send first.
Azure accepted/reviewed evidence is checked in batches of at most 20 Job IDs (501-record sentinel
per batch, overflow fails closed), matching Job/assignment/recipient and submission after the
send request. Missing old recipient values match conservatively. Recorded legacy primary or
assignment submission timestamps also exclude already-returned cards; an earlier submission
does not hide a later send cycle. No evidence or operational record is changed by this projection.
Current lifecycle filtering retains expired unsubmitted links in Open jobs as **Expired link — resend
needed**. Explicit withdrawal/replacement remains distinct. No email is sent by viewing the queue.

Dispatch reads follow only same-origin/same-path continuation links and have finite page/row bounds.
An access error or incomplete evidence check is an unavailable queue, not an empty queue. Open rows
show **Sent** and **Awaiting submission**, with no fabricated review ID, review link or editing
controls. Other stages use saved Azure snapshots. Stage/account changes remount data ownership and
ignore stale responses; keyboard tab focus is restored after the stage changes.

Release preflight must verify delegated **Read** on Email Dispatch and Job Assignment as well as
the existing reference tables. No privileges are provisioned locally. Delivery confirmation is the
recorded email-flow result, not proof the technician opened the email. Dispatch/submission matching
uses existing identifiers and timestamps, not an exact stored request-ID relation. Off-system/paper
returns without a recorded timestamp cannot be inferred, and retained dispatch history limits the
visible backlog. Verify these boundaries with approved live testing before rollout.

The ordinary Job drawer's Job Card tab uses one authenticated, reviewer-authorized
`GET /api/jobcardreviews?jobId=<guid>` request to show Azure link/submission history. The response
contains lifecycle metadata and review IDs only, never raw tokens, token hashes, photo paths or
submission contents. It is bounded to 500 entries with an explicit truncation flag. A created link
is not labelled as confirmed email delivery. Submitted/reviewed entries open **Job Card reviews**.
Errors remain visible and are not treated as an empty history; refresh and completed sends reload
the affected Job's history. Account/Job changes discard the previous result and ignore late responses.

Ordinary Jobs no longer use the old manual Card Status selector, legacy progress count, Submitted
table badge or email lockout. Their neutral **Job cards** action opens the canonical drawer, and
Azure's active-link conflict owns replacement confirmation. Existing Dataverse evidence, including
closed cards, remains in an explicitly historical, read-only section with its photos and legacy PDF
downloads. This evidence never controls the current Azure lifecycle. Ordinary drawer refresh loads
only the Job; old time/parts/submissions/photos load when **Historical submissions** is opened.
The account/Job-scoped archive hook ignores late responses and offers retry. Strict loads follow
verified Dataverse next links and fail visibly on incomplete evidence rather than reporting empty
history. Site Check eager evidence loading and technician post-submission PDF remain unchanged.

The authenticated review detail leads with Job number/description, then saved Equipment and Customer/
Site details including make/model/serial, order number and address. A separate, explicitly labelled
**Current Job contact** uses one minimal delegated Job read expanding `gr_Contact` name/phone/email;
it is not added to the immutable snapshot, public portal, or saved PDF. Missing contact and failed
contact reads remain distinct. Story groups a prominent submitted hour meter (zero is valid), Job
story, further work and safety issues. On desktop the detail fills the available workspace, with
horizontal actions and a three-column context summary above the story and evidence columns.
Private photos and compact time/travel/parts tables sit beside the story, not below a long sequence
of full-width cards. Container-size fallbacks use the actual available width (including the sidebar).
There is no fixed-height content clipping, line clamp, hidden evidence or nested vertical scrolling;
long submissions retain natural page scrolling. Photo thumbnails contain the full image and retain
the original download action. Existing shared drawers and feature hooks still own all interactions.

**Download all photos** opens an editable filename prompt using the shared drawer. The suggested
ZIP name is `JobNumber - Job description - dd-mm-yyyy.zip`, using the saved submission timestamp in
`Pacific/Auckland`, not download time. Invalid Windows filename characters, reserved device names
and trailing dots are handled. `jobCardPhotoDownload.ts` uses pinned `fflate` ZIP pass-through entries
without image recompression. It loads up to 20 originals sequentially through the authenticated private
photo endpoint, checks each non-empty file against its saved size and the 10 MiB limit, uses canonical
image extensions/flat numbered names, and produces no archive if any photo fails. No SAS/Blob URLs
or tokens enter filenames, downloads, or the DOM. Photo loading and all-photo saving have independent
progress/duplicate-click guards. Leaving the account/review aborts an in-flight archive download.

The native Save File picker, when supported, opens synchronously from the Save click before token/
network work; cancellation performs no downloads. Writing starts only after a complete archive is
built, and write failures abort the writable. Other browsers use their configured download location
after the in-app filename prompt. HEIC/HEIF originals remain downloadable without inline support.

**Associated quotes** mounts the feature-owned read-only `JobQuotesDrawer` in the same screen only
when requested. It reuses existing bounded per-Job header/selected-Quote line reads and active-account
authentication. No Quote editing or operational updates are available here; see [Quotes](quotes.md).

**Download job card PDF** fills `docs/templates/jobsheet-template.pdf` (the existing Field Service
Inspection Report), using only the loaded Azure snapshot and submitted values. It does not reread
the current Job/contact, request a public token, or use the current hour meter when the submission
has no reading. Unrecorded fields and signatures remain blank. The PDF remains interactive; saving
an edited local copy does not change the stored submission.

The shared Job sheet renderer adds clearly linked continuation pages when a form box cannot fit
the complete text. It preserves individual time entries when weekday/date slots collide instead
of merging separate weeks under one date, corrects the template's reversed Saturday/Sunday date
widgets, and uses the NZ submission date. Unsupported font characters are written as explicit
Unicode code points, not dropped. These safeguards also apply to technician and legacy downloads.

**Save all documentation** downloads one ZIP containing this filled Job card PDF and every original
submitted photo, but no associated Quotes. It works with zero photos. It uses the same private,
authenticated sequential photo reads, filename sanitisation, size checks and cancellation as
photo-only downloads. A failed PDF or photo prevents saving an incomplete archive. It never marks
the card complete. Review content is remounted on account/review changes so exports and photo URLs
cannot follow the previous review.

The primary **Mark complete** action confirms that the administrator has finished GreenTree entry.
It records the existing `completeGreenTreeProcessing` outcome, actor and time and moves the card to
Completed. Starting entry first is optional; follow-up still requires a note. Completion
does not send data to GreenTree or close the operational Job, and final outcomes cannot be reopened
in this UI. Saving documents remains available before and after completion.

Site Check Type or occurrence-linked Jobs retain their existing office controls and service path.
No old tables, columns, identities or historical evidence are deleted. Additional assignments with
known Azure requests or legacy evidence cannot be removed from the ordinary Job Card tab; removal
is also unavailable if Azure history is unknown/truncated or the archive has not loaded successfully.

See [Azure Job Card Storage](../azure-job-card-storage.md) for infrastructure, settings, cutover,
retention and verification. Local shortcuts fail closed in hosted processes.
