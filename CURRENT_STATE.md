# Current State

This file is intentionally temporary working context. Update or replace it as active work,
blockers, Dataverse readiness, and the recommended next task change. Do not move this state
into `AI_CONTEXT.md`.

Branch: `codex/wof-rego-improvements-and-bug-fixes`

## Active work

- WOF Management is implemented in the working tree and is not committed.
- The WOF screen now derives a lifecycle status for each road-registered Equipment record,
  opens the shared Job creation drawer with WOF context prefilled, opens existing work in
  the manager-facing Job drawer without leaving WOF Management, and exposes the office
  expiry-update action.
- WOF creation performs a final Dataverse duplicate check so only one unfinished cycle can
  exist for an Equipment record.
- Saving a new WOF expiry now updates the authoritative Equipment expiry and returns the
  record to normal monitoring.
- Customer Dashboard Site sections can transfer multiple existing Equipment records using
  the shared drawer and confirmation patterns. Transfers update only the current Equipment
  Site, report partial failures, and retain failed machines for retry. The shared searchable
  selector supports multi-selection and the drawer keeps a removable Equipment summary
  visible before confirmation.

## Dataverse state

- The nine maintenance configuration columns were provisioned and published in the
  `ServiceOperationsNew` solution on 24 July 2026.
- All 189 existing Equipment records were safely backfilled to ICE Standard + Standard.
- Power Type remains unset pending an authoritative classification source.
- Application deployment of the current uncommitted work is not confirmed.

## Important rules

- Service Programme and Maintenance Profile are separate.
- ICE uses A/B/C; Electric uses A/C.
- Fixed hour intervals are A 250, B 1,000, C 2,000.
- Missing configuration falls back to Standard Profile + ICE Standard Programme.
- Historical B records and inactive plan history must remain preserved.
- Service completion must continue through the atomic completion workflow.

## Current blockers

- End-to-end smoke testing against the live Dataverse environment is still required,
  including duplicate protection and in-place Job drawer saves from WOF Management.

## Next task

Smoke test the WOF lifecycle against Dataverse, review the resulting UI with office users,
then commit only when explicitly requested.
