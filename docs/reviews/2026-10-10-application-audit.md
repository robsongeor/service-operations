# Application audit — 10 October 2026

## Verdict and scope

The application has a substantial working implementation, reusable UI/data foundations and
extensive automated checks. **It is not yet signed off for broad restricted-role rollout.**
The largest risks are disagreement between client permissions and the server guard, duplicated
Job status rules, and incomplete synchronization of the unified coordination worklist.

This is a source/offline audit of `v2-deployment` at `f73f3d6`, begun on 9 October and completed
on 10 October. It covers the documentation inventory and all major source families: office
routes, Jobs/Job Book, Customers, Equipment, maintenance, WOF, Site Checks, scheduling, Quotes,
invoices, public portals, managed APIs, realtime, Dataverse plugins and deployment scripts.
It is not a claim that every code path was executed, a penetration test, or a fresh cloud audit.
No production settings, records, permissions, application code or feature flags were changed.

Evidence must be kept separate:

- **Source:** what this checkout implements and what its workflows build.
- **Recorded deployment:** dated observations already in the repository; not reverified here.
- **Release proof:** named-user, service-identity and browser tests against the deployed artifact.
  These remain outstanding where specified below.

## Validation baseline

| Check | Result | Meaning |
| --- | --- | --- |
| Production build | Pass | TypeScript/Vite compilation; not authorization or end-to-end proof |
| Complete Node test-file run | 835 pass, 3 fail, 838 total | Includes files beyond where the normal chained `npm test` stops |
| Restricted-access C# harness | 64 pass | Offline policy tests; some expectations conflict with the intended UI policy |
| Registration C# harness | 47 pass | Offline registration behavior, not live pipeline verification |
| ESLint | 6 errors | Four effect-driven state updates and two unused parameters |
| Live role / browser / scheduler smoke | Not run | Required before rollout approval |

Commands: `npm test`; `node --experimental-strip-types --test tests/*.test.ts tests/*.test.mjs tests/*.test.cjs`;
`npm run lint`; `npm run build`; `scripts/test-restricted-access-plugin.ps1`;
`scripts/test-job-registration-plugin.ps1`. This audit used local Node 25.9.0; deployment uses
Node 20, so reproduce the checks on the deployment runtime before release.

All three Node failures are in `tests/unifiedJobWorkflow.test.ts`: the expected readiness label,
assembly version and role-roster counts no longer match the manifests (1.0.1.0 and 3 Office /
5 Job Book administrators). Do not blindly regenerate expectations: the readiness manifest
still says registration is flag-off while the V2 workflow builds it enabled. Reconcile the
contract, configuration and evidence together.

Lint owners: `EquipmentTransferDrawer.tsx`, `EquipmentScreen.tsx`, two occurrences in
`MaintenanceBookingScreen.tsx`, and two unused `_options` parameters in `siteChecksApi.ts`.

The main build chunk is approximately 543 kB uncompressed / 154 kB gzip. Route splitting already
exists; further work should be measured rather than another blanket lazy-loading rewrite.
Of 79 root test source files, 35 use `readFileSync`; many assertions inspect source structure.
Those checks help protect contracts but are not substitutes for rendered interaction or live security tests.

## Rollout blockers and important findings

### A01 — Client permissions and server allowlists disagree

**Confirmed source mismatch; restricted-role rollout blocker.** The client allows all admitted
Job Book roles to select a mechanic and allows Office / Job Book admins to edit basic Equipment
details. The restricted plugin does not allow `gr_mechanic` or supplier changes in normal Job
updates. Its Equipment allowlist omits the compliance fields that `equipmentDetailsApi` includes
in every save, even when only fleet/serial details changed. Thus an apparently ordinary details
edit can fail against the guard. Passing policy tests currently include rejecting mechanic changes.

