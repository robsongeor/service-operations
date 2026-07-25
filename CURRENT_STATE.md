# Current State

This file is intentionally temporary working context. Update or replace it as active work,
blockers, Dataverse readiness, and the recommended next task change. Do not move this state
into `AI_CONTEXT.md`.

Branch: `tech-job-cards-submission`

## Active work

- Technician Job Card Submission Phase 1 is implemented on
  `tech-job-cards-submission` and awaits production deployment.
- `/portal/job/:token` is a public, mobile-first route outside the management-app login and
  navigation shell.
- The server endpoint validates hashed expiring tokens, returns a minimal Job projection,
  and saves pending story/hour-meter values with ETag replay protection.
- The endpoint delegates token validation, public lookup, validation, and persistence to the
  reusable server-side `JobSubmissionService`.
- Submission moves Job Card Status to Submitted but leaves operational Job Status,
  Completed Date, Equipment hour meter, maintenance, and assignments unchanged.
- An authenticated endpoint action generates submission links. Email integration remains
  out of scope.

## Dataverse state

- Microsoft Entra registration `Service Operations Public Portal` was created and verified
  on 25 July 2026. Client ID: `dfad95a1-0541-47f0-b599-cb09b7181c72`; application Object ID:
  `72b93428-33fb-4f59-84cd-5c6c53e350a3`. It is single-tenant with no redirect URI,
  platform, public-client flow, credential, or configured API permission.
- The corresponding Dataverse Application User was created and verified on 25 July 2026.
  Its system user ID is `4322873e-ce87-f111-ab10-0022489917ff`, its Power Platform-derived
  display name is `# Service Operations Public Portal`, and it belongs to Business Unit
  `org0d4246d7`. It is enabled and unlicensed.
- The dedicated `Public Portal Service` role (`3b0845b7-ceb7-48c6-8cf2-a8dd90a20850`) is the
  Application User's only assigned role. It grants organisation Job Read/Write and
  organisation read-only access to Equipment, Site, and Customer. Job Create, Delete,
  Assign, Share, Append, and Append To are absent. Dataverse also supplied its standard
  platform minimum privileges for SDK/plugin metadata and SharePoint integration.
- Role-scoped impersonation verified read access to Job, Equipment, Site, and Customer.
- One confidential credential named `Public Portal Dataverse Server Credential` was
  created on 25 July 2026 and expires on 21 January 2027. Its value is stored outside the
  repository in Windows Credential Manager and must be rotated before expiry.
- Real client-credential authentication resolved to the expected Dataverse Application
  User. Allowed reads and the fixed submission workflow succeeded; denied table writes,
  Job delete, and unrelated Quote access returned `403`. The repeated submission was
  rejected and the reversible test Job's original submission fields were restored.
- The seven Technician Job Card Submission columns were provisioned, published, verified,
  and passed a second idempotency run on 25 July 2026.
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

- Production server environment variables are not configured and the portal/API is not
  deployed.
- The current Azure account has Reader access to the `ServiceOps` Static Web App, so its
  production environment variables cannot be changed until Contributor access is granted.

## Next task

After Azure Contributor access propagates, configure the four server-only Dataverse
environment variables in `ServiceOps`, deploy through the established `v1-deployment`
workflow, and run a production-safe portal smoke test. Do not expose the credential through
Vite or browser configuration.
