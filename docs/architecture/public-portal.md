# Public Portal Architecture

## Overview

The public portal provides token-scoped workflows to users who do not enter the
authenticated management application. Its first workflow is Technician Job Card Submission.

## Request flow

```text
Office user generates secure link
    → server reads a delegated Job snapshot and stores it with a SHA-256 token hash in Azure Table
    → technician opens /portal/job/:token
    → server validates token against Azure Table, without calling Dataverse
    → server returns the minimal stored snapshot
    → technician uploads private photos and submits evidence
    → server persists fixed payload and sends an office review notification
    → token becomes used
```

The public browser never calls Dataverse. `JobSubmissionService` owns delegated office
snapshot generation, hash lookup, expiry/replay validation, public projection, payload
validation, private Blob upload, atomic Table persistence, and safe errors. The authenticated
`/job-card-reviews` queue is the source of new evidence; it does not automatically import
evidence into Dataverse or complete the operational Job.

## API

`/api/jobsubmission` supports:

- authenticated `POST` with `action: "generate"` to create a one-time link;
- anonymous `GET` with the raw token to load the minimal public Job view;
- anonymous `POST` with `action: "uploadPhoto"`, the raw token, and one bounded photo;
- anonymous `POST` with the raw token and submission payload.

The production endpoint is an Azure Function under `api/jobsubmission`. Vite installs an
equivalent local middleware route so the same service implementation is tested locally.

## Security and lifecycle

- Tokens contain 32 random bytes and only their SHA-256 hashes are stored.
- The default expiry is seven days; generation accepts a bounded 1–720 hour lifetime.
- Generating a replacement invalidates the previous unused token.
- Submission rechecks expiry and used state and uses the Azure Table ETag.
- Replay returns a terminal used-link response.
- Operational Job completion remains an office workflow.

## Extension points

Future portal workflows may add checklist, inspection, signature, delivery, WOF, or
customer sign-off evidence. Extend the server service boundary and generic child models;
do not widen the public Job projection without a security review.

The approved Site Checks design adds one occurrence-level bearer link at
`/portal/site-check/:token`, backed by a separate `/api/sitecheckassignment` service. It
groups navigation but preserves one independently submitted Job Card per Equipment. Its
token schema and Public Portal Service Organisation Read privilege are provisioned. The
shared service, Azure Function wrapper, and equivalent Vite middleware implement secure
generation/revocation and minimal anonymous lookup locally.

Site Check service credentials and Dataverse File storage are intentionally unchanged by
the job-level Azure cutover. Its delivery state is owned by the
[Site Checks tracker](../features/SITE_CHECKS_IMPLEMENTATION_PLAN.md). Backend configuration,
retention and cutover instructions are in [Azure Job Card operations](../azure-job-card-storage.md).

## Related files

- [`../../api/jobsubmission/index.js`](../../api/jobsubmission/index.js)
- [`../../api/services/jobSubmissionService.js`](../../api/services/jobSubmissionService.js)
- [`../../api/sitecheckassignment/index.js`](../../api/sitecheckassignment/index.js)
- [`../../api/services/siteCheckAssignmentService.js`](../../api/services/siteCheckAssignmentService.js)
- [`../../src/alpha/portal/TechnicianJobSubmissionPage.tsx`](../../src/alpha/portal/TechnicianJobSubmissionPage.tsx)
- [Technician Job Card Submission](technician-job-submission.md)
- [Authentication](authentication.md)
- [Security](security.md)
