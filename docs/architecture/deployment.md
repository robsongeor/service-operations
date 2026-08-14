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
VITE_MSAL_SILENT_REDIRECT_URI (optional)
VITE_HOUR_METER_CLASSIFICATION_ENABLED (optional; default false)
```

When `VITE_MSAL_SILENT_REDIRECT_URI` is configured, its exact
`https://<application-origin>/auth/silent.html` value must also be registered as a
Single-page application redirect URI in Microsoft Entra.

The Job `gr_hourmeterreadingtype` Choice and `gr_hourmeterrecordeddate` Date Only column were
provisioned and structurally verified in the target Dataverse environment on 14 August 2026. Local
development may set `VITE_HOUR_METER_CLASSIFICATION_ENABLED=true`; keep deployed settings unchanged
until manager read/write and Actual/Estimated completion smoke testing passes. A build with the flag
disabled continues to omit both columns.

Server-only portal variables:

```text
DATAVERSE_URL
DATAVERSE_TENANT_ID
DATAVERSE_CLIENT_ID
DATAVERSE_CLIENT_SECRET
```

Equipment Map geocoding uses one additional server-only setting:

```text
GEOAPIFY_API_KEY
```

Without this setting, the page shows a safe configuration warning and address markers remain
unavailable. Create and restrict the provider key separately; never expose it through a `VITE_`
variable. `VITE_EQUIPMENT_MAP_TILE_URL` may optionally select a different Leaflet raster-tile template;
it is a public URL, not a credential.

Chargeable Invoice File-write release gates are server-only and default to disabled:

```text
CHARGEABLE_INVOICE_PREVIEW_ENABLED
CHARGEABLE_INVOICE_APPROVAL_ENABLED
```

Authenticated bounded PDF preview and Job lookup are read-only and do not require these flags.
Despite its legacy name, `CHARGEABLE_INVOICE_PREVIEW_ENABLED` gates confirmed import and source
File persistence. Do not set either flag to `true` as part of ordinary deployment. Enable the
relevant File-write path only after manager role assignments and its target-environment smoke are
approved. V1 deliberately has no malware-scanning setting or integration. The API package installs
`pdfjs-dist` and `pdf-lib`; dependency installation is required when the managed Function build
runs. Vite's local approval middleware loads that API service only when a development/preview
server is configured, so the root production build does not require or duplicate API-only PDF
packages before Azure builds the managed Functions directory. The managed Functions build uses
Node 20. `pdfjs-dist` is therefore pinned exactly to `5.4.624`, which supports Node 20.16+ and is
outside the high-severity advisory range affecting `>=5.6.83 <6.2.108`; do not float this package
without rechecking the Azure runtime, package engine and audit result together.

Approval generation additionally requires `CHARGEABLE_INVOICE_APPROVAL_ENABLED=true`. Leave it
false until the generated-PDF File path and manager-role smoke have passed in the target
environment. Enabling import does not enable approval generation.

Do not enable confirmed import until the approved Review Import Status and Document Upload
Status/Error columns have been provisioned and verified. The deployed smoke must cover a
de-identified new import, duplicate revision decision, failed-upload recovery and manager denial;
it must not send a real customer communication.

The authoritative release gates, de-identified smoke matrix and non-destructive rollback order are
maintained in [`../chargeable-invoice-review-operations.md`](../chargeable-invoice-review-operations.md).

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
