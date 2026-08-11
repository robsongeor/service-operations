# Security Architecture

## Overview

Security is enforced through identity separation, least-privilege Dataverse roles, fixed
server payloads, safe errors, and explicit confirmation for consequential operations.

## Trust boundaries

- Office users authenticate with delegated MSAL access.
- Anonymous portal users possess only a bounded, one-time opaque token.
- Confidential Dataverse credentials exist only in the server process.
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

## Public Portal Service

The dedicated Application User has read access to the minimal Job, Equipment, Site, and
Customer projection; Job Write for the fixed submission fields; and the child-table
privileges required for time, materials, and photos. Dataverse permissions are table-scoped,
so `JobSubmissionService` is the application-level column allowlist.

Exact identifiers and privileges are documented in
[Public Portal Service Identity](../public-portal-service-identity.md).

## File handling

Job Photos use a Dataverse File column. The public browser sends validated supported image
data to the server; it receives no Dataverse file URL. Authenticated managers download
submitted photos through their delegated Dataverse access.

Chargeable Invoice preview accepts only an authenticated manager's PDF with a `.pdf` filename,
`application/pdf` media type, matching declared/decoded byte length, PDF signature, at most five
pages, bounded extracted text, and the approved 5 MiB limit. PDF.js runs server-side and returns
structured preview evidence; preview does not persist a file or Review. Confirmed import re-parses
the supplied bytes, rechecks exact Job/duplicate state, stages bounded metadata and uses ETag-
protected atomic finalisation after the File upload. Failed staging records contain only safe
error text and remain recoverable because managers have no Delete privilege. The endpoint remains
fail-closed unless both `CHARGEABLE_INVOICE_PREVIEW_ENABLED` and
`CHARGEABLE_INVOICE_MALWARE_SCANNING_READY` are explicitly `true`. The latter may be enabled only
after the deployed upload path's malware-scanning readiness has been verified and approved.

The review queue filters to Active imports before returning records. Workspace reads are bounded,
follow only same-origin Dataverse continuation links, and request only the six review tables plus
their approved reference display fields. Document File downloads use the manager's delegated
token, verify byte count against metadata, create a browser object URL only for the deliberate
download, and revoke it immediately after handoff. Review transitions require the loaded ETag and
append Activity atomically; they expose no Job write path.

Terminal Ready to Process performs a fresh bounded read for Outstanding/Not Made corrections
immediately before its ETag-protected Review transition. Terminal actions require an explicit
confirmation; Do Not Process additionally requires a non-empty reason. Extracted Order No is
display-only evidence and is never copied into the confirmed PO field by service or UI code.

## Security review triggers

Review this architecture before adding a new public route, credential, Application User,
table privilege, file type, anonymous response field, external integration, or destructive
automation.

## Related documents

- [Authentication](authentication.md)
- [Public portal](public-portal.md)
- [Dataverse](dataverse.md)
- [Deployment](deployment.md)
