# Job Branch Scope and Personal Watchlist

## Purpose

Service Coordination needs two independent forms of scope:

- **Branch scope** answers which Jobs belong in a coordinator's normal operating queue.
- **Personal watch scope** answers which individual Jobs the signed-in user has chosen to keep
  following.

They must not be represented by Job Status, technician assignment, Job ownership or the existing
shared Office Attention flag. Auckland coordinators must see the same Auckland branch queue while
maintaining separate personal watchlists. Christchurch coordinators should see Christchurch work by
default without routinely loading Auckland work.

This document records the target design and current implementation boundary. The Branch Choice,
nullable Job/System User branch columns and user-owned Job Watch table were provisioned and
post-verified on 19 October 2026. The approved historical Auckland Job migration and the reviewed
home branches for Andy Lee, Bruce Frost, George Robson and Pubudu were applied and verified on
20 October 2026. Reviewed exceptions remain unclassified; the default-off application gates are a
separate release control.

## User experience

Service Coordination has these worklist views:

| View | Contents | Sharing |
| --- | --- | --- |
| **Branch work** | Active Jobs whose current operating branch matches the signed-in user's home branch. | Shared by every coordinator in that branch. |
| **My watchlist** | Jobs explicitly watched by the signed-in user and still readable by that user. | Private to that user in the application. |
| **All branches** | Cross-branch work for participating Service Coordination users. | Available to every participating user; home branch remains the default view. |

Branch work remains the operational default. It is not filtered by Job creator, Dataverse owner,
assigned technician or watcher. Both Auckland users therefore see the same Auckland queue and can
work from the same current Job state.

Every Job row and the canonical Job drawer expose a watch/unwatch control. A watch does not change
Job Status, Branch, Office Attention, assignment, schedule or Job Card progress. Two users may watch
the same Job independently. Unwatching removes only the caller's watch.

My watchlist uses the normal Job lifecycle and displays the Job's Branch prominently. A watched Job
does not disappear merely because it moves from Staging to With Technician or Completion Review.
Jobs whose factual GreenTree status is `closed` or `finalised` are excluded at the Dataverse query
boundary from Branch work, All branches and My watchlist so archived work does not consume paging,
network or rendering capacity. The underlying personal watch is retained rather than silently
deleted; it can reappear if a separately approved GreenTree reopen process makes the Job active
again. Jobs with `open` or no recorded GreenTree status remain visible.

`gr_officeattentionrequired` remains a **shared branch-level operational signal** for work that
needs office action. It may make a Job prominent to all branch coordinators. It is not a personal
bookmark and must not be set or cleared by watch/unwatch actions.

## Authoritative branch model

Regional Job Book identity is not sufficient as the ongoing branch model:

- an unnumbered Staging Job has no regional ledger yet;
- legacy and unknown Job Number formats cannot always identify a region safely;
- technician `gr_region` is free text and a technician may work across branches; and
- a Job may later be operationally transferred while its permanent Job Number and origin ledger
  remain unchanged.

Add one global Choice for the supported operating branches and reuse it on Job and System User.
Names are proposed here; exact publisher/schema names must be confirmed during metadata preflight.

| Proposed field | Type | Purpose |
| --- | --- | --- |
| `gr_job.gr_operatingbranch` | Global Choice `gr_operatingbranch` | Current branch responsible for coordinating the Job. |
| `systemuser.gr_serviceoperationsbranch` | Same global Choice | Signed-in user's default/home Service Operations branch. |

Proposed Choice values preserve the existing regional-book order:

| Label | Proposed value |
| --- | ---: |
| Auckland | `122830000` |
| Waikato | `122830001` |
| Hastings | `122830002` |
| Christchurch | `122830003` |

These values now exist in the verified target metadata. They remain nullable until the separately
reviewed user and historical Job mappings are applied.

