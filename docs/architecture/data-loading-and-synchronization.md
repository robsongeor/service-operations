# Data Loading and Synchronization

This document owns the cross-cutting architecture for collecting, caching, displaying,
mutating, and synchronizing operational data. Feature documents continue to own business
workflows and Dataverse schema documents continue to own logical field names.

The target design in this document is approved architecture, not a claim that every phase is
already implemented. The current implementation and its known failure modes are recorded first
so migrations can be incremental and testable.

## Objectives

- show previously loaded data immediately when it is safe to do so;
- make the first useful part of a screen or drawer independent of unrelated lookups;
- keep all mounted consumers of the same record consistent;
- propagate another user's committed change quickly without reloading an entire table;
- recover changes missed during sleep, disconnect, navigation, or SignalR reconnect;
- prevent an old request from overwriting a newer mutation or refresh;
- retain Dataverse as the authority and browser storage as a disposable performance layer;
- preserve existing feature services, business rules, delegated authentication, and explicit
  deployment/provisioning gates.

## Current architecture

```text
Route component
    -> feature hook instance (`useJobs` or `useEquipmentManager`)
        -> hook-local arrays and loading flags
        -> feature Dataverse services
            -> MSAL delegated access token
            -> Dataverse Web API

Jobs and Equipment list services
    -> module-level in-memory full-table snapshot (5-minute TTL)
    -> account/environment-scoped IndexedDB full-table snapshot (24-hour TTL)
    -> stale-while-revalidate full-table request

Jobs and Equipment feature hooks
    -> route-local SignalR connection
    -> bounded invalidation event
    -> debounced full-table refresh
```

Dataverse is the source of truth. React hook state is the active screen copy. IndexedDB contains
disposable Jobs or Equipment list snapshots only; it is not a write queue and must never be treated
as proof that a Dataverse write succeeded. MSAL owns its own token cache.

### Current collection behaviour

| Data | Current collection path | Local lifetime | Realtime behaviour |
| --- | --- | --- | --- |
| Jobs | All paged Jobs with several expanded relationships | Hook state plus 5-minute memory and 24-hour IndexedDB snapshots | Job event, reconnect, or visibility recovery can trigger a full Jobs reload |
| Equipment | All paged Equipment with expanded Site and Customer | Hook state plus 5-minute memory and 24-hour IndexedDB snapshots | Equipment event triggers a full Equipment reload |
| Customers | Full direct Dataverse query | Hook instance | None |
| Sites | Full direct Dataverse query with Customer expansion | Hook instance | None |
| Site Contacts | Full direct Dataverse query with Site and Contact expansion | `useJobs` hook instance | None |
| Mechanics/Staff | Full collection used by the feature hook | Hook instance | Staff events refresh the collection used by that hook |
| Equipment Service Plans | Full direct Dataverse query | Hook instance | Indirect local updates; no cross-client plan invalidation |
| Job Schedule Options | Full collection on Jobs hook startup | Hook instance | No dedicated cross-client invalidation |
| Job Office Updates | Full collection on Jobs hook startup | Hook instance | No dedicated cross-client invalidation |
| Quotes and Assignments used by Job editing | Loaded as part of the broad on-demand Job reference bundle | `useJobs` hook instance | No shared invalidation |
| Job detail children and photos | Focused Job fetch plus time, parts, submissions, and photo bodies | Focused hook state | Reloaded with the drawer workflow |

### Existing reusable strengths

- feature services isolate Dataverse URLs, projections, writes, and relationship binding;
- Jobs and Equipment full-list pagination follows `@odata.nextLink`;
- Jobs and Equipment cache entries are scoped by Dataverse resource, tenant, and account;
- device snapshots permit stale-while-revalidate rendering;
- in-flight full-list requests are deduplicated within each cache module;
- focused Job and Equipment-history queries exist and can become bounded query primitives;
- Jobs and Equipment SignalR events identify the changed record and operation;
- most successful mutations already update the active hook state or invalidate the relevant
  feature cache;
- route components are lazy loaded, which limits initial JavaScript work.

These pieces should be migrated into a shared coordinator rather than discarded.

## Problems in the current implementation

### 1. Data ownership is tied to hook instances

Every call to `useJobs()` or `useEquipmentManager()` creates separate React arrays, readiness
flags, background-refresh callbacks, and usually a realtime connection. Jobs is instantiated by
the Jobs screen, Scheduler, Job Map, WOF drawer, Equipment Job creation, Chargeable Invoice review,
and Customer Dashboard. Customer Dashboard also instantiates Equipment Manager.

Consequences:

