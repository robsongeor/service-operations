# Deployment Architecture

## Overview

The application is deployed as an Azure Static Web App with a managed Azure Functions API.
Deployment is separate from Dataverse provisioning.

## Pipeline

`.github/workflows/azure-static-web-apps-yellow-cliff-068680700.yml` builds and deploys pushes
to `v1-deployment`.

- Application source: `/`
- API source: `api`
- Client output: `dist`
- Public Vite configuration: GitHub Actions repository variables
- Server configuration: Static Web App / Function application settings

The workflow derives display version metadata from an exact Git tag or the current short
commit SHA.

## Configuration

Public build-time variables:

```text
VITE_MSAL_CLIENT_ID
VITE_MSAL_TENANT_ID
VITE_DATAVERSE_URL
```

Server-only portal variables:

```text
DATAVERSE_URL
DATAVERSE_TENANT_ID
DATAVERSE_CLIENT_ID
DATAVERSE_CLIENT_SECRET
```

Do not place the client secret in repository variables, source files, documentation, or
browser configuration.

## Dataverse provisioning

Schema scripts under `scripts/` are explicit administrative operations. Verify the target
environment, solution, logical names, compatibility, and idempotency before running them.
Application deployment does not implicitly provision Dataverse.

## Release workflow

1. Confirm schema and identity prerequisites.
2. Run tests, lint, build, and `git diff --check`.
3. Review the exact Git state and deployment branch.
4. Configure server settings through the authorised Azure administrative path.
5. Deploy through the established workflow.
6. Run a production-safe smoke test.

Do not deploy, provision, tag, or change production settings without explicit authorisation.

## Related files

- [`../../.github/workflows/azure-static-web-apps-yellow-cliff-068680700.yml`](../../.github/workflows/azure-static-web-apps-yellow-cliff-068680700.yml)
- [`../../api/host.json`](../../api/host.json)
- [Authentication](authentication.md)
- [Security](security.md)