Office dispatch also attempts a separate status PATCH after confirmed email delivery; the
normal restricted Job allowlist rejects status. A successfully sent email and failed allocation
update are therefore a distinct failure case to test, not a reason to resend automatically.

Owners: [client capabilities](../../src/auth/applicationAccess.ts),
[Job corrections](../../src/alpha/jobs/services/jobCorrectionsApi.ts),
[Equipment writes](../../src/alpha/equipment/services/equipmentDetailsApi.ts),
[server policy](../../dataverse/access/RestrictedAccessPlugin.cs),
[policy tests](../../tests/dataverse/RestrictedAccessTests.cs).

Resolve intended field/operation permissions first, then align client payloads, role-policy
manifests and server-owned operations. **Do not disable the guard or grant broad roles as a fix.**
Verify allowed edits AND rejected unrelated fields, direct API requests, changed relationships,
mixed-role users and ETag conflicts using real restricted accounts.

### A02 — Registration allocates before dispatch

**Confirmed behavioral defect.** `JobRegistrationPlugin` creates Allocated status when a mechanic
or supplier is selected. The restricted guard's registration-child check repeats that rule.
The agreed workflow is Unallocated until dispatch is confirmed; selecting a person is not delivery.
The email workflow separately transitions after successful delivery, producing two competing owners.

Owners: [registration](../../dataverse/job-registration/JobRegistrationPlugin.cs),
[guard](../../dataverse/access/RestrictedAccessPlugin.cs),
[dispatch workflow](../../src/alpha/jobs/services/primaryJobEmailWorkflow.ts).

Change the registration rule, guard validation, contracts and regression tests together. Include
failed delivery, retried delivery, supplier jobs and existing historical statuses. Historical
correction needs an evidence-based migration, not a blanket reset of all Allocated records.

### A03 — GreenTree closure bypasses operational completion

**Confirmed semantic/data-consistency gap.** The GreenTree reconciler patches Complete and a
completion date when supplied; it does not run the Service/WOF/Site Check completion workflows.
It does not update equipment hours, maintenance plans, WOF inspections or Site Check occurrences.
Its projection also does not explicitly exclude voided registrations. A closed job with no
completion date can be absent from the default recent-complete slice, although explicit archive
loading can retrieve it. A later GreenTree reopen does not currently reverse completion.

Owner: [GreenTree reconciliation](../../api/services/greenTreeJobReconciliation.js).

**Owner decision, 10 October:** when required operational completion evidence is missing, retain
Completion Review, not Complete. This decision is documented, **not implemented**. Define evidence
by Job type (including non-service and equipment-unknown jobs), run the canonical completion
transition when satisfied, preserve a separate GreenTree closed fact, and test idempotent retries.
Do not infer physical-work outcomes from technician free text or overwrite operational Customer/Site
data from GreenTree. Reopening and exceptional historical cases still need an explicit transition policy.

**Owner guidance requested:** if GreenTree reopens a previously completed job, move it to
Completion Review or retain Complete with a discrepancy flag? Pending response; do not silently
choose a transition during implementation.

### A04 — Background reconciliation is not yet proven end-to-end

The schedule is server-side, but Job Book also calls reconciliation with the signed-in user's
delegated token. Scheduled runs use a dedicated application identity. Both must satisfy the
new guard's role resolution; server execution alone does not grant authority. The configured
application user's effective role mapping was not verified in this audit.

The handler performs Job Card status reconciliation before obtaining the GreenTree checkpoint
lease. A response can be HTTP 200 while reporting failed records, whereas the scheduled workflow
checks HTTP success. A green workflow is therefore **not** proof that all jobs updated. ETag-conflicted
records can be skipped while the checkpoint advances; durable retries are needed. The 120-second
lease has no renewal, so long runs need overlap tests. Without the persistent checkpoint store,
the bounded lookback fallback is not a durable historical backfill.

V2 proxies interactive Job Card requests to V1, but reconciliation reads its locally configured
Job Card store. Verify both use the same authoritative dataset; source alone cannot prove it.

