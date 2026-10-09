# Routing Architecture

## Overview

React Router owns client routes in `src/App.tsx`. Routes fall into an authenticated
management shell and a public portal shell.

## Route boundaries

| Route | Owner |
| --- | --- |
| `/` | Overview placeholder |
| `/customers` | Customer Dashboard |
| `/staff` | Internal Staff directory, technician eligibility, and contact details |
| `/mechanics` | Legacy redirect to `/staff` |
| `/equipment` | Equipment Management |
| `/equipment-map` | Equipment assigned-Site map |
| `/job-map` | Allocated, Unallocated, and Action Required Jobs grouped by recorded Site |
| `/jobs` | Jobs |
| `/job-import` | Spreadsheet Job paste, validation, matching, and atomic import |
| `/equipment-photos` | Mobile office Equipment Photo upload |
| `/site-checks` | Cross-customer Site Checks workspace |
| `/scheduling` | Scheduler |
| `/quotes` | Quotes |
| `/pricing` | Pricing |
| `/wof` | WOF Management |
| `/portal/job/:token` | Anonymous Technician Job Card Submission |
| `/portal/site-check/:token` | Proposed Site Check assignment portal (Phase 15; subject to approval) |

Management routes require an MSAL account and render with the shared navigation shell.
`/portal/job` and `/portal/job/:token` are evaluated before the management authentication
gate and intentionally render without the Sidebar or office navigation. The proposed Site
Check assignment route must use the same public-shell boundary if Phase 15 is approved.

Every feature screen and public portal screen is a route-level lazy import. The authenticated
shell, authentication boundary, Sidebar, and small route-loading fallback remain in the initial
bundle; a feature's JavaScript and CSS load only when that route is opened. Public portal routes
retain their pre-authentication routing checks and their own Suspense boundary, so code splitting
does not move them into the management shell or expose office navigation.

When application-role enforcement is enabled, `ServiceOperations.FullAccess` retains the complete
management route set. `ServiceOperations.JobBookOnly` redirects `/` to `/job-book`, renders only the
Legacy Job Book navigation item, blocks every other management path through the catch-all access-
denied route, and suppresses the Job Book's cross-navigation into a managed Job. Hiding navigation
is a usability boundary only; the matching Dataverse role must independently restrict reads and
writes. Accounts with no supported application role receive Access Denied before the management
shell is mounted.

`ServiceOperations.JobCardAdmin` redirects `/` to `/job-card-reviews` and exposes only
`/job-card-reviews`, `/job-book`, `/quotes`, `/equipment`, and `/customers`. Every other direct
management route uses the restricted catch-all. Quotes, Equipment, Customers, their Sites and
Contacts remain read-only. Job Book Intake retains its permitted operations. Job Card Admin now
has `canCorrectJobDetails`: managed rows open the canonical Job drawer in corrections-only mode
inside Job Book, without adding a `/jobs` route or enabling coordination. Factual managed-Job
GT/Timecloud markers are permitted for this role; JobBookOnly still cannot edit managed records.

## Navigation rules

- Reuse existing feature drawers when one management feature opens another record.
- Preserve route, filters, sorting, tab state, and scroll position where practical.
- Do not use route navigation as a substitute for an existing embedded drawer workflow.
- Public portal routes must remain outside the authenticated shell.

## Extension points

Add routes in `src/App.tsx`, then update this document and the owning feature architecture.
If a new route crosses an authentication boundary, review [Authentication](authentication.md)
and [Security](security.md) first.

## Related files

- [`../../src/App.tsx`](../../src/App.tsx)
- [`../../src/Sidebar.tsx`](../../src/Sidebar.tsx)
- [Public portal](public-portal.md)
