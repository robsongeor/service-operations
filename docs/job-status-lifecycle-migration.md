# Job Status Lifecycle Schema and Historical Migration

## Purpose

This document owns the Dataverse metadata and historical-data transition for the agreed Service
Coordination lifecycle. The product meaning is defined in
[Jobs architecture](architecture/jobs.md#operational-job-status-lifecycle). This plan does not
implement the transition, change production metadata, or authorize a bulk update.

The change has three ordered parts:

1. rename existing Job Status Choice labels without changing their numeric identities; and
2. migrate every legacy Unconfirmed (`122830005`) Job to Staging (`122830001`), then retire the
   Unconfirmed option; and
3. reconcile other historical `gr_job` rows whose saved status does not match the evidence-based
   lifecycle.

A label update changes how the same value is displayed in Dataverse. It does not repair the status
stored on any existing Job. Historical reconciliation is therefore required even if the Choice
metadata is renamed successfully.

## Existing and target Dataverse Choice contract

`gr_job.gr_status` uses the existing global Choice `gr_status`. No new operational status value is
required for this lifecycle and no active numeric value may be renumbered or reused. Value
`122830005` is a retired legacy value and must not be offered for new writes.

| Value | Current Dataverse label | Target coordinator label | Data migration |
| ---: | --- | --- | --- |
| `122830000` | Allocated | With Technician | Some historical rows may need reclassification. |
| `122830001` | Unallocated | Staging | Some historical rows may need reclassification. |
| `122830002` | Waiting for parts | Action Required | Preserve the value; rename the label only. |
| `122830003` | Complete | Complete | Preserve the label and value. Existing anomalies require review, not blanket reopening. |
| `122830004` | Review | Completion Review | Preserve the value; rename the label only. |
| `122830005` | Unconfirmed | Staging compatibility label until migration | Migrate every row to `122830001`, verify zero references, then remove/retire the Choice option. Never reuse the number. |

The preferred cutover updates the labels on global Choice `gr_status` and publishes the metadata so
Dataverse forms, views, exports and administration screens use the same wording as Service
Coordination. The application may ship the new wording first, but that is a temporary presentation
bridge rather than proof that Dataverse metadata was updated. Every configured language label must
be inspected; the rollout must not silently remove translations.

Changing the active labels is a metadata operation only. It must not create a second Choice, add new
values, alter `gr_job.gr_status` to a local Choice, or rewrite active numeric values merely to display
new text. The one deliberate value migration is the approved `122830005` → `122830001` retirement.
Site Check and every other consumer continue using the remaining numeric contract.

Until that migration is applied, application compatibility code loads `122830005` in the priority
worklist, displays and filters it as Staging, permits the same allocation/scheduling/dispatch actions,
and canonicalises it to `122830001` when a normal edit or lifecycle transition writes the status.
There is no Unconfirmed tab or editable option. This bridge prevents historical rows and saved views
from disappearing; it does not replace the controlled bulk migration.

## Historical reconciliation principles

Historical correction must be evidence-based. A selected mechanic, schedule, Job number, GreenTree
entry or GreenTree status does not by itself prove that a Job was dispatched or completed. Do not
reset every Allocated Job to Staging and do not promote every GreenTree-closed Job to Complete.

The reconciliation must use the current Job plus the authoritative evidence available for that Job:

- successful Email Dispatch records;
- the current primary technician and active additional-assignment roster;
- Azure Job Card lifecycle records, including assignment identity, replacement, withdrawal,
  expiry and submitted state;
- compatible legacy dispatch/submission timestamps where the newer lifecycle did not exist;
- the existing Action Required, Completion Review and Complete status;
- completion date, meter evidence and type-specific Service/WOF/Site Check side effects for audit;
- void, inactive, external-supplier and legacy markers; and
- ETag/version information needed to prevent overwriting a concurrent office change.

Missing or contradictory evidence produces an exception for human review. It must never be treated
as evidence for the most convenient status.

## Proposed classification order

The dry-run classifier evaluates each active, non-void operational Job in this order. The order is
important because it prevents a lower-confidence signal from overwriting a deliberate or terminal
state.

| Condition | Proposed result | Rule |
| --- | --- | --- |
| Status is legacy Unconfirmed (`122830005`) | Staging (`122830001`) | Deterministic retirement mapping. Report separately from evidence-based reclassification. |
| Status is Action Required | Action Required | Preserve the coordinator-controlled blocker. Report card progress separately; do not auto-clear it. |
| Status is Complete | Complete or review exception | Do not automatically reopen. Audit required completion evidence and type-specific side effects; unresolved anomalies need an approved repair decision. |
| All current required technician returns are received, with explicit withdrawals handled by the current roster rules | Completion Review | At least one accepted return must exist. Truncated, missing or contradictory lifecycle history is an exception. |
| At least one current successful dispatch/active technician-card lifecycle exists | With Technician | A tentative assignment or schedule is insufficient. Expired links remain visible follow-up, not automatic Staging. |
| No successful dispatch or accepted return exists | Staging | A selected mechanic may remain as planning information. |
| Evidence cannot establish one of the above safely | Review exception | Make no write. Record the reason for coordinator review. |

Inactive, void and imported historical records are reported separately and excluded from automatic
updates unless a later approved migration explicitly includes them. External-supplier Jobs without
the standard dispatch evidence also remain exceptions until their authoritative hand-off signal is
defined.

GreenTree **Open**, **Closed** and **Finalised** remain factual external states during this migration.
They do not cause Complete, synthesize a completion date or run maintenance/WOF effects. The future
Completion Review → Complete processor remains on hold as defined in
[Deferred type-specific Job Card completion](architecture/jobs.md#deferred-type-specific-job-card-completion).

## Required migration tooling

Implement one controlled tool with separate modes; do not use ad-hoc spreadsheet edits or an
unreviewed bulk PATCH.

The first source slice is implemented in
`scripts/plan-job-status-retirement.ps1`, backed by
`dataverse/service-coordination/job-status-retirement-manifest.json`. It intentionally supports only
read-only `Inspect` and review-artifact `Plan` for the deterministic `122830005` → `122830001`
retirement. It has no Apply mode, performs no Dataverse write, and does not classify any other
status. An offline synthetic snapshot exercises the PowerShell 5.1 path without authentication.
Live Inspect found 1,353 Jobs, including 25 legacy Unconfirmed rows and zero missing row versions.
The deterministic 25-row Plan has zero exceptions and remains unapplied. Evidence-based Plan,
exact-hash conditional Apply/Verify, checkpoints and conditional rollback are implemented in
`scripts/service-coordination-migration.mjs`; production Apply and Choice retirement remain
separately gated work.

### Inspect

- Verify that `gr_job.gr_status` references global Choice `gr_status`.
- Verify every numeric value and every configured-language label.
- Count active, inactive and void Jobs by current status and Job type, with legacy Unconfirmed shown
  as a separate retirement population.
- Inventory dispatch, assignment, Job Card and completion evidence needed by the classifier.
- Report incomplete paging, duplicate identities, missing ETags and unsupported legacy records.
- Perform no writes.

### Plan

- Produce a deterministic proposed transition for every in-scope Job: unchanged, Staging, With
  Technician, Completion Review, or review exception.
- Include every `122830005` row in the plan as `122830001`; do not send this deterministic legacy
  mapping through the normal evidence classifier.
- Include the current value, proposed value, evidence category and safe reason code.
- Keep customer descriptions, technician free text, photos and other unnecessary content out of the
  report.
- Produce aggregate counts and a reviewable exception list before Apply is permitted.

### Apply

- Require an explicitly approved Plan artifact and reject changed or unknown input.
- Process bounded, resumable batches with conditional ETag updates.
- Change only `gr_status`; never combine historical reconciliation with Customer/Site/Equipment,
  assignments, completion dates, meter evidence, maintenance, WOF or technician-evidence writes.
- Treat a conflict as an exception and preserve the newer office change.
- Record old/new values, reason code, timestamp and migration run identifier for audit and rollback.
- Be idempotent: rerunning the same approved plan must not repeat or widen updates.

### Verify

- Rerun Inspect and the classifier after Apply.
- Reconcile planned, updated, unchanged, conflicted and failed counts with no unaccounted records.
- Confirm targeted examples for each status, multi-technician returns, expired/replaced links,
  external suppliers, Service, WOF, Site Check, void and inactive history.
- Confirm no completion date, Equipment, maintenance, WOF, assignment or technician evidence changed.

## Cutover order

1. Capture solution/metadata and data-count rollback evidence.
2. Deploy and verify the creation/dispatch/submission rules that stop producing old semantics.
3. Run migration **Inspect** and review the population and unsupported evidence.
4. Update and publish the global Choice labels, or retain the app-only labels temporarily if the
   metadata release is deliberately deferred.
5. Deploy the Service Coordination labels, card-progress presentation and follow-up/watch behavior.
6. Run **Plan** and obtain explicit business approval for its counts and exceptions, including the
   exact legacy Unconfirmed retirement count.
7. Run bounded **Apply**, then **Verify** before treating the historical worklist as corrected.
8. Prove that no Job, saved app preference, server filter, plugin or integration still depends on
   `122830005`; only then remove the option from the global Choice (or leave it disabled/retired when
   the platform will not safely delete a published option).
9. Retain the plan, outcome, exceptions and rollback evidence with the release record.

Rollback of label metadata restores the previous labels without changing numeric values. Data
rollback may restore a row's recorded previous value only when its ETag proves that no later user or
automation change has occurred. A rollback must never overwrite newer operational work.

## Decisions still required before Apply

- How to handle existing Complete Jobs that are missing Service/WOF/Site Check side effects.
- What to do if GreenTree later reopens a previously Complete Job.
- Which evidence proves dispatch to an external supplier when no normal technician card was sent.
- How much legacy dispatch/submission evidence is reliable enough for automatic classification.
- Who approves the Plan report and owns the review-exception queue.

Until these decisions and the remaining evidence/Apply/Verify tooling are complete, the migration
must not write live data. The narrow legacy Inspect/Plan artifact is preparation, not authorization.
