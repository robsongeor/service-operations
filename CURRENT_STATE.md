# Current application state

Reviewed 20 October 2026 against branch `v2-deployment`, after the Auckland production cutover.
This page is a current summary, not a release history or blanket live-cloud certification.

## V2 release scope — 11 October 2026

Owner requested commit/push and V2 deployment. This release includes the review popout, official
Job Card PDF/photo ZIP, compact office workflow, clipboard fix, shared-search/state fixes and
documentation audit. V1 and Dataverse are not deployed by the V2 workflow.

V2 keeps the existing V1 Job Card bridge. Recovery controls (office corrections, Resume entry,
technician-return checks) require `officeRecoveryAvailable: true` from the authoritative backend.
Meter-date entry requires `meterRecordedDateAvailable: true`; an old backend must not silently
discard a displayed field. Without these capabilities, established filing/follow-up and downloads
remain available. Meter approval and cursor flags are explicitly false in the V2 build.
Server-only recovery, GT reconciliation changes and the new meter guard are committed but are
not made live on the authoritative shared service by a V2-only push. Broader release gates remain.

## Release position

**Auckland is cut over to V2 for a controlled Job Book Admin and Office Admin acceptance test.**
The production assembly, role grants and number guards are live and verified. Broad staff rollout
still waits for the two named-role tests below; a successful deployment is not authorization proof.

Read the [application audit](docs/reviews/2026-10-10-application-audit.md) for evidence,
feature readiness, refactor opportunities and test results.
[Release readiness](RELEASE_READINESS.md) is the acceptance checklist;
[TODO](TODO.md) is the prioritised backlog.

## Active follow-up

The [Job Card implementation report](docs/reviews/2026-10-10-job-card-implementation.md) records
local office-approved meter syncing, corrections/Resume, expired-return visibility, authoritative
technician-return checks and retry/paging recovery. New meter and cursor features remain gated off;
no schema, permission or deployment changes occurred. Real-account acceptance, queue indexes and
automation monitoring remain outstanding. **The personal-account technician app is parked at the
owner's request**; existing emailed links and the limited pilot remain.

The original 10 October test/lint and `1.0.1.0` deployment snapshot is superseded by the Auckland
cutover evidence below. Meter approval and continuation remain independently gated; deploying the
unified workflow does not activate those features. See the
[meter-writer rollout checklist](docs/job-card-meter-writer-rollout.md).

## Source and configuration

- Office UI: React/TypeScript, MSAL delegated Dataverse access, lazy feature routes.
- V2 workflow builds application-role enforcement and unified Job registration/workflow enabled.
  Separate regional-book/allocation flags are false.
- V2 Job Card requests bridge to V1 using `VITE_JOB_CARD_SHARED_BACKEND=v1-production`.
  V1 storage, endpoints and existing technician links remain dependencies.
- V2 realtime API URL is empty in its workflow. The unified worklist also needs its own
  shared invalidation integration; enabling the URL alone does not fix freshness.
- External supplier and hour-meter classification switches are not enabled by the V2 workflow.
  Source/schema presence does not mean those workflows are ready for activation.
- Customer/Site operational relationships remain separate from GreenTree account references.
  GreenTree account data must not replace operational Customer, Site or Equipment relationships.
- Customer and Equipment filters use shared/bounded searchable selection. The Equipment
  full projection still loads broadly; bounded dropdown results do not prove bounded page loading.

See [deployment](docs/architecture/deployment.md), [routing](docs/architecture/routing.md),
[security](docs/architecture/security.md) and [data loading](docs/architecture/data-loading-and-synchronization.md).

## Auckland production cutover — 20 October 2026

- George confirmed the Auckland spreadsheet allocator was frozen and explicitly approved deployment.
- The final pre-cutover audit found 1,316 numbered Jobs, Auckland maximum `147474`, active Job and
  Auckland-ledger uniqueness keys, and `147475` available as the next permanent number.
- Signed assembly `ServiceOperations.UnifiedJobWorkflow` `1.0.19.0` was deployed with public-key token
  `0edea2881bb8578c` and SHA-256
  `1033a8c660c29e7dcba59cb0e42517447cee6846852eb0f7cc244b02f3852a04`.
- The reviewed Office Admin role drift was reconciled. Production verification preserved two Office
  Admin and seven Job Book Admin direct assignments and the approved TimeCloud/GreenTree writer
  extensions in the shared restricted-access configuration.
- All 14 restricted-access guards and all 15 number-invariant guards are enabled. An independent
  all-scope verification passed with 29 enabled workflow steps.
- The post-cutover number audit still reported maximum `147474`; deployment did not create a Job or
  consume `147475`.

The remaining release action is controlled live acceptance with George's Job Book Admin and Office
Admin test accounts. The first successful Auckland creation consumes `147475` permanently; use a real
or deliberately retained/voided acceptance Job, never delete or reseed it. A protected off-PC signing-
key recovery copy and proof build also remain operational recovery work before unattended broad use.

## Current blockers

| Finding | Required action |
| --- | --- |
| A01: restricted save/dispatch policy mismatch | Align mechanic/supplier and Equipment payloads with reviewed server operations; prove allowed and denied writes |
| A02: mechanic selection allocated at registration | Resolved in deployed 1.0.19; confirm Staging behavior with the restricted test accounts |
| A03: GreenTree closure bypasses operational completion | Preserve Completion Review until required operational evidence is present |
| A04/A05: reconciliation permissions, partial failures and bounded-queue starvation | Prove scheduled identity/store, observe per-record outcomes, add continuation/retry handling |
| A06: unified coordination worklist can stay stale | Connect scoped worklist to invalidation and test independent browsers |
| A07: unfinished Customer Info editing | Hide nonpersistent editing; keep working Site settings/inline creation/Equipment transfer |
| Manifest/CI evidence | Local tests/lint repaired; reconcile manifest/client flags and enforce CI checks before rollout |

