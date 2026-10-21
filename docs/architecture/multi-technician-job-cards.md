# Multi-technician Job Cards

## Ownership model

`gr_job` remains the operational Job and `gr_jobassignment` remains the authoritative roster of
additional assigned technicians. Current emailed Job Card requests and immutable technician
evidence are owned by the private Azure Job Card store, with one stable assignment scope for the
primary technician and one for each additional assignment.

- Primary identity: `{jobId}:primary`
- Additional identity: `{jobId}:{jobAssignmentId}`
- Each scope has its own recipient snapshot and a sequence of Azure requests. A request owns its
  token hash, expiry, lifecycle, saved Job/Customer/Site/Equipment context, meter, story, warnings,
  time, parts and private Blob photos.
- A replacement link changes only that technician's token. It cannot invalidate another
  technician's link or overwrite another technician's evidence.
- The latest applicable request/evidence is matched back to the primary scope or assignment ID;
  a bearer link never grants access to another assignment or a list of Jobs.

The recipient name and email are snapshots. They preserve what was sent even if the Staff
record changes later. The bearer link identifies the intended submission, but is not proof
that a particular person held the device.

The old Dataverse `gr_jobcardsubmission`, time, material and photo records are retained as
historical evidence. They appear only in the explicitly labelled historical section and do not
control the current Azure lifecycle, expected-return calculation or office queue.

## Overall progress

The current expected-return view derives each required technician's state from the authoritative
primary/active-assignment roster and the latest matching Azure lifecycle:

- **No matching card sent** (`notSent`): the required technician has no matching request.
- **Awaiting card** (`awaiting`): a current request exists and has not been submitted.
- **Expired link — resend needed** (`expired`): the latest current request expired unused.
- **Withdrawn** (`withdrawn`): the request was explicitly withdrawn.
- **Received** (`received`): matching evidence was submitted.

Queue-level progress may summarize these states as not sent, awaiting technicians, partially
submitted or ready for office. It must not claim completeness when assignment reads, Azure history
or bounded scans are unavailable/incomplete.

Technician submission never directly completes the operational Job. After a submission is durably
accepted, the server may attempt **Allocated → Completion Review** only when every current,
non-withdrawn required technician has returned a card. A failed attempt preserves the evidence and
is handled by the separate recovery path. GreenTree closure remains the only automatic route from
Completion Review to Complete.

## Compatibility and migration

Existing legacy links and Dataverse evidence remain readable for compatibility, but new requests
use the Azure request store. Do not run the historical Dataverse migration as part of current Azure
Job Card work, and do not move Azure evidence back into the legacy tables.

The following commands document the earlier Dataverse migration only:

```powershell
./scripts/manage-multi-technician-job-card-schema.ps1 -Mode Inspect
./scripts/manage-multi-technician-job-card-schema.ps1 -Mode Apply
./scripts/update-public-portal-expanded-submission-role.ps1
./scripts/manage-multi-technician-job-card-schema.ps1 -Mode Migrate
```

That migration created one legacy submission for each Job with existing technician evidence,
linked existing time/material/photo children to it, and deliberately left all original Job fields
intact for rollback and audit. It is not a prerequisite for the Azure workflow.

See [Technician Job Card Submission Architecture](technician-job-submission.md) for the active
storage, review and compatibility contract.
