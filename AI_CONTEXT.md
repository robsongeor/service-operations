# Service Operations

This file is the durable project overview and index. Read it at the start of a task, then
read only the relevant document under `docs/architecture/` and the necessary source files.
Put active work in `CURRENT_STATE.md`, release history in `CHANGELOG.md`, and detailed
Dataverse schemas in the existing feature documents under `docs/`.

## Purpose

Service Operations coordinates forklift and materials-handling work from customer request
through scheduling, technician allocation, service completion, compliance, and operational
history. It replaces disconnected office workflows with a shared Dataverse-backed system.

The major modules are Jobs, Scheduler, Equipment, Customers, Quotes, WOF, and Technicians.
They share the same Customer → Site → Equipment → Job operating model rather than maintaining
independent copies of business data.

## Technology Stack

Service Operations is a React 19 and TypeScript application built with Vite. It supports
forklift and materials-handling service operations backed by Microsoft Dataverse.

- Routing: React Router.
- Authentication: Microsoft Entra ID through MSAL.
- Data access: Dataverse Web API v9.2 and OData.
- State: React hooks and feature-owned services; there is no global state framework.
- Styling: standard CSS with shared presentation components where appropriate.
- Server API: Azure Functions under `api/`; Vite provides the equivalent local
  `/api/joblookup` middleware.
- Primary checks: `npm test`, `npm run build`, `npm run lint`, and `git diff --check`.

## Repository Structure

- `src/alpha/<feature>/`: feature screens, components, hooks, services, types, and helpers.
- `src/alpha/shared/`: reusable presentation controls and small cross-feature helpers.
- `src/auth/`: MSAL configuration and signed-in account resolution.
- `api/`: production server-side endpoints.
- `docs/`: Dataverse schemas and workflow documentation.
- `docs/architecture/`: permanent feature and cross-cutting design references.
- `scripts/`: idempotent Dataverse provisioning and verification scripts.
- `tests/`: server API tests.

Components render data and raise user actions. Hooks coordinate feature state and workflows.
Services own Dataverse requests. Dataverse calls and business rules should not be duplicated
inside visual components.

Current application routes are defined in `src/App.tsx`; inspect that file instead of keeping
a route inventory here.

## Authentication

The browser uses MSAL and Dataverse delegated `user_impersonation` access. Resolve account
identity through the shared auth helpers. Do not select an account by cached-array order.
User-specific browser preferences must be scoped to the resolved signed-in account.

The application expects:

```env
VITE_MSAL_CLIENT_ID=
VITE_MSAL_TENANT_ID=
VITE_DATAVERSE_URL=
```

`VITE_DATAVERSE_URL` is the organisation origin only, with no `/api/data/v9.2` suffix or
trailing slash.

The Job lookup endpoint uses server-only `LIFTTRUCKS_API_USERNAME`,
`LIFTTRUCKS_API_PASSWORD`, and `DATAVERSE_URL`. Never expose these through `VITE_` variables,
commit them, return upstream error bodies, or send configuration details to the browser.
Although the Azure Function trigger is anonymous, its handler authenticates the caller's
Dataverse bearer token with `WhoAmI` before accessing credentials or the upstream service.

The SPA deliberately uses its own MSAL session rather than Azure Static Web Apps `/.auth`.
Do not change that boundary without an explicit architecture decision.

## Dataverse Architecture

The durable operational chain is:

```text
Customer → Site → Contact / Equipment → Job → Schedule / Assignment / Job Card / Quote
```

- A Site belongs to a Customer.
- A Contact is associated with one or more Sites through the established relationship.
- Equipment belongs to a Site; its Customer is derived through that Site. Do not add or
  assume a redundant direct Equipment-to-Customer lookup.
- A Job belongs to a Customer and Site through its relationships and may reference
  Equipment.
- Equipment is optional throughout Job create, edit, schedule, dispatch, and completion
  workflows. Jobs without Equipment are valid.
- When a saved Job has both Equipment and Site, move the Equipment's Site relationship to
  the Job Site and update local state without requiring a reload.
- Quote author is the immutable Dataverse `createdby` relationship; never infer it by
  matching display names.

Schema detail belongs in the documents under `docs/`.

See [Dataverse architecture](docs/architecture/dataverse.md).

## Shared UI Architecture

Before implementing UI, consult the
[Reusable components inventory](docs/architecture/reusable-components.md) for the current
canonical components, feature-owned workflows, and shared business-rule owners.

Reuse the shared drawer shell, sections, confirmation, and small form dialog under
`src/alpha/shared/drawer/`. Feature-owned state, services, and actions remain in the feature.
Use the shared `SearchableSelect` rather than building separate search and selection inputs.
Use the shared `FormSwitch` for compact boolean settings.

