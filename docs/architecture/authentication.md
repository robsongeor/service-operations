# Authentication Architecture

## Overview

Service Operations uses delegated office-user authentication for management and office-only
server actions. Anonymous technician requests are authorised only by a hashed, expiring
capability token and have no Dataverse identity.

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

## Technician portal

Anonymous browser requests use only the opaque technician token. The server resolves its
hash in Azure Table Storage and stores photos in a private Blob container. It does not use
`DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`, or `DATAVERSE_CLIENT_SECRET`.

## Authenticated server actions

Office-only API actions, including snapshot generation and review, require the caller's
Dataverse bearer token and validate it with `WhoAmI`. Snapshot generation reads Dataverse
with that same delegated token. An anonymous Function trigger is not authorization.

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
