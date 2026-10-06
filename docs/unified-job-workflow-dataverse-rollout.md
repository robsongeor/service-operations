# Unified Job workflow — Dataverse readiness and rollout

Status: local readiness package only. No schema, API, plugin, role, assignment, setting, migration,
or deployment change has been approved or performed.

## Read-only target audit — 6 October 2026

The approved audit connected successfully to `https://org0d4246d7.crm6.dynamics.com` and completed
40 checks using one authenticated session. The expanded sequence-contract rerun completed 47 checks,
confirmed all four AutoNumber formats and Active unique keys, and reported 28 not-ready items. Both
runs explicitly made no changes.

Confirmed present:

- the unmanaged `ServiceOperationsNew` solution;
- optimistic concurrency on `gr_job` (the earlier audit did not verify the four regional ledgers);
- the four proposed execute-privilege sources for Job Book Entry create/write, Job Schedule Option
  create, and Email Dispatch create;
- one existing `System Administrator` role and one existing `Service Operations` role; both hold
  the proposed API privilege sources.

Confirmed absent:

- all five proposed Custom APIs;
- 12 proposed columns: three on Job, one on Email Dispatch, and two on each regional ledger;
- the Registered `122830004` stage option on all four regional ledgers;
- `Service Operations - Office Admin` and `Service Operations - Job Book Admin` roles.

The audit initially recorded six activation blockers. The local reviewed specialist allocation
adapter now closes one code blocker; the five blockers in the current manifest remain open. This
result is the exact metadata delta for review; it is not authorization to create the missing items. No user/role assignment, business data, feature
flag, plugin registration, schema, solution, or application deployment was changed.

The machine-readable deployment inventory is
[`dataverse/job-registration/readiness-manifest.json`](../dataverse/job-registration/readiness-manifest.json).
It complements the behavioural API contract in
[`dataverse/job-registration/contract.json`](../dataverse/job-registration/contract.json); neither
file is a provisioning instruction by itself.

## Read-only preflight

`scripts/inspect-unified-job-workflow-readiness.ps1` creates one Dataverse connection and performs
only metadata, role, privilege, Custom API/plugin-type and `WhoAmI` reads. It defaults to
`LoginPrompt=Never`, contains no create/update/delete/publish/grant/assignment operation, and exits
with code 2 while required items or activation gates remain unresolved. An interactive run still
requires explicit approval because it opens a live administrative session.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/inspect-unified-job-workflow-readiness.ps1 `
  -EnvironmentUrl https://org0d4246d7.crm6.dynamics.com `
  -SolutionUniqueName ServiceOperationsNew `
  -LoginPrompt Auto
```

Do not redirect raw output into the repository: it can contain user/role identifiers. Record only
reviewed pass/fail evidence in the release record.

## Required deployment unit

Provisioning must be reviewed and executed as one compatible unit:

1. Job membership/Void columns, guarded-dispatch fingerprint, and the registered Job/fingerprint
   columns plus Registered stage on all four regional ledgers. Optimistic concurrency must be
   enabled on the Job and every regional ledger before the atomic registered-entry Void action is
   exposed; otherwise its exact-version ledger update fails at Dataverse.
2. A signed assembly containing registration, workflow, number-invariant and restricted-access
   plugin types.
3. Five synchronous global Custom APIs with non-empty reviewed `ExecutePrivilegeName` values and
   exact request/response contracts.
4. Exact caller-context plugin steps and required pre-images. The restricted guard and transactional
   exceptions must be installed together; a partially installed guard can block legitimate work or
   leave forbidden direct writes open.
5. Separate reviewed coordinator, Office Admin and Job Book Admin Dataverse roles, followed by the
   secure role-ID configuration and real-account tests. Existing broad direct/team grants must be
   reconciled rather than hidden by an additional narrow role.
6. A compatible application/backend release before any feature flag or user assignment changes.

The exact offline expansion is now captured in the validated
[deployment package review](unified-job-workflow-deployment-package.md): 12 columns, four Choice
additions, one four-type `1.0.0.0` assembly, five APIs, 29 guard steps, four default-deny profiles
and the eleven-account review-only assignment plan. It is not a provisioning script.

## Stop gates before provisioning

Provisioning is not currently safe. The following remain open:

- approve migration/backfill, regional sequence ownership and rollback, preserving historical rows;
- review and sign the plugin assembly and exact registration metadata;
- approve the least-privilege privilege matrix and intended Dataverse role names/IDs;
- complete target-environment admission/licensing for pilot accounts;
- define controlled target records, evidence capture and rollback ownership.

The read-only audit may be run before these decisions to establish the exact metadata delta. A
Provision mode must not be added or run until the blockers are closed and the user approves the
specific environment and change package.

The separate [migration and role review](unified-job-workflow-migration-and-security.md) now defines
the aggregate-only historical classifier, no-auto-link rule, backfill evidence/rollback gates and
default-deny action matrix. Its approved read-only target run found 1,191 Jobs and zero ledger rows:
1,154 numbered Jobs are grandfathered without fabricated history, while eight unknown-format numbers
were reviewed as immutable regionless exceptions protected by a count/set fingerprint. Regional
sequence/source evidence remains a cutover stop condition. No changes were made.

## Target verification order

After an approved non-production provisioning run: verify schema and registrations, test direct API
denials with each real role, exercise all four number series and replay/conflict cases, test linked
Void and initial dispatch, verify existing coordinator/Site Check/WOF work, then run the complete
acceptance matrix in the [Job Book rollout plan](features/JOB_BOOK_ROLLOUT_PLAN.md). Keep
`VITE_UNIFIED_JOB_WORKFLOW_ENABLED=false` until that evidence is accepted.
