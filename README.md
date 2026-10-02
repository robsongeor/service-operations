# Service Operations

Service Operations coordinates forklift and materials-handling work across Customers, Sites,
Equipment, Jobs, scheduling, maintenance, Quotes, WOF/REGO, and technician submissions. It
is a React and TypeScript application backed by Microsoft Dataverse.

## Architecture at a glance

```text
Customer → Site → Equipment → Job
                         ├── Schedule / Assignment
                         ├── Job Card / Technician Submission
                         ├── Quote
                         └── Maintenance / WOF history
```

The authenticated management application uses Microsoft Entra ID and delegated Dataverse
access. Anonymous technician links use Azure Table Storage and private Blob Storage through
the server API; technician requests have no Dataverse identity or access.

## Documentation

Start with the [knowledge base](docs/README.md). It maps each feature to one authoritative
architecture document and its detailed schema references.

Common starting points:

- [Architecture overview](docs/architecture/README.md)
- [Jobs](docs/architecture/jobs.md)
- [Technician Job Card Submission](docs/architecture/technician-job-submission.md)
- [Equipment and maintenance](docs/architecture/equipment.md)
- [Customer Dashboard](docs/architecture/customer-dashboard.md)
- [Scheduler](docs/architecture/scheduler.md)
- [WOF/REGO](docs/architecture/wof.md)
- [Reusable components](docs/architecture/reusable-components.md)
- [Development workflow](docs/architecture/development-workflow.md)
- [Deployment](docs/architecture/deployment.md)

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

The public Technician Job Card route is `/portal/job/:token`. `.env.example` enables the
in-memory/no-email local adapter so portal API tests do not require live Azure or Dataverse.
Production Azure resources, settings, retention, and cost controls are documented in
[Azure Job Card Storage](docs/azure-job-card-storage.md). Never enable
`JOB_CARD_LOCAL_DEVELOPMENT` in Azure or expose server settings through `VITE_` variables.

## Validation

```powershell
npm test
npm run lint
npm run build
git diff --check
```

See [Development Workflow](docs/architecture/development-workflow.md) for task setup,
documentation ownership, and administrative-action rules.