Keep tables compact and operationally scannable. Loading, empty, failure, validation, and
destructive-confirmation states must be explicit. After a successful Dataverse mutation,
update local state or reload authoritative data as the workflow requires; do not rely on a
full browser refresh.

Account-specific view preferences must remain account-scoped. Shared table metadata should
own column order, labels, widths, and sticky offsets rather than scattered component
constants.

See [Shared components](docs/architecture/shared-components.md).

## Core Business Rules

Historical operational records are preserved. Changes to current configuration, status, or
eligibility must not delete Jobs, assignments, inspections, service completions, or other
history. Cross-feature rules belong in domain helpers or workflow services, not copied into
screen components.

### Jobs

- Job types are Breakdown `122830000`, Service `122830001`, and Workshop `122830002`.
- Equipment remains optional for every Job type.
- Job Status and Job Card Status are separate workflows and must never be conflated.
- Operational Job Status values are named constants; do not infer workflow order from their
  numeric values.
- Completion Review is not Complete. It does not set Completed Date or run Equipment
  maintenance completion.
- Unconfirmed is recorded but not committed work. It is excluded from allocation and
  Scheduling until changed to Unallocated, but remains visible in history, search, and Quote
  linking. Moving allocated or scheduled work to Unconfirmed requires confirmation and
  removal of technician allocations and schedule options before the status change.
- Office Action is independent of Job Status. `gr_officeattentionrequired` is the workload
  source of truth; turning it off must not erase Action, Owner, or append-only Office Update
  history.
- If a selected Customer has exactly one Site, select it automatically. If a selected Site
  has exactly one Contact, select it automatically. The user must still be able to change
  either selection.
- Keep the primary technician on the Job. Additional technicians use Job Assignment
  records. Assignment instructions, dispatch timestamps, Job Card Status, and history must
  remain assignment-specific; do not overwrite historical assignments.
- Dispatch is successful only after the configured send operation succeeds. Never mark
  email as sent in advance.
- Technician submission must not automatically close the operational Job; office completion
  remains authoritative.
- Anonymous technician Job Card submission uses `/portal/job/:token` and a server-side
  Dataverse application identity. Store only a cryptographic token hash. Submission moves
  Job Card Status to Submitted while leaving operational Job Status, Completed Date,
  Equipment hour meter, and maintenance unchanged.
- Public portal endpoints must delegate token validation, minimal record projection,
  submission validation, and persistence to a server-side submission service boundary.
  Public browsers never call Dataverse directly.
- Schedule options are child records. Preserve their type, date/time, notes, and technician
  relationship according to the existing scheduling services.

See [Jobs architecture](docs/architecture/jobs.md).

### Equipment

Equipment belongs to a Site and derives its Customer through that Site. It is optional on a
Job. When work establishes a different real operating Site, the Equipment location follows
the saved Job Site. Registration, compliance, maintenance configuration, and service plans
are Equipment concerns; Job workflows consume them through shared domain APIs.

See [Equipment architecture](docs/architecture/equipment.md).

### Maintenance

Maintenance Profile and Service Programme are separate authoritative settings resolved by
`src/alpha/equipment/servicePlans/maintenanceConfiguration.ts`. Programme determines
applicable service levels; Profile determines time frequency.

- Fixed hour intervals: A 250, B 1,000, C 2,000.
- ICE Standard: A/B/C; completion cascades A→A, B→A+B, C→A+B+C.
- Electric Standard: A/C; completion cascades A→A, C→A+C.
- Custom Programme enables at least one level.
- High Usage time intervals: A 6 weeks, B 6 months, C 12 months.
- Standard: A 3 months, B 12 months, C 24 months.
- Low Usage: A 6 months, B 24 months, C 48 months.
- Custom Profile uses positive whole-day intervals for enabled levels.
- Missing configuration safely falls back to Standard Profile + ICE Standard Programme.
- Inactive plans do not contribute to due status, but their history stays readable.
- Changing Programme may deactivate a plan or create a missing applicable plan with an
  unknown baseline. Never delete service history or invent a completion.
- Historical B Jobs and completion values remain readable after switching to Electric.

Maintenance applies only to Service Jobs. Service completion uses the generic completion
framework under `src/alpha/jobs/completion/` and must call
`completeServiceJobAtomically`. Its Dataverse batch change set updates the Job, Equipment,
applicable service plans, and pending same-Equipment Job/Site changes atomically with ETag
concurrency checks. Do not reintroduce separate completion writes.

A Service completion needs the expected Equipment, saved Service Type, and a whole,
non-decreasing hour reading. A missing reading or Equipment prevents completion. Completed
historical Jobs with no reading display “Not recorded”; never substitute the Equipment's
current reading. Treat a retry as idempotent success only when authoritative Equipment and
plan state confirms the same completion.

