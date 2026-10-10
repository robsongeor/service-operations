# Service Operations

Service Operations coordinates forklift and materials-handling work across Customers, Sites,
Equipment, Jobs, scheduling, maintenance, Quotes, WOF/REGO, and technician submissions. It
is a React and TypeScript application backed by Microsoft Dataverse.

## Architecture at a glance

Customer owns Sites; Equipment belongs to its current Site. A Job records its own operational
Site and may optionally reference Equipment. Moving Equipment does not rewrite historical Jobs.

The office application uses Microsoft Entra ID and delegated Dataverse access. Anonymous
Job-level cards use private Azure snapshots/evidence without Dataverse access. Site Check
assignment links retain their separate server-side Dataverse Application User workflow.
GreenTree account references remain separate from operational Customer/Site relationships.

## Documentation

Start with the [knowledge base](docs/README.md). It maps each feature to one authoritative
architecture document and its detailed schema references.

Common starting points:

- [Architecture overview](docs/architecture/README.md)
- [Jobs](docs/architecture/jobs.md)
- [Technician Job Card Submission](docs/architecture/technician-job-submission.md)
- [Equipment and maintenance](docs/architecture/equipment.md)
- [Customer Dashboard](docs/architecture/customer-dashboard.md)
- [Site Checks release tracker](docs/features/SITE_CHECKS_IMPLEMENTATION_PLAN.md)
- [Scheduler](docs/architecture/scheduler.md)
- [WOF/REGO](docs/architecture/wof.md)
- [Reusable components](docs/architecture/reusable-components.md)
- [Development workflow](docs/architecture/development-workflow.md)
- [Deployment](docs/architecture/deployment.md)

The [10 October audit](docs/reviews/2026-10-10-application-audit.md) records current risks,
feature readiness and refactor opportunities. Follow the [release gates](RELEASE_READINESS.md)
before broad rollout and the [retirement runbook](docs/architecture/retirement-plan.md)
before deleting compatibility features.

`AI_CONTEXT.md` contains durable project rules. `CURRENT_STATE.md` contains only active
branch, readiness, blockers, and unfinished work.

## Local development

Requirements:

- Node.js and npm
- access to the Microsoft Entra tenant and Dataverse environment
- an `.env` containing the public Vite values from `.env.example`

Install and start:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

The public Technician Job Card route is `/portal/job/:token`. Configure its Azure Table/Blob
storage according to [Azure Job Card Storage](docs/azure-job-card-storage.md).
Confidential `DATAVERSE_*` credentials are needed by the separate Site Check/application-identity
flows, not anonymous Azure Job Card requests. See [Authentication](docs/architecture/authentication.md).
Never expose confidential values through `VITE_` variables or commit secrets.

## Validation

```powershell
npm test
npm run lint
npm run build
git diff --check
```

See [Development Workflow](docs/architecture/development-workflow.md) for task setup,
documentation ownership, and administrative-action rules.
