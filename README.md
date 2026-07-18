# Service Operations

Service Operations is a web application for managing breakdown, service, and workshop jobs. It is being built to replace several Excel-based workflows with one shared system backed by Microsoft Dataverse.

The app supports jobs that are linked to equipment as well as jobs without equipment, such as charger work, site-wide work, pickups, and deliveries.

## Current features

- Microsoft sign-in using MSAL.
- Create breakdown, service, and workshop jobs.
- Equipment is optional when creating a job.
- Select or create customers, sites, contacts, and equipment while creating a job.
- Link sites to customers and contacts to sites.
- Automatically select a site when a customer has exactly one site.
- Automatically select a contact when a site has exactly one contact.
- Move the selected equipment to the job's site in Dataverse.
- View jobs in a compact operations table.
- Search across job, equipment, customer, site, contact, and mechanic details.
- Sort jobs by status priority or creation date.
- Filter jobs by status.
- Edit complete job details in a side drawer.
- Delete jobs with an explicit confirmation step.
- Create customers, sites, contacts, and equipment without leaving the job drawer.
- Quickly edit job number, description, order number, mechanic, and status from the table.
- Email a job to its assigned mechanic.
- Add one or more scheduling options while creating or editing a job.
- Schedule work as flexible for a week, any time on a day, morning, after a specified time, or at an exact time.
- Mark scheduling options as confirmed or provisional.
- Review scheduled work in a seven-day planner and move between weeks.
- Open the complete job editor directly from the scheduling board.

## Job workflow

Jobs currently use these types:

| Job type | Dataverse choice value |
| --- | ---: |
| Breakdown | `122830000` |
| Service | `122830001` |
| Workshop | `122830002` |

Jobs currently use these statuses:

| Status | Dataverse choice value | Default table priority |
| --- | ---: | ---: |
| Complete | `122830003` | 1 |
| Waiting for parts | `122830002` | 2 |
| Allocated | `122830000` | 3 |
| Unallocated | `122830001` | 4 |

The default table order follows the operational workflow above, with completed jobs first and unallocated jobs last.

## Scheduling workflow

Each job can have multiple scheduling options. This supports tentative customer options before one appointment is confirmed, as well as work that can be completed flexibly during a week.

| Schedule type | Dataverse choice value | Meaning |
| --- | ---: | --- |
| Flexible week | `122830000` | The job can be completed on any suitable day in the selected week. |
| Any time | `122830001` | The job can be completed at any time on the selected day. |
| Morning | `122830002` | The job should be completed during the morning of the selected day. |
| After time | `122830003` | The job should be completed after the stored time. |
| Exact time | `122830004` | The job is scheduled for the stored time. |

The scheduling screen groups flexible work into a weekly lane and dated work into daily columns. Confirmed and provisional options are shown separately through their card state.

## Technology

- React 19
- TypeScript
- Vite
- React Router
- Microsoft Authentication Library (`@azure/msal-browser` and `@azure/msal-react`)
- Microsoft Dataverse Web API v9.2

## Requirements

Before running the project, you need:

- Node.js and npm.
- Access to the correct Microsoft Entra tenant.
- A registered Microsoft Entra application configured for this app.
- Permission to access the target Dataverse environment.
- The required Dataverse tables, columns, relationships, and Choice values.

## Local setup

1. Install the dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Replace the placeholders in `.env` with the Microsoft Entra application ID, tenant ID, and Dataverse organization URL:

   ```env
   VITE_MSAL_CLIENT_ID=your-application-client-id
   VITE_MSAL_TENANT_ID=your-tenant-id
   VITE_DATAVERSE_URL=https://your-environment.crm.dynamics.com
   ```

   Use the organization URL without `/api/data/v9.2` and without a trailing slash.

4. Make sure the Microsoft Entra app registration includes this local redirect URI:

   ```text
   http://localhost:5173
   ```

5. Make sure the signed-in user and app registration can request the Dataverse `user_impersonation` scope.

