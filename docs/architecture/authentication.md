# Authentication Architecture

## Overview

Service Operations has two deliberately separate identity paths: delegated office-user
authentication for the management app and confidential application authentication for the
anonymous technician portal.

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

## Public portal service

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

Additional anonymous portals should reuse the confidential server boundary and receive
their own minimal service methods and privilege review. Do not reuse the SPA registration
for server credentials or introduce browser-accessible secrets.

## Related files

- [`../../src/auth/authConfig.ts`](../../src/auth/authConfig.ts)
- [`../../src/auth/signedInUser.ts`](../../src/auth/signedInUser.ts)
- [`../../src/auth/useActiveMsalAccount.ts`](../../src/auth/useActiveMsalAccount.ts)
- [`../../src/auth/dataverseAuthentication.ts`](../../src/auth/dataverseAuthentication.ts)
- [`../../api/services/jobSubmissionService.js`](../../api/services/jobSubmissionService.js)
- [Security](security.md)
- [Public portal](public-portal.md)