Owners: [handler](../../api/greentreejobchanges/index.js),
[status automation](../../api/services/jobOperationalStatusAutomation.js),
[application token](../../api/services/dataverseApplicationToken.js).

Before rollout, prove scheduled service authorization, shared storage identity, failure-count
alerting, checkpoint persistence and replay after partial failure. Avoid running equivalent
queries twice merely because two screens use the result.

### A05 — Job Card enumeration can miss work or starve older jobs

Status automation takes the first bounded pending-card set, reduces it to at most 100 Job IDs,
and has no continuation cursor. Cards can stay pending review after a job's status moves, so
the same front-of-queue jobs can occupy later runs. It groups existing Azure cards by assignment;
it does **not** enumerate every current Dataverse assignment. A second technician without a
generated link is not necessarily represented in the completion-review decision.

Storage helpers retrieve bounded subsets then sort in memory; that does not guarantee the newest
records globally or an efficient Azure Table scan. The office queue also has a 500-record bound.
Existing over-limit detection is useful, but a recovery/paging process is still required.

Owners: [automation](../../api/services/jobOperationalStatusAutomation.js),
[storage](../../api/services/jobCardStorage.js).

Use an indexed work queue / continuation cursor with retry state and an explicit required-assignment
set. Test more than 100 jobs, more than 500 cards, never-submitted links, withdrawn/superseded links,
multiple technicians and new cards arriving during a run.

### A06 — Unified Service Coordination can stay stale

The shared data client has account/environment scoping, invalidation and synchronization support.
However, the unified Job worklist owns separate React state. Its `useJobs` consumer disables
global operational loading, which also bypasses that hook's realtime subscription; the unified
worklist has no equivalent subscription. Invalidating the shared cache does not itself reload it.
Additionally the V2 build currently leaves the realtime API URL empty.

Owners: [unified worklist](../../src/alpha/jobs/hooks/useUnifiedJobWorklist.ts),
[Jobs hook](../../src/alpha/jobs/hooks/useJobs.ts), [Jobs screen](../../src/alpha/jobs/JobsScreen.tsx).

Connect scoped worklist queries to shared invalidation before claiming realtime is restored.
Test two independent browsers, hidden-tab resume, reconnect, registration, dispatch, completion
and server-side reconciliation. Re-enabling SignalR alone is insufficient.

### A07 — Customer Info editing has nonpersistent fields

Customer draft name/accounts/contact/notes/operating-hours changes are held in browser state;
the save path persists certain Site changes, not the full draft. A prototype Customer-create
branch also remains, distinct from the real shared inline Customer creation path. Multi-Site
save operations are not one atomic transaction.

Owner: [Customer Dashboard](../../src/alpha/customers/CustomerDashboardScreen.tsx).

**Owner decision, 10 October:** hide unfinished editing until proper persistence exists.
This has **not been implemented** by this documentation audit. Hide the incomplete Info/draft
entry points specifically; do not remove working inline Customer/Site creation, Site settings
or Equipment transfer. Test that no remaining action implies unsaved draft fields were persisted.

### A08 — Quote save can leave partial or conflicting data

Quote creation saves the header then child lines, with best-effort rollback. Updates delete,
create and patch lines separately before the header and do not consistently use concurrency
protection. A failure or competing editor can leave partial state. Atomic Quote deletion already
exists and should not be confused with atomic save.

Owner: [Quotes API](../../src/alpha/quotes/services/quotesApi.ts).
Adopt an ETag-protected changeset/workflow for the complete save and test injected failures,
parallel editors and retry after uncertain responses.

### A09 — Authentication recovery needs account-switch tests

Silent token requests are account-scoped, but the shared pending interactive-recovery promise
is not explicitly bound to that account or cancelled on logout. Validate the popup result against
the initiating account before resuming a mutation. This is a source-level risk, not a demonstrated
cross-account incident. Root and lightweight MSAL callback bridges are present; their presence
does not prove the reported blank-popup problem is resolved for all deployed redirect settings.

