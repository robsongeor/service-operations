# Service Operations — AI Project Context

> Last reviewed: 19 July 2026  
> Source branch: `codex/multi-technician-assignments`  
> Repository: `robsongeor/service-operations`  
> Project phase: Alpha / active development

---

## 1. Project purpose

Service Operations is a web application for managing forklift and materials-handling service operations.

It is intended to replace several disconnected Excel, email, and manual office workflows with one shared system backed by Microsoft Dataverse.

The application manages:

- Breakdown jobs
- Scheduled service jobs
- Workshop jobs
- Jobs linked to equipment
- Jobs that do not involve equipment
- Customer and site relationships
- Site contacts
- Technician allocation
- Multi-technician assignments
- Job-card dispatch and tracking
- Scheduling options
- Quotes and quote revisions

Examples of valid jobs without equipment include:

- Charger repairs
- Site-wide work
- Equipment collection
- Equipment delivery
- General customer-site work
- Workshop tasks where a machine has not yet been identified

Equipment must therefore remain optional throughout the job workflow.

---

## 2. Current source of truth

The most advanced development branch is:

```text
codex/multi-technician-assignments
```

This branch should be treated as the current source of truth until its work is reviewed and merged.

Other active branches include:

```text
codex/job-card-workflow
codex/mechanic-allocated-jobs
codex/quotes-page
scheduler-page
```

These appear to represent earlier feature stages that have been incorporated into or extended by the multi-technician branch.

Do not begin new work from `main` without first merging or rebasing the current development branch. The `main` branch is significantly behind the current feature work.

---

## 3. Technology stack

### Front end

- React 19
- TypeScript
- Vite
- React Router
- Standard CSS
- ESLint

### Authentication

- Microsoft Authentication Library
- `@azure/msal-browser`
- `@azure/msal-react`
- Microsoft Entra ID sign-in

### Data layer

- Microsoft Dataverse
- Dataverse Web API v9.2
- OData queries
- Dataverse lookups, choices and relationships

### Current dependencies

```text
@azure/msal-browser
@azure/msal-react
react
react-dom
react-router-dom
```

There is currently no external state-management framework, component library, form framework or data-fetching library.

State and server interactions are handled with React hooks and feature-specific services.

---

## 4. Environment configuration

The application expects a local `.env` file based on `.env.example`.

Required variables:

```env
VITE_MSAL_CLIENT_ID=
VITE_MSAL_TENANT_ID=
VITE_DATAVERSE_URL=
```

`VITE_DATAVERSE_URL` must contain the Dataverse organisation URL only.

Correct example:

```env
VITE_DATAVERSE_URL=https://example.crm6.dynamics.com
```

Do not include:

```text
/api/data/v9.2
```

Do not include a trailing slash.

The Microsoft Entra application registration must include:

```text
http://localhost:5173
```

as a permitted redirect URI.

The user and application registration must be able to request the Dataverse:

```text
user_impersonation
```

scope.

Never commit `.env`.

---

## 5. Development commands

Install dependencies:

```bash
npm install
```

Start development:

```bash
npm run dev
```

Run linting:

```bash
npm run lint
```

Run the production type-check and build:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Always run `npm run build` before considering a feature complete.

---

## 6. Current application routes

| Route | Screen | Current state |
|---|---|---|
| `/` | Overview | Placeholder |
| `/jobs` | Job operations | Active |
| `/scheduling` | Seven-day planner | Active development |
| `/mechanics` | Mechanic management | Prototype/active development |
| `/equipment` | Equipment Manager | First version |
| `/quotes` | Quote management | Development branch feature |
| Settings navigation | Settings | Route not implemented |

Authentication is handled at the application level. Users who are not signed in are shown the Microsoft login screen.

---

## 7. Current project structure

