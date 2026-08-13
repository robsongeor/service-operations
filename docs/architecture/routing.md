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
| `/jobs` | Jobs |
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
