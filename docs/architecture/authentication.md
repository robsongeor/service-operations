# Authentication Architecture

## Overview

Service Operations separates delegated office-user authentication from anonymous bearer-link
workflows. Job-level technician links access private Azure snapshots/evidence without calling
Dataverse. Site Check links retain confidential application authentication to Dataverse.

## Management application

MSAL authenticates office users against Microsoft Entra ID. The browser requests delegated
Dataverse `user_impersonation` access and feature services call Dataverse with that token.
The active account is resolved through the shared authentication helpers; code must not
select an account by cached-array position.

Required public variables:

```text
VITE_MSAL_CLIENT_ID
VITE_MSAL_TENANT_ID
VITE_DATAVERSE_URL
```

### Management application roles

Optional Entra application-role enforcement supports three role values:

- `ServiceOperations.FullAccess` grants the normal management application.
- `ServiceOperations.JobCardAdmin` grants Job Card reviews plus Legacy Job Book and read-only
  Quotes, Equipment, Customers, Sites and Contacts, plus corrections-only managed Job access.
  `canCorrectJobDetails` permits equipment, Customer/Site, Contact, description and order/PO
  corrections through the existing Job drawer hosted by Job Book. It does not grant coordination.
  The approved exception is `canMoveEquipment`: both restricted roles can explicitly change the
  current Equipment Site during new Job Book entry. This does not enable `canEditEquipment` or
  master Customer/Site edits. `canCreateEquipmentDestination` additionally permits new Customer/
  first-Site creation within that location panel, without enabling `canEditCustomers`. Live
  Dataverse Create privileges remain separately approval-gated; see the
  [equipment move security boundary](equipment.md#equipment-location-during-job-creation).
- `ServiceOperations.JobBookOnly` grants only `/job-book`; FullAccess takes precedence if both
  claims are present.

Keep `VITE_APPLICATION_ACCESS_CONTROL_ENABLED=false` until the Entra application roles, assignments,
and matching least-privilege Dataverse roles have been configured and tested. When enforcement is
enabled, a signed-in account with neither application role receives Access Denied. Role claims own
navigation and feature visibility; Dataverse roles remain the authoritative data and mutation
boundary.

Development can simulate `full`, `job-card-admin`, `job-book-only`, or `denied` through
`VITE_SIMULATED_ACCESS_MODE`. The override is ignored by production builds and displays a persistent
warning because it validates application behaviour, not Dataverse security.

The Job Book-only route can create and edit staging Intake entries but never exposes the managed Job
editor. Once an entry is promoted, the row becomes a locked `Managed Job` summary for that access
mode. Only FullAccess renders `Open Job` and routes into the operational Jobs screen.
`canManageJobs` likewise grants the Intake-row **Manage job** preparation action only to
FullAccess (the current service-coordinator access profile), not either restricted role.
See [Job Book Intake](../features/JOB_BOOK_INTAKE_DESIGN.md#restricted-job-book-operators) for the
guarded entry point and still-disabled managed-Job creation boundary.

The Job Card Admin route set contains only Job Card reviews, Legacy Job Book, Quotes, Equipment,
and Customers. Quotes and master records stay read-only outside the existing narrow Intake location
exceptions. Admins can now correct managed Job details and the factual GT/Timecloud markers;
JobBookOnly cannot. Job number, type, status, service type, assignment, scheduling,
deletion and original technician submissions are protected. The address is derived from the
selected Site; Job correction does not edit a master Site or move Equipment.
`canEmailAssignedTechnician` separately allows Admins and FullAccess to email an already-numbered
managed Job from Job Book. Admin recipients are fixed to the assigned technician; allocation stays
coordinator-only. This does not enable Intake dispatch, the Jobs route, or additional assignments.
Email Dispatch Create/Read/relationship permissions and server-side assigned-recipient enforcement
must be verified in the approval-gated release; no live permission changes have been made.
These client capabilities are not an authorization substitute: the separately approved
least-privilege Dataverse role and Entra assignments remain required before enforcement is enabled.
Do not grant unrestricted Job Write and assume these client checks enforce column-level security.
Before release, validate server-side/Dataverse enforcement of the allowed correction columns and
relationship scope (field security or a server-owned allowlisted operation as appropriate). No live
role, privilege, assignment or environment setting was changed for this local implementation.

`VITE_DATAVERSE_URL` is the organisation origin without `/api/data/v9.2` or a trailing
slash. User preferences use the resolved account storage ID.

For the lightest silent-renewal callback, register
`https://<application-origin>/auth/silent.html` as a Single-page application redirect URI
in the Entra app registration and set:

```text
VITE_MSAL_SILENT_REDIRECT_URI=https://<application-origin>/auth/silent.html
```

The variable is optional. When it is absent, MSAL uses the already-registered application
origin and `main.tsx` prevents the React application from booting inside an iframe or popup
that contains an MSAL authorization response.

### Token acquisition and interaction rules

- Feature coordinators use the shared `acquireDataverseAccessToken` helper with the account
  resolved by `useActiveMsalAccount`. The helper performs `acquireTokenSilent` with the
  lightweight callback URI.
- A page-level load or mutation acquires once, then passes that bearer token to parallel
  feature-service calls. Child components and individual rows never acquire tokens.
- Concurrent callers should share an in-flight silent token promise where a common
  coordinator is available. MSAL remains responsible for token caching and renewal; the
  application must not add a second token cache.
- `loginRedirect` or a popup is allowed only from an explicit sign-in/reauthenticate action.
  Rendering, effects, background refresh, automatic retry, and Dataverse 401 handling must
  not start interactive authentication.
- An MSAL interaction-required or hidden-iframe timeout result is surfaced once through the
  global session-recovery dialog. Its user-invoked popup resolves the pending shared token
  request so the interrupted load or mutation continues without a page reload. Repeated
  service failures must not create a sign-in loop.
- Authenticated server workflows validate the caller once per server operation. Do not call
  `WhoAmI` once per child record.

These rules reduce both sign-in prompts and token/Dataverse traffic. They do not permit
sharing tokens between users, persisting bearer tokens outside MSAL, or bypassing expiry and
consent checks.

## Job-level Azure portal

Office generation reads a snapshot with the delegated bearer. Anonymous Job lookup, upload
and submission use Azure Table/Blob only. Review validates WhoAmI, then requires the authoritative
user email/domain name to match `JOB_CARD_REVIEWER_EMAILS`; missing configuration denies access.
`X-Dataverse-Authorization` carries delegated tokens through the Static Web Apps proxy.

## Site Check portal service

Anonymous browsers never receive Dataverse credentials. Server endpoints acquire a
client-credential token using:

```text
DATAVERSE_URL
DATAVERSE_TENANT_ID
DATAVERSE_CLIENT_ID
DATAVERSE_CLIENT_SECRET
```

These values are server-only and must never use the `VITE_` prefix. The confidential Entra
registration and Dataverse Application User are documented in
[Public Portal Service Identity](../public-portal-service-identity.md).

## Authenticated server actions

Office-only API actions, such as secure technician-link generation and Job lookup, require
the caller's Dataverse bearer token and validate it with `WhoAmI` before acting. An
anonymous Function trigger is not authorization by itself.

Chargeable Invoice PDF preview and import additionally perform a bounded Read probe against
`gr_chargeableinvoicereviews`. Dataverse therefore enforces the dedicated manager-role boundary;
a generally signed-in office user is not sufficient. The same delegated bearer token is used for
bounded exact Job, duplicate and revision reads and confirmed writes. The server never stores or
logs the bearer token or PDF outside the approved Dataverse Document File record.

The Chargeable Invoice queue and workspace use the same active MSAL account and silent delegated
token path as the rest of the office application. Dataverse directly enforces the unassigned
manager-role boundary for bounded Review/child reads, File downloads and ETag-protected Review +
Activity change sets. No interactive authentication is initiated by the feature hook or service.

Chargeable Invoice supporting-photo selection, metadata creation, File upload and finalisation use
the signed-in manager's delegated Dataverse token directly. The client validates image signatures
and limits before creating Pending Review Documents; Dataverse permissions remain the authorization
boundary. Files receive no anonymous URL, and only Complete documents are downloadable. Technician
photo requests use a validated `mailto:` URL that opens an editable local draft only; prepared-on
is not delivery proof.

Chargeable Invoice approval-PDF generation uses the same delegated bearer token through the
authenticated server endpoint. The endpoint performs one `WhoAmI` and bounded Review-table access
probe, then re-reads the current Review/Revision/Lines itself; browser-supplied commercial values
are never trusted. Dataverse remains the authorization and File-storage boundary.

The PO-request workspace reads only Site Contacts associated with the Review's authoritative
Site through the same delegated token. Recipient selection and email content remain browser-local.
Preparing the editable draft uses the Review ETag to record its timestamp and append Activity;
it neither calls a mail service nor proves send or delivery.

## Administrative and provisioning sessions

Existing schema scripts commonly create a `CrmServiceClient` with `LoginPrompt=Auto`. A
multi-step feature must not invoke several such scripts in sequence when that would create
separate sign-in attempts. Prefer one idempotent feature script with explicit Inspect,
Provision, and Verify modes; one invocation creates one service connection and reuses it for
metadata reads, writes, publish, and post-verification.

Read-only inspection must be the default before provisioning. Codex must not start an
auth-capable script for local investigation, and must obtain approval before the first live
session. A cancelled or failed interactive sign-in is returned to the user instead of being
automatically retried.

## Extension points

Additional anonymous portals need their own minimal server methods and privilege review;
prefer scoped snapshots where operational access is unnecessary. Do not reuse the SPA registration
for server credentials or introduce browser-accessible secrets.

## Related files

- [`../../src/auth/authConfig.ts`](../../src/auth/authConfig.ts)
- [`../../src/auth/signedInUser.ts`](../../src/auth/signedInUser.ts)
- [`../../src/auth/useActiveMsalAccount.ts`](../../src/auth/useActiveMsalAccount.ts)
- [`../../src/auth/dataverseAuthentication.ts`](../../src/auth/dataverseAuthentication.ts)
- [`../../api/services/jobSubmissionService.js`](../../api/services/jobSubmissionService.js)
- [Security](security.md)
- [Public portal](public-portal.md)
