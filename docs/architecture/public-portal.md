# Public Portal Architecture

## Overview

The public portal provides token-scoped workflows to users who do not enter the
authenticated management application. Its first workflow is Technician Job Card Submission.

## Request flow

```text
Office user generates secure link
    → server stores SHA-256 token hash on Job
    → technician opens /portal/job/:token
    → server validates token with Application User
    → server returns minimal Job projection
    → technician submits evidence
    → server persists fixed payload
    → token becomes used
```

The browser never calls Dataverse directly. `JobSubmissionService` owns application-token
acquisition, hash lookup, expiry and replay validation, public projection, payload
validation, File upload, atomic persistence, and safe errors.

## API

`/api/jobsubmission` supports:

- authenticated `POST` with `action: "generate"` to create a one-time link;
- anonymous `GET` with the raw token to load the minimal public Job view;
- anonymous `POST` with the raw token and submission payload.

The production endpoint is an Azure Function under `api/jobsubmission`. Vite installs an
equivalent local middleware route so the same service implementation is tested locally.

## Security and lifecycle

- Tokens contain 32 random bytes and only their SHA-256 hashes are stored.
- The default expiry is seven days; generation accepts a bounded 1–720 hour lifetime.
- Generating a replacement invalidates the previous unused token.
- Submission rechecks expiry and used state and uses the Job ETag.
- Replay returns a terminal used-link response.
- Operational Job completion remains an office workflow.

## Extension points

Future portal workflows may add checklist, inspection, signature, delivery, WOF, or
customer sign-off evidence. Extend the server service boundary and generic child models;
do not widen the public Job projection without a security review.

## Related files

- [`../../api/jobsubmission/index.js`](../../api/jobsubmission/index.js)
- [`../../api/services/jobSubmissionService.js`](../../api/services/jobSubmissionService.js)
- [`../../src/alpha/portal/TechnicianJobSubmissionPage.tsx`](../../src/alpha/portal/TechnicianJobSubmissionPage.tsx)
- [Technician Job Card Submission](technician-job-submission.md)
- [Authentication](authentication.md)
- [Security](security.md)
