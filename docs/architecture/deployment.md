# Deployment Architecture

## Overview

The application is deployed as an Azure Static Web App with a managed Azure Functions API.
Deployment is separate from Dataverse provisioning.

## Pipeline

There are two frontend deployment workflows, not one:

| Branch | Workflow / destination |
| --- | --- |
| `v1-deployment` | `azure-static-web-apps-yellow-cliff-068680700.yml` / V1 |
| `v2-deployment` | `azure-static-web-apps-kind-wave-0cdea2200.yml` / V2 |

Both explicitly build on Node 20 with `npm ci` and `npm run build`, upload `dist` with
`skip_app_build: true`, and deploy managed API source from `api`. V1 version metadata uses
a tag/SHA; V2 labels its short SHA as a V2 Pilot. Server settings remain separate from public build-time flags.

### V2 configuration in source (10 October 2026)

| Setting | Workflow value |
| --- | --- |
| `VITE_APPLICATION_ACCESS_CONTROL_ENABLED` | `true` |
| `VITE_UNIFIED_JOB_REGISTRATION_ENABLED` | `true` |
| `VITE_UNIFIED_JOB_WORKFLOW_ENABLED` | `true` |
| Regional-book and regional-allocation flags | `false` |
| `VITE_JOB_CARD_SHARED_BACKEND` | `v1-production` |
| `VITE_EQUIPMENT_REALTIME_API_URL` | Empty |
| External-supplier / hour-meter classification flags | Not enabled by this workflow; default false |

This table describes the workflow, **not a fresh observation of the deployed artifact**.
Local `.env` values do not automatically change a hosted build. Rebuild when changing Vite flags.
The readiness manifest's flag-off status is stale relative to these build settings; reconcile
manifest/tests and deployed evidence before treating it as approval.

The workflows currently build without enforcing the full test/lint/plugin policy gates.
The initial audit failures have been repaired locally; see
[release readiness](../../RELEASE_READINESS.md). Add CI gates before broader rollout.

Do not enable registered numbering invariant guards, retire V1, or toggle all feature switches
together: V1 and V2 share backend dependencies. Capture exact artifact/configuration and rollback
before changing cloud resources. [Retirement checks](retirement-plan.md) cover those dependencies.

## Configuration

Public build-time variables:

```text
VITE_MSAL_CLIENT_ID
VITE_MSAL_TENANT_ID
VITE_DATAVERSE_URL
VITE_MSAL_SILENT_REDIRECT_URI (optional)
VITE_HOUR_METER_CLASSIFICATION_ENABLED (optional; default false)
VITE_EXTERNAL_SUPPLIER_ASSIGNMENT_ENABLED (optional; default false)
```

When `VITE_MSAL_SILENT_REDIRECT_URI` is configured, its exact
`https://<application-origin>/auth/silent.html` value must also be registered as a
Single-page application redirect URI in Microsoft Entra.

The Job `gr_hourmeterreadingtype` Choice and `gr_hourmeterrecordeddate` Date Only column were
provisioned and structurally verified in the target Dataverse environment on 14 August 2026. Local
development may set `VITE_HOUR_METER_CLASSIFICATION_ENABLED=true`; keep deployed settings unchanged
until manager read/write and Actual/Estimated completion smoke testing passes. A build with the flag
disabled continues to omit both columns.

Keep `VITE_EXTERNAL_SUPPLIER_ASSIGNMENT_ENABLED=false` until the
`gr_job.gr_externalsupplierdetails` Memo column, `ExternalSupplierDetails` input on
`gr_RegisterJobBookJob`, and the matching signed registration and restricted-access plugins have
all been deployed and verified. The disabled build hides Other supplier and omits the new field
from Dataverse selects, filters and writes, so frontend deployment may safely precede the backend
release. Enabling the flag is the final cutover step and requires a new frontend build.

New job-level Job Cards use the resources/settings templates documented in
[Azure Job Card Storage](../azure-job-card-storage.md). Deploy resources and backend
configuration before the API/client cutover. Keep existing settings for Site Checks.

### Temporary V2 Job Card backend bridge

The V2 pilot currently sets `VITE_JOB_CARD_SHARED_BACKEND=v1-production`. Marked Job Card
requests received by V2's managed `/api/jobsubmission` and `/api/jobcardreviews` endpoints are
forwarded server-to-server to the fixed V1 production Static Web App origin. V1 therefore remains
the source of truth for Job Card links, private storage, technician submissions, photos, email,
review queues and office review actions while the bridge is enabled. The bridge forwards only the
delegated Dataverse bearer token and bounded request data; it does not forward browser cookies,
standard authorization headers, origins or caller-selected destinations. Do not retire V1 or its
Job Card resources during this period.

The 11 October V2 release keeps this bridge and explicitly disables meter approval and cursor
queue flags. New review controls require the authoritative detail response's boolean
`officeRecoveryAvailable`; public meter-date entry requires `meterRecordedDateAvailable`.
Missing/false capabilities hide the new actions/field, while existing completion, follow-up,
PDF and photo downloads continue using the legacy contract. The proxy accepts the new bounded
query keys for a future compatible shared-backend upgrade; it does not implement those operations
itself. Publishing V2 does not publish the new services to V1 or deploy the Dataverse meter guard.

This bridge is an interim rollout measure, not the permanent architecture. Before it can be
removed, provision the equivalent settings on V2 or on a dedicated shared Job Card backend:

```text
DATAVERSE_URL
DATAVERSE_TENANT_ID
DATAVERSE_CLIENT_ID
DATAVERSE_CLIENT_SECRET
AZURE_STORAGE_CONNECTION_STRING
JOB_CARD_STORAGE_MODE=azure
JOB_CARD_TABLE_NAME
JOB_CARD_PHOTO_CONTAINER
ACS_EMAIL_CONNECTION_STRING
ACS_EMAIL_SENDER
JOB_CARD_REVIEW_EMAIL_TO
JOB_CARD_REVIEWER_EMAILS
APP_PUBLIC_URL
```

New Office Admin Job Book registrations can temporarily remain without `gr_jobtype`. The Job Card
backend accepts that interim state without inventing a Job Type or requiring a service hour meter.
This compatibility does not replace the planned Office Admin Job Type selection: the owner will
confirm an expanded category list, the categories must then be provisioned, and Job Type must become
a required Office Admin entry field. Job Status is a separate control and is not implied by this
requirement.

After provisioning, run the production-safe Job Card smoke covering link generation, public
lookup, submission, photo storage/download, email, manager review and replay rejection. Only after
that smoke passes should `VITE_JOB_CARD_SHARED_BACKEND` be removed from the V2 deployment workflow,
V2 redeployed and verified, and the proxy code retired. Provisioning, setting changes and bridge
retirement remain separately approved production operations.

Server-only Site Check / legacy portal variables:

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

Without this setting, the page shows a safe configuration warning, address markers remain
unavailable, and the default same-origin map-tile proxy returns a safe configuration error. Create
and restrict the provider key separately; never expose it through a `VITE_` variable.
`VITE_EQUIPMENT_MAP_TILE_URL` may optionally select a different public Leaflet raster-tile template;
never put a provider credential in that browser-visible value.

The managed address-search and Equipment Map APIs prefer the server-side `DATAVERSE_URL` setting.
Because this repository is dedicated to the Liftrucks tenant and Azure Static Web Apps does not pass
Vite build variables into its managed API runtime, those APIs use the fixed, non-secret Liftrucks
Dataverse origin when the setting is absent. An explicitly configured but invalid URL still fails
closed. `GEOAPIFY_API_KEY` has no fallback and must remain a server-only Static Web App setting.

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
