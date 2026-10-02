# Technician Job Card Submission Architecture

## Purpose and workflow

An office user sends a secure, expiring Job Card link to a technician who does not enter
the management application and does not require a Power Apps Premium licence.

1. The licensed office user's delegated token is validated through Dataverse `WhoAmI`.
2. The server reads the minimum Job, Equipment, Customer, Site, and selected technician or
   assignment fields with that office token and writes an immutable dispatch snapshot to
   Azure Table Storage.
3. A random token is returned once; only its SHA-256 hash is retained.
4. The anonymous React page loads the snapshot from Azure, uploads validated photographs
   through the server into private Blob Storage, and submits structured evidence to Azure.
5. An optimistic Table ETag consumes the token once and creates a `pendingReview` item.
6. The notification abstraction emails an authenticated `/job-card-reviews/:reviewId` link.
7. An office user reviews evidence and marks it reviewed. This first version performs no
   automatic Dataverse import or operational Job change.

## UI and API

`TechnicianJobSubmissionPage` remains the mobile public UI. `JobCardReviewsScreen` is the
authenticated pending queue and read-only evidence page. It streams photographs through
the authenticated `/api/jobcardreviews` endpoint; the Blob container is never public.

`JobSubmissionService` owns token lifecycle, snapshot validation, payload limits, Blob
ownership checks, ETag replay protection, review projection, and safe errors. Storage and
email are injected through server-side abstractions with in-memory/console local modes.

## Invariants

- Anonymous GET, photo upload, and submission do not acquire a Dataverse token and do not
  read or write Dataverse.
- Link generation is an office-triggered Dataverse read; it makes no Job write.
- Replacing an active link requires office confirmation and supersedes the previous hash.
- Technician submission never changes Job Status, Job Card Status, Equipment, maintenance,
  assignments, Quotes, or any other Dataverse record.
- Photos are limited to JPG, PNG, HEIC, or HEIF; 20 files; 10 MB each.
- Story, hour meter, time/travel, parts, conditional details, and photo references receive
  independent server validation.
- Notification failure is audited but does not discard accepted evidence or its queue item.

## Extension point

A future licensed office import may read accepted Azure evidence and write Dataverse only
after an explicit office action. It needs a separate service, mapping, idempotency key,
confirmation, and audit fields. It must not be called by the public endpoint.

See [Azure Job Card Storage](../azure-job-card-storage.md), [Public portal](public-portal.md),
[Security](security.md), and [Jobs](jobs.md).