```text
service-operations/
├── docs/
│   ├── email-dispatch-flow.md
│   ├── job-assignment-dataverse-schema.md
│   ├── job-card-dataverse-schema.md
│   └── quotes-dataverse-schema.md
│
├── scripts/
│   └── Dataverse schema/setup scripts
│
├── public/
│
├── src/
│   ├── alpha/
│   │   ├── jobs/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── services/
│   │   │   ├── types/
│   │   │   └── JobsScreen.tsx
│   │   │
│   │   ├── mechanics/
│   │   ├── equipment/
│   │   ├── quotes/
│   │   ├── scheduling/
│   │   ├── test-screen/
│   │   └── LoginScreen.tsx
│   │
│   ├── auth/
│   ├── App.tsx
│   ├── Sidebar.tsx
│   ├── Sidebar.css
│   ├── index.css
│   └── main.tsx
│
├── .env.example
├── package.json
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

### Responsibility boundaries

- Components render fields and raise user actions.
- Feature screens compose tables, drawers and page-level controls.
- Hooks own feature state and coordinate user workflows.
- Services communicate with the Dataverse Web API.
- Type files describe Dataverse responses and local view models.
- Dataverse schema documentation is stored under `docs/`.
- Dataverse provisioning or setup automation is stored under `scripts/`.

Avoid placing Dataverse request logic directly inside visual components.

---

## 8. Current job workflow

The application supports three job types.

| Job type | Dataverse value |
|---|---:|
| Breakdown | `122830000` |
| Service | `122830001` |
| Workshop | `122830002` |

Current job statuses:

| Status | Dataverse value | Default table priority |
|---|---:|---:|
| Complete | `122830003` | 1 |
| Waiting for parts | `122830002` | 2 |
| Allocated | `122830000` | 3 |
| Unallocated | `122830001` | 4 |

The current default table order follows the operational workflow above.

Do not assume the numeric Dataverse values are sequential in workflow order.

Use named constants rather than scattering raw numeric values through components.

---

## 9. Jobs feature — implemented behaviour

The jobs feature currently supports:

- Creating breakdown, service and workshop jobs
- Creating jobs with equipment
- Creating jobs without equipment
- Selecting an existing customer
- Creating a new customer
- Selecting an existing site
- Creating a new site
- Linking a new site to a customer
- Selecting an existing contact
- Creating a new contact
- Linking contacts to sites
- Selecting existing equipment
- Creating new equipment
- Assigning a primary mechanic
- Entering job number
- Entering order number
- Entering job description
- Setting job type
- Setting job status
- Adding schedule options
- Viewing jobs in a compact operations table
- Searching jobs and related records
- Filtering by status
- Sorting by workflow priority or creation date
- Editing complete job details in a side drawer
- Quickly editing key values from the jobs table
- Deleting jobs with explicit confirmation
- Emailing job information to the assigned technician
- Opening the full job editor from the scheduling board

Search currently spans information such as:

- Job number
- Description
- Equipment
- Customer
- Site
- Contact
- Mechanic

It also spans Current Office Action, Office Action Owner, and the newest Office Update.

### Office Action workflow

Office Action is stored in Dataverse and is independent of operational Job Status.

The Job table columns are:

```text
gr_currentofficeaction       Choice
gr_officeactionowner         Single line of text
gr_officeattentionrequired   Yes/No, default false
```

Office Action choices use the `122830000` to `122830010` values defined in
`src/alpha/jobs/types/officeAction.types.ts`. `None` is `122830000`.

Office Attention Required—not Current Office Action—is the source of truth for:

- the orange marker beside Job Number;
- the All / Needs Attention / No Attention Required filters; and
- the current office attention workload.

`gr_jobofficeupdates` is the append-only update-history table. Its verified schema is:

```text
Primary name: gr_name
Job lookup:   gr_Job -> gr_jobs
Update text:  gr_update
Audit fields: createdon, createdby
```

The Office tab owns Current Office Action, free-text Owner, Attention Required, and update
history. Turning attention off never removes Action, Owner, or history. Adding an update
saves the current attention value first, then creates the child update record.

Provisioning and read-only metadata verification scripts are available under `scripts/`:

```text
setup-job-office-update-schema.ps1
verify-job-office-attention-schema.ps1
```

Known follow-ups:

- Pass Office update data/actions to the Job drawer opened from Scheduling.
- Allow Office history failures to degrade independently instead of blocking the complete Jobs load.
- Add pagination or Job-scoped querying before Office Update history becomes large.

### Automatic selection rules

When a selected customer has exactly one site:

```text
Automatically select that site.
```

When a selected site has exactly one contact:

```text
Automatically select that contact.
```

The user must still be able to change the automatic selection.

### Equipment movement rule

When a saved job has both:

- selected equipment, and
- selected site

the selected equipment's Dataverse `gr_Site` lookup is updated to the job site.

This represents the real operational location of the machine.

The local React state must also be updated so that the UI reflects the change without requiring a full reload.

---

## 10. Equipment Manager

The first Equipment Manager is available at:

```text
/equipment
```

Its feature code is grouped under:

```text
src/alpha/equipment/
├── components/
├── hooks/
├── services/
├── types/
└── EquipmentScreen.tsx
```

The screen provides a compact table, free-text search, Customer/Site/state filters,
sorting, and an editing drawer. Equipment Customer is always derived through the
current Site relationship; there is no direct Equipment Customer lookup.

The drawer edits only existing Equipment master fields and the current Site. Equipment
state is displayed but remains read-only until Equipment-specific Dataverse status reason
values are confirmed. The Job History section is read-only and uses Jobs linked through
their Equipment lookup.

Equipment and Job drawers share presentation-only components under:

```text
src/alpha/shared/drawer/
├── EditDrawerShell.tsx
├── EditDrawerSection.tsx
├── EditDrawerConfirmation.tsx
├── EditDrawerFormDialog.tsx
└── EditDrawer.css
```

The shared components own the backdrop, panel, header, scrollable body, footer, section
heading, and deletion confirmation appearance. Job and Equipment form state, services,
and actions remain within their respective features.

`EditDrawerFormDialog` provides the same modal presentation for small, feature-owned
forms. Equipment uses it for combined Customer-and-Site creation and for Site creation
for an existing Customer. Customer remains temporary Equipment form state and Equipment
continues to store only its Site lookup.

Equipment may only be permanently deleted when its already-loaded Job History is empty.
If linked Jobs exist, deletion is disabled and must not call the delete API, unlink Jobs,
or modify historical records. A confirmed successful delete removes only the Equipment
from local Equipment state and closes the drawer. Equipment is not automatically made
inactive as a deletion alternative because safe Equipment state transitions are unverified.

The current-master versus historical-job rule is mandatory:

```text
Equipment is the current master record.
Each Job retains its own historical Site and other job-specific relationships.
Editing or moving Equipment must never automatically update previous Jobs.
```

## 11. Customer, site and contact model

Important relationship rules:

```text
Customer
  └── Site
       └── Site Contact relationship
            └── Contact
