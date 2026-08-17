# Technician Job Card Submission Architecture

## Purpose

Technician Job Card Submission lets an office user send a secure, expiring link so a
technician can submit work evidence without entering the management application.

## User workflow

1. An office user selects the existing Email Technician action.
2. The authenticated server action creates a fresh secure link.
3. The technician opens `/portal/job/:token`.
4. The portal shows only the minimum Job, Equipment, Customer, Site, and work-required data.
5. The technician records story, time/travel, Parts, conditional observations, and photos.
6. The server validates and persists the submission.
7. Job Card Status becomes Submitted; office staff review it in the existing Job drawer.

## UI

The public mobile-first page is
`src/alpha/portal/TechnicianJobSubmissionPage.tsx`. Pending photos remain removable before
submission. The manager review is read-only in the existing Job Card tab of
`JobEditDrawer`; no separate review drawer exists. The Jobs table Submitted action opens
that same drawer and tab.

## Dataverse model

The Job stores token lifecycle, submitted-on, story, submitted hour meter, Further Work, and
Safety Issue values. Append-only children store:

- Job Card Submission Time Entry;
- Job Material, labelled **Parts** in the technician UI;
- generic Job Photo with a Dataverse File column.

Exact logical names, types, ownership, and provisioning status are in
[Technician Job Submission Schema](../technician-job-submission-schema.md).

## Services and persistence

`api/services/jobSubmissionService.js` is the server-side boundary. It:

- authenticates office link generation;
- creates cryptographically secure tokens and stores only SHA-256 hashes;
- obtains the Application User token;
- validates expiry, used state, and ETag;
- returns a minimal public projection;
- validates field, child-row, and photo limits;
- stages retry-safe File uploads;
- creates time/material children and updates final Job submission state in one Dataverse
  change set.

Each change-set operation includes a unique `Content-ID`, as required by Dataverse.

## Security model

The browser has no Dataverse credentials. The Public Portal Service Application User is the
only server identity and has a dedicated least-privilege role. Job table writes cannot be
restricted to individual fields by the role, so the fixed server payload is the
column-level boundary. See [Security](security.md) and
[Public Portal Service Identity](../public-portal-service-identity.md).

## Lifecycle and invariants

- Default token lifetime is seven days.
- A replacement link invalidates the previous unused link.
- A successful submission consumes the token.
- Concurrent or repeated submission is rejected.
- Technician submission does not complete the operational Job.
- It does not set Completed Date, update Equipment hour meter, run maintenance completion,
  change assignments, create follow-up work, or create Quotes.
- Further Work and Safety Issue values are evidence for office review, not automation.

## Retry behaviour

Photo metadata and File content are uploaded before the atomic final change set. A failed
File upload or final commit leaves the token usable. The deterministic non-secret upload
key lets the same token retry reuse its staged photo rows. Submitted manager review loads
only the Job's authoritative evidence.

## Email integration

The Jobs table uses its in-app Email Dispatch composer and permits optional bounded comments for the
technician without changing the Job description. The Job drawer retains its established Email
Dispatch/Power Automate workflow. While online Job Card access is paused, neither workflow generates
or replaces a secure portal link. The generated HTML keeps Open Job Card visibly disabled and does
not expose a URL. The linked Site Contact name, phone, and email are included when available. Missing
recipient email still blocks dispatch.

## Current limitations

- No offline submission.
- No signature, customer sign-off, checklist, inventory quantity, or stock integration.
- Photos are JPG, PNG, HEIC, or HEIF, with at most 20 files and 10 MB per file.
- Further Work and Safety observations do not automatically create operational records.

## Extension points

Add checklist, assignment grouping, technician relationship, signature, inspection,
delivery, WOF, or customer sign-off records as explicit child models. Extend generic Job
Photo rather than creating feature-specific photo tables. Keep the public projection and
role privileges minimal.

Site Checks will reuse the canonical per-Job form and submission transaction behind one
proposed occurrence-level assignment link. The occurrence token never replaces or consumes
the Job-level evidence record, never completes operational Jobs, and authorises only
parent-linked Jobs still assigned to the occurrence technician. See the
[Site Checks tracker](../features/SITE_CHECKS_IMPLEMENTATION_PLAN.md), Phase 15.

## Related files

- [`../../api/services/jobSubmissionService.js`](../../api/services/jobSubmissionService.js)
- [`../../src/alpha/portal/TechnicianJobSubmissionPage.tsx`](../../src/alpha/portal/TechnicianJobSubmissionPage.tsx)
- [`../../src/alpha/jobs/components/JobCardFields.tsx`](../../src/alpha/jobs/components/JobCardFields.tsx)
- [`../../src/alpha/jobs/services/jobsApi.ts`](../../src/alpha/jobs/services/jobsApi.ts)
- [`../../src/alpha/jobs/services/jobSubmissionLinkApi.ts`](../../src/alpha/jobs/services/jobSubmissionLinkApi.ts)
- [Public portal](public-portal.md)
- [Jobs](jobs.md)
- [Dataverse](dataverse.md)