Owner: [Dataverse authentication](../../src/auth/dataverseAuthentication.ts).
Test expiration, blocked popups, cancellation, logout, two accounts/tabs, callback failure and retry.

### A10 — Anonymous map-tile proxy has a quota-exhaustion surface

Tiles now use the server Geoapify proxy, not direct public OSM tiles. The proxy protects the key
and constrains coordinates, but accepts anonymous tile requests without the authenticated
geocoding endpoint's caller checks/rate limits. Cache headers alone do not bound provider usage.
Add an appropriate edge/caller budget, cache strategy and usage alerting without exposing the key.

Owner: [tile service](../../api/services/mapTileService.js).

### A11 — Release controls lag the implementation

Frontend workflows compile but do not run the complete test/lint/security-policy gate. Deployment
manifests and test fixtures disagree with current build flags. Plugin/schema/role provisioning is
multi-step, not an atomic deployment. Before further activation, require artifact identity,
preflight-before-mutation, signing-key recovery, captured prior configuration and a rehearsed rollback.
Do not treat structural plugin registration verification as named-user authorization proof.

Owners: [.github/workflows](../../.github/workflows/),
[deployment script](../../scripts/manage-unified-job-workflow-deployment.ps1),
[release gates](../../RELEASE_READINESS.md).

### A12 — Equipment CSV gate and multi-step row updates need hardening

The administrator-only CSV restriction is an email predicate in browser code. The save hook
checks it again, but still performs ordinary delegated Equipment/service-plan writes; this is
not an independent server-side authorization boundary for the import operation. Existing
Dataverse privileges/guards still apply, so this is not a claim that unauthenticated writes work.

Within one row, Equipment can save before maintenance-plan synchronization fails. The row is
reported failed, but that does not guarantee no changes occurred. Per-row retry is useful only
with explicit partial-write/reload behavior; a whole-file atomic transaction is not necessarily required.

Owners: [CSV predicate](../../src/alpha/equipment/utils/equipmentCsv.ts),
[save orchestration](../../src/alpha/equipment/hooks/useEquipmentManager.ts).
Decide whether administrator-only import is a security requirement or a UI convenience, enforce
the former server-side, and test interruption between Equipment and plan writes.

## Feature readiness

| Area | What exists | Remaining work / restriction |
| --- | --- | --- |
| Unified Jobs / Job Book | Shared Job registration, correction/operational drawers, number ledger, server guard source | A01–A06; invariant guards recorded disabled for shared V1 compatibility; verify live before cutover |
| Customer / Equipment | Shared selectors, bounded Customer search, Equipment transfer, separate GT Site account display | A01, A07; Equipment full projection still loads broadly; no GreenTree master-data overwrite |
| Azure Job Cards / Office review | Snapshot links, private evidence, review lifecycle, ETags, allowlist | A04–A05; V1 bridge is a live dependency; named-role smoke outstanding |
| External supplier | Selector/details, serialization and plugin contract implemented | V2 workflow does not enable flag; existing restricted updates conflict with guard; do not call it live-ready |
| Service / maintenance / WOF | Canonical operational completion and history paths | GreenTree bypass A03; completion/hour-meter flag smoke still required |
| Site Checks | Office workspace, checklist admin, assignment portal and submission code | Historical phase plans are not current activation proof; checklist/content, role and portal release gates remain |
| Chargeable invoices | Review workspace, staged import, private Files, approval/email-draft flows | Server switches and dedicated-role verification; release/rollback smoke remains, not general office access |
| Quotes / pricing | Authoring and review | A08; never equate prepared mail draft with delivery |
| Maps | Shared geocoding, proxy tiles, recorded-Site grouping | A10; provider/configuration/network smoke |
| Realtime / scheduler | Shared invalidation and Azure/GitHub background infrastructure | A04/A06; V2 realtime URL absent; verify service identity and actual outcomes |
| Regional books | Separate staging/schema/migration paths retained | V2 regional flags false; no implication that migration/cutover is complete |