```

A site belongs to a customer using the site's:

```text
gr_Customer
```

lookup.

Contacts and sites are linked through the junction table:

```text
gr_sitecontacts
```

The job's customer is currently derived through the selected site.

The job does not need an independent customer lookup when the site relationship provides the customer.

When creating a new site from the job editor:

1. The user selects an existing customer or creates a new customer.
2. The user enters the site details.
3. The site is created with its customer lookup populated.
4. The new site becomes selected in the job form.
5. Contacts may then be selected or created for that site.

Do not create an orphan site without a customer unless the Dataverse/business model is deliberately changed.

---

## 12. Primary and additional technician model

A job retains one primary mechanic lookup for:

- Normal single-technician jobs
- Fast table display
- Filtering
- Mechanic pages
- Existing job-card fields
- Primary email and paperwork state

Additional technicians are stored in a separate Job Assignment table.

This is deliberate. Do not replace the primary mechanic lookup with a many-to-many-only model.

### Job Assignment table

The Job Assignment table records an additional technician's involvement in a job.

Required/expected columns:

| Display name | Schema name | Type |
|---|---|---|
| Name | `gr_name` | Text |
| Job | `gr_job` | Lookup to Job |
| Technician | `gr_mechanic` | Lookup to Mechanic |
| Work Instructions | `gr_workinstructions` | Multiline text |
| Job Card Status | `gr_jobcardstatus` | Global choice |
| Assigned On | `gr_assignedon` | Date and time |
| Email Sent On | `gr_emailsenton` | Date and time |
| Submitted On | `gr_submittedon` | Date and time |
| Closed On | `gr_closedon` | Date and time |

The table is organisation-owned.

### Assignment rules

- Adding another technician must not overwrite the primary mechanic.
- Each assignment retains its own work instructions.
- Historical assignments must not be overwritten.
- Email status is tracked per assignment.
- Job-card status is tracked per assignment.
- Each technician visit can maintain an independent paperwork history.
- The primary technician continues to use the existing job-level job-card fields.
- Overall paperwork closure remains controlled by the office.
- The overall job card should not be treated as closed until all required technician paperwork is accepted.

Schema setup is documented in:

```text
docs/job-assignment-dataverse-schema.md
```

and provisioned through the associated PowerShell setup script.

---

## 13. Job-card workflow

Job Status and Job Card Status are separate concepts.

### Job Status

Job Status is manually controlled by office staff.

Mechanics should not automatically change the operational Job Status when submitting paperwork.

### Job Card Status

The job-card workflow is:

```text
Not sent
→ Sent
→ Submitted
→ Closed
```

Dataverse choice values:

| Job-card status | Value |
|---|---:|
| Not sent | `122830000` |
| Sent | `122830001` |
| Submitted | `122830002` |
| Closed | `122830003` |

### Status rules

- `Not sent` is the initial/default state.
- `Sent` is recorded only after email dispatch succeeds.
- `Submitted` is applied when an online job card or photographed paperwork is submitted.
- `Closed` is applied after office processing is complete and the corresponding GreenTree job is closed.
- GreenTree is an implementation detail and should not appear as a separate user-facing status.

### Job fields

Expected job-card columns on the Job table include:

```text
gr_jobcardstatus
gr_jobcardsenton
gr_jobcardsubmittedon
gr_jobcardclosedon
```

Date fields should use Dataverse User Local behaviour.

Email or submission failures must not advance the job-card status.

---

## 14. Scheduling workflow

A job can have multiple scheduling options.

This supports cases where:

- The customer has been given several provisional appointment options.
- Work can happen flexibly during a selected week.
- A particular date is known but not an exact time.
- The job must occur during the morning.
- The technician must attend after a specified time.
- An exact appointment has been confirmed.

### Schedule types

| Schedule type | Dataverse value | Meaning |
|---|---:|---|
| Flexible week | `122830000` | Any suitable day in the selected week |
| Any time | `122830001` | Any time on the selected date |
| Morning | `122830002` | During the morning |
| After time | `122830003` | After the stored time |
| Exact time | `122830004` | At the stored time |

Each option may be:

```text
Confirmed
or
Provisional
```

### Scheduling board

The current scheduling screen:

- Displays seven days
- Allows navigation between weeks
- Groups flexible work into a weekly lane
- Groups dated work into day columns
- Visually distinguishes confirmed and provisional options
- Allows the full job editor to be opened from a schedule card

### Schedule records

Expected Job Schedule Option columns:

```text
gr_jobscheduleoptionid
gr_name
gr_scheduletype
gr_scheduledate
gr_scheduletime
gr_confirmed
gr_Job
```

A job can have multiple schedule-option records through `gr_Job`.

Future conflict detection should be advisory rather than blocking until business rules are fully defined.

---

## 15. Quotes feature

A quotes feature exists in the current development branch, with Dataverse schema documentation under:

```text
docs/quotes-dataverse-schema.md
```

The intended direction includes:

- Quotes linked to jobs
- Editable quote line items
- Labour lines
- Parts lines
- Consumables
- Standard services
- Subtotals
- GST
- Grand totals
- Quote revision tracking
- A shared pricing catalogue

Before extending quotes, inspect the existing quote types, services, screen and Dataverse schema document.

Do not independently invent replacement entity names when matching tables and columns already exist in the branch.

Likely future design:

```text
Job
  └── Quote
       ├── Quote revision/version
       └── Quote line items
