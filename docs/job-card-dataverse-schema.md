# Job card workflow Dataverse setup

This document defines the first job-card workflow for Service Operations.

## Workflow rules

- The existing Job Status remains manually controlled by the office.
- Mechanics do not update Job Status.
- Job Card Status follows `Not sent` → `Sent` → `Submitted` → `Closed`.
- `Sent` is recorded only after the system successfully dispatches the email.
- `Submitted` is recorded automatically after an online job card or photographed job card is submitted.
- `Closed` is applied after the paperwork has been processed and the GreenTree job is closed.
- GreenTree remains an implementation detail; the application does not expose a separate GreenTree status.

## Job Card Status choice

Create a global choice with display name **Job Card Status** and schema name `gr_jobcardstatus`.

| Label | Value |
| --- | ---: |
| Not sent | `122830000` |
| Sent | `122830001` |
| Submitted | `122830002` |
| Closed | `122830003` |

## Job table columns

Add these columns to the existing **Job** table.

| Display name | Schema name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Job Card Status | `gr_jobcardstatus` | Choice | Yes | Use the global Job Card Status choice; default `Not sent` |
| Job Card Sent On | `gr_jobcardsenton` | Date and time | No | Set only after an email is successfully sent |
| Job Card Submitted On | `gr_jobcardsubmittedon` | Date and time | No | Set when the technician submits online or uploads paperwork |
| Job Card Closed On | `gr_jobcardclosedon` | Date and time | No | Set when the paperwork/GreenTree job is processed and closed |

Use **User local** behaviour for all three date-and-time columns so office users see timestamps in their local timezone.

## Initial application behaviour

1. Existing jobs without a value are displayed as `Not sent` during migration.
2. The Jobs table shows a compact Job Card Status control.
3. The job drawer shows status and workflow timestamps.
4. Until automatic email is implemented, the existing mail-draft action does not change status to `Sent`.
5. Office users can correct the status manually during the transition.

## Later submission tables

The secure technician form and evidence uploads will use separate Job Card Submission and Job Card Evidence tables. They are intentionally deferred until the basic status workflow is live and verified.