6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:5173` and sign in.

Do not commit the `.env` file. It is already excluded by `.gitignore`.

## Available commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Vite development server. |
| `npm run build` | Type-check the app and create a production build. |
| `npm run lint` | Run ESLint across the project. |
| `npm run preview` | Preview the production build locally. |

## Dataverse model

The application currently expects the following Dataverse entity sets:

| Purpose | Entity set |
| --- | --- |
| Jobs | `gr_jobs` |
| Equipment | `gr_equipments` |
| Mechanics | `gr_mechanics` |
| Customers | `gr_customers` |
| Sites | `gr_sites` |
| Contacts | `gr_contacts` |
| Site/contact links | `gr_sitecontacts` |
| Job schedule options | `gr_jobscheduleoptions` |

Important job columns and relationships include:

- `gr_jobnumber`
- `gr_ordernumber`
- `gr_description`
- `gr_jobtype`
- `gr_status`
- `gr_Equipment`
- `gr_Mechanic`
- `gr_Site`
- `gr_Contact`
- Dataverse system column `createdon`

The job schedule option table requires:

- `gr_jobscheduleoptionid`
- `gr_name`
- `gr_scheduletype`
- `gr_scheduledate`
- `gr_scheduletime`
- `gr_confirmed`
- `gr_Job` lookup to `gr_jobs`

Important relationship rules:

- A job may have equipment, but equipment is not mandatory.
- A site belongs to a customer through `gr_Customer`.
- A site and contact are connected through `gr_sitecontacts`.
- When a saved job has both equipment and a site, the equipment record's `gr_Site` lookup is updated to that site.
- The job's customer is derived from its selected site rather than stored as a separate job lookup.
- A job can have multiple schedule option records through the `gr_Job` lookup.

If the schema or Choice values change in Dataverse, the corresponding API queries and TypeScript constants must also be updated.

## Project structure

```text
src/
├── alpha/
│   ├── jobs/
│   │   ├── components/    Job table and create/edit drawer fields
│   │   ├── hooks/         Job data and editor state
│   │   ├── services/      Dataverse APIs and job email helper
│   │   ├── types/         Job, relationship, and schedule types
│   │   └── JobsScreen.tsx Job operations screen
│   ├── scheduling/        Seven-day scheduling board
│   ├── test-screen/       Current mechanic management prototype
│   └── LoginScreen.tsx    Microsoft sign-in screen
├── auth/                  MSAL configuration
├── App.tsx                Authentication gate and application routes
├── Sidebar.tsx            Main navigation
└── main.tsx               React, MSAL, and router setup
```

The jobs feature uses a simple separation of responsibilities:

- Components display fields and raise user actions.
- `JobsScreen` composes the job table and job drawers.
- `SchedulingScreen` groups schedule options into weekly and daily lanes.
- `useJobEditor` manages customer, site, contact, and equipment selections.
- `useJobs` owns shared job and schedule data and calls the service layer.
- Service files communicate with the Dataverse Web API.
- Type files describe the records returned by Dataverse.

## Current routes

| Route | Screen | Status |
| --- | --- | --- |
| `/` | Overview | Placeholder |
| `/jobs` | Job operations | Active development |
| `/scheduling` | Seven-day scheduling planner | Active development |
| `/mechanics` | Mechanic management | Prototype |

The Settings navigation item does not yet have an implemented route.

## Development notes

- This project is under active development and should not yet be treated as production-ready.
- Dataverse logical names are case-sensitive where used in OData bindings.
- New Dataverse fields must be added to both the relevant `$select`/`$expand` query and its TypeScript type.
- After updating equipment or related job records, keep the local React state in sync so the table updates without a page refresh.
- Run `npm run build` before committing a feature to catch TypeScript and production-build errors.

## Planned direction

Likely next areas of development include:

- Job-linked quotes with editable line items, GST totals, and revision tracking.
- A shared pricing catalogue for labour, consumables, standard services, and common parts.
- Conflict warnings for the smaller set of jobs that receive schedule options.
- Faster triage and allocation controls for breakdown work.
- Dedicated management pages for sites, customers, contacts, and equipment.
- A production-ready mechanic management screen.
- Job history and audit notes for equipment or location corrections.
- Overview reporting for active work, waiting parts, and upcoming service jobs.
