# Unified Job workflow — migration and role review

Status: local read-only design. No backfill, role assignment, provisioning, feature enablement or
business-data mutation is approved by this document.

## Read-only target audit — 6 October 2026

The approved aggregate-only audit read 1,191 Jobs and zero rows across all four regional ledger
tables. Of 1,154 numbered legacy Jobs, 1,130 match Auckland format, five Waikato, three Hastings,
eight Christchurch, and eight do not match an approved regional format. A further 37 Jobs are
unnumbered. The proposed coordinator-membership column is absent, as expected from the metadata
preflight. No IDs or Job-number values were emitted and no data was changed.

This evidence supports grandfathering the 1,154 numbered Jobs without inventing ledger history.
The eight unknown-format values were explicitly inspected and confirmed as legacy labels/codes rather
than approved regional sequences. They remain immutable, regionless exceptions. Only their count and
set fingerprint are stored, so future drift stops the audit without placing the values in the repository. The 37
unnumbered Jobs remain Staging work and can be allocated later through the guarded operation. Zero
ledger rows means there are currently no record pairs to link and no legitimate ledger-link backfill.

## Simple model

The migration has two independent questions:

1. Which historical Job and regional ledger rows describe the same work?
2. Which people may perform each future workflow action?

Neither answer may be inferred from the browser. Record linkage is reviewed from Dataverse evidence;
authorization is enforced by Dataverse privileges plus caller-context plugins.

## Historical record classification

[`migration-manifest.json`](../dataverse/job-registration/migration-manifest.json) is the
machine-readable policy. The read-only audit classifies all bounded Job and regional ledger rows as:

- already linked and number-consistent;
- historical Promoted linkage that must remain historical;
- a one-Job number-text candidate requiring manual review;
- missing, duplicate, malformed, cross-region or number-mismatch stop conditions;
- numbered Jobs without a ledger, numberless ledger rows, or unnumbered Jobs.
- explicit true, false or unset coordinator membership, or the currently missing membership column.

A matching number is not a backfill instruction. The audit never writes `gr_registeredjob`, changes a
number, reinterprets `gr_promotedjob`, or emits identifiers and number values. One-to-one candidates
must be reviewed against source evidence and exported into a separately approved change manifest with
exact Job and ledger row versions. Conflicts stay unresolved until an owner makes an explicit decision.
Coordinator membership is a separate reviewed decision and is never derived from Job type, status,
number, ledger presence or historical promotion.

Existing numbered Jobs without a ledger are grandfathered legacy Jobs. Do not fabricate regional
ledger rows, registration fingerprints, snapshots or Registered stages for them. Existing membership
remains unset and uses the explicit legacy Operational fallback. New registration writes membership
false; the reviewed Manage action changes it to true. This avoids a destructive bulk backfill while
keeping new workflow provenance exact.

Run only after approval for a live read-only business-data audit:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/inspect-unified-job-migration.ps1 `
  -EnvironmentUrl https://org0d4246d7.crm6.dynamics.com `
  -LoginPrompt Auto
```

The default is non-interactive. Reads are bounded to 50,000 rows per table unless a smaller reviewed
bound is supplied. Exceeding the bound aborts rather than presenting an incomplete report. Output is
aggregate counts only and should not be redirected into the repository.

## Backfill package required after review

No write tool exists yet. Before one may be designed, reviewers must approve:

- a candidate evidence file containing explicit Job/ledger IDs and exact row versions;
- decisions for every duplicate, mismatch, missing counterpart and historical Promoted row;
- regional AutoNumber sequence ownership and collision checks;
- a backup/export owner, maintenance window and compatible app/plugin release;
- an idempotent, conditional update contract that changes linkage/membership fields only;
- reconciliation reads proving every intended update and no number/evidence changes;
- rollback behavior. Rollback may restore newly added linkage/membership values, but must never
  renumber, delete or rewrite historical records.

## Role policy

[`unified-workflow-role-policy.json`](../dataverse/access/unified-workflow-role-policy.json) defines
the default-deny action matrix and must stay consistent with the Custom API readiness manifest.

| Action | Full | Coordinator | Office Admin | Job Book Admin |
| --- | --- | --- | --- | --- |
| Register basic Job | Yes | Yes | Yes | Yes |
| Allocate regional number | Yes | Yes | No | No |
| Add to coordinator worklist | Yes | Yes | No | No |
| Eligible registered-entry Void | Yes | Yes | Yes | Yes |
| Initial assigned-technician dispatch | Yes | Yes | Yes | No |
| Factual corrections | Yes | Yes | Yes | Yes |
| Initial technician assignment | Yes | Yes | Yes | No |
| Later reassignment/scheduling | Yes | Yes | No | No |
| GT/Timecloud markers | Yes | Yes | Yes | No |
| Job Card review | Yes | Yes | Yes | No |
| Direct number mutation or numbered deletion | No | No | No | No |

Full and Coordinator remain distinct roles even while their initial capabilities match. Office and
Book Admin need table-level writes for narrow operations, so the synchronous restricted-access guard
is part of the same deployment unit; hidden controls are not enforcement.

Before assignments change, inventory each pilot's direct and team-derived roles. Any overlapping role
that restores a denied capability is a stop condition. Test both allowed and denied direct API calls
with real licensed pilot profiles, and verify the separate Job Card reviewer service allowlist.

## Current stop gates

- Live business-data migration audit has not been approved or run.
- No reviewed candidate link/membership backfill file exists.
- Regional AutoNumber cutover ownership and rollback are not approved.
- Plugin assembly signing and exact registration metadata are not approved.
- Least-privilege Dataverse roles and pilot identity/admission checks remain unprovisioned.
- The compatible release must be deployed before any feature flag or assignment change.