```

The latest approved or accepted revision should remain identifiable while preserving revision history.

---

## 16. Expected Dataverse entity sets

The application currently expects entity sets including:

```text
gr_jobs
gr_equipments
gr_mechanics
gr_customers
gr_sites
gr_contacts
gr_sitecontacts
gr_jobscheduleoptions
```

The active branch also introduces or documents entities for:

```text
Job assignments
Quotes
Quote lines/revisions
```

Always verify exact plural entity-set names in Dataverse metadata before writing new API calls.

Display names, logical names, schema names and entity-set names are not interchangeable.

---

## 17. Important Job columns and relationships

Current important Job values include:

```text
gr_jobnumber
gr_ordernumber
gr_description
gr_jobtype
gr_status
gr_Equipment
gr_Mechanic
gr_Site
gr_Contact
createdon
```

Job-card workflow fields include:

```text
gr_jobcardstatus
gr_jobcardsenton
gr_jobcardsubmittedon
gr_jobcardclosedon
```

Important relationship behaviour:

- Equipment is optional.
- Site is linked to Customer.
- Contact is linked to Site through `gr_sitecontacts`.
- Customer is derived through Site.
- Equipment is relocated to the selected job site when appropriate.
- A job can contain multiple schedule options.
- A job has one primary mechanic.
- A job can contain additional technician assignment records.

Dataverse logical names are case-sensitive in OData bindings.

For lookups, verify the exact case used in:

```text
@odata.bind
$select
$expand
```

---

## 18. Existing architectural patterns

### Feature folders

Keep code grouped by business feature rather than by global technical type.

Preferred:

```text
alpha/jobs/
alpha/equipment/
alpha/scheduling/
alpha/mechanics/
alpha/quotes/
```

Within a larger feature, use:

```text
components/
hooks/
services/
types/
```

### Components

Components should:

- Display data
- Handle field interaction
- Raise callbacks
- Avoid owning Dataverse request details
- Avoid duplicating business constants

### Hooks

Hooks should:

- Manage feature state
- Coordinate related selections
- Perform automatic selection behaviour
- Expose clear actions to screens
- Coordinate service calls
- Keep UI state in sync after mutations

Examples:

```text
useJobs
useJobEditor
```

### Services

Services should:

- Obtain or receive an access token
- Construct Dataverse URLs
- Perform Web API operations
- Map Dataverse results
- Throw meaningful errors
- Avoid UI-specific state

### Screens

Screens should:

- Compose page-level features
- Connect hooks to components
- Control drawers and modals
- Manage selected records
- Avoid becoming a second service layer

---

## 19. UI and UX direction

The system is an operations tool used frequently by office staff.

Prioritise:

- Fast scanning
- Compact tables
- Clear status visibility
- Minimal clicks
- Inline editing for common changes
- Drawers for complete edits
- Explicit confirmation before destructive actions
- Search across related operational data
- Automatic defaults where unambiguous
- Easy correction when the automatic selection is wrong

Avoid:

- Excessively large cards
- Consumer-style decorative layouts
- Hiding common operational fields
- Requiring navigation away from a job to create related records
- Making equipment mandatory
- Overwriting historical technician assignments
- Mixing Job Status with Job Card Status
- Automatically closing jobs when paperwork is submitted

The jobs table is the primary operations workspace.

The full job drawer should remain available for complex changes, while common changes should be achievable directly from the table.

---

## 20. Current development maturity

The project is not production-ready.

Areas that still need production hardening include:

- Formal error boundaries
- User-facing API error handling
- Loading and retry behaviour
- Permission and security-role validation
- Dataverse schema verification
- Automated tests
- Integration tests
- End-to-end tests
- Audit/history support
- Production deployment configuration
- Environment separation
- Logging and telemetry
- Accessibility review
- Responsive behaviour
- Empty-state design
- Conflict handling
- Concurrency handling
- Robust email-dispatch workflow
- Protection against duplicate submissions
- Pagination for larger Dataverse datasets

Do not assume a successful local prototype is ready for live operational use.

---

## 21. Current known limitations

- `main` is behind active development.
- Several major features exist on separate branches.
- There are no open pull requests tying those branches together.
- The Overview page is still a placeholder.
- Settings is shown in navigation but has no implemented route.
- Mechanic management is not yet fully production-ready.
- Some code remains under an `alpha` namespace.
- Automated testing is not established.
- Production deployment is not documented as complete.
- Dataverse setup depends on the correct custom schema and choice values.
- The README is more complete on the active feature branches than on `main`.
- Email dispatch depends on an external/Power Automate workflow and must avoid marking emails as sent before confirmed success.
- Job-card and technician-assignment workflows require careful status separation.
- Quotes require additional workflow decisions before becoming production-ready.

---

## 22. Recommended immediate next steps

### Priority 1 — consolidate Git branches

Review the following branches against `codex/multi-technician-assignments`:

```text
codex/job-card-workflow
codex/mechanic-allocated-jobs
codex/quotes-page
scheduler-page
```

Confirm whether all desired work is present in the multi-technician branch.

Then:

1. Run the application.
2. Run `npm run build`.
3. Run `npm run lint`.
4. Test primary workflows.
5. Merge the consolidated branch into `main`.
6. Delete obsolete branches only after confirmation.

### Priority 2 — finish and test multi-technician assignments

Confirm:

- Primary mechanic remains unchanged.
- Additional technicians create assignment records.
- Assignment instructions are saved correctly.
- Duplicate assignment behaviour is defined.
- Technician email dispatch uses the correct assignment.
- Email sent timestamps update only after success.
- Each assignment's paperwork status is independent.
- Historical assignments are retained.
- Overall job-card closure checks all required paperwork.

### Priority 3 — complete job-card workflow

Confirm Dataverse columns and global choices are present.

Test:

```text
Not sent → Sent
Sent → Submitted
Submitted → Closed
```

Verify Job Status is not unintentionally changed.

### Priority 4 — improve mechanic management

Move remaining mechanic functionality out of `test-screen` where appropriate.

Create a production-ready mechanic screen covering:

- Active technicians
- Allocated jobs
- Additional assignments
- Job-card state
- Contact/email details where required
- Filtering
- Assignment history

### Priority 5 — continue quote workflow

Review the existing quote branch implementation and schema.

Define:

- Draft
- Sent
- Accepted
- Rejected
- Superseded
- Revision numbering
- GST calculation
- Catalogue pricing
- Permissions
- Conversion of accepted quote lines into job/work information

### Priority 6 — build the Overview screen

Useful dashboard measures could include:

- Unallocated breakdowns
- Allocated jobs
- Waiting-for-parts jobs
- Today's work
- This week's flexible work
- Overdue job cards
- Submitted paperwork awaiting processing
- Quotes awaiting response
- Upcoming service work

---

## 23. Testing checklist for job creation

Every change to the job editor should be checked against these cases.

### Existing equipment

- Existing customer
- Existing site
- Existing contact
- Existing equipment
- Primary mechanic selected
- Equipment site updated after save

### No equipment

- Existing customer
- Existing site
- Existing contact
- No equipment
- Job saves successfully

### New customer and site

- Create customer
- Create site linked to new customer
- Create or select contact
- Job saves
- Relationships reload correctly

### Existing customer and new site

- Select customer
- Create site linked to that customer
- New site becomes selected
- Create or select contact
- Job saves

### Automatic selection

- Customer with one site auto-selects it
- Customer with multiple sites does not make an unsafe assumption
- Site with one contact auto-selects it
- Site with multiple contacts allows explicit selection

### Multi-technician

- Primary mechanic remains on Job
- Additional technician creates Job Assignment
- Assignment instructions persist
- Removing/editing an assignment does not corrupt the Job
- Previous assignment history is preserved

### Scheduling

- Flexible-week option saves
- Any-time option saves
- Morning option saves
- After-time option saves with time
- Exact-time option saves with time
- Provisional and confirmed states display correctly
- Multiple options can coexist

---

## 24. Dataverse development rules

When adding a new field:

1. Confirm its exact Dataverse logical name.
2. Add it to the correct `$select`.
3. Add relationships to `$expand` when required.
4. Update the TypeScript type.
5. Update create/update payloads.
6. Update local state mapping.
7. Test null and missing values.
8. Document the schema.
9. Run the production build.

When adding a lookup:

1. Confirm the target entity-set name.
2. Use the exact navigation property name.
3. Use the correct case in `@odata.bind`.
4. Test clearing the lookup.
5. Test creating with the lookup.
6. Test updating the lookup.
7. Test expanded reads.

Never guess a Dataverse navigation-property name from its display label.

---

## 25. Guidance for AI coding agents

Before implementing a feature, an AI coding agent should:

1. Read this file.
2. Inspect the current branch.
3. Read the relevant feature folder.
4. Read the relevant document under `docs/`.
5. Identify existing constants and types.
6. Identify existing service patterns.
7. Run the current build before editing.
8. Avoid broad refactors unless requested.
9. Keep changes scoped to the requested feature.
10. Run build and lint after editing.
11. Summarise modified files and remaining risks.
12. Update this context file when architecture or workflow changes.

### Required AI behaviour

Do not:

- Make equipment mandatory.
- Remove the primary mechanic lookup.
- Replace assignment history with a single technician list.
- Mix Job Status and Job Card Status.
- Mark an email as sent before dispatch success.
- Automatically close operational jobs from technician submission.
- Create sites without linking them to a customer.
- Store a redundant job customer without confirming the data model has changed.
- Change Dataverse choice values without updating documentation and constants.
- Invent Dataverse schema names.
- Commit secrets.
- Rewrite unrelated areas of the application.

Prefer:

- Small reviewable changes
- Existing feature patterns
- Named constants
- Strong TypeScript types
- Explicit null handling
- Local state updates after Dataverse mutations
- Documentation for schema changes
- User confirmation for destructive actions

---

## 26. Suggested prompt for the next Codex task

```text
Read AI_CONTEXT.md and inspect the current branch before making changes.

