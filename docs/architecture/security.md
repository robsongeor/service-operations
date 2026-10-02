# Security Architecture

## Overview

Security is enforced through identity separation, least-privilege Dataverse roles, fixed
server payloads, safe errors, and explicit confirmation for consequential operations.

## Trust boundaries

- Office users authenticate with delegated MSAL access.
- Anonymous portal users possess only a bounded, one-time opaque token.
- Storage and email credentials exist only in the server process.
- Dataverse remains authoritative for business records and relationship permissions.

## Core rules

- Never commit `.env`, Function settings, access tokens, client secrets, or customer
  debugging exports.
- Never expose server configuration through `VITE_` variables.
- Validate authenticated API callers with Dataverse `WhoAmI`.
- Store only cryptographic hashes of public submission tokens.
- Request and return only the fields required by the workflow.
- Do not weaken roles to work around development failures.
- Preserve historical records and require confirmation before destructive changes.

## Technician portal

The technician workflow has no Dataverse Application User. Only link generation reads the
minimum Dataverse projection through the licensed office user's delegated token. Public
requests operate on the stored Azure snapshot and fixed evidence schema.

## File handling

Photographs use a private Azure Blob container. Uploads are server-mediated, validated
before and after storage, and associated with the token hash. Authenticated managers stream
accepted evidence through an office-authenticated endpoint and receive no reusable public
Blob URL.

## Security review triggers

Review this architecture before adding a new public route, credential, Application User,
table privilege, file type, anonymous response field, external integration, or destructive
automation.

## Related documents

- [Authentication](authentication.md)
- [Public portal](public-portal.md)
- [Dataverse](dataverse.md)
- [Deployment](deployment.md)
