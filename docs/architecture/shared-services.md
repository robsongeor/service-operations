# Shared Services Architecture

## Overview

Service Operations does not use one generic Dataverse client for every workflow. Feature
services own their queries and mutations, while cross-feature helpers provide stable
authentication, date, presentation, and domain contracts.

The planned Operational Data Client is a shared query, persistence, mutation-reconciliation, and
realtime coordination layer; it does not replace feature services or become a generic owner of
Dataverse payload construction. Its required contract and phased migration are documented in
[Data Loading and Synchronization](data-loading-and-synchronization.md).

## Service boundaries

- Components display values and raise actions.
- Hooks coordinate loading, editor state, and workflow sequencing.
- Feature services own OData queries, mappings, lookup bindings, and narrow mutations.
- Domain helpers own pure business calculations and validation.
- Server services own privileged or anonymous workflows.

Dataverse logic must not be duplicated in visual components. Multi-record transitions use a
workflow service and an atomic change set when partial success would corrupt business state.

## Shared helpers

| Contract | Owner |
| --- | --- |
| Signed-in identity | `src/auth/` |
| Date Only parsing/formatting | `src/alpha/shared/dates/dateOnly.ts` and feature date helpers |
| Site display naming | `src/alpha/shared/siteName.ts` |
| Reusable presentation | `src/alpha/shared/` |
| Technician portal persistence | `api/services/jobSubmissionService.js` |
| Operational query/cache/realtime coordination | Planned account-scoped Operational Data Client; see `data-loading-and-synchronization.md` |

Feature-owned business-rule owners are indexed in
[Reusable Components](reusable-components.md#shared-business-and-domain-logic).

## Error and refresh rules

- Return safe user-facing errors; do not expose upstream response bodies or configuration.
- After a successful mutation, reconcile shared state and reload the authoritative affected record
  or bounded query keys. During migration, existing feature-local state remains supported.
- Use ETags where stale state could overwrite concurrent work.
- Avoid N+1 requests; expand or batch-load related data when a screen displays many rows.

## Extension points

Create a shared service only when multiple features share the same stable data contract.
Otherwise keep the service with its owning feature and expose a narrow adapter.

## Related files

- [Dataverse](dataverse.md)
- [Shared components](shared-components.md)
- [Security](security.md)
- [Data loading and synchronization](data-loading-and-synchronization.md)