Treat codex/multi-technician-assignments as the current source branch.

First run npm run build and identify any existing failures.

Then review the multi-technician assignment workflow end to end:
- primary mechanic must remain stored on the Job
- additional technicians must use Job Assignment records
- each assignment must retain instructions, email timestamps and job-card status
- historical assignments must not be overwritten
- overall job-card closure remains office-controlled

Do not make unrelated UI or architecture changes.

After implementation:
1. run npm run build
2. run npm run lint
3. list every modified file
4. explain the data-flow changes
5. identify any required Dataverse schema or Power Automate changes
6. update AI_CONTEXT.md if the architecture or workflow changed
```

---

## 27. Definition of done for future features

A feature is complete only when:

- The user workflow works from the UI.
- Dataverse reads and writes succeed.
- Related React state updates without a forced reload.
- Loading, empty and failure states are handled.
- TypeScript builds successfully.
- ESLint passes or exceptions are explained.
- Existing job-with-equipment behaviour still works.
- Job-without-equipment behaviour still works.
- Relevant Dataverse schema changes are documented.
- No secrets are committed.
- The feature is tested against its important edge cases.
- The README or AI context is updated when behaviour changes.

---

## 28. Product direction

The long-term product should become the central operational system for:

```text
Customer
→ Site
→ Contact
→ Equipment
→ Job
→ Schedule
→ Technician assignment
→ Job card
→ Quote
→ Completion/history
```

The immediate goal should not be to build every possible feature.

The priority is a reliable daily operations workflow:

1. Receive or create a job.
2. Identify the customer and site.
3. Optionally identify equipment.
4. Allocate one or more technicians.
5. Schedule the work.
6. Dispatch instructions.
7. Receive paperwork.
8. Process and close the job.
9. Preserve operational history.

---

## 29. Equipment service-plan engine

The Equipment feature now owns the maintenance engine under:

```text
src/alpha/equipment/servicePlans/
```

Calculation and status helpers are independent of React. Dataverse reads and writes are
handled by `servicePlanApi.ts`. Completing a Job with A, B or C Service updates the
applicable Equipment Service Plan records from the actual Job hour meter (A only; A+B;
or A+B+C), then increases Equipment Current Hour Meter when appropriate. A missing hour
meter or Equipment lookup prevents service-plan completion. Service Type None leaves
maintenance records unchanged.

The Equipment Manager loads plans alongside Equipment and displays a read-only Maintenance
section plus a compact nearest-due summary. These state updates are immutable and do not
reload the page or alter historical Jobs.

Maintenance is relevant only to Service jobs. `jobRequiresMaintenance` in the Job Type
module centralises that decision for drawer visibility and completion validation. In the
manager-facing Job drawer, office staff choose A, B, or C Service while planning. Hour
Meter and Completed Date belong to the future technician completion workflow and are not
editable there. Completed Date remains set by the completion workflow.