The verified Phase 3 source contract lives in
`dataverse/service-coordination/schema-manifest.json`, with the approval-gated manager at
`scripts/manage-service-coordination-schema.ps1`. The generated Job Watch entity-set name is
`gr_jobwatchs`; its Job + Watcher alternate key is Active. Provisioning did not assign user branches,
classify historical Jobs, deploy application source or enable a feature gate.

The application resolves the home branch from the authenticated Dataverse System User, not from
browser storage, an editable UI preference, an email-domain rule or technician data. Users with
Service Coordination access require a configured home branch before Branch work can claim a
complete result. A missing/unknown branch shows a clear setup error; it must not fall back to
Auckland or All branches.

### Required user-onboarding branch gate

Every new Service Operations user must receive an explicit reviewed home branch as part of the same
onboarding change. Access/role assignment is not considered complete while the branch is missing.
There is deliberately no implicit Auckland default.

1. Add the exact user principal name and one allowed branch to
   `dataverse/service-coordination/user-branch-mapping.json`.
2. Run `scripts/setup-service-operations-user-home-branch.ps1 -Mode Plan` with the same user and
   branch, then review its single-user artifact and hash.
3. Run the command again with `-Mode Apply -ApprovedPlanHash <reviewed hash>`. Apply performs an
   immediate live Verify and reports onboarding complete only for one verified user and zero
   mismatches.

The command rejects a missing/duplicate mapping, a branch that differs from the reviewed mapping,
a multi-user Plan, a changed Plan hash and a failed live verification. `-Mode Verify` can recheck the
approved Plan without writing.

New Jobs default to the current user's home branch. Job Book creation/registration starts with the
selected regional book's branch. A permanent Job Number remains immutable. A later approved
operating-branch transfer changes only `gr_operatingbranch`; it does not renumber the Job or move its
historical regional ledger.

## Personal watch data model

Create a dedicated user-owned `Job Watch` table rather than adding a multi-user flag to `gr_job`.
Names remain proposed until metadata preflight.

| Proposed column | Type | Rule |
| --- | --- | --- |
| `gr_jobwatchid` | Primary key | Dataverse generated. |
| `gr_name` | Primary name | Server-generated non-secret display value. |
| `gr_Job` | Required lookup to Job | The watched Job. |
| `gr_Watcher` | Required lookup to System User | Must equal the authenticated caller. |
| Owner | Standard user-owned owner | Must be the same authenticated System User. |
| Created On | Standard timestamp | Audit of when the watch began. |

Add an alternate key on Job + Watcher so repeated requests cannot create duplicate watches. Delete
behavior must remove orphaned watch rows if a Job is legitimately deleted without deleting or
modifying the Job when a watch is removed.

Do not store a watch only in local storage: that would be browser-specific, easy to lose and unable
to follow the user across devices. Do not use `createdby` or Job ownership as a substitute: both
describe record administration, not the user's current interest.

## Authenticated watch operations

Watch operations use a narrow authenticated server boundary:

1. validate the delegated identity with Dataverse `WhoAmI`;
2. resolve the exact System User and its configured home branch;
3. list only watches whose Watcher and owner are that user;
4. add an idempotent watch for the requested readable Job;
5. remove only that caller's matching watch; and
6. return safe conflict/not-found errors without exposing another user's watch records.

The server sets Watcher/owner from the authenticated identity and never accepts a caller-supplied
user ID as authority. Job Watch permissions must not allow an ordinary coordinator to create,
reassign or delete another user's watch. Dataverse administrators may retain their normal platform
visibility, but the application does not expose who else is watching a Job.

Watchlist reads must be bounded and paged. Resolve the watched Job projection without one request
per row, exclude GreenTree `closed` and `finalised` Jobs in the server query, follow trusted
Dataverse continuation links and preserve account/environment scoping in client query state. A
deleted, inaccessible or void Job produces a safe unavailable/archived result or removes the
orphaned watch under an explicit cleanup rule; it must not expose stale Job content.

## Branch filtering and security boundary

