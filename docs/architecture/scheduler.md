# Scheduler Architecture

## Purpose

Scheduler turns confirmed Jobs into dated work options and presents technician workload
across the planning horizon.

## Architecture

Scheduling is a projection and editor of Job schedule child records. It reuses Job editing,
technician assignment, and completion workflows rather than maintaining a parallel Job
model.

## Major Dataverse Relationships

- A schedule option belongs to a Job.
- It may reference a technician and stores its scheduling type, date/time, and notes.
- The Job remains the source of operational Customer, Site, Equipment, and status context.

## Shared Components and APIs

Scheduler uses shared Job drawers and the established scheduling and assignment services.
Changes made from the board must update the same authoritative records and local feature
state as changes made from Jobs.

## Important Business Rules

- Unconfirmed Jobs are not schedulable.
- Schedule options are durable child records, not fields copied onto the Job.
- Removing or invalidating allocation must coordinate with affected schedule records.
- Scheduling does not change Job Card state or imply operational completion.
- Service completion started from Scheduler uses the shared completion workflow.

## Extension Points

Additional calendar views, schedule types, capacity rules, and dispatch actions should
consume the same schedule and assignment contracts.

## Implementation Constraints

Do not duplicate Job validation or completion logic in board components. Preserve schedule
record identity and history, use existing APIs for coordinated transitions, and keep local
board state consistent after Dataverse mutations.

## Related Files and Documents

- [`../../src/alpha/scheduling/SchedulingScreen.tsx`](../../src/alpha/scheduling/SchedulingScreen.tsx)
- [`../../src/alpha/jobs/services/jobScheduleApi.ts`](../../src/alpha/jobs/services/jobScheduleApi.ts)
- [`../../src/alpha/jobs/components/JobScheduleFields.tsx`](../../src/alpha/jobs/components/JobScheduleFields.tsx)
- [Jobs](jobs.md)
- [Shared components](shared-components.md)
