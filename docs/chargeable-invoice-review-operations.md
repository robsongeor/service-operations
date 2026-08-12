# Chargeable Invoice Review Operations and Release Validation

## Purpose

This is the operator checklist for releasing, validating and safely rolling back Chargeable
Invoice Review. Product architecture and implementation progress remain owned by the
[implementation tracker](features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md); exact
Dataverse contracts remain owned by the
[schema document](chargeable-invoice-review-dataverse-schema.md).

The local release-readiness baseline is complete. Target-environment validation remains gated by
explicit approval for role assignment, deployment and server-setting changes.

## Authentication and approval gates

Routine validation must use one already signed-in manager session and silent MSAL token
acquisition. It must never automatically start or repeat login popups or redirects. Administrative
schema verification defaults to cached, no-prompt Verify mode:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/manage-chargeable-invoice-review-schema.ps1 `
  -Mode Verify `
  -LoginPrompt Never
```

If the cached session is unavailable, stop and arrange one deliberate user-owned authentication
session. Before target validation, separately obtain explicit approval to:

- assign the unassigned `Chargeable Invoice Manager` role to a named manager list;
- deploy the client and API artifacts;
- install the server PDF dependencies in the managed Function build;
- enable each required File-write server flag. Authenticated preview and Job lookup are
  non-persisting and need no upload-readiness flag. Keep
  `CHARGEABLE_INVOICE_PREVIEW_ENABLED` and `CHARGEABLE_INVOICE_APPROVAL_ENABLED` false until
  each independent gate has passed.

V1 deliberately has no malware-scanning integration or readiness setting. Operators must not
describe the file allowlists or bounded parser as malware detection. Reintroducing scanning later
requires an approved design, deployment contract and target-path verification.

Do not provision schema, change the organisation upload limit, create credentials, or send a real
customer or technician communication as an inferred release step.

## Retention and recovery

V1 performs no automatic cleanup. Complete source invoices, approval PDFs, supporting photos,
Revisions, Lines, Corrections and Activity remain immutable historical evidence unless a manager
uses the explicit permanent-delete action, types the invoice number, and confirms deletion of the
entire package. The operation is ETag-guarded and atomic; it never deletes the linked Job, Customer,
Site, Equipment or Mechanic. Pending and Failed imports remain recovery evidence because they are
excluded from the active queue and are not targeted by this UI.

Application rollback does not delete Dataverse rows, columns, tables, relationships, alternate
keys or files. Any future privileged cleanup or retention job requires a separately approved
policy, security role, relationship review, alternate-key/retry analysis and auditable recovery
plan. During smoke testing, record row counts and storage observations without customer content;
raise a backlog item if measured growth makes a retention change necessary.

## Pre-release checks

- Use only de-identified synthetic fixtures in a non-production target.
- Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- After separate approval provisions the deletion grants, verify the six-table contract, staging
  columns, alternate keys and all 36 role grants using at
  most one approved cached-session schema verification.
- Confirm the manager role remains unassigned until the named list is approved and has
  organisation-depth Create, Read, Write, Delete, Append and Append To on the six review tables,
  with no Assign or Share.
- Confirm the organisation upload limit remains 5 MiB and all three release flags are false before
  the controlled enablement step.
- Confirm deployment contains no credentials, access tokens, PDFs, PO numbers, recipient/body
  content, customer exports or raw Dataverse error bodies.

## Controlled smoke test

Use de-identified records and record only pass/fail, safe status/error codes, timing, request counts
and non-sensitive identifiers. Do not create real accounting mutations or send communications.

1. As a user without the manager role, confirm the route and both authenticated PDF endpoints deny
   access without exposing business data.
2. As an approved manager, import a valid new PDF and confirm exactly one Active Review, immutable
   Revision/Lines, Complete source Document and Activity are created.
3. Exercise a duplicate invoice as a deliberate revision. Confirm no duplicate Review and that
   outstanding corrections compare conservatively.
4. Exercise malformed, unsupported, over-limit and known upload-failure fixtures. Confirm safe
   errors, independent batch progress and recoverable Pending/Failed evidence.
5. Open the active queue and workspace; verify Start Review, Waiting, correction creation, revised
   comparison, source-PDF view/download, Ready and Do Not Process business rules. Confirm Ready can
   hand Outstanding/Not Made corrections to Nargiza / Accounts, retains them on the review, and
   records their bounded count without an operational Job write.
6. Import a dedicated disposable fixture, type its invoice number in the permanent-delete dialog,
   and confirm the complete Review/Revision/Line/Correction/Document/File/Activity package is gone
   while its linked Job, Customer, Site and Equipment remain unchanged. Verify a stale ETag or any
   nested delete failure rolls the entire operation back.
7. Prepare a technician photo request, inspect the editable `mailto:` draft, then discard it. Upload
   safe supporting-image fixtures when required. Delete one retained thumbnail and confirm only its
   Review Document/File is removed. Delete the last retained thumbnail and confirm Photos returns to
   Requested and Ready is blocked again. Repeat with `Remove all` and confirm the entire retained
   batch is removed atomically; verify the Job and any Job Photos remain unchanged.
8. Generate the approval PDF and confirm the current revision, totals, template version, A4 layout,
   extractable text and `FOR CUSTOMER PO APPROVAL - NOT A TAX INVOICE` marker.
9. Select a Site-scoped or deliberate manual PO recipient. Use `Download supporting documents` and
   confirm the invoice PDF plus every required photo downloads, open the editable `mailto:` draft,
   then discard it.
10. Confirm a PO-required review becomes eligible for Ready after its PO-request draft is prepared;
    do not enter or receive a PO first. Verify the Ready confirmation hands customer follow-up to
    Nargiza / Accounts, recipient and email body were not persisted, and no Email Dispatch row was
    created. Separately record a synthetic PO number to verify the downstream PO Received audit does
    not alter the completed manager disposition.

## Accessibility checks

- Complete the workflow with keyboard only. Verify visible focus, logical order, Escape close,
  contained drawer focus, labelled tabs and focus return to the exact invoking queue row.
- Exercise the shared searchable Site Contact selector with keyboard and a screen reader.
- Confirm errors use alerts and asynchronous preparation/generation feedback is announced.
- Check desktop layout at 200% zoom and the practical narrow drawer breakpoint without loss of
  actions or information.
- Confirm PDF evidence remains available through an explicitly labelled download when embedded
  viewing is unavailable.

## Performance and request budgets

The client admits at most 20 PDFs per batch and uses two preview workers. Queue and detail reads
stop at 500 records; technician, Site Contact and line reads stop at 200; preview accepts at most
five PDF pages and 5 MiB; approval output is at most 5 MiB. Reads use bounded collections and
same-origin continuation links and must not issue per-row requests.

For the largest de-identified fixture, record elapsed time and browser network request counts for
intake, initial queue load, workspace load, revision comparison, approval generation and PO
preparation. Confirm concurrent work shares silent token acquisition and no interactive sign-in or
N+1 pattern occurs. A breached bound or unexplained request growth blocks release.

## Monitoring and safe errors

Operational evidence may contain route/action name, safe status or application error code, UTC
timestamp, duration and a non-sensitive correlation identifier. Never log access tokens, PDF/file
bytes or extracted text, customer details, invoice/PO values, email recipient/body, credentials or
raw Dataverse responses. Monitoring must not make a failed business mutation look successful.

## Rollback

1. Set the Chargeable Invoice import and approval flags false first.
2. If access must be withdrawn, remove the manager role only from the explicitly approved users or
   teams through the authorised administrative path.
3. Roll back client/API artifacts through the normal deployment workflow.
4. Preserve all schema and business/recovery evidence. Do not delete or rewrite Complete,
   Pending or Failed history as a release rollback.
5. Capture safe counts and identifiers for any staged failures and create an individually reviewed
   reconciliation plan before retrying or repairing them.

## Release decision record

Record target/environment, artifact commit, approver, named role assignments, dependency
verification, flag values, fixture identifiers, checks run, request counts,
timings, accessibility results, failures/blockers, rollback owner and final go/no-go decision.
The feature is not production-ready while any controlled smoke, access denial, accessibility,
performance, safe-error or rollback check remains unverified.