The initial branch feature is a worklist scope, not automatically a security boundary. Hiding
Auckland rows in the Christchurch UI does not prevent a user with organization-wide Dataverse Read
from retrieving them through another client or API.

Before rollout, choose and record one of these modes:

1. **Operational filtering:** users retain their existing Dataverse access, but normal app queries
   are branch-filtered. Cross-branch access may be exposed only through an explicit capability.
2. **Security isolation:** branch owner teams/business units own Jobs and related records, and
   Dataverse privileges restrict users to approved branch teams. The UI filter remains useful but is
   not the enforcement mechanism.

Do not describe branch filtering as security isolation unless named-user Dataverse/API tests prove
that Auckland and Christchurch users cannot read each other's rows. Auckland collaboration must
also be tested: both Auckland users must be able to read and update the same branch Jobs even when
neither individually created or owns a Job.

## Historical branch migration

Provisioning a branch column does not classify existing Jobs. Use a dry-run-first migration with
the same Inspect, Plan, Apply and Verify discipline as the
[Job Status migration](job-status-lifecycle-migration.md).

Classification evidence, strongest first:

1. an exact, consistent linked Registered regional ledger;
2. an approved legacy regional source/ledger mapping;
3. an unambiguous supported permanent Job Number format for a legacy Job; and
4. explicit coordinator review.

Job creator, selected technician, Site address text, mechanic region, status and GreenTree account
data are not authoritative branch evidence. Existing unknown-format and cross-region conflicts stay
unclassified for review. Unnumbered Jobs need an explicit reviewed branch assignment; if the owner
approves a one-time Auckland baseline for the existing population, that approval and exact bounded
record set must be captured rather than silently encoded as a fallback.

Apply uses ETags, bounded resumable batches and an audit of previous/new values and reason codes.
It updates only `gr_operatingbranch`. It must not renumber Jobs, create regional ledgers, change
Status, assignments, watches, Customer/Site/Equipment relationships or completion evidence.

The source implementation is `scripts/service-coordination-migration.mjs`, backed by
`dataverse/service-coordination/migration-manifest.json`. Inspect/Plan operate on a privacy-minimal
evidence snapshot. Apply requires the exact approved Plan hash and an explicit checkpoint, and
conditional rollback preserves any newer operational edit. Simulation tests cover bounds,
conflicts, interruption/resume and partial outcomes. On 20 October 2026 the approved Auckland
historical migration was applied and verified for 1,320 Jobs. Forty-one unclassified Jobs were
exported for review and intentionally left unchanged. The reviewed System User mappings were also
applied and verified: Andy Lee uses Christchurch; Bruce Frost, George Robson and Pubudu use
Auckland. All participating users may still select All branches.

## Release order and acceptance

1. Inspect existing branch-related metadata, System Users, roles, teams and regional-ledger data.
2. Decide whether branch scope is operational filtering or enforced Dataverse security isolation.
3. Provision the Branch Choice, Job/System User columns, Job Watch table, alternate key and minimum
   privileges; publish and verify metadata before deploying dependent code.
4. Configure and verify each participating user's home branch. Auckland's two coordinators receive
   Auckland; Christchurch users receive Christchurch.
5. Run and approve the historical branch Plan, then apply and verify it in bounded batches.
6. Deploy server-owned watch operations and branch-scoped Service Coordination queries.
7. Test two Auckland users sharing Branch work but maintaining different watches.
8. Test Christchurch's default queue excludes Auckland Jobs and includes Christchurch Staging work.
9. Test watch add/remove idempotency, multiple users watching one Job, completion retention,
   account switching, inaccessible Jobs, paging, conflicts and independent-browser refresh.
10. If security isolation is selected, run direct Dataverse/API allowed-and-denied tests; UI results
    alone are not acceptance evidence.

Rollback disables the branch/watch UI first, restores the previous query scope, and retains nullable
metadata/watch records unless an independently approved cleanup proves safe. Never delete personal
watches or clear historical branch values merely to roll back presentation code.