The Equipment “Current Hour Meter” Dataverse value is labelled “Last Known Hour Meter” in
the UI; logical names and API properties remain unchanged.

See [Maintenance architecture](docs/architecture/maintenance.md).

### WOF

The typed road-compliance domain is
`src/alpha/equipment/compliance/equipmentCompliance.ts`.

- `gr_compliancestatus` is authoritative: Road Registered `122830000`, Deregistered
  `122830001`, Off Road `122830002`.
- `gr_wofrequired` is a compatibility write mirror and fallback only for records not yet
  backfilled. Do not use it for new operational decisions.
- Only Road Registered Equipment participates in operational WOF selection, the WOF screen,
  and Customer Dashboard WOF summaries.
- Confirmed On-road to Off-road changes clear the Equipment registration number, REGO
  expiry, and WOF expiry. Jobs and inspections remain preserved.
- Existing WOF records may retain now-ineligible Equipment so history remains readable, but
  that Equipment must not become selectable for new WOF work.
- Returning Off-road Equipment to On-road requires the current registration number.
- Date Only fields must use the shared WOF Date Only parsing and formatting helpers and must
  not be shifted through local timezone conversion.

WOF uses Jobs as its scheduling backbone while inspections remain durable compliance
history.

See [WOF architecture](docs/architecture/wof.md).

### Quotes

Quotes link commercial work to Customer, Equipment, and optionally Jobs without replacing
the operational Job workflow. Quote revisions preserve their identity and history. Author
identity comes from Dataverse `createdby`, never a display-name match.

See [Quotes architecture](docs/architecture/quotes.md).

### Scheduler

Scheduler presents Job schedule options and technician allocation. Schedule records remain
children of Jobs, and scheduling must use the same Job editing and allocation rules as the
Jobs module rather than implementing parallel business logic.

See [Scheduler architecture](docs/architecture/scheduler.md).

### Customers

The Customer Dashboard composes Customer, Site, Equipment, Job, Quote, and WOF information.
It is an operational projection of shared records, not a separate data model.

See [Customer Dashboard architecture](docs/architecture/customer-dashboard.md).

## Security

- Never commit `.env`, local Azure settings, access tokens, credentials, or customer data
  captured for debugging.
- Keep upstream credentials server-side and validate caller identity before using them.
- Request only required Dataverse fields and privileges.
- Do not expose raw upstream or Dataverse error bodies when they may contain sensitive
  details.
- Require confirmation for destructive actions and preserve operational history by default.
- Do not weaken authentication routes or security roles to work around development issues.

## Shared Development Principles

- Start with `AI_CONTEXT.md`, `CURRENT_STATE.md`, Git status, current branch, and the last
  three commits.
- Identify and read the smallest relevant file set and its direct dependencies.
- Prefer exact searches for components, APIs, types, helpers, and Dataverse fields over a
  repository-wide read.
- Reuse existing feature patterns, shared controls, named constants, and strong TypeScript
  types.
- Keep changes scoped; do not refactor unrelated modules.
- Preserve unrelated uncommitted work.
- Document schema changes under `docs/` and provisioning under `scripts/`.
- Keep feature-specific permanent architecture under `docs/architecture/`.
- Run validation proportionate to the change; normally run the full test, build, lint,
  diff-check, and status checks once before completion.
- Do not commit, push, merge, provision Dataverse, or deploy unless explicitly instructed.
- Update this file only when durable architecture or project-wide rules change. Replace
  `CURRENT_STATE.md` whenever the active work changes.

## Deployment Constraints

Azure Static Web Apps builds from the branch configured in
`.github/workflows/azure-static-web-apps-yellow-cliff-068680700.yml`. Do not assume the
configured deployment branch, environment state, or schema provisioning status; verify them
when deployment is part of the task.

Production public Vite values are GitHub Actions repository variables. Server-only values
are Static Web App or Function environment settings. The workflow injects application
version metadata: an exact release tag identifies a release build; later untagged commits
remain unreleased.

Do not deploy application or Dataverse changes unless the user specifically requests it.

## Updating AI_CONTEXT

Update this file only for:

- new project-wide architecture or module boundaries;
- new shared components, APIs, or data-flow patterns;
- permanent cross-feature business rules;
- new security, coding, or deployment conventions; or
- a new or renamed architecture document that belongs in this index.

Do not add completed features, bug fixes, branches, commits, validation output, deployment
progress, migration results, temporary blockers, implementation walkthroughs, or speculative
ideas. Use:

- `docs/architecture/` for permanent feature design;
- `CURRENT_STATE.md` for temporary work and readiness;
- `CHANGELOG.md` for releases, completed features, and fixes;
- feature schema/workflow documents under `docs/` for operational detail; and
- Git history for implementation evolution.
