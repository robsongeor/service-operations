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
access. Anonymous technician links use a server API and a separate least-privilege
Dataverse Application User.

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

The public Technician Job Card route is `/portal/job/:token`. Its local server process also
requires the confidential `DATAVERSE_*` settings described in
[Authentication](docs/architecture/authentication.md). Never expose those values through
`VITE_` variables or commit secrets.

## Validation

```powershell
npm test
npm run lint
npm run build
git diff --check
```

See [Development Workflow](docs/architecture/development-workflow.md) for task setup,
documentation ownership, and administrative-action rules.
