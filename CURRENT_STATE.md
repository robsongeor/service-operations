# Current State

This file is intentionally temporary working context. Update or replace it as active work,
blockers, Dataverse readiness, and the recommended next task change. Do not move this state
into `AI_CONTEXT.md`.

Branch: `codex/equipment-road-compliance`

## Active work

- Equipment Maintenance Profiles and Service Programmes are implemented in the working
  tree but are not committed.
- The work spans Equipment configuration and plan calculations, Job creation/editing and
  completion, Customer Dashboard Equipment data, and WOF Equipment integration.
- Related documentation and the idempotent provisioning script are:
  `docs/maintenance-programmes-dataverse.md` and
  `scripts/setup-maintenance-programmes-schema.ps1`.
- `AI_CONTEXT.md` and `CHANGELOG.md` also have uncommitted edits. Preserve all current
  working-tree changes.

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

- Authoritative Power Type data is required before classifying existing Equipment as
  Electric. Do not infer it from names, makes, models, descriptions, or meter data.
- End-to-end smoke testing against the provisioned Dataverse environment is still required
  before deployment.

## Next task

Validate the current maintenance-programme implementation, run focused Dataverse smoke
tests, then run the repository test, build, lint, diff-check, and status checks. Review the
result before committing or deploying.