- navigation discards useful route state even when the same records are needed next;
- two mounted consumers can display different versions of one record;
- a local mutation patches only the hook instance that performed it;
- each new hook can repeat Customers, Sites, plans, schedule, assignment, or other reference reads;
- a cache background-refresh callback updates only the caller that started that request, not every
  consumer that received the shared snapshot;
- multiple hook instances can open duplicate SignalR connections.

### 2. Invalidation is too broad and can still become stale

A single Job or Equipment event is debounced and then reloads the entire respective collection.
Reconnect and visibility recovery also use broad reads. This is acceptable at hundreds of rows but
will become slower and more expensive as history grows, and a burst separated by more than the
debounce window repeats the work.

The cache modules remove a cache entry on invalidation but cannot cancel or supersede its existing
promise. An earlier request can therefore finish after a mutation, restore its older snapshot, and
write that snapshot back to IndexedDB. `forceRefresh` can also join an existing request that began
before the caller required authoritative post-write data.

There is no generation, server version, ETag, or watermark comparison protecting newer state from
an older response.

### 3. Drawers wait for unrelated data

The focused Job drawer prepares a broad reference bundle containing Equipment, Customers, Sites,
Site Contacts, Quotes, Assignments, and Equipment Service Plans. Its exact Job request is coupled to
that preparation. Equipment Job creation creates a fresh `useJobs()` instance and blocks the form
until the same broad bundle is ready.

The focused Job read also requests time rows, parts, submissions, submission children, and every
photo body. Downloading photo bytes before their tab or preview is used delays useful text and form
controls.

### 4. Screens fetch global data for scoped views

Customer Dashboard currently combines a full Equipment Manager load with a full Jobs load, then
filters those arrays in the browser. Scheduler and Job Map also start from the general Jobs hook.
This guarantees convenient reuse but makes the cost of a scoped view proportional to the complete
business history.

Some smaller collection services do not follow `@odata.nextLink`, unlike Jobs and Equipment. Those
services can silently become incomplete when the Dataverse page limit is exceeded.

### 5. Multi-user synchronization is incomplete

Jobs and Equipment have bounded SignalR invalidation, but Customers, Sites, Contacts, Service Plans,
Schedule Options, Office Updates, Quotes, and Assignments do not share the same invalidation path.
Equipment realtime does not perform an explicit reconnect gap refresh. Events contain no replay
cursor, and there is no delta reconciliation for changes committed while a client was asleep or
offline.

Separate browser tabs do not notify one another when a mutation succeeds or a realtime event is
received. A valid 24-hour device snapshot can therefore be visibly stale until its detached network
refresh completes.

### 6. Loading and error state is aggregated too coarsely

Several hooks await unrelated requests in one `Promise.all`. A failure in secondary data can turn a
screen into a general load failure even when its primary list is available. A restored device list
can render early, but reference panels and actions have no standard independent readiness contract.

The UI has no consistent distinction among **cached**, **refreshing**, **fresh**, **stale**, and
**offline** data.

### 7. Observability is insufficient for performance decisions

There is no shared measurement of cache hit source, request duration, payload size, duplicate request
count, event-to-screen latency, or stale-response suppression. Performance regressions are therefore
found mainly through visible user delay.

## Target architecture

Use one authenticated, account-scoped **Operational Data Client** above route components. It owns
query state, mutation reconciliation, IndexedDB persistence, and one realtime dispatcher. Feature
hooks become selectors and commands over this client; feature services remain the only code that
knows Dataverse URLs and payloads.

```text
Authenticated App Shell
    -> Operational Data Client (one per Dataverse environment + tenant + account)
        -> shared query registry and entity records
        -> mutation coordinator
        -> IndexedDB snapshot adapter
        -> one realtime event dispatcher
        -> cross-tab invalidation channel
        -> authentication coordinator
            -> existing typed feature services
                -> Dataverse Web API

Route / drawer
    -> feature query hook (subscribes to shared query keys)
    -> feature command (writes, patches returned record, invalidates bounded dependants)
```

The client may be implemented with a proven React query library or a small external store based on
`useSyncExternalStore`. Before implementation, record the selected library and persistence support
in `shared-services.md`. Whichever implementation is chosen must provide the contracts below; feature
hooks must not recreate independent authoritative arrays.

### Query key contract

Every query key contains:

1. Dataverse environment/resource;
2. tenant and signed-in account;
3. entity or aggregate name;
4. record ID or normalized filter/sort/page parameters;
5. projection version.

Examples:

```text
['job', jobId, 'core', projectionVersion]
['job', jobId, 'submissions', projectionVersion]
['jobs', { status, customerId, siteId, cursor }, projectionVersion]
['equipment', equipmentId, 'core', projectionVersion]
['equipment', equipmentId, 'jobs', cursor, projectionVersion]
['customer-dashboard', customerId, projectionVersion]
```

