# Multi-technician Job Cards

## Ownership model

`gr_job` remains the operational Job. Technician evidence is owned by
`gr_jobcardsubmission`, with one stable submission identity for the primary technician and
one for each `gr_jobassignment`.

- Primary identity: `{jobId}:primary`
- Additional identity: `{jobId}:{jobAssignmentId}`
- Each identity has its own recipient snapshot, token, expiry, sent/submitted/closed dates,
  hour meter, story, warnings, time, parts and photos.
- `gr_jobcardsubmissiontimeentry`, `gr_jobmaterial`, and `gr_jobphoto` retain their Job lookup
  and also reference the specific Job Card Submission.
- A replacement link changes only that technician's token. It cannot invalidate another
  technician's link or overwrite another technician's evidence.

The recipient name and email are snapshots. They preserve what was sent even if the Staff
record changes later. The bearer link identifies the intended submission, but is not proof
that a particular person held the device.

## Overall progress

The manager UI derives progress from required submission records:

- **Not sent**: no technician card has been sent.
- **Awaiting technicians**: at least one card is sent and none is submitted.
- **Partially submitted**: some, but not all, required cards are submitted.
- **Ready for office**: all required cards are submitted.
- **Closed**: the office has closed the Job Card workflow.

Technician submissions do not change the operational Job status.

## Compatibility and migration

Existing links stored on `gr_job` remain valid until used or expired. The API tries the new
submission table first and falls back to the legacy Job token.

Run schema management in this order:

```powershell
./scripts/manage-multi-technician-job-card-schema.ps1 -Mode Inspect
./scripts/manage-multi-technician-job-card-schema.ps1 -Mode Apply
./scripts/update-public-portal-expanded-submission-role.ps1
./scripts/manage-multi-technician-job-card-schema.ps1 -Mode Migrate
```

Migration creates one legacy submission for each Job with existing technician evidence,
links existing time/material/photo children to it, and deliberately leaves all original Job
fields intact for rollback and audit.
