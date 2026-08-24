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

Authenticated app shell
    -> one account-scoped SignalR connection
    -> bounded Job, Equipment, and Staff event dispatcher
    -> immediate focused-record invalidation
    -> coalesced dependent-query invalidation
    -> reconnect and visibility recovery for currently observed queries

Jobs and Equipment feature hooks
    -> browser-local bounded event subscription only where a legacy full-list adapter still needs it
    -> debounced full-table refresh for those remaining legacy lists
```

Dataverse is the source of truth. The app-shell query registry owns the accepted in-memory Jobs and
Equipment list values; feature hooks still orchestrate their established service/cache callbacks and
own supporting workflow state. IndexedDB contains
disposable Jobs or Equipment list snapshots only; it is not a write queue and must never be treated
as proof that a Dataverse write succeeded. MSAL owns its own token cache.

### Current collection behaviour

| Data | Current collection path | Local lifetime | Realtime behaviour |
| --- | --- | --- | --- |
| Jobs | All paged Jobs with several expanded relationships | App-shell query value plus 5-minute service memory and 24-hour IndexedDB snapshots | The app-shell dispatcher invalidates focused/scoped queries; a mounted legacy global list performs one debounced refresh |
| Equipment | All paged Equipment with expanded Site and Customer | App-shell query value plus 5-minute service memory and 24-hour IndexedDB snapshots | The app-shell dispatcher invalidates scoped queries; a mounted legacy global list performs one debounced refresh |
| Customers | Full direct Dataverse query | Hook instance | None |
| Sites | Full direct Dataverse query with Customer expansion | Hook instance | None |
| Site Contacts | Full direct Dataverse query with Site and Contact expansion | `useJobs` hook instance | None |
| Mechanics/Staff | The paged Staff directory is the only route gate. A lightweight paged Job allocation projection supplies open counts; the selected person's Jobs use a mechanic/status-scoped display query; qualification badges load independently and qualification types start only while editing | Account-scoped shared keys use a 20-second stale window and five-minute unobserved retention; qualification types remain fresh for five minutes | Staff events refresh the directory. Job mutations/events refresh open counts and observed focused Staff Job keys. Local Staff/qualification mutations reconcile or invalidate only their affected keys |
| Equipment Service Plans | Equipment Manager loads plans only for the visible page, or the full filtered result when Data Status sorting explicitly requires an authoritative cross-page order. An open Equipment drawer loads only the focused Equipment's plans when Maintenance is selected. Equipment Map skips plans; Equipment CSV loads complete references only after import starts | Register query: 30-second stale window and 2-minute unobserved retention. Focused drawer query: 30-second stale window and 1-minute unobserved retention | Maintenance writes invalidate focused and Equipment-register plan keys; matching Equipment events refresh the observed Equipment query family |
| Job Schedule Options | Full collection on general Jobs-hook startup; Customer Dashboard filters by its loaded Job IDs and Scheduler uses a server-filtered seven-day window | Hook instance or shared bounded screen query | Scheduler mutations invalidate bounded windows; no dedicated cross-client Schedule Option event |
| WOF register | Shared cached Equipment projection plus continuation-safe WOF Inspection history; Schedule Options are fetched only for Jobs referenced by those inspections | Account-scoped shared WOF keys: 20-second stale window and 2-minute unobserved retention; Equipment reuses the app-shell list value | WOF/Job mutations force-refresh the bounded keys; Job events refresh both WOF queries, Equipment events refresh Inspection history, and reconnect/visibility recovery reuses those dependencies |
| WOF editor support | Provider, Qualification, Customer, and Site directories load only when the WOF Inspection editor opens; WOF Job creation loads Staff, selected-Site contacts, and selected-Equipment service plans on demand; opening a linked WOF Job loads that exact Job plus office updates filtered to its ID and receives only its supplied Schedule Options | WOF route instance or existing focused query lifetime | Focused creates merge returned rows; register refresh remains independent of editor-only collections |
| Job Office Updates | Full collection on general Jobs-hook startup; Customer Dashboard and Scheduler filter by their loaded Job IDs | Hook instance or shared bounded screen query | No dedicated cross-client invalidation |
| Job editor relationships | Equipment and Customer search use bounded `$top=8` Dataverse queries; selecting a Customer, Site, or Equipment loads only its Sites, Contacts, exact Equipment record, and Service Plans | `useJobs` hook instance, merged incrementally into the open editor | No shared invalidation; requests abort when the search or relationship changes |
| Quotes used by Job editing | At most 50 Quote headers filtered to the focused Job; starts only when the Quotes tab opens | Shared focused query: 15-second stale window and 1-minute unobserved retention | Focused retry; successful create/edit is authoritative on the next focused read |
| Quote register and editor | The register follows all Quote pages through one shared account-scoped key. Opening an existing Quote outside the register fetches that exact Quote and its bounded lines. Pricing/Staff support is deferred; Job, Customer, and active Equipment selectors use abortable `$top=8` search and exact-ID hydration | Register, exact Quote, and editor support use 20-second stale windows and five-minute unobserved retention; relationship search results live only inside the open editor | Local create/update/delete reconciles the register and exact record immediately and broadcasts a resource-only Quote invalidation to same-scope tabs. Job/Equipment events and visibility/reconnect recovery refresh observed dependent projections; a dedicated Quote server event remains future work |
| Assignments used by Job editing | At most 50 Assignment rows filtered to the focused Job; starts only when the Job Card tab opens | Shared focused query: 15-second stale window and 1-minute unobserved retention | Create, send, status, and delete actions force-refresh the focused Assignment key |
| Job core | One exact Job projection started after the shell opens; it does not wait for lookups or child tables | Shared focused query: 15-second stale window and 2-minute unobserved retention | A matching Job event or mutation invalidates and refreshes the observed focused record |
| Job Card detail | Time, parts, submissions, submission children, and photo metadata load only when the Job Card tab is selected | Shared focused query: 30-second stale window and 1-minute unobserved retention | Job invalidation refreshes the observed metadata query |
| Job Card photo body | One Dataverse File body requested only when that photo is opened | Shared focused query: 5-minute stale window and 30-second unobserved retention; never IndexedDB persisted | Independent retry; closing the last observer starts eviction |

Customer Dashboard is now an intentional exception to the global Jobs and Equipment rows above.
After Customer selection it loads only that Customer's Sites, then bounded Site-filtered Equipment
and Jobs, then bounded Equipment-filtered service plans plus Job-ID-filtered Schedule Options and
Office Updates. These collections use shared
customer-dashboard query keys with 20–30-second stale windows and two-minute unobserved retention.
Its Quotes tab independently loads only Quotes directly linked to the selected Customer when that tab
opens; it no longer depends on a Job drawer's collaboration load or the complete Quote register.
They are not written to IndexedDB. Equipment completion additionally loads the focused Equipment's
complete Job history before applying hour-meter or maintenance rules, because historical Jobs may
belong to a Site outside the currently selected Customer projection.

Equipment Manager reuses the shared Equipment projection but no longer couples first render to full
Customer, Site, or Service Plan directories. Its filter choices come from each Equipment row's
expanded current Site and Customer. Maintenance summaries are keyed to the visible page and display
their own loading/failure state. Customer editing uses abortable `$top=8` search and a selected-
Customer Site read. Full Site/plan references are reserved for the explicitly opened CSV import.
Equipment Map retains its full Site directory because all addressed Sites are part of the map's
primary projection, while disabling the unrelated global plan read.

Scheduler is also a scoped exception. It loads only the visible week's Schedule Options, only
the Jobs referenced by those rows, and Office Updates filtered to those Job IDs, then prefetches the
adjacent schedule/Job windows. Window results are shared for
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
- one authenticated app-shell SignalR connection validates and dispatches bounded Job, Equipment,
  and Staff events;
- Job and Equipment events identify the changed record and operation, immediately invalidate a
  matching focused record, and coalesce dependent collection invalidation after bursts;
- successful local Job and Equipment cache invalidations publish resource-only messages to other
  tabs in the same hashed account/environment scope; receivers coalesce refreshes and do not echo;
- Quote create, update, and delete commands reconcile the shared register/exact-record keys and
  publish the same resource-only cross-tab invalidation contract without sharing Quote content;
- most successful mutations already update the active hook state or invalidate the relevant
  feature cache;
- route components are lazy loaded, which limits initial JavaScript work.

These pieces should be migrated into a shared coordinator rather than discarded.

## Problems in the current implementation

### 1. Supporting data and orchestration remain tied to hook instances

The primary Jobs and Equipment list arrays are now shared by query key above routes. Every call to
`useJobs()` or `useEquipmentManager()` still creates separate supporting reference arrays, readiness
flags and background-refresh orchestration. Realtime connection ownership is no longer duplicated.
Only the main Jobs register uses the global `useJobs()` mode. WOF, Equipment Job creation,
Chargeable Invoice Review, Customer Dashboard, and Scheduler use scoped adapters seeded with empty
or bounded supporting collections; opening a WOF Job hydrates only that exact Job and its office
updates. Customer Dashboard also instantiates Equipment Manager.

Consequences:

- navigation now retains the primary Jobs and Equipment values, but supporting reference state is
  still discarded;
- mutations to the main lists reconcile every mounted consumer, while supporting feature-local
  collections can still diverge until refreshed;
- each new hook can repeat Customers, Sites, plans, schedule, assignment, or other reference reads;
- supporting lookup refreshes can still be duplicated across feature-hook instances even though
  realtime connection ownership is now centralized.

### 2. Invalidation is too broad and can still become stale

The app-shell dispatcher now refreshes only dependent Operational Data Client query families and
coalesces event bursts. The still-mounted legacy global Jobs or Equipment list adapter performs one
debounced full-list refresh because those list projections have not yet been replaced by server-side
pages. This is acceptable at hundreds of rows but will become slower and more expensive as history
grows.

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

Equipment and Customer choices no longer require full-table reads. Search is debounced and bounded;
dependent Site, Site Contact, exact Equipment, and Equipment Service Plan reads are scoped to the
selected parent and aborted when the selection changes. Existing linked records seed the editor so
the drawer does not clear a valid relationship while a scoped refresh is in flight. Related-record
creates merge their returned/scoped records instead of refreshing whole tables. Equipment-originated
Job creation uses a scoped `useJobs()` instance seeded by the selected Equipment rather than starting
the global Jobs or Equipment lists. Job creation renders that supplied context immediately. Staff is
shared through the account-scoped directory key; exact Equipment, maintenance plans, selected-Customer
Sites, and selected-Site Contacts then hydrate independently with cancellation and local retry states.

Job Quotes and technician Assignments now use separate focused Job query keys. Neither query starts
with the drawer shell: Quotes load when the Quotes tab opens and Assignments load when the Job Card
tab opens. Concurrent consumers deduplicate the same Job request, tab-specific failures retry without
blocking Job editing, and Assignment mutations refresh only the focused Assignment key. Moving a Job
to Unconfirmed performs one bounded Assignment lookup before removing linked operational work, so
that business rule does not depend on previously opening the Job Card tab.

### 4. Some screens still fetch global data for scoped views

Customer Dashboard has migrated its selected-Customer Sites, Equipment, Jobs, and service plans to
server-filtered bounded queries. Scheduler now uses a seven-day Schedule Option query and batches
only the referenced Jobs, with adjacent-window prefetch. Job Map now uses a minimal status/location
Job projection with Site geocodes embedded in the recorded-Site expansion, so it starts neither the
global Jobs collection nor the global Sites collection. Job editor Equipment, Customer, Site,
Contact, and Service Plan lookups are now bounded. Customer Dashboard Quotes and Job-drawer Quote/
Assignment collections are also scoped to their selected Customer or Job. Equipment Manager now
derives Customer/Site filters from its Equipment projection, loads page-bounded Service Plans, and
uses bounded drawer relationship lookups; its CSV import is the explicit full-reference exception.
Customer Dashboard and Scheduler now load Schedule Options/Office Updates only for their bounded
Job sets, and scoped `useJobs()` consumers without supplied supporting data no longer fall back to
either full child table. The final `useJobs()` call-site audit found no other implicit global Jobs,
Schedule Option, or Office Update consumer: Chargeable Invoice Job creation receives an empty scoped
shell, and the WOF Job drawer loads one exact Job plus its filtered office updates. Remaining full
reads are deliberate primary registers or explicit Map/CSV workflows rather than hidden drawer
dependencies.

WOF now follows the same progressive rule. Its route startup does not load the global Jobs,
Customers, Sites, Site Contacts, Staff, Providers, Qualifications, or Equipment Service Plans
collections. The register uses the shared Equipment projection and an account-scoped WOF Inspection
query with a 20-second stale window, two-minute unobserved retention, cancellation, and complete
Dataverse continuation paging. A second shared query is bounded and keyed to the Jobs referenced by
those inspections. WOF editor directories start only when the inspection editor opens; WOF Job
creation uses bounded remote searches and parent-scoped relationship reads. Direct WOF Inspection
and Schedule Option server events or watermark/delta recovery remain future work.

The Quotes register is also migrated. It renders from one continuation-safe account-scoped query
instead of route-local state and does not wait for editor references. The lazy cross-screen overlay
loads an exact Quote by ID plus that Quote's bounded lines. Pricing and Staff start only when an
editor is requested, but are independent shared queries rather than one bundled support request.
The Pricing screen and Quote editors share the catalogue key, Quotes reuse the shared Staff directory,
and a Staff failure blocks only PO-email routing with a local retry. Job, Customer, and active
Equipment choices now use debounced `$top=8` searches, while saved selections and Job-originated
creates hydrate only their exact linked records. Superseded relationship requests are aborted.

Some smaller collection services do not follow `@odata.nextLink`, unlike Jobs and Equipment. Those
services can silently become incomplete when the Dataverse page limit is exceeded.

### 5. Multi-user synchronization is incomplete

Jobs, Equipment, and Staff now share one app-shell SignalR connection and bounded dispatcher, but
Customers, Sites, Contacts, Service Plans, Schedule Options, Office Updates, Quotes, and Assignments
do not have approved server events. Reconnect and visibility recovery invalidate only currently
observed Job/Equipment-dependent queries and cause active Staff consumers to re-read. Events contain
no replay cursor, and there is no delta reconciliation for changes committed while a client was
asleep or offline; the bounded authoritative re-read is the safe interim recovery path.

Successful local Job, Equipment, and Quote mutations notify other open tabs through an account/environment-
scoped `BroadcastChannel`. Messages contain only a bounded resource label and sender nonce; they do
not contain record IDs, business content, tokens, or queued writes. A receiving tab invalidates its
disposable list snapshot and only dependent observed queries, and does not rebroadcast. Other entity
families still depend on their existing focused mutation reconciliation and visibility recovery
until separately approved server events or change tracking exist.

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
generations, bounded invalidation, short-window eviction, privacy-safe in-memory query metrics, and
resource-only cross-tab invalidation for successful local Job/Equipment mutations. IndexedDB query
persistence, entity normalization, and exported telemetry remain future extensions. App-shell
realtime dispatch is implemented for the currently published Job, Equipment, and Staff events.
Feature hooks must
not recreate independent authoritative arrays after their query is migrated.

In development builds, the app shell also exposes a **Data diagnostics** panel in the Sidebar
footer. It subscribes to the same account/environment-scoped client and reports normalized query
family counts, cache hits, concurrent-request deduplication, outcomes, mean request duration,
estimated payload size, and route-mount-to-useful-content timing for Jobs, Customer Dashboard,
Equipment, Scheduling, and WOF. Route timing begins outside the lazy route `Suspense` boundary and
ends when that screen's authoritative primary loading state settles, so it includes lazy chunk and
primary-data wait without treating optional drawer/tab support as first content. The panel is not
shown in production and its copyable JSON contains no query-key record IDs, account scope, business
values, tokens, or response bodies.

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
8. Treat the selected Equipment summary as the drawer's core projection. Load Service Plans only
   when Maintenance is selected, and reuse focused Job history as both usage evidence and History-tab
   data. The drawer currently has no Equipment-document collection; document/photo features remain
   separate workflows until an Equipment-owned metadata contract is introduced.

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
- [x] split Job Quotes and Assignments into independent, bounded focused queries that start only
  when their drawer tab needs them and refresh Assignments after focused mutations;
- [x] keep the complete editable Equipment summary as immediately rendered core, move Service Plans
  to a tab-triggered focused query, and reuse focused Job history for usage evidence and History;
- [ ] define and split an Equipment-document metadata/body query when Equipment-owned documents are
  added to the canonical drawer;
- [x] move Equipment Job history into a shared focused query, prefetch it when either Equipment
  drawer opens, abort superseded work, and evict it after its short unobserved cache window;
- [x] stop canonical Job edit and create drawers from blocking on broad reference bundles; Job create
  renders supplied defaults immediately and progressively hydrates shared Staff plus bounded dependent
  relationships with independent retry boundaries.

### Phase 4 — Scoped screens

- [x] migrate Customer Dashboard Sites, Equipment, Jobs, and service plans to bounded
  customer-scoped child queries, while retaining focused full Equipment history for completion;
- [x] migrate Scheduler to date-window queries with adjacent-window prefetch and bounded mutation/
  Job-realtime reconciliation;
- [x] remove implicit full Schedule Option and Office Update reads from scoped `useJobs()` consumers;
  Customer Dashboard and Scheduler now supply Job-ID-filtered supporting collections;
- [x] migrate Job Map to status/location summaries with status-keyed caching, current-query
  Job-realtime reconciliation, and no global Site read;
- [x] migrate Job editor Equipment and Customer selectors to bounded remote search, and Site,
  Contact, exact Equipment, and Service Plan dependencies to parent-scoped queries;
- [x] decouple Equipment Manager startup from complete Customer, Site, and Service Plan collections;
  derive register filters from expanded Equipment, query page-bounded plans, and use bounded drawer
  relationships while retaining explicit Map and CSV exceptions;
- [x] decouple Staff startup from the complete Jobs and qualification-type collections; use a
  lightweight open-allocation summary, selected-person Job projections, independent qualification
  state, and edit-triggered qualification types;
- [x] remove WOF startup reads of global Jobs and editor-only reference collections; move paged,
  abortable Inspection history and referenced-Job Schedule Options into bounded shared keys, and
  defer WOF editor/Job-create relationships until opened;
- [x] migrate Job Book Staff to the shared directory, Customer selection to bounded abortable search,
  and Site selection to the chosen Customer while retaining its explicit lightweight Equipment index;
- [x] complete the remaining administrative-selector audit. Quote Pricing, Quote Staff support,
  Job Book relationships, Chargeable Invoice Job creation, and linked WOF Job editing are scoped;
  the only global `useJobs()` consumer is the main Jobs register, and explicit Map/CSV full-reference
  workflows remain documented exceptions.

### Phase 5 — Multi-user synchronization

- [x] move the Job, Equipment, and Staff realtime connection and dispatcher to the app shell;
- [x] immediately invalidate matching focused records and coalesce dependent observed query keys;
- [x] add bounded Jobs/Equipment/Staff reconciliation on reconnect and visibility return as the
  interim gap-recovery path;
- add Jobs and Equipment watermark/delta recovery after separately approved server support;
- [x] add account/environment-scoped cross-tab invalidation for successful local Job and Equipment
  mutations without broadcasting business content or creating an offline write queue;
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

### Signed-in local baseline workflow

1. Open a development build while signed in and select **Data diagnostics** in the Sidebar footer.
2. Select **Reset sample** so earlier navigation does not contaminate the comparison.
3. Visit Jobs, Customer Dashboard (with a representative saved Customer), Equipment, Scheduling,
   and WOF once; wait for each screen's primary useful content or its scoped error state.
4. Repeat the route sequence to capture warm-cache behaviour. Cache and deduplication counts should
   rise without equivalent network requests.
5. Copy the privacy-safe JSON report and record cold/warm median and P95 values outside the product
   only in an approved engineering artefact. Do not add business screenshots or identifiers.
6. Optimize the slowest query family, then repeat with equivalent Dataverse volume and network.

The local report is diagnostic evidence, not production telemetry. Exported monitoring,
event-to-visible latency and stale-result suppression metrics remain separately designed work.

### 20 August 2026 signed-in baseline and first optimization

The first representative development sample recorded Customer Dashboard useful content at
approximately 465 ms, Scheduling at 287 ms, and Equipment at 2,435 ms. It contained no failed or
aborted requests. Customer Dashboard's Job child reads made one network request each, but unstable
Schedule Option and Office Update key arrays caused six to eight redundant cache lookups and up to
four concurrent-request joins during re-rendering. Those keys are now memoized from the selected
Customer and sorted Job fingerprint, so unchanged renders do not re-enter the client.

The same sample could not attribute Equipment's delay because the full Equipment register still
reported only through its legacy cache while diagnostics saw only the visible-page Service Plan
query. The register's initial, explicit-refresh, and realtime-recovery reads now enter through the
versioned `equipment:operational-list` client key while preserving the existing account-scoped
memory cache, IndexedDB stale-while-revalidate snapshot, and Dataverse network refresh. This gives
Equipment Manager and Equipment Map one in-flight request and accepted app-shell value and makes
the next signed-in sample distinguish full-register latency from visible Service Plan latency.

The next comparison should reset diagnostics, revisit Customer Dashboard and Equipment with the
same data volume, and confirm both that the two Customer child families make one request without
render-driven cache/deduplication churn and that `equipment:operational-list` explains the remaining
Equipment useful-content time. Warm-cache Equipment remains targeted at under 300 ms; cold-network
timing will determine whether the next step is app-shell idle prefetch or a narrower server-backed
register projection.

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
- `src/alpha/shared/realtime/OperationalRealtimeProvider.tsx`
- `src/alpha/shared/realtime/operationalRealtime.ts`
- `src/alpha/shared/realtime/operationalRealtimeEvents.ts`
- `src/alpha/shared/realtime/operationalRealtimeInvalidation.ts`
- `src/alpha/shared/data/OperationalDataClient.ts`
- `src/alpha/shared/data/OperationalDataDiagnostics.tsx`
- `src/alpha/shared/data/OperationalScreenPerformance.tsx`
- `src/alpha/customers/CustomerDashboardScreen.tsx`
- `src/alpha/scheduling/SchedulingScreen.tsx`
- [`shared-services.md`](shared-services.md)
- [`dataverse.md`](dataverse.md)
- [`authentication.md`](authentication.md)
