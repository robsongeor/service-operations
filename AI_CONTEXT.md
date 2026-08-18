# Service Operations — AI Context

This file contains durable project-wide rules and document routing. Read it and
`CURRENT_STATE.md` first, then use [`docs/README.md`](docs/README.md) to select only the
architecture and schema documents relevant to the task.

## Technology and structure

- React 19, TypeScript, Vite, React Router, MSAL, and Dataverse Web API v9.2.
- Feature code lives under `src/alpha/<feature>/`.
- Reusable presentation and cross-feature helpers live under `src/alpha/shared/`.
- Production server APIs live under `api/`; Vite provides equivalent local middleware.
- Dataverse provisioning and verification scripts live under `scripts/`.

Components render data and raise actions. Hooks coordinate feature state. Services own
Dataverse requests. Domain helpers own reusable business calculations and validation.

## Architecture rules

- Customer → Site → Equipment → Job is the shared operating model.
- Equipment belongs to Site and derives Customer through Site; do not add a redundant
  Equipment-to-Customer lookup.
- Equipment is optional on every Job.
- Historical Jobs, assignments, inspections, Quotes, service records, and other evidence
  are preserved when current configuration changes.
- Job Status and Job Card Status are separate workflows.
- Technician submission never automatically completes the operational Job.
- Anonymous portal browsers never call Dataverse directly or receive server credentials.
- Date Only values use shared date-only helpers and must not be shifted through timezone
  conversion.
- Multi-record transitions use the existing workflow service and an atomic change set when
  partial success would corrupt state.
- New loading, cache, focused-query, and realtime work follows
  [`docs/architecture/data-loading-and-synchronization.md`](docs/architecture/data-loading-and-synchronization.md):
  Dataverse remains authoritative, shared query state is account/environment scoped, and stale
  requests must never overwrite newer mutations or refreshes.

Feature-specific rules belong in their authoritative architecture documents.

## Development rules

1. Read `CURRENT_STATE.md`, verify Git status/branch/recent commits, and preserve unrelated
   worktree changes.
2. Read only the relevant documents from `docs/README.md` and the smallest directly related
   source-file set.
3. Reuse the shared component inventory and established feature workflows.
4. Keep changes localised; do not refactor unrelated code or duplicate business logic.
5. Confirm Dataverse logical names, entity sets, relationships, and Choice values from
   metadata, code, or schema documentation.
6. Keep Dataverse calls out of components and avoid N+1 request patterns.
7. After mutations, reconcile shared state and reload only the authoritative affected records or
   query keys; do not use a whole-table reload when a bounded refresh is available.
8. Run tests, lint, build, and `git diff --check` before handoff when proportionate.

Do not provision Dataverse, deploy, commit, push, create credentials, or change cloud
configuration unless explicitly requested.

## Shared UI rules

Consult [`docs/architecture/reusable-components.md`](docs/architecture/reusable-components.md)
before creating UI. Reuse the shared drawer, tabs, searchable selection, switch, metric,
page-header, confirmation, and feature-owned canonical drawer workflows where applicable.
Shared presentation does not own feature validation, permissions, state, or Dataverse
writes.

## Authentication and security

- Office users use MSAL delegated Dataverse access.
- Resolve the active account through shared auth helpers; never select by cached-array order.
- Reuse silent MSAL token acquisition and pass one token through a coordinated load or
  mutation. Feature rendering, background refresh, and retry loops never initiate an
  interactive sign-in; interaction-required errors expose one explicit user action.
- Batch and deduplicate Dataverse reads, reuse one authenticated connection for administrative
  workflows, and avoid repeated metadata or `WhoAmI` requests within the same operation.
- Public portal workflows use a separate confidential Entra registration and least-
  privilege Dataverse Application User.
- Validate authenticated server actions with Dataverse `WhoAmI`.
- Never expose or commit `.env`, Function settings, tokens, credentials, secrets, or
  customer debugging data.
- Server-only values never use the `VITE_` prefix.
- Return safe errors rather than raw upstream or Dataverse bodies.

See [Authentication](docs/architecture/authentication.md) and
[Security](docs/architecture/security.md).

## Documentation ownership

- `AI_CONTEXT.md`: durable project-wide rules and routing only.
- `CURRENT_STATE.md`: active branch, deployment status, unfinished work, blockers, and a
  short recent milestone.
- `TODO.md`: authoritative prioritised backlog.
- `docs/architecture/`: authoritative subsystem and cross-cutting architecture.
- `docs/*.md`: detailed Dataverse schemas and operational references.
- `CHANGELOG.md` and Git history: completed release history.

Update the authoritative owner and link to it; do not copy the same architecture into
multiple files.
