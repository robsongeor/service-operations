# Service Operations Knowledge Base

This directory is the authoritative technical knowledge base for Service Operations. Read
the smallest relevant document set for the task; do not rediscover established architecture
by scanning the repository.

## Start here

| Need | Read |
| --- | --- |
| Standard instructions for every Codex task | [`CODEX_PRE_PROMPT.md`](CODEX_PRE_PROMPT.md) |
| Project rules and document routing | [`../AI_CONTEXT.md`](../AI_CONTEXT.md) |
| Active branch, blockers, and deployment readiness | [`../CURRENT_STATE.md`](../CURRENT_STATE.md) |
| Prioritised product and technical backlog | [`../TODO.md`](../TODO.md) |
| System boundaries and document map | [`architecture/README.md`](architecture/README.md) |
| Dataverse conventions and relationships | [`architecture/dataverse.md`](architecture/dataverse.md) |
| Reusable UI and business-rule owners | [`architecture/reusable-components.md`](architecture/reusable-components.md) |
| Local development and validation | [`architecture/development-workflow.md`](architecture/development-workflow.md) |
| Deployment and environment configuration | [`architecture/deployment.md`](architecture/deployment.md) |

## Feature architecture

| Subsystem | Architecture | Detailed schema or workflow |
| --- | --- | --- |
| Site Checks (release validation) | [`features/SITE_CHECKS_IMPLEMENTATION_PLAN.md`](features/SITE_CHECKS_IMPLEMENTATION_PLAN.md) | [`features/SITE_CHECK_CHECKLIST_CONTENT_PROPOSAL.md`](features/SITE_CHECK_CHECKLIST_CONTENT_PROPOSAL.md) — unprovisioned checklist content proposal; [`site-checks-dataverse-schema.md`](site-checks-dataverse-schema.md) — provisioned and verified; [`site-checks-operations.md`](site-checks-operations.md) — release/smoke/rollback checklist |
| Jobs | [`architecture/jobs.md`](architecture/jobs.md) | [`job-card-dataverse-schema.md`](job-card-dataverse-schema.md), [`job-assignment-dataverse-schema.md`](job-assignment-dataverse-schema.md), [`email-dispatch-flow.md`](email-dispatch-flow.md) |
| Technician submission | [`architecture/technician-job-submission.md`](architecture/technician-job-submission.md) | [`technician-job-submission-schema.md`](technician-job-submission-schema.md), [`public-portal-service-identity.md`](public-portal-service-identity.md) |
| Equipment | [`architecture/equipment.md`](architecture/equipment.md) | [`hour-meter-recorded-date-schema.md`](hour-meter-recorded-date-schema.md) |
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
- [`architecture/public-portal.md`](architecture/public-portal.md)
- [`architecture/security.md`](architecture/security.md)
- [`architecture/deployment.md`](architecture/deployment.md)
- [`architecture/development-workflow.md`](architecture/development-workflow.md)

## Documentation standard

Architecture documents describe purpose, boundaries, workflows, data ownership, services,
UI, business rules, extension points, and related files. Detailed logical names and field
definitions belong in schema documents. Prioritised future work belongs in `TODO.md`,
temporary progress belongs in `CURRENT_STATE.md`, and release history belongs in
`CHANGELOG.md` or Git history.

When architecture changes:

1. Update the authoritative subsystem document.
2. Update a schema document only when the Dataverse contract changes.
3. Update `architecture/reusable-components.md` when a reusable component or rule owner
   changes.
4. Update `AI_CONTEXT.md` only for durable project-wide rules or document routing.
5. Avoid copying the same explanation into several documents; link to its owner.
