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

## Extension points

Additional anonymous portals should reuse the confidential server boundary and receive
their own minimal service methods and privilege review. Do not reuse the SPA registration
for server credentials or introduce browser-accessible secrets.

## Related files

- [`../../src/auth/authConfig.ts`](../../src/auth/authConfig.ts)
- [`../../src/auth/signedInUser.ts`](../../src/auth/signedInUser.ts)
- [`../../src/auth/useActiveMsalAccount.ts`](../../src/auth/useActiveMsalAccount.ts)
- [`../../api/services/jobSubmissionService.js`](../../api/services/jobSubmissionService.js)
- [Security](security.md)
- [Public portal](public-portal.md)
