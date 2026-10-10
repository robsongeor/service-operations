# Service Operations Knowledge Base

This directory is the authoritative technical knowledge base for Service Operations. Read
the smallest relevant document set for the task; do not rediscover established architecture
by scanning the repository.

## Start here

| Need | Read |
| --- | --- |
| Standard instructions for every Codex task | [`CODEX_PRE_PROMPT.md`](CODEX_PRE_PROMPT.md) |
| Project rules and document routing | [`../AI_CONTEXT.md`](../AI_CONTEXT.md) |
| Source audit: readiness, defects and refactor opportunities | [`reviews/2026-10-10-application-audit.md`](reviews/2026-10-10-application-audit.md) |
| Job Card review screens, tracking/recovery gaps and next work | [`reviews/2026-10-10-job-card-review.md`](reviews/2026-10-10-job-card-review.md) |
| Local office-approved meters, recovery implementation and activation gates | [`reviews/2026-10-10-job-card-implementation.md`](reviews/2026-10-10-job-card-implementation.md) |
| Dedicated Job Card meter identity, guard rollout and rollback | [`job-card-meter-writer-rollout.md`](job-card-meter-writer-rollout.md) |
| Obsolete features, dependencies and safe-removal checks | [`architecture/retirement-plan.md`](architecture/retirement-plan.md) |
| Active branch, blockers, and deployment readiness | [`../CURRENT_STATE.md`](../CURRENT_STATE.md) |
| Prioritised product and technical backlog | [`../TODO.md`](../TODO.md) |
| System boundaries and document map | [`architecture/README.md`](architecture/README.md) |
| Dataverse conventions and relationships | [`architecture/dataverse.md`](architecture/dataverse.md) |
| Core Dataverse table and lookup map | [`dataverse-core-schema.md`](dataverse-core-schema.md) |
| Loading, caching, realtime, and multi-user synchronization | [`architecture/data-loading-and-synchronization.md`](architecture/data-loading-and-synchronization.md) |
| Reusable UI and business-rule owners | [`architecture/reusable-components.md`](architecture/reusable-components.md) |
| Local development and validation | [`architecture/development-workflow.md`](architecture/development-workflow.md) |
| Deployment and environment configuration | [`architecture/deployment.md`](architecture/deployment.md) |
| Sanitized PDF development templates | [`templates/README.md`](templates/README.md) |

## User guides

End-user tutorials are authored under [`wiki/`](wiki/) and published to the GitHub Wiki. The Wiki
is intentionally task-focused; this knowledge base remains authoritative for architecture, schema,
security, rollout and operational controls.

- [`wiki/Getting-Started-and-Signing-In.md`](wiki/Getting-Started-and-Signing-In.md)
- [`wiki/Job-Book-Admin-Guide.md`](wiki/Job-Book-Admin-Guide.md)

## Job Book rollout

For replacing the Excel job books, use the owner-facing [rollout plan](features/JOB_BOOK_ROLLOUT_PLAN.md):
user access, engineering prerequisites, acceptance checks, migration rehearsal, cutover and rollback.
The [user access plan](features/JOB_BOOK_ACCESS_PLAN.md) owns the agreed roles and intended account roster.
The [Microsoft access audit](features/JOB_BOOK_ACCESS_AUDIT.md) records live read-only findings and required changes.

## Feature architecture

