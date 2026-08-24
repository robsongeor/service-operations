# Scheduler Architecture

## Purpose

Scheduler turns confirmed Jobs into dated work options and presents technician workload
across the planning horizon.

## Architecture

Scheduling is a projection and editor of Job schedule child records. It reuses Job editing,
technician assignment, and completion workflows rather than maintaining a parallel Job
model.

## Data Loading and Synchronization

The board owns a Monday-to-Sunday visible window rather than consuming the global Jobs list.
It first requests only Schedule Options whose Date Only value falls inside that window, then
batch-loads only the unique Jobs referenced by those options and Office Updates filtered to those
same Job IDs. Dataverse filters are bounded and all continuation pages are followed. The previous
and next schedule/Job weeks are prefetched through the
account-scoped Operational Data Client after the visible week succeeds, so normal week navigation
can reuse a warm result.

Visible and prefetched windows use separate versioned query keys, a 20-second fresh window, and
five-minute unobserved retention. They are memory-only and are not written to IndexedDB. The
shared client deduplicates concurrent readers, aborts superseded requests, and prevents an older
week response from replacing a newer selection.

The Scheduler passes its bounded Jobs, Schedule Options, and Office Updates into the canonical Jobs
hook in scoped mode. Equipment, Customer, Site, Contact, Quote, assignment, and service-plan data
remain owned by the established Job drawer workflows and are loaded progressively when needed. Refreshing
the board does not clear reference data already loaded for an open drawer.

Successful Schedule Option writes invalidate Scheduler window keys. Successful Job writes
invalidate affected Scheduler Job projections, while existing Job realtime, reconnect, and
visibility recovery refresh the observed window. Dataverse does not yet emit a dedicated
Schedule Option realtime notification, so changes made by another user to only a Schedule Option
are reconciled on the next bounded refresh/re-entry until that separately approved event or change-
tracking phase is implemented.

## Major Dataverse Relationships

- A schedule option belongs to a Job.
- It may reference a technician and stores its scheduling type, date/time, and notes.
- The Job remains the source of operational Customer, Site, Equipment, and status context.

## Shared Components and APIs

Scheduler uses shared Job drawers and the established scheduling and assignment services.
Changes made from the board must update the same authoritative records and local feature
state as changes made from Jobs.

Opening a scheduled item uses the same focused Job-editor preparation as the Jobs screen:
editor reference data is loaded, the selected Job is refreshed from Dataverse, and the shared
drawer receives the Job's Office updates and Office attention actions. If only the focused
refresh fails after reference data has loaded, the visible scheduled Job remains available as
a fallback.

## Important Business Rules

- Unconfirmed Jobs are not schedulable.
- Site Check Jobs are not schedulable.
- Schedule options are durable child records, not fields copied onto the Job.
- Removing or invalidating allocation must coordinate with affected schedule records.
- Scheduling does not change Job Card state or imply operational completion.
- Service completion started from Scheduler uses the shared completion workflow.
- Jobs owns `jobIsSchedulerEligible`; Scheduler projection and schedule create/confirm/update
  validation use that same rule. Scheduler type tabs omit Site Check. Historical Site Check
  schedule options remain stored but hidden and are counted for non-destructive review;
  cleanup requires separate approval.

## Extension Points

Additional calendar views, schedule types, capacity rules, and dispatch actions should
consume the same schedule and assignment contracts.

## Implementation Constraints

Do not duplicate Job validation or completion logic in board components. Preserve schedule
record identity and history, use existing APIs for coordinated transitions, and keep local
board state consistent after Dataverse mutations.

## Related Files and Documents

- [`../../src/alpha/scheduling/SchedulingScreen.tsx`](../../src/alpha/scheduling/SchedulingScreen.tsx)
- [`../../src/alpha/scheduling/useSchedulerWindowData.ts`](../../src/alpha/scheduling/useSchedulerWindowData.ts)
- [`../../src/alpha/scheduling/schedulerWindow.ts`](../../src/alpha/scheduling/schedulerWindow.ts)
- [`../../src/alpha/jobs/services/jobScheduleApi.ts`](../../src/alpha/jobs/services/jobScheduleApi.ts)
- [`../../src/alpha/jobs/components/JobScheduleFields.tsx`](../../src/alpha/jobs/components/JobScheduleFields.tsx)
- [Jobs](jobs.md)
- [Shared components](shared-components.md)
