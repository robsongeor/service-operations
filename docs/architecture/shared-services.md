# Shared Services Architecture

## Overview

Service Operations does not use one generic Dataverse client for every workflow. Feature
services own their queries and mutations, while cross-feature helpers provide stable
authentication, date, presentation, and domain contracts.

The Operational Data Client is a small `useSyncExternalStore`-backed shared query registry. It is
instantiated once per Dataverse environment, tenant, and account above authenticated routes. It
owns typed query state, request generations, cancellation, subscriptions, bounded invalidation,
unobserved-query eviction, and privacy-safe in-memory query metrics without adding another client
dependency. The adjacent app-shell realtime provider owns one account-scoped connection for the
currently published Job, Equipment, and Staff events, dispatches only validated record identifiers,
coalesces dependent query invalidation, and shares resource-only local Job/Equipment invalidations
through an account/environment-scoped browser channel without echoing messages. IndexedDB query
persistence, entity normalization, and exported telemetry remain phased extensions. The client does not
replace feature services or become a generic owner of Dataverse payload construction. Its required
contract and phased migration are documented in
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
| Scoped cache generation and subscriptions | `src/alpha/shared/data/ScopedDataCache.ts` |
| Dataverse continuation paging | `src/alpha/shared/dataverse/fetchAllDataversePages.ts` |
| Operational query registry and React subscription | `src/alpha/shared/data/OperationalDataClient.ts`, `OperationalDataClientProvider.tsx`, `useOperationalQuery.ts`, and `useOperationalQueryState.ts` |
| Shared main-list, Staff, Pricing, focused Job/Quote, and WOF register query keys | `src/alpha/shared/data/operationalCollectionKeys.ts` |
| Shared WOF Inspection and referenced-Job Schedule Option loading | `src/alpha/wof/hooks/useWof.ts`, `src/alpha/wof/services/wofApi.ts` |
| Selected-Customer dashboard query keys and loader | `src/alpha/shared/data/operationalCollectionKeys.ts`, `src/alpha/customers/useCustomerDashboardData.ts` |
| Bounded Dataverse lookup filters | `src/alpha/shared/dataverse/boundedDataverseFilters.ts` |
| Focused Equipment Job-history query | `src/alpha/equipment/hooks/useEquipmentJobHistory.ts` |
| App-shell realtime connection, status, recovery, and query invalidation | `src/alpha/shared/realtime/OperationalRealtimeProvider.tsx`, `operationalRealtime.ts`, `operationalRealtimeEvents.ts`, and `operationalRealtimeInvalidation.ts` |

Feature-owned business-rule owners are indexed in
[Reusable Components](reusable-components.md#shared-business-and-domain-logic).

## Error and refresh rules

- Return safe user-facing errors; do not expose upstream response bodies or configuration.
- After a successful mutation, reconcile shared state and reload the authoritative affected record
  or bounded query keys. Jobs and Equipment main lists and the WOF register must use their shared
  app-shell/account-scoped keys; smaller supporting collections may remain feature-local only until
  their migration is completed.
- Use ETags where stale state could overwrite concurrent work.
- Avoid N+1 requests; expand or batch-load related data when a screen displays many rows.
- Keep large binary evidence outside list/detail payloads. Job Card queries return photo metadata;
  the shared photo-body query loads one selected Dataverse File and evicts it after a short window.
- Operational query metrics may retain aggregate query-family counts, duration, outcomes, and
  estimated payload bytes in memory. They must not retain tokens, record IDs, filters containing
  IDs, URLs with business identifiers, or response content.

## Extension points

Create a shared service only when multiple features share the same stable data contract.
Otherwise keep the service with its owning feature and expose a narrow adapter.

## Related files

- [Dataverse](dataverse.md)
- [Shared components](shared-components.md)
- [Security](security.md)
- [Data loading and synchronization](data-loading-and-synchronization.md)
