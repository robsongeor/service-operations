# Legacy Job Card Status Dataverse setup

> **Retained migration record — not the current workflow.** Ordinary Jobs no longer expose the
> manual Job Card Status selector, legacy progress count, Submitted table badge or email lockout.
> Current emailed links and review evidence use the Azure lifecycle described in
> [Technician Job Card Submission Architecture](architecture/technician-job-submission.md).

This document records the first Job Card workflow and its existing Dataverse columns. Keep the
columns and historical values for compatibility and audit, but do not use them to decide the
current Azure request, submission, expected-return or office-review state.

## Historical workflow rules

The following were the original transition rules. They are preserved here to interpret legacy
rows, not as instructions for current UI or automation:

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

## Retired initial application behaviour

The following list describes the transition-era UI. It has been retired for ordinary Jobs and
must not be reintroduced as a second workflow:

1. Existing jobs without a value are displayed as `Not sent` during migration.
2. The Jobs table shows a compact Job Card Status control.
3. The job drawer shows status and workflow timestamps.
4. Until automatic email is implemented, the existing mail-draft action does not change status to `Sent`.
5. Office users can correct the status manually during the transition.

## Superseded later-submission proposal

The proposed Dataverse submission/evidence tables were later implemented for legacy evidence, then
superseded for new cards by private Azure Table/Blob storage. See
[`technician-job-submission-schema.md`](technician-job-submission-schema.md) only when working with
historical Dataverse evidence.
