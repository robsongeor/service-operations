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
- The public technician Job Card route is `/portal/job/:token`. It validates a random token
  through the server API and returns a deliberately minimal Job projection. The browser
  never receives Dataverse credentials or direct anonymous Dataverse access.
- Existing technician email actions generate a fresh secure submission link before
  preparing or dispatching the email. The primary technician's existing email address is
  required before token generation. Replacing an active unused link requires confirmation
  because only the newest token hash remains valid.
- Email preparation uses the existing delivery path: the Jobs table opens a plain-text
  `mailto:`, while the Job drawer retains its Email Dispatch/Power Automate workflow.
  Generating a link does not change operational Job Status or Job Card Status. The automated
  drawer workflow records Sent only after its existing dispatch confirmation succeeds.
- Technician Job Card submission stores pending story/hour-meter information and moves the
  Job Card Status to `Submitted`. It does not change operational Job Status, Completed Date,
  Equipment hour meter, maintenance state, or assignments.
- Managers review the immutable original submission timestamp, hour meter, and job story in
  the existing Job drawer's Job Card tab. Opening the drawer refreshes Jobs from Dataverse;
  viewing the submission performs no writes. A compact Submitted table action opens that
  same drawer directly on Job Card, while Jobs without authoritative submission evidence
  show a clear not-yet-submitted state.
- Expanded Job Card submissions keep time/travel and parts as append-only Job child records.
  Further-work and safety flags/details remain immutable submission metadata. The public
  service writes all child rows and the final token/status transition atomically and never
  turns those observations into Jobs, Quotes, tasks, notifications, or operational changes.
- Photos use the generic Job Photo child table and Dataverse File storage. Public submission
  tokens permit server-mediated upload only; authenticated office users download photos
  through Dataverse for read-only manager review. Do not create feature-specific photo
  tables for WOF, Quote, delivery, office, or customer upload extensions.
- Historical Jobs and their relationships are preserved.

## Extension Points

Add new Job types, completion workflows, assignment capabilities, or office actions through
typed domain modules and shared orchestration. Extend all entry points together when a rule
is cross-feature.

## Implementation Constraints

Use named Dataverse Choice constants. Keep Dataverse requests in services and multi-record
transitions in workflow APIs. Update local state after mutations. Do not duplicate completion,
allocation, or schedule logic inside tables or drawers.

## Related Files and Documents

- [`../../src/alpha/jobs/JobsScreen.tsx`](../../src/alpha/jobs/JobsScreen.tsx)
- [`../../src/alpha/jobs/hooks/useJobs.ts`](../../src/alpha/jobs/hooks/useJobs.ts)
- [`../../src/alpha/jobs/services/jobsApi.ts`](../../src/alpha/jobs/services/jobsApi.ts)
- [`../../src/alpha/jobs/components/JobEditDrawer.tsx`](../../src/alpha/jobs/components/JobEditDrawer.tsx)
- [Technician Job Card Submission](technician-job-submission.md)
- [Scheduler](scheduler.md)
- [Dataverse](dataverse.md)
