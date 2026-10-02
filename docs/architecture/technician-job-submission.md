# Technician Job Card Submission Architecture

## Boundary and workflow

Job-level links at `/portal/job/:token` use Azure Table snapshots and private Blob evidence.
Licensed office generation reads Dataverse using the caller's delegated token through
`X-Dataverse-Authorization` and a `WhoAmI` check. Authenticated office review may separately read
current contact/Quote context with the active account's delegated Dataverse token. Anonymous lookup,
photo upload and final submission never acquire a Dataverse token or call Dataverse.

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
   and mark reviewed under the loaded ETag. Reviewer identity/time are retained.

## Preserved form and rules

The mobile form and browser-local editable Job sheet download remain. Parts retain description and
quantity. Public PDF data includes equipment make/model/serial, order number and Site address;
Site Contact is not exposed. Limits are 50 Time & Travel entries, 100 Parts, 20 photos of 10 MiB
each, and 10,000 characters for each story/observation. At least one real date, positive hours
(up to 24) and non-negative whole kilometres is required. Lower meter readings require explicit
technician confirmation, independently checked by the server.

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
Date, Equipment hours, maintenance or assignments, or create follow-up work/Quotes.
Ordinary Job dispatch records delivery through Email Dispatch and does not write legacy Job or
assignment Card Status. Site Check dispatch retains its existing Sent updates. Future Dataverse
import requires a separate explicit licensed-office action.

## Office screens after legacy-control retirement

The pending review queue uses Jobs-style shared table/toolbar, type tabs, sort controls and attention
pills, plus shared searchable Customer/Technician selectors. Columns display saved Job number,
NZ submission date/time, type, Equipment, Customer/Site, work required, Technician, reported flags
and photo count. Job and Review links open the saved review. Filters and sort are query-state;
returning via **Pending reviews** restores them. No operational status/scheduling filters, edits,
bulk actions or emails are exposed in the queue. Reported attention is not Job office status.

`GET /api/jobcardreviews` reads up to 101 pending Azure records, returns at most 100 summaries and
an explicit `truncated` flag. Type/description/Equipment identifiers come from the existing saved
snapshot, not per-row Dataverse reads. No schema migration or public-portal response change is
required. The Azure scan is bounded and is not a global newest-100 selection: search, filters and
newest-first sorting apply only to the returned subset, and overflow is visibly labelled. Older
snapshots with missing fields remain visible under All jobs with unrecorded-value fallbacks.
Loading, empty, no matches, failed refresh and stale retained rows have separate visible states.

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
story, further work and safety issues; structured time/travel, parts and private photos follow.

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

The **Download submission PDF** action uses only the loaded Azure record, with no current
Job reread or public-token request. A browser-local paginated report retains all structured evidence,
individual time dates (including multiple weeks), quantities, observations and a photo filename
manifest. Photos are not embedded or fetched by export; private photos remain separate actions.
Missing snapshot values are labelled as unrecorded, not filled from mutable operational data.
The existing one-page interactive technician/legacy Job sheet is unchanged. Unsupported PDF-font
characters appear as explicit Unicode code points rather than disappearing. Review content is
remounted on account/review changes so exports and photo URLs cannot follow the previous review.

Site Check Type or occurrence-linked Jobs retain their existing office controls and service path.
No old tables, columns, identities or historical evidence are deleted. Additional assignments with
known Azure requests or legacy evidence cannot be removed from the ordinary Job Card tab; removal
is also unavailable if Azure history is unknown/truncated or the archive has not loaded successfully.

See [Azure Job Card Storage](../azure-job-card-storage.md) for infrastructure, settings, cutover,
retention and verification. Local shortcuts fail closed in hosted processes.
