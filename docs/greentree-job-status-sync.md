# GreenTree Job Status Synchronisation

## Purpose

The Job Book displays GreenTree as a factual external status. It does not use GreenTree to change
the operational Job status, complete a Job, or run maintenance/WOF completion side effects.

The displayed values are exactly:

| Display | Stored value | Meaning |
| --- | --- | --- |
| **Not entered** | No GreenTree entry marker/status | The Job Number has not yet been found in GreenTree. |
| **Open** | `open` | The Job exists in GreenTree and is open. |
| **Closed** | `closed` | The Job exists in GreenTree and is closed. |
| **Finalised** | `finalised` | The Job has reached its terminal GreenTree state. |

When GreenTree returns both closed and finalised flags, **Finalised** takes precedence.

## Polling policy

The scheduler wakes every 15 minutes, but only records due under this policy may be checked:

| Current display | Check cadence |
| --- | --- |
| **Not entered** | Every 15 minutes. |
| **Open** | Every 3 hours. |
| **Closed** | Once per New Zealand calendar day, at or after **7:00am Pacific/Auckland**. |
| **Finalised** | Never checked again. This is the terminal state. |

The 7:00am rule must use the `Pacific/Auckland` time zone rather than a fixed UTC hour so daylight
saving changes do not move the business-time check. A delayed or failed 7:00am run may retry later
that New Zealand day. It must not run twice after a successful daily check.

Polling must be idempotent and bounded. A retry may repeat the same lookup, but it must not change an
operational Job status. A missing GreenTree result retains **Not entered**. Status progression is
`Not entered` to `Open`, `Open` to `Closed`, and `Closed` to `Finalised`; unexpected regressions must
be reported for review rather than silently rewriting the stored state.

## Initial full-status backfill

Before normal polling is enabled, run a one-time full-status backfill for every record with a valid
GreenTree-shaped Job Number in:

- managed Jobs (`gr_job`);
- Auckland Job Book entries (`gr_jobbookentry`);
- Waikato Job Book entries (`gr_waikatojobbookentry`);
- Hastings Job Book entries (`gr_hastingsjobbookentry`); and
- Christchurch Job Book entries (`gr_christchurchjobbookentry`).

Known free-text or malformed supervisor entries are data-quality exceptions, not GreenTree lookup
keys. The verifier must report them separately and exclude them from the due/remaining totals.

The backfill must deduplicate identical Job Numbers before calling GreenTree, then apply the one
authoritative result to every matching Dataverse representation. Registered ledger/managed-Job
pairs must therefore cause one GreenTree lookup, not two. Every Job Number is checked once during
this initial pass, including Jobs whose first result is **Finalised**. Finalised records are excluded
from every subsequent scheduled check.

The backfill must be bounded, resumable and safe to restart. Persist a continuation/checkpoint after
each successful batch, use ETags for Dataverse writes, use limited request concurrency, and honour
GreenTree throttling/retry responses. A failed batch must resume from its retained checkpoint rather
than restart the complete population or skip unresolved records.

For each exact Job Number lookup:

- no GreenTree match stores no status and leaves the record displayed as **Not entered**;
- a match stores the entry marker plus `open`, `closed`, or `finalised`;
- duplicate or contradictory Dataverse/GreenTree matches are quarantined for review;
- no request may patch the operational `gr_status`, completion dates, Equipment, maintenance, WOF,
  assignments, or technician evidence.

The completion report must include aggregate counts for scanned unique Job Numbers, Not entered,
Open, Closed, Finalised, conflicts, failed lookups and remaining records. It must not include API
credentials or expose unnecessary customer/job content.

## Provisioning and release order

This feature must not be deployed before its Dataverse metadata is provisioned. Provision all five
tables (`gr_job` and the Auckland, Waikato, Hastings and Christchurch Job Book ledgers) with the
optional, unsecure `gr_greentreestatus` text column and the optional, unsecure UTC date/time column
`gr_greentreestatuscheckedon`. The stored status values are limited to `open`, `closed`, and
`finalised`; the checked time enforces the polling cadence and makes the initial backfill resumable.