| Subsystem | Architecture | Detailed schema or workflow |
| --- | --- | --- |
| Site Checks (release validation) | [`features/SITE_CHECKS_IMPLEMENTATION_PLAN.md`](features/SITE_CHECKS_IMPLEMENTATION_PLAN.md) | [`features/SITE_CHECK_CHECKLIST_CONTENT_PROPOSAL.md`](features/SITE_CHECK_CHECKLIST_CONTENT_PROPOSAL.md) — unprovisioned checklist content proposal; [`site-checks-dataverse-schema.md`](site-checks-dataverse-schema.md) — provisioned and verified; [`site-checks-operations.md`](site-checks-operations.md) — release/smoke/rollback checklist |
| Jobs | [`architecture/jobs.md`](architecture/jobs.md) | [`job-description-schema.md`](job-description-schema.md), [`job-card-dataverse-schema.md`](job-card-dataverse-schema.md), [`job-assignment-dataverse-schema.md`](job-assignment-dataverse-schema.md), [`email-dispatch-flow.md`](email-dispatch-flow.md) |
| Regional Job Books (build complete; migration pending) | [`features/JOB_BOOK_INTAKE_DESIGN.md`](features/JOB_BOOK_INTAKE_DESIGN.md) | [`features/REGIONAL_JOB_BOOKS.md`](features/REGIONAL_JOB_BOOKS.md) — separate tables, release gates, migration, and cutover seeding |
| Unified Job registration (V2 build enabled; acceptance gaps) | [`features/JOB_BOOK_INTAKE_DESIGN.md#transactional-registration-implementation-local-only`](features/JOB_BOOK_INTAKE_DESIGN.md#transactional-registration-implementation-local-only) | [`../dataverse/job-registration/contract.json`](../dataverse/job-registration/contract.json) — behavioural contract; [`unified-job-workflow-dataverse-rollout.md`](unified-job-workflow-dataverse-rollout.md) — metadata readiness; [`unified-job-workflow-migration-and-security.md`](unified-job-workflow-migration-and-security.md) — historical migration and role review; [`unified-job-workflow-deployment-package.md`](unified-job-workflow-deployment-package.md) — staged deployment procedure and rollback; [`unified-job-workflow-signing-key.md`](unified-job-workflow-signing-key.md) — private-key custody requirements |
| Staff | [`architecture/staff-directory.md`](architecture/staff-directory.md) | [`staff-directory-dataverse-schema.md`](staff-directory-dataverse-schema.md) — recorded schema provisioning; verify deployed artifact and role access |
| Technician submission | [`architecture/technician-job-submission.md`](architecture/technician-job-submission.md) | [`azure-job-card-storage.md`](azure-job-card-storage.md), [`technician-job-submission-schema.md`](technician-job-submission-schema.md) (legacy/Site Checks) |
| Job Card Admin Review (implemented; release validation required) | [`features/JOB_CARD_ADMIN_REVIEW_IMPLEMENTATION_PLAN.md`](features/JOB_CARD_ADMIN_REVIEW_IMPLEMENTATION_PLAN.md) | Open jobs / Submitted / Review / Completed, office notes/audit, ETag concurrency, and restricted administrator routing; recorded role/guard deployment does not replace named-user acceptance |
| Equipment | [`architecture/equipment.md`](architecture/equipment.md) | [`equipment-alternate-fleet-number-schema.md`](equipment-alternate-fleet-number-schema.md), [`hour-meter-recorded-date-schema.md`](hour-meter-recorded-date-schema.md), [`hour-meter-reading-classification-schema.md`](hour-meter-reading-classification-schema.md) — hour-meter classification columns provisioned and locally enabled; completion smoke pending |
| Equipment Map | [`architecture/equipment-map.md`](architecture/equipment-map.md) | Reuses current Site address; no Dataverse schema change |
| Job Map | [`architecture/job-map.md`](architecture/job-map.md) | Operational Jobs grouped by recorded Site; reuses Equipment Map geocoding |
| Maintenance | [`architecture/maintenance.md`](architecture/maintenance.md) | [`maintenance-programmes-dataverse.md`](maintenance-programmes-dataverse.md), [`site-maintenance-settings-schema.md`](site-maintenance-settings-schema.md) |
| Customers | [`architecture/customer-dashboard.md`](architecture/customer-dashboard.md) | [`purchase-order-recipient-schema.md`](purchase-order-recipient-schema.md); Site and Equipment schemas linked from their owning documents |
| Scheduler | [`architecture/scheduler.md`](architecture/scheduler.md) | Job scheduling relationships are documented with Jobs |
| WOF/REGO | [`architecture/wof.md`](architecture/wof.md) | [`wof-dataverse-schema.md`](wof-dataverse-schema.md) |
| Quotes and pricing | [`architecture/quotes.md`](architecture/quotes.md) | [`quotes-dataverse-schema.md`](quotes-dataverse-schema.md) |
| Chargeable Invoice Review (release validation pending) | [`features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md`](features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md) | [`chargeable-invoice-review-dataverse-schema.md`](chargeable-invoice-review-dataverse-schema.md) — provisioned schema and unassigned role; [`chargeable-invoice-review-operations.md`](chargeable-invoice-review-operations.md) — release/smoke/rollback checklist |

## Cross-cutting architecture

- [`architecture/authentication.md`](architecture/authentication.md)
- [`architecture/routing.md`](architecture/routing.md)
- [`architecture/shared-components.md`](architecture/shared-components.md)
- [`architecture/shared-services.md`](architecture/shared-services.md)
- [`architecture/data-loading-and-synchronization.md`](architecture/data-loading-and-synchronization.md)
- [`architecture/public-portal.md`](architecture/public-portal.md)
- [`architecture/security.md`](architecture/security.md)
- [`architecture/deployment.md`](architecture/deployment.md)
- [`architecture/development-workflow.md`](architecture/development-workflow.md)

## Documentation standard

Architecture documents describe purpose, boundaries, workflows, data ownership, services,
UI, business rules, extension points, and related files. Detailed logical names and field
definitions belong in schema documents. Prioritised future work belongs in `TODO.md`,
current status belongs in `CURRENT_STATE.md`, and release history belongs in
`CHANGELOG.md` or Git history.

Dated plans and checked-off implementation phases are historical delivery evidence, not blanket
claims that the current build is ready. The current audit identifies behavior that does not yet
satisfy the intended architecture; do not rewrite an intended rule to hide a defect. Label source
configuration, recorded deployment and live acceptance separately.

When architecture changes:

1. Update the authoritative subsystem document.
2. Update a schema document only when the Dataverse contract changes.
3. Update `architecture/reusable-components.md` when a reusable component or rule owner
   changes.
4. Update `AI_CONTEXT.md` only for durable project-wide rules or document routing.
5. Avoid copying the same explanation into several documents; link to its owner.
