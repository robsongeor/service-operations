# Architecture Guide

Service Operations is a React and TypeScript operations application backed by Microsoft
Dataverse. Its modules share the Customer → Site → Equipment → Job operating model.

## System boundaries

```text
Authenticated office browser
    ├── React management UI
    ├── MSAL delegated Dataverse access
    └── authenticated server API calls

Anonymous technician browser
    └── /portal/job/:token
          └── server JobSubmissionService
                └── least-privilege Dataverse Application User
```

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
- [Public portal](public-portal.md)
- [Security](security.md)
- [Deployment](deployment.md)
- [Development workflow](development-workflow.md)

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
| WOF | `wof.md`, `jobs.md`, `equipment.md` |
| Deployment | `deployment.md`, `security.md`, `authentication.md` |
