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
        -> shared Jobs/Equipment list value in the app-shell Operational Data Client
        -> hook-local workflow/reference data and loading flags
        -> feature Dataverse services
            -> MSAL delegated access token
            -> Dataverse Web API

Jobs and Equipment list services
    -> shared generation-aware in-memory full-table snapshot (5-minute TTL)
    -> subscribed hook consumers receive accepted cache commits
    -> account/environment-scoped IndexedDB full-table snapshot (24-hour TTL)
    -> stale-while-revalidate full-table request

Jobs and Equipment feature hooks
    -> route-local SignalR connection
    -> bounded invalidation event
    -> debounced full-table refresh
```

Dataverse is the source of truth. The app-shell query registry owns the accepted in-memory Jobs and
Equipment list values; feature hooks still orchestrate their established service/cache callbacks and
own supporting workflow state. IndexedDB contains
disposable Jobs or Equipment list snapshots only; it is not a write queue and must never be treated
as proof that a Dataverse write succeeded. MSAL owns its own token cache.

### Current collection behaviour

| Data | Current collection path | Local lifetime | Realtime behaviour |
| --- | --- | --- | --- |
| Jobs | All paged Jobs with several expanded relationships | App-shell query value plus 5-minute service memory and 24-hour IndexedDB snapshots | Job event, reconnect, or visibility recovery can trigger a full Jobs reload |
| Equipment | All paged Equipment with expanded Site and Customer | App-shell query value plus 5-minute service memory and 24-hour IndexedDB snapshots | Equipment event triggers a full Equipment reload |
| Customers | Full direct Dataverse query | Hook instance | None |
| Sites | Full direct Dataverse query with Customer expansion | Hook instance | None |
| Site Contacts | Full direct Dataverse query with Site and Contact expansion | `useJobs` hook instance | None |
| Mechanics/Staff | Full collection used by the feature hook | Hook instance | Staff events refresh the collection used by that hook |
| Equipment Service Plans | Full direct Dataverse query | Hook instance | Indirect local updates; no cross-client plan invalidation |
| Job Schedule Options | Full collection on general Jobs-hook startup; Scheduler uses a server-filtered seven-day window | Hook instance or shared Scheduler window query | Scheduler mutations invalidate bounded windows; no dedicated cross-client Schedule Option event |
| Job Office Updates | Full collection on Jobs hook startup | Hook instance | No dedicated cross-client invalidation |
| Job editor relationships | Equipment, Customers, Sites, Site Contacts, and Service Plans load together after an edit drawer opens | `useJobs` hook instance | No shared invalidation |
| Quotes and Assignments used by Job editing | Independent collaboration bundle started after an edit drawer opens | `useJobs` hook instance | No shared invalidation |
| Job core | One exact Job projection started after the shell opens; it does not wait for lookups or child tables | Shared focused query: 15-second stale window and 2-minute unobserved retention | A matching Job event or mutation invalidates and refreshes the observed focused record |
| Job Card detail | Time, parts, submissions, submission children, and photo metadata load only when the Job Card tab is selected | Shared focused query: 30-second stale window and 1-minute unobserved retention | Job invalidation refreshes the observed metadata query |
| Job Card photo body | One Dataverse File body requested only when that photo is opened | Shared focused query: 5-minute stale window and 30-second unobserved retention; never IndexedDB persisted | Independent retry; closing the last observer starts eviction |

Customer Dashboard is now an intentional exception to the global Jobs and Equipment rows above.
After Customer selection it loads only that Customer's Sites, then bounded Site-filtered Equipment
and Jobs, then bounded Equipment-filtered service plans. These four collections use shared
customer-dashboard query keys with 20–30-second stale windows and two-minute unobserved retention.
They are not written to IndexedDB. Equipment completion additionally loads the focused Equipment's
complete Job history before applying hour-meter or maintenance rules, because historical Jobs may
belong to a Site outside the currently selected Customer projection.

Scheduler is also a scoped exception. It loads only the visible week's Schedule Options and only
the Jobs referenced by those rows, then prefetches the adjacent weeks. Window results are shared for
20 seconds and retained unobserved for five minutes without IndexedDB persistence. Existing Job
events, reconnect recovery, visibility recovery, and successful mutations refresh the active
bounded projection; a Schedule Option-only cross-client event remains future work.

### Existing reusable strengths

- feature services isolate Dataverse URLs, projections, writes, and relationship binding;
- Jobs and Equipment full-list pagination follows `@odata.nextLink`;
- Jobs and Equipment cache entries are scoped by Dataverse resource, tenant, and account;
- device snapshots permit stale-while-revalidate rendering;
- in-flight full-list requests are deduplicated within each cache module;
- the shared scoped cache prevents invalidated or superseded requests from restoring older memory
  or device snapshots;
- accepted Jobs and Equipment cache commits are published to every mounted hook subscriber for the
  same account/environment scope;
- Jobs and Equipment route hooks now read and reconcile one app-shell query value rather than
  creating independent authoritative list arrays;
- concurrent silent delegated-token requests with the same account and refresh intent are coalesced;
- the main Job/Equipment reference collections use one reusable Dataverse continuation-page reader;
- focused Job core, Job Card metadata, individual Job Card photo bodies, and Equipment history use
  bounded shared query keys with request deduplication, cancellation, and unobserved eviction;
- canonical Job drawers now open from the available summary immediately, refresh the exact Job in
  the background, and keep editor, collaboration, and Job Card failures inside separate retry
  boundaries;
- Jobs and Equipment SignalR events identify the changed record and operation;
- most successful mutations already update the active hook state or invalidate the relevant
  feature cache;
- route components are lazy loaded, which limits initial JavaScript work.

These pieces should be migrated into a shared coordinator rather than discarded.

## Problems in the current implementation

### 1. Supporting data and orchestration remain tied to hook instances

The primary Jobs and Equipment list arrays are now shared by query key above routes. Every call to
`useJobs()` or `useEquipmentManager()` still creates separate supporting reference arrays, readiness
flags, background-refresh orchestration, and usually a realtime connection. Jobs is instantiated by
the Jobs screen, Scheduler, Job Map, WOF drawer, Equipment Job creation, Chargeable Invoice review,
and Customer Dashboard. Customer Dashboard also instantiates Equipment Manager.

Consequences:

- navigation now retains the primary Jobs and Equipment values, but supporting reference state is
  still discarded;
- mutations to the main lists reconcile every mounted consumer, while supporting feature-local
  collections can still diverge until refreshed;
- each new hook can repeat Customers, Sites, plans, schedule, assignment, or other reference reads;
- multiple hook instances can open duplicate SignalR connections.

### 2. Invalidation is too broad and can still become stale

A single Job or Equipment event is debounced and then reloads the entire respective collection.
Reconnect and visibility recovery also use broad reads. This is acceptable at hundreds of rows but
will become slower and more expensive as history grows, and a burst separated by more than the
debounce window repeats the work.

The generation-aware shared cache now prevents an older request from committing after invalidation,
a direct write, or a newer authoritative refresh. Remaining work is to pass abort signals into the
network layer and compare server ETags/modified versions so unnecessary responses can be cancelled
and realtime echoes can be ignored without a re-read.

### 3. Remaining drawer/reference work

The canonical Job edit drawer no longer waits for one broad reference bundle. It opens immediately,
shares the exact Job core by stable key across every entry point, separates relationship/service-plan
data from Quotes and Assignments, and loads Job Card children and photo metadata only when that tab
is selected. A full photo body is requested only when the operator opens that photo. Core,
relationship, collaboration, Job Card metadata, and photo-body failures have scoped retry states;
save remains guarded until the exact Job and relationship choices are ready.

The remaining limitations are that relationship and collaboration groups still perform full-table
reads inside a `useJobs()` instance, and Equipment Job creation still creates a fresh `useJobs()`
instance. Job creation correctly remains gated on its required relationship choices.

### 4. Some screens still fetch global data for scoped views

Customer Dashboard has migrated its selected-Customer Sites, Equipment, Jobs, and service plans to
server-filtered bounded queries. Scheduler now uses a seven-day Schedule Option query and batches
only the referenced Jobs, with adjacent-window prefetch. Job Map still starts from the general Jobs
hook, so its cost remains proportional to the complete business history. Customer and editor/
reference collections also remain broader than their selected projections.

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

### 7. Observability is not yet exported

The Operational Data Client now retains privacy-safe in-memory counters for request count, cache
hits, concurrent-request deduplication, success/failure/abort, duration, and estimated payload bytes.
Metrics use normalized query-family labels and do not retain Dataverse record IDs, business content,
or tokens. There is not yet a production telemetry exporter, event-to-visible-update measurement, or
stale-response suppression counter, so regressions still need local snapshots and visible testing.

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

The first implementation uses a small internal external store based on `useSyncExternalStore`,
recorded in `shared-services.md`. This avoids another runtime dependency while the migration is
incremental. It currently provides typed keys, shared request/state, cancellation, request
generations, bounded invalidation, short-window eviction, and privacy-safe in-memory query metrics.
IndexedDB query persistence, entity normalization, exported telemetry, and app-shell realtime remain
future extensions. Feature hooks must
not recreate independent authoritative arrays after their query is migrated.

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

- [x] add request generations to the existing Jobs and Equipment caches;
- [x] prevent invalidated or older in-flight results from repopulating memory or IndexedDB;
- [x] coalesce concurrent silent token acquisition through the authentication coordinator;
- [x] use one continuation-page reader for the primary startup and Job/Equipment reference
  collections;
- [ ] pass cancellation signals through all caches and Dataverse services; focused Equipment Job
  history now supports cancellation as the first migrated query;
- [x] instrument request count/duration, memory-cache hits, request deduplication, outcomes, and
  estimated payload size in memory without logging business content, record IDs, or tokens;
- [ ] add stale-result-drop and event-to-visible-update metrics, then export only approved aggregate
  telemetry;
- audit the remaining feature-specific full collections and make each follow `@odata.nextLink`.

### Phase 2 — Shared Operational Data Client

- [x] publish accepted Jobs and Equipment cache commits to every mounted consumer in the same scope;
- [x] introduce the account/environment-scoped client at the authenticated app shell;
- [x] define typed query keys, shared subscriptions, request generations, cancellation, and
  unobserved-query eviction;
- [x] migrate Jobs and Equipment list ownership without changing business services; established
  generation-aware memory/IndexedDB loaders remain the data-source adapters during migration;
- [x] make successful main-list mutations update all mounted consumers; Job mutations also
  invalidate observed Equipment Job-history queries as the first bounded path;
- keep route state warm for the configured stale window; focused Equipment Job history now uses a
  30-second stale window and 60-second unobserved retention.

### Phase 3 — Progressive focused workflows

- [x] split Job core from editor relationships, Quotes/Assignments, Job Card submissions, and photo
  work; canonical Job drawers open from summary immediately and use scoped readiness/error guards;
- [x] migrate focused Job core and Job Card metadata into shared query keys with cancellation,
  mutation/realtime invalidation, and short unobserved retention;
- [x] split Job Card photo metadata from full photo bodies and load only the opened photo body;
- split Equipment core, service plans, documents, and usage evidence queries;
- [x] move Equipment Job history into a shared focused query, prefetch it when either Equipment
  drawer opens, abort superseded work, and evict it after its short unobserved cache window;
- [x] stop canonical Job edit drawers from blocking on broad reference bundles; Job creation remains
  intentionally gated on its required relationship choices.

### Phase 4 — Scoped screens

- [x] migrate Customer Dashboard Sites, Equipment, Jobs, and service plans to bounded
  customer-scoped child queries, while retaining focused full Equipment history for completion;
- [x] migrate Scheduler to date-window queries with adjacent-window prefetch and bounded mutation/
  Job-realtime reconciliation;
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