Query records store `status`, `fetchedAt`, `staleAt`, an optional Dataverse ETag or modified time,
the request generation, and normalized IDs. Query results subscribe through the shared client so
all mounted consumers receive one update.

### Collection strategy

- Use server-side `$select`, `$filter`, `$orderby`, and paging for the view being rendered.
- Keep summary/list projections separate from record-detail projections.
- Page or virtualize growing operational lists. Do not download all historical Jobs to open a
  current-work screen.
- Provide customer-scoped and site-scoped queries for Customer Dashboard rather than loading global
  Jobs and Equipment first.
- Provide date-range/status queries for Scheduler and status/location queries for Job Map.
- Keep truly small, stable lookup collections shared with a longer `staleTime`, but always support
  `@odata.nextLink`.
- Load remote Equipment search results on demand instead of requiring the full Equipment table before
  a Job form can open.

### Progressive drawer strategy

1. Open the shell immediately from the selected list summary.
2. Fetch the focused record's core projection and render it independently.
3. Load only the lookups needed by the active editable fields.
4. Load tab data when the tab is approached or selected; prefetch likely next tabs while idle.
5. Load photo metadata before photo bytes. Fetch a thumbnail or body only when it becomes visible,
   and prefer object URLs over storing base64 bodies in React state.
6. Keep independent loading and retry boundaries for core record, lookups, Office, Scheduling,
   Quotes, Job Card submissions, and photos.
7. Prefetch Equipment Job history after an Equipment drawer opens, cancel or release the query when
   it is no longer observed, and retain only the configured short cache window.

### Mutation strategy

1. Acquire one shared delegated token request for concurrent work.
2. Send the mutation through its owning feature service, using ETag preconditions where overwriting a
   concurrent edit would be unsafe.
3. Prefer a Dataverse representation response when practical.
4. Patch the returned entity into the shared store once.
5. Invalidate only dependent query keys, for example one Job summary, its Equipment history, the
   affected Customer dashboard aggregate, and relevant Scheduler/Job Map pages.
6. Mark older request generations obsolete and abort them when possible. Obsolete responses must not
   write memory or IndexedDB.
7. Re-fetch the exact authoritative record when the write response is not a sufficient projection.
8. Let the later echo realtime event become a no-op when its version is not newer.

Optimistic UI is suitable only for reversible, low-risk fields such as local selection. Job
completion, relationship transfer, service-plan recalculation, submission, and multi-record writes
remain server-confirmed workflows.

### Realtime and gap recovery

- Maintain one authenticated realtime connection at the app shell and dispatch events by entity and
  record ID.
- Preserve bounded event payloads: table/entity, record ID, operation, changed timestamp or monotonic
  version, and only the parent IDs needed for invalidation. Do not broadcast business content.
- When a visible record changes, re-read that exact record. Otherwise mark affected list/aggregate
  keys stale and batch their background refresh.
- Coalesce by query key and record ID, not into a whole-table refresh.
- On reconnect, account resume, or tab visibility return, reconcile every subscribed entity from a
  stored watermark with a small overlap and ID/version deduplication.
- Until an approved delta mechanism exists, perform a bounded refresh of currently observed queries
  rather than every table. Dataverse change tracking/delta links are the preferred later gap-recovery
  mechanism but require separately approved table configuration and verification.
- Extend server invalidation to Sites, Customers, Contacts, Service Plans, Schedule Options, Office
  Updates, Quotes, and Assignments only through separately reviewed plugin/cloud changes.
- Use `BroadcastChannel` to share invalidations and successful local mutation versions across tabs.
  A later leader-tab lease may reduce duplicate SignalR connections, but correctness must not depend
  on leader election.

### Browser persistence

Persist only explicitly approved list/summary queries. Each IndexedDB record must include account and
environment scope, query key, projection version, saved time, optional watermark/version, and data.

- Browser data is a disposable read cache, never an offline write queue.
- Do not persist photo bodies, secrets, access tokens, or high-sensitivity submission content.
- Purge the active account's persisted operational cache on sign-out and make retention configurable;
  the current 24-hour list retention is the upper starting bound, not a freshness guarantee.
- A device snapshot may render immediately with an **Updating** indicator. Failed revalidation keeps
  the usable snapshot visible and presents a scoped retry/offline state.
- Persisted writes use a generation/version guard so detached old refreshes cannot replace newer data.

## Data authority and storage rules

