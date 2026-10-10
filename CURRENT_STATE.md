# Current application state

Reviewed 10 October 2026 against branch `v2-deployment`, commit `f73f3d6`.
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

**Hold broad restricted-role rollout pending the security and workflow gates below.**
The source build passes, but client capabilities and Dataverse guard allowlists disagree.
A hidden menu, a simulated role, or a successful deployment is not authorization proof.

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

The readiness continuation cleared the original test/lint failures: **894 Node tests, full lint,
build and 114 offline access-policy tests pass locally**. Equipment search reuses bounded request
handling; maintenance detail/contact state is isolated by selection and account. A dedicated,
four-field meter writer is implemented locally in guard `1.0.2.0`. Read-only live checks confirm
the existing reading type/date columns, but the approval-reference column and dedicated writer
role are missing; production still runs `1.0.1.0` with 14 guards. Production provisioning was
blocked pending explicit approval. No feature flags or cloud permissions were changed.
See the [meter-writer rollout checklist](docs/job-card-meter-writer-rollout.md).

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

## Recorded deployment evidence — not reverified by this audit

Previous work records signed plugin assembly 1.0.1.0 and 14 enabled restricted-access guards;
15 numbering invariant guards were registered but left disabled for shared V1 compatibility.
The reviewed restricted-user cohort records 3 Office Admins and 5 Job Book Admins with the
obsolete JobBookOnly assignments removed. This is not a new live tenant-wide inventory.

The readiness manifest still labels registration flag-off, while the V2 workflow builds it on.
Resolve that evidence/configuration drift before using manifests as a release gate.
Never enable all invariant guards or remove compatibility paths without checking V1 writers.

## Current blockers

| Finding | Required action |
| --- | --- |
| A01: restricted save/dispatch policy mismatch | Align mechanic/supplier and Equipment payloads with reviewed server operations; prove allowed and denied writes |
| A02: mechanic selection allocates at registration | Keep Unallocated until confirmed dispatch; update plugin, guard, contracts and tests together |
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
