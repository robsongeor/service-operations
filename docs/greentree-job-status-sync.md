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

Before normal polling is enabled, run a one-time full-status backfill for every numbered record in:

- managed Jobs (`gr_job`);
- Auckland Job Book entries (`gr_jobbookentry`);
- Waikato Job Book entries (`gr_waikatojobbookentry`);
- Hastings Job Book entries (`gr_hastingsjobbookentry`); and
- Christchurch Job Book entries (`gr_christchurchjobbookentry`).

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
4. Deploy and verify access guard `1.0.14.0`. The existing exact backend application user and its
   dedicated integration-writer role may update only the GreenTree marker, factual status and
   checked timestamp for these five tables; the guard rejects mixed, regressive, inactive, void,
   future-dated or unrelated-field patches.
5. Deploy the compatible API and application together.
6. Run the initial full-status backfill to completion and retain its aggregate reconciliation report.
7. Enable the status-aware scheduler only after the deployed API passes controlled checks for all
   four display states and confirms that `gr_status` is never patched.

The current 15-minute `modifiedSince` delta job is not, by itself, the complete status-specific
polling policy. Before scheduler enablement, the backend must retain enough per-record/checkpoint
state to enforce the 3-hour Open cadence, the once-daily 7:00am Closed cadence, and the permanent
Finalised exclusion. Schema provisioning alone does not enable polling.

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
