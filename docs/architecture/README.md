# Architecture Guide

Service Operations is a React and TypeScript operations application backed by Microsoft
Dataverse. Its modules share the Customer → Site → Equipment → Job operating model.

## System boundaries

~~~text
Office browser (MSAL delegated token)
    ├── Dataverse operational records and guarded mutations
    └── authenticated APIs (review, dispatch, maps, invoices)

Anonymous Job Card browser → API → private Azure Table snapshots / Blob evidence
Anonymous Site Check browser → separate API → Dataverse Application User

Scheduled reconciliation → API → application identity → guarded Dataverse updates
V2 Job Card APIs → temporary V1 shared-backend bridge
~~~

GreenTree is a separate external source; its account references must not overwrite operational
Customer/Site relationships. Job equipment is optional, and the Job's recorded Site need not be
the Equipment's current Site. See [current state](../../CURRENT_STATE.md) for configuration and
known gaps, and the [audit](../reviews/2026-10-10-application-audit.md) for release blockers.

Feature components render state and raise actions. Feature hooks coordinate workflows.
Feature services own Dataverse requests. Pure domain helpers own reusable calculations and
validation. Shared UI provides presentation contracts without owning feature writes.

## Document map

### Cross-cutting

- [Authentication](authentication.md)
- [Routing](routing.md)
- [Dataverse](dataverse.md)
- [Shared components](shared-components.md)
- [Reusable component inventory](reusable-components.md)
- [Shared services](shared-services.md)
- [Data loading and synchronization](data-loading-and-synchronization.md)
- [Public portal](public-portal.md)
- [Security](security.md)
- [Deployment](deployment.md)
- [Development workflow](development-workflow.md)
- [Retirement and compatibility checks](retirement-plan.md)

### Features

- [Jobs](jobs.md)
- [Technician Job Card Submission](technician-job-submission.md)
- [Equipment](equipment.md)
- [Maintenance](maintenance.md)
- [Customer Dashboard](customer-dashboard.md)
- [Scheduler](scheduler.md)
- [WOF/REGO](wof.md)
- [Quotes and pricing](quotes.md)

Detailed Dataverse field lists remain in the schema references linked from
[`../README.md`](../README.md).

## Reading routes for common work

| Task | Minimum useful documents |
| --- | --- |
| Job workflow | `jobs.md`, `dataverse.md`, `reusable-components.md` |
| Technician portal | `technician-job-submission.md`, `public-portal.md`, `security.md` |
| Equipment or maintenance | `equipment.md`, `maintenance.md`, `dataverse.md` |
| Customer Dashboard | `customer-dashboard.md`, `equipment.md`, `shared-components.md` |
| Scheduler | `scheduler.md`, `jobs.md`, `shared-components.md` |
| Loading, caching, or realtime synchronization | `data-loading-and-synchronization.md`, `shared-services.md`, `dataverse.md`, `authentication.md` |
| WOF | `wof.md`, `jobs.md`, `equipment.md` |
| Deployment | `deployment.md`, `security.md`, `authentication.md` |