Finding IDs refer to the [audit](docs/reviews/2026-10-10-application-audit.md).

## Owner decisions recorded on 10 October

1. A GreenTree-closed Job without required completion hours/WOF or equivalent evidence stays
   in **Completion Review**. The local GT reconciliation safeguard now does this, without advancing
   service/WOF history. Deployment and historical-state reconciliation remain outstanding.
2. Hide unfinished Customer Info editing until proper persistence exists. Current code still
   exposes local draft fields; implementation is outstanding.

These are product decisions. The original documentation audit did not implement them; the later
Job Card work implements the local GT safeguard only. New hour-meter evidence requires office
approval, corrections are recorded by office staff, and the personal-account technician app is parked.

## Owner decisions recorded on 19 October

1. Service Coordination will present the existing Unallocated and Allocated lifecycle values as
   **Staging** and **With Technician**. Assignment alone remains a planning fact; confirmed Job Card
   dispatch is the lifecycle transition. Office attention/follow-up, not an inaccurate status, keeps
   Jobs on the coordinator's working list. The existing numeric Choice values remain stable, but the
   matching global Dataverse labels and historical rows need a controlled metadata/migration release;
   see the [Job Status lifecycle migration plan](docs/job-status-lifecycle-migration.md).
2. Service and WOF completion evidence will eventually move into type-specific technician Job Cards.
   The current manual completion dialogs remain until those cards and an atomic processor replace
   them safely. Automatic Completion Review → Complete processing is on hold and GreenTree closure
   must not bypass required evidence or Service/WOF side effects. The target contract and retirement
   gates are documented in
   [Jobs architecture](docs/architecture/jobs.md#deferred-type-specific-job-card-completion).
3. Service Coordination needs a shared Branch work queue plus a private user watchlist. Auckland's
   two coordinators share Auckland Jobs but may watch different Jobs; Christchurch defaults to its
   own Jobs. This requires an authoritative operating branch on Job and System User plus a separate
   user-owned Job Watch record. Shared Office Attention is not a personal watch. Whether branch
   filtering is also a Dataverse security boundary remains a release decision; see
   [Job Branch Scope and Personal Watchlist](docs/job-branch-and-personal-watchlist.md).
4. Unconfirmed is no longer a distinct lifecycle state or tab; it is the same operational meaning
   as Staging. Source now hides the option and compatibility-maps historical `122830005` rows and
   saved preferences to Staging without hiding or disabling them. Phase 3 now includes a read-only,
   offline-testable Inspect/Plan tool for the deterministic `122830005` → `122830001` retirement.
   Live inspection found 25 legacy rows, all with row versions, and produced a deterministic
   zero-exception Plan. It has not been applied. The option must remain until an approved Apply and
   zero-reference verification complete.

The ordered source, schema, migration, deployment, acceptance and rollback work for these decisions
is now tracked in the
[Service Coordination workflow implementation plan](docs/features/SERVICE_COORDINATION_WORKFLOW_IMPLEMENTATION_PLAN.md).
Phases 0–7 are complete in source. Phase 3 metadata was provisioned and post-verified: the shared
Branch Choice, nullable Job/System User fields and user-owned Job Watch table exist, its alternate
key is Active, and the Service Operations role has user-depth watch CRUD/Append privileges without
Assign/Share. Registration and ordinary WOF creation stay in Staging regardless of assignment;
confirmed delivery owns the transition to With Technician, with a status-only retry after delivery
failures.

The branch/watch API, authoritative bounded Job Card progress summary, branch-scoped queue,
private watchlist UI and Job Book branch stamping are deployed in V2. Evidence-based status and
branch migration has deterministic hashed Plans, checkpointed ETag
Apply/Verify and conditional rollback with simulation coverage. On 20 October 2026 the approved
Auckland historical migration was applied and verified for 1,320 Jobs. Forty-one unclassified Jobs
were exported to CSV for later review and intentionally left unchanged. The Auckland registration
backend and number guards were deployed at cutover; named restricted-user acceptance remains.

Andy Lee's verified home/default branch is Christchurch. Bruce Frost, George Robson and Pubudu use
Auckland. Home branch controls the initial worklist and new-Job default, while every participating
user may switch to All branches. This is operational filtering, not Dataverse row-level isolation.
The final four-user verification reported four verified users and zero mismatches. The onboarding
manifest now makes an explicit reviewed home branch mandatory for every new user; the single-user
setup command requires an exact Plan hash and automatically verifies Apply before the assignment is
considered complete. It never defaults a missing branch to Auckland.

The Service Coordination worklist now implements Home branch, All branches and My watchlist as
distinct persisted views. Home branch applies the Dataverse branch filter; All branches omits that
filter; new Jobs still default to the signed-in user's configured home branch.
The initial delivery uses operational branch filtering; Dataverse branch
security isolation and automatic Job completion remain deferred phases.

## Initial audit validation snapshot

The counts below describe the initial audit, not today's latest result. The three contract failures
and six lint findings are now resolved; see the [later Job Card checks](docs/reviews/2026-10-10-job-card-implementation.md#verification).

- Production build: passed.
- Complete Node test run: **835 passed / 3 failed / 838 total**.
- Offline restricted-access C# tests: **64 passed**; registration C# tests: **47 passed**.
- ESLint: **6 errors**.
- Named-user, cross-browser, application-identity and deployed-auth smoke: not performed in this audit.

Historical detailed progress remains in Git, for example `git show f73f3d6:CURRENT_STATE.md`.
Use dated history for provenance, not as a competing description of current behavior.
