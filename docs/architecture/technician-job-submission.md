# Technician Job Card Submission Architecture

## Boundary and workflow

Job-level links at `/portal/job/:token` use Azure Table snapshots and private Blob evidence.
Only licensed office generation reads Dataverse, using the caller's delegated token through
`X-Dataverse-Authorization` and a `WhoAmI` check. Anonymous lookup, photo upload and final
submission never acquire a Dataverse token or call Dataverse.

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
The existing licensed-office dispatch can still set Sent. Legacy evidence remains in the Job drawer;
new evidence is in **Job Card reviews**. Future Dataverse import requires a separate explicit
licensed-office action.

See [Azure Job Card Storage](../azure-job-card-storage.md) for infrastructure, settings, cutover,
retention and verification. Local shortcuts fail closed in hosted processes.
