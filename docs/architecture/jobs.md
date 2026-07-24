# Jobs Architecture

## Purpose

Jobs are the operational backbone for breakdown, service, and workshop work. A Job records
what must be done, where it occurs, its operational state, and the relationships needed for
scheduling, assignment, dispatch, completion, quoting, and history.

## Architecture

The Jobs feature separates presentation components, workflow hooks, Dataverse services,
typed domain constants, and completion orchestration. Other screens may open the shared Job
editing workflow, but they must not maintain an independent version of Job rules.

Job Status, Office Action, technician assignment, scheduling, Job Card progress, and Quote
linkage are separate concerns. A change in one must not implicitly rewrite another unless a
documented workflow coordinates them.

## Major Dataverse Relationships

- A Job references a Customer and Site.
- Equipment is optional.
- The primary technician remains on the Job.
- Additional technicians are represented by Job Assignment child records.
- Schedule options and Office Updates are child records.
- Quotes may link to Jobs without becoming required for Job creation.

Detailed tables, columns, and relationship names belong in the relevant schema documents.

## Shared Components and APIs

Job create/edit drawers use shared drawer presentation and shared searchable selectors.
Scheduling and Customer Dashboard entry points reuse the Jobs workflow. Completion is routed
through the completion framework rather than screen-specific writes.

## Important Business Rules

- Breakdown, Service, and Workshop Jobs may exist without Equipment.
- Job Status and Job Card Status are never interchangeable.
- Completion Review is not completion.
- Unconfirmed Jobs are visible history but unavailable for allocation and scheduling.
- Moving allocated work to Unconfirmed removes allocations and schedules through existing
  APIs before changing status.
- Office attention is independent of operational Job Status, and Office Update history is
  append-only.
- Assignment instructions, dispatch state, and Job Card state are assignment-specific.
- Dispatch state changes only after successful dispatch.
- Technician submission does not close the operational Job; office completion is
  authoritative.
- Historical Jobs and their relationships are preserved.

## Extension Points

Add new Job types, completion workflows, assignment capabilities, or office actions through
typed domain modules and shared orchestration. Extend all entry points together when a rule
is cross-feature.

## Implementation Constraints

Use named Dataverse Choice constants. Keep Dataverse requests in services and multi-record
transitions in workflow APIs. Update local state after mutations. Do not duplicate completion,
allocation, or schedule logic inside tables or drawers.