Release in this order:

1. Export/retain the current solution and plugin registration state.
2. Run `scripts/manage-greentree-job-status-schema.ps1 -Mode Verify` and confirm it reports the
   expected missing columns before the first rollout.
3. Run the same script with `-Mode Provision`, then run `-Mode Verify` again.
4. Deploy and verify access guard `1.0.18.0`. GreenTree status writes use the enabled application
   user for client `ba0bb04d-dcb3-4434-9383-3001de294214` and its sole direct role,
   **Service Operations GreenTree Sync**. This identity is distinct from the general Dataverse,
   TimeCloud and Job Card meter writers. Run `scripts/inspect-dataverse-application-user.ps1`
   read-only first, then attach the exact `greentreerole`, `greentreeuser` and
   `greentreeapplication` tuple with `scripts/configure-greentree-status-guard.ps1`. The guard permits
   this identity to update only the GreenTree marker, factual status and checked timestamp for the
   five supported tables; it rejects mixed, regressive, inactive, void, future-dated or unrelated
   patches. The TimeCloud identity remains limited to its three confirmation fields.
5. Deploy the compatible API and application together.
6. Run the initial full-status backfill to completion and retain its aggregate reconciliation report.
7. Enable the status-aware scheduler only after the deployed API passes controlled checks for all
   four display states and confirms that `gr_status` is never patched.

The old 15-minute `modifiedSince`-only delta job was retired when the status-aware scheduler was
enabled. The backend retains a checked timestamp per record to enforce the 3-hour Open cadence, the
once-daily 7:00am Closed cadence, and the permanent Finalised exclusion.

Interactive checks authenticate the signed-in user before accepting the request, but the factual
GreenTree marker, status and checked timestamp are read and written by the same dedicated GreenTree
application identity used by scheduled polling. This keeps the result consistent for every permitted
application role without granting human users direct write access to synchronization-only fields.
Local development may reuse its delegated test token because production application credentials are
intentionally unavailable there.

## Live rollout record — 19 October 2026

- The dedicated GreenTree Dataverse application user was verified and the access guard was deployed
  as `1.0.18.0`. Deployment and verification were performed as `georger@liftrucks.co.nz`.
- Full backfill workflow run `39202703036` completed successfully with no lookup failures or status
  conflicts.
- The read-only Dataverse verifier found 1,319 unique non-empty values: 1,311 valid Job Numbers were
  checked, 0 valid Job Numbers remained, and 0 cross-representation status conflicts existed.
- Eight known incorrect supervisor-entered values were recorded as ignored data-quality exceptions:
  `143057A`, `146274A`, `DQ45-D`, `GALLAGHER CROWN`, `MASON`, `QUOTE`, `TEST`, and `VWL000111`.
- The status-aware workflow was enabled on the default branch at commit `858e4d1`. It wakes every
  15 minutes; per-record due logic applies the cadence in this document.
- The scheduler does not invoke the former operational Job completion-review reconciliation path.
  GreenTree status remains factual metadata only and never changes operational `gr_status`.
- Plugin exception tracing was returned to **Off** after rollout diagnostics.

## Verification and rollback

Before enabling the scheduler, verify a controlled record in each state and confirm:

- the Job Book wording is **Not entered**, **Open**, **Closed**, or **Finalised**;
- a GreenTree update writes only the entry marker and factual GreenTree status;
- the operational `gr_status` value is unchanged;
- **Finalised** records generate no further GreenTree lookups;
- Closed records are not checked more than once per New Zealand day.
- the full backfill has no unreviewed conflicts or failed/remaining records.

To roll back, disable the scheduler first and redeploy the last compatible API/application and guard
assembly. Retain the nullable Dataverse columns; do not delete populated metadata during rollback.
