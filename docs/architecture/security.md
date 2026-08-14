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

## Equipment Map external boundary

The authenticated Equipment Map sends current Site address text to Geoapify only through the
server `/api/equipmentgeocode` route. The server validates the office user's delegated Dataverse
token with `WhoAmI`, bounds and deduplicates the request, restricts lookup to New Zealand, rate
limits provider calls, and returns only Site IDs, submitted addresses, coordinates, and bounded
formatted addresses. `GEOAPIFY_API_KEY` is server-only and is never logged or returned. Safe errors
contain neither upstream response bodies nor Site addresses. OpenStreetMap receives ordinary map-tile
requests from the browser but no Dataverse token or Site address payload.

Chargeable Invoice preview accepts only an authenticated manager's PDF with a `.pdf` filename,
`application/pdf` media type, matching declared/decoded byte length, PDF signature, at most five
pages, bounded extracted text, and the approved 5 MiB limit. PDF.js runs server-side and returns
structured preview evidence; preview does not persist a file or Review. Confirmed import re-parses
the supplied bytes, rechecks exact Job/duplicate state, stages bounded metadata and uses ETag-
protected atomic finalisation after the File upload. Failed staging records contain only safe
error text and remain recoverable because the permanent-delete UI targets loaded Active reviews
only. Authenticated,
bounded preview and Job lookup do not persist the supplied file and are available without the
import release flag. Confirmed import remains fail-closed unless the legacy-named
`CHARGEABLE_INVOICE_PREVIEW_ENABLED` import switch is explicitly `true`. By explicit product-owner
decision on 12 August 2026, V1 has no malware-scanning integration or readiness gate. It relies on
manager-only access, file signature/type/size/page/text allowlists, bounded parsing and recoverable
staging; this does not claim to detect malicious content.

The review queue filters to Active imports before returning records. Workspace reads are bounded,
follow only same-origin Dataverse continuation links, and request the six review tables plus their
approved reference display fields. For a matched Job, the Amendments tab additionally performs one
read-only delegated query capped at 50 directly linked Quotes; Quote Lines are capped at 200 and load
only after deliberate expansion. Existing Quote table privileges apply and no Quote or Job write is
introduced. Document File downloads use the manager's delegated
token, verify byte count against metadata, create a browser object URL only for the deliberate
download, and revoke it immediately after handoff. Review transitions require the loaded ETag and
append Activity atomically; they expose no Job write path.

Embedded invoice viewing uses the current Revision's Source Document only. The File is fetched
after deliberate manager action, byte count is checked against Dataverse metadata, and the PDF is
rendered through a local browser object URL that is revoked when replaced or unmounted. The app
does not expose or retain an anonymous or durable File URL.

Approval PDFs are generated only by the authenticated server endpoint and are fail-closed behind
`CHARGEABLE_INVOICE_APPROVAL_ENABLED`. The endpoint requires the
loaded Review ETag and current Revision ID, re-reads an Active started PO-required Review, its
immutable Revision and at most 200 Lines, and rejects terminal reviews or unresolved Corrections.
The browser supplies identifiers only. The renderer uses a versioned bounded PDF layout, ASCII-safe
text, A4 pages and a 5 MiB output limit. A canonical source-snapshot hash prevents duplicate
Complete documents. File staging and ETag-protected Document/Activity finalisation follow the
existing recoverable pattern; no generated file receives an anonymous URL.

PO-request preparation loads at most 200 Site Contacts for the authoritative Review Site and also
allows a deliberately entered, syntactically validated recipient. It never persists the recipient
or email body and does not use Email Dispatch. The current Revision's Complete GreenTree source PDF,
resolved Corrections, deliberate photo decision and any required Complete photos are prerequisites.
The UI identifies files for manual download/attachment; `mailto:` cannot attach or send them. When
the manager saves those files, the browser adds the approved Liftrucks logo to an in-memory copy of
the GreenTree PDF only. It does not PATCH the immutable Review Document/File, create another
Dataverse document or expose an anonymous file URL; a transformation failure stops the export.
Only an ETag-protected preparation timestamp and safe Activity are stored.

V1 performs no automatic Chargeable Invoice cleanup. Complete evidence is immutable during normal
review work, and Pending/Failed recovery rows are retained. A manager may permanently delete one
loaded Active package only after typing its exact invoice number. The bounded ETag-guarded changeset
deletes only the six review-table graph in dependency order; Restrict relationships, a 900-operation
ceiling and atomic rollback prevent partial or operational-record deletion. The six table-level
Delete grants require separate provisioning approval and Assign/Share remain forbidden. Any
scheduled retention process still requires a separately approved policy and role. Release validation records safe status, timing and request-count evidence
only, never invoice/PDF/PO/email content, tokens or raw Dataverse responses. See the
[operations checklist](../chargeable-invoice-review-operations.md).

Terminal Ready to Process performs a fresh bounded read for Outstanding/Not Made corrections
immediately before its ETag-protected Review transition. Up to 200 correction instructions remain
attached for Accounts processing and the count is recorded in the Ready Activity instead of
blocking handoff. Terminal actions require an explicit
confirmation; Do Not Process additionally requires a non-empty reason. Extracted Order No is
display-only evidence and is never copied into the confirmed PO field by service or UI code.

Correction authoring is allowlisted to supported header/story keys and structured line fields.
It captures the current immutable Revision/Line evidence, validates lengths/numbers, and creates
Correction plus safe Activity in one change set. A same-value Review sentinel patch under the
loaded ETag gives correction creation the same stale-workspace protection without changing any
business value. The feature never updates extracted Revision or Line rows.

## Security review triggers

Review this architecture before adding a new public route, credential, Application User,
table privilege, file type, anonymous response field, external integration, or destructive
automation.

## Related documents

- [Authentication](authentication.md)
- [Public portal](public-portal.md)
- [Dataverse](dataverse.md)
- [Deployment](deployment.md)
