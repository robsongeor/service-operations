# Service Operations

Service Operations is Liftrucks' operational workspace for coordinating forklift and
materials-handling work. It brings Customers, Sites, Equipment, Jobs, scheduling,
maintenance, Quotes, WOF/REGO, technician submissions, and Site Checks into one React
application backed by Microsoft Dataverse.

> **Release status:** `v1.3.0` is the current production release. The
> `codex/site-checks-polish` branch at `f0f146e` adds the Site Checks subsystem and is
> awaiting its remaining release-gate validation.

## How the app fits together

```text
Customer → Site → Equipment → Job
                         ├── Schedule / technician assignment
                         ├── Job Card / technician submission
                         ├── Quote
                         ├── Maintenance / service programme
                         ├── WOF / road compliance
                         └── Site Check occurrence
```

The authenticated management app uses Microsoft Entra ID and delegated Dataverse access.
Public technician links use server-side API endpoints and a separate least-privilege
Dataverse Application User; confidential Dataverse credentials are never exposed to the
browser.

## Main areas

| Area | What it covers |
| --- | --- |
| **Customer Dashboard** | Customer and Site summaries, Site settings, Equipment lists, bulk Equipment import and transfer, maintenance and Site Check status. |
| **Equipment** | Equipment details, ownership classification, hour meters, service programmes, maintenance due state, road-compliance state, WOF and registration information. |
| **Jobs** | Job creation and editing, status, technician assignment, materials, time and travel, photos, completion workflows, Quotes, and Equipment history. |
| **Scheduler** | Operational scheduling and allocation. Unconfirmed and Site Check Jobs are deliberately excluded. |
| **WOF / REGO** | Due-state queue, road-registration lifecycle, WOF Jobs and Inspections, internal qualification filtering, and external providers. |
| **Technician Job Cards** | Expiring one-time mobile links for technicians to submit work details, time, travel, materials, further work, safety issues, and photos. |
| **Site Checks** | Per-Site recurring checks that generate one protected Job per eligible Equipment record, track progress, retain history, and roll the Schedule forward atomically. |
| **Mechanics** | Technician qualification summaries plus create, edit, and deactivate administration. |

## Typical workflows

### Plan and complete operational work

1. Create or open a Job against the relevant Customer, Site, and Equipment.
2. Assign and schedule an active technician.
3. Record operational work in the management app or send a secure technician Job Card link.
4. Review submitted time, travel, materials, photos, further work, and safety information.
5. Complete the Job through its workflow. Service completion also records the immutable
   hour reading, updates Equipment hours, and advances applicable maintenance plans in one
   Dataverse transaction.

### Run a Site Check

1. Open a Site from the Customer Dashboard and configure Site Checks in **Site Settings**.
2. Choose weekly, fortnightly, or monthly cadence and set the next due date.
3. Choose the Equipment scope: all Equipment, Liftrucks rentals only, or a manual selection.
4. When due, preview the included Equipment and select one active technician.
5. Run the check to atomically create an occurrence and one protected Site Check Job for
   every eligible Equipment record.
6. Complete the generated Jobs operationally. The final Job completes the occurrence and
   rolls the Schedule to its next NZ date-only due date.

Site Check Jobs live in the dedicated **Site Checks** Jobs view. They are excluded from the
default **Operational** view and from Scheduler, while current details and permanent history
remain available from the Customer Dashboard.

### Manage WOF and road compliance

Use the WOF Management queue to find due and overdue Road Registered Equipment, create or
open the contextual WOF Job, record the Inspection, and manage registration state. Active
WOF Job duplicate protection and protected cleanup rules prevent conflicting work.

## Technology and architecture

- React 19, TypeScript 6, React Router 7, and Vite 8
- Microsoft Entra ID authentication through MSAL
- Microsoft Dataverse as the operational data store
- Server API endpoints for confidential integrations and anonymous technician submissions
- Shared drawers and services for authoritative Job, Equipment, Customer, and Site editing
- ETag concurrency, Dataverse change sets, alternate keys, and replay reconciliation for
  critical multi-record workflows

The management app resolves the active MSAL account and uses delegated access. Site Checks
reuse a single silent access token per coordinated load and do not introduce an interactive
authentication path.

## Local development

Requirements:

- Node.js and npm
- access to the Microsoft Entra tenant and Dataverse environment
- an `.env` populated with the public Vite settings from `.env.example`

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

The public technician route is `/portal/job/:token`. Its local server endpoints also need
the confidential `DATAVERSE_*` settings documented in the authentication guide. Never put
those values in `VITE_` variables or commit them.

Run the standard validation suite before shipping:

```powershell
npm test
npm run lint
npm run build
git diff --check
```

## Current release notes

### Production — v1.3.0

The production release introduced secure technician Job Card submissions, modular project
documentation, multi-machine Equipment transfers, operational WOF Management, configurable
maintenance programmes, road-compliance management, atomic Service Job completion, Site
bulk Equipment import, Unconfirmed Jobs, technician qualification administration, and
related workflow and security improvements.

### Preview — Site Checks

The latest branch adds:

- weekly, fortnightly, and monthly per-Site Schedules;
- all-Equipment, Liftrucks-rental-only, and manual-selection scopes;
- replay-safe atomic occurrence and Job creation;
- protected completion and final-Job Schedule rollover;
- Customer Dashboard summaries and accessible Site Settings;
- dedicated current details and permanent history;
- Operational Jobs and Scheduler exclusion;
- provisioned Dataverse schema, alternate keys, relationships, and least-privilege role
  grants; and
- paging, token coalescing, concurrency controls, focus restoration, and rollback guidance.

Remaining release gates are assigned non-admin smoke testing, maximum-Site runtime
observation, desktop keyboard/screen-reader/200% zoom checks, historical disable/re-enable
review, and deployment rollback review.

## Known limitations

- Customer creation and Customer-level information are still local prototypes; Site
  name/address changes are persisted.
- Passing a WOF does not yet update Equipment Current WOF Expiry or Last WOF Completed.
- Some multi-record workflows outside Service Job completion can partially succeed and need
  operational recovery guidance.
- Bulk Equipment Import's email restriction is a client-side convenience, not a Dataverse
  security boundary.
- Mobile and narrow responsive management layouts are not currently supported.

## Further documentation

- [Documentation index](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/README.md)
- [Architecture overview](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/README.md)
- [Authentication](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/authentication.md)
- [Jobs](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/jobs.md)
- [Equipment and maintenance](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/equipment.md)
- [Customer Dashboard](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/customer-dashboard.md)
- [Scheduler](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/scheduler.md)
- [WOF / REGO](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/wof.md)
- [Technician Job Card Submission](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/architecture/technician-job-submission.md)
- [Site Checks operations guide](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/docs/site-checks-operations.md)
- [Changelog](https://github.com/robsongeor/service-operations/blob/codex/site-checks-polish/CHANGELOG.md)