## Refactor and efficiency priorities

| Priority | Area / evidence | Recommended boundary and acceptance checks |
| --- | --- | --- |
| 1 | Status rules duplicated across C#, Node reconciliation and TS UI | One documented transition contract, shared test vectors, server-owned mutation paths. Check all callers before replacement; do not force C# and Node to share runtime code |
| 1 | Unified worklist bypasses data registry; eagerly follows bounded page loops | Shared scoped query keys, cancellation and incremental paging; prove loaded-vs-total counts and cross-browser freshness |
| 1 | Azure Table list/filter/sort and 100/500-item caps | Query-aligned index/work queue and resumable cursor; measure scanned rows and oldest pending age, not only returned count |
| 2 | `useJobs`, CustomerDashboard, EquipmentDrawer, JobBookScreen each exceed 1,000 nonblank lines | Extract domain transitions and request orchestration, then section-level UI. Keep canonical drawers; avoid another drawer variant |
| 2 | Searchable customer/site controls use `SearchableSelect`; mechanic/equipment/address controls still custom | Extend shared keyboard/focus/portal contracts, then migrate compatible selectors. Preserve supplier/unknown-equipment actions, async results and drawer focus traps |
| 2 | Shared select active item lacks robust async-shrink/scroll-to-active handling | Interaction tests for Arrow keys, Enter, Escape, empty results, delayed results, disabled items and action rows |
| 2 | Equipment filter duplicates customer-search coordination | Reuse the bounded search hook; abort/ignore stale responses. Current Customer search is remote/minimum-length/limited, not a whole-customer dropdown fetch |
| 2 | Equipment initial projection + client filtering/sorting | Measure load/heap first, then indexed/server filtering or incremental projections without losing alias search and totals |
| 2 | Non-atomic Quote saves, Equipment CSV row steps and multi-Site draft writes | Reuse existing changeset/ETag patterns where all-or-nothing is required; explicit per-item outcomes where partial success is intentional |
| 2 | Repeated bearer/WhoAmI/error handling across APIs | Small shared authenticated-request boundary; keep public snapshot, reviewer allowlist, invoice role and app-identity policies separate |
| 3 | Repeated route lists, flags, policy manifests and textual tests | A reviewed capability/route matrix and build-time contract checks; preserve independent server enforcement |
| 3 | Historical roadmap text, dead UI modules and CSS ownership leaks | Follow the [retirement runbook](../architecture/retirement-plan.md), not filename-based deletion |
| 3 | Large PDF/initial bundles | Profile slow-device startup and deliberate PDF interactions. Route lazy loading already exists; avoid unsafe bundle splitting without auth-callback tests |

Do not create a universal form/table abstraction just to reduce line count. Prefer shared
selection behavior, field sections, query ownership, transactional services and small reusable
actions. Retain feature-specific validation and security boundaries.

## Recommended sequence

1. Align restricted operations and registration semantics (A01/A02), then prove allowed/denied writes.
2. Implement the agreed Completion Review evidence gate and hide unfinished Customer Info editing.
3. Repair reconciliation authorization, outcomes, cursors/retries and unified worklist freshness.
4. Put clean tests/lint and policy checks into CI; run named-user, two-browser and service-identity smoke.
5. Address Quote/CSV write integrity, auth-recovery account binding and map-proxy limits.
6. Retire proven dead modules in small independent changes; defer data/backend retirement until its gates pass.

There is **no unconditional safe-removal certification** in this audit. The runbook distinguishes
unused-source candidates from active compatibility/data dependencies and lists the proof required
before removal. Older release notes remain historical evidence, not current readiness assertions.