| Layer | Owns | Must not own |
| --- | --- | --- |
| Dataverse | Business records, relationships, server timestamps, concurrency tokens | UI selection and transient form state |
| Server APIs / plugins | Anonymous portal boundary, atomic or privileged orchestration, bounded invalidation publication | General browser screen cache |
| Operational Data Client memory | Shared query/entity state, request generations, current subscriptions, mutation reconciliation | Independent business truth |
| IndexedDB | Approved account-scoped read snapshots and reconciliation metadata | Tokens, uncommitted writes, photo bodies, permanent audit evidence |
| React component state | Draft form values, selected tab, expanded rows, focus and presentation state | Shared copies of authoritative collections |
| Session/local storage | Approved small view preferences such as selected Customer | Dataverse records or synchronization queues |

## Loading-state contract

Every query-facing component should be able to distinguish:

- **initial**: no usable data has been loaded;
- **cached**: a safe local snapshot is visible;
- **refreshing**: visible data is being revalidated;
- **fresh**: the latest request or event version is applied;
- **stale/offline**: visible data remains usable but revalidation failed;
- **error**: no usable data exists for that boundary.

A secondary query failure must not blank a valid primary screen. Actions that depend on missing
reference data should explain and retry only that dependency.

## Implementation sequence

### Phase 1 — Correctness and measurement foundation

- add request generation and cancellation to the existing Jobs and Equipment caches;
- prevent invalidated or older in-flight results from repopulating memory or IndexedDB;
- coalesce concurrent silent token acquisition through the authentication coordinator;
- instrument request count/duration, cache source, payload size where available, stale-result drops,
  and event-to-visible-update latency without logging business content or tokens;
- make every full collection service follow `@odata.nextLink`.

### Phase 2 — Shared Operational Data Client

- introduce the account/environment-scoped client at the authenticated app shell;
- define typed query keys and shared subscriptions;
- migrate Jobs and Equipment list caches without changing business services;
- make successful mutations update all mounted consumers;
- keep route state warm for the configured stale window.

### Phase 3 — Progressive focused workflows

- split Job core, editable lookup, Office, Scheduling, Quotes, submission, and photo queries;
- split Equipment core, Job history, service plans, documents, and usage evidence queries;
- prefetch Equipment Job history in the background and avoid retaining it after its short cache window;
- stop blocking drawers on broad reference bundles.

### Phase 4 — Scoped screens

- migrate Customer Dashboard to customer-scoped aggregates and paged child queries;
- migrate Scheduler to date-window queries;
- migrate Job Map to status/location summaries;
- migrate remote Equipment/Customer/Site selectors to bounded search queries.

### Phase 5 — Multi-user synchronization

- move the realtime connection and dispatcher to the app shell;
- patch or invalidate by record/query key;
- add Jobs and Equipment reconnect watermark recovery;
- add cross-tab invalidation;
- separately design and approve expanded Dataverse plugin events or change tracking for other tables.

## Verification and performance targets

Capture a baseline before migration and compare equivalent data volumes. Initial targets are:

- cached route content visible within 300 ms on a supported office device;
- drawer shell visible immediately and focused core data normally available within 750 ms on the
  office network, without waiting for photos or unrelated tabs;
- no full Jobs or Equipment collection reload for a single bounded record event;
- a connected remote Job or Equipment change visible in an observing client within 5 seconds;
- reconnect/visibility recovery refreshes only subscribed queries and cannot overwrite a newer local
  mutation;
- one network request per query key during concurrent mounting;
- no blank screen when a valid cached primary query exists and a secondary query fails;
- pagination tests for every potentially growing Dataverse collection;
- multi-client tests covering simultaneous edit, delete, relationship move, Job completion, missed
  event recovery, account switch, multiple tabs, and stale in-flight response suppression.

These are product targets rather than Dataverse service guarantees. Record measured median and P95
results before tightening them.

## Security and deployment boundary

This design does not change Dataverse schema, roles, plugins, Azure settings, credentials, or public
routes by itself. Implementing SignalR events for additional tables or Dataverse change tracking is a
cloud/configuration change and requires explicit approval, least-privilege review, deployment, and
signed-in multi-client smoke testing.

## Related files

- `src/auth/dataverseAuthentication.ts`
- `src/alpha/jobs/hooks/useJobs.ts`
- `src/alpha/jobs/services/jobsApi.ts`
- `src/alpha/jobs/services/jobsDataCache.ts`
- `src/alpha/jobs/services/jobsRealtime.ts`
- `src/alpha/equipment/hooks/useEquipmentManager.ts`
- `src/alpha/equipment/services/equipmentDataCache.ts`
- `src/alpha/equipment/services/equipmentRealtime.ts`
- `src/alpha/customers/CustomerDashboardScreen.tsx`
- `src/alpha/scheduling/SchedulingScreen.tsx`
- [`shared-services.md`](shared-services.md)
- [`dataverse.md`](dataverse.md)
- [`authentication.md`](authentication.md)

