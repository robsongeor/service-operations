# Chargeable Invoice Review implementation plan

## Planning status

- [x] Repository, branch, architecture, schema, current file/email handling, and representative PDF inspected.
- [x] V1 boundaries, data model, state derivation, security model, and phased delivery proposed.
- [ ] Product owner approves the schema, document retention limits, GreenTree extraction fixture set, and customer document wording.
- [ ] Dataverse read-only preflight.
- [ ] Schema/security provisioning (explicit approval required).
- [ ] Implementation phases below.

## Problem and V1 scope

GreenTree invoices and attached technician paperwork currently act as a physical shared queue.
V1 replaces those piles with a manager-only, shared digital review queue. Managers batch-upload
GreenTree PDF invoices, review exceptions beside the source PDF, request/track corrections,
photos and POs, prepare—not send—emails, and return work to the existing GreenTree/accounts
process when no management work remains. It never changes operational Job Status.

The representative document confirms a one-page, text-bearing commercial layout with job/date,
customer/site/contact/equipment, story, priced labour/material rows and GST totals. Extraction
must be format-specific and confidence-scored until a representative fixture pack is approved;
the uploaded PDF remains the authority. V1 excludes GreenTree integration/retrieval,
accounts/Nargiza users, automatic email send/ingestion, technician-portal photo ingestion,
scanned-job-card parsing, automatic customer rules, AI wording, assignment, and accounting
`Processed` state.

## Existing architecture to reuse

- A new authenticated `/chargeable-invoices` route owns a feature module, hook, services,
  typed domain helpers, and CSS. It follows Jobs/Quotes table/filter/sticky-column patterns,
  `PageHeader`, `SearchableSelect`, and `EditDrawerConfirmation`, but is a full split-screen
  page rather than a drawer or Kanban board.
- Office users acquire one delegated token silently per load/mutation. Components do not call
  Dataverse. ETag-protected change sets protect multi-record import/revision transitions.
- Existing Job/Customer/Site/Equipment/Mechanic contracts are read via bounded expanded
  queries. Equipment is optional and Customer derives through Site when a Job provides it.
- `mailto:` validates a deliberate recipient and opens a manager's email client only. Existing
  Email Dispatch is Job-bound and must not be repurposed.
- Job Photo proves Dataverse File handling. A new generic review-document model—not Job Photo—
  owns invoice PDFs, approval PDFs, POs and uploaded supporting photos.

## State and derived queue tabs

Persist `New`, `In review`, `Waiting`, and `Ready to Process`; the UI derives queue placement
from events instead of exposing many editable statuses.

| Tab | Derived rule |
| --- | --- |
| All | Every matching review. |
| New | No `reviewStartedOn`; opening a PDF changes nothing. |
| In Progress | Started, not waiting, not ready. |
| Waiting | An active waiting reason/note exists. |
| Ready to Process | `readyToProcessOn` exists. |
| History | Ready reviews plus superseded/replaced revisions. |

Ready is allowed only with no active wait, a PO number when PO is required, and received
photos when photos are required. Managers explicitly start review, set PO/photos requirements,
create exception corrections and manage Waiting. `Corrections → Process` records correction
instructions then reaches ready without requiring a returned revision. Further action remains
open through its actual prerequisite, not another broad status.

## Proposed Dataverse model (approval required)

Use organisation ownership unless confirmed environment policy requires user/team ownership
with organisation-depth manager grants. Logical names are proposals requiring collision and
navigation-name preflight.

| Table | Key fields/relationships | Purpose |
| --- | --- | --- |
| Chargeable Invoice Review (`gr_chargeableinvoicereview`) | alternate key `gr_invoicenumber`; optional Job, Customer, Site, Equipment; current revision; review/wait/PO/photo/ready fields | One durable review per GreenTree invoice number. |
| Invoice Revision (`gr_chargeableinvoicerevision`) | required Review; revision number; extracted header/totals JSON; extraction status/confidence; source-document | Immutable imported version; unique Review + revision. |
| Invoice Line (`gr_chargeableinvoiceline`) | required Revision; extracted line key; Labour/Parts/Other; description, quantity, unit price, total, order | Immutable structured extraction; unique Revision + line key. |
| Review Correction (`gr_chargeableinvoicecorrection`) | required Review/Revision; optional source Line; field, original snapshot, requested value, matched state | Append-only story/line change request. |
| Review Document (`gr_chargeableinvoicedocument`) | required Review; optional Revision; document type; File; filename/content type/size; generated snapshot/version | Original/revised PDFs, approval PDFs, PO, photos. |
| Review Activity (`gr_chargeableinvoiceactivity`) | required Review; optional Revision/Document/Correction; event Choice; safe detail; actor/on | Automatic timeline and manual notes. |

The Review holds invoice number/date, GreenTree reference, match confidence/status,
`reviewStartedOn/By`, waiting-on Choice (Technician, Customer, Accounts, Sales, Management,
Other), waiting note, `poRequired`, PO number/received-on, `photosRequired`, photo lifecycle
(Not requested/Requested/Received), selected photo-request technician, prepared timestamps,
`readyToProcessOn/By`, and current-revision lookup. Revision snapshots contain customer/site/
equipment display data shown in its PDF. Keep original-extraction JSON for source fidelity but
normalise searchable headers and lines into columns.

V1 reads existing Site Contacts. A future contact-purpose relationship/choice (PO/accounts)
needs a separate decision after confirming global contact reuse; do not add customer-email
columns to Review. V1 can require deliberate recipient entry/selection when no contact fits.

## Import, matching, revisions, and comparison

The browser submits selected PDFs to an authenticated server endpoint; it does not parse or
persist files directly. The server validates the caller once and enforces PDF signature/page/
size/batch limits, extracts text/layout with a deterministic GreenTree parser, normalises
amounts/dates, and returns a review-only batch preview. No record exists before confirmation.

Match exact normalised GreenTree Job/reference number to `gr_jobs.gr_jobnumber`, then only a
uniquely corroborated reference proven safe by fixtures. Zero/multiple matches, missing invoice
number, conflicting totals, unsupported layout or low confidence block that file; they do not
block confirmed import of other valid files. Never choose a Job from customer/fleet text.

Invoice number identifies a Review. Duplicates are previewed as `Skip` or `Import as revised`.
A revision appends a PDF/value snapshot transactionally and compares header/story/totals and
lines by stable parser key, with any description-similarity fallback labelled uncertain. Every
outstanding correction is recorded as matched, not made or unexpected change; ambiguous lines
remain visible for a manager.

## Review workspace, documents and email

The table shows invoice/date, Job, customer/site, fleet, total, queue, waiting-on, PO number,
photo state, revision/change flag and last actor/time. Search covers invoice/reference. A row
opens a desktop two-pane workspace: authenticated PDF viewer with browser zoom/scroll left;
structured header, exception corrections, workflow decisions, documents and timeline right.
Below a practical width, use accessible labelled tabs and preserve focus return.

Review by exception creates no per-line approvals: flag only a story/line needing correction,
with original and requested values. Generate consolidated correction instructions for copying
or download, never sending. A manager uploads photos to Review Document after deliberately
selecting a technician; `Prepare photo request` opens a `mailto:` draft. `Prepare PO request`
also opens an editable draft. V1 cannot reliably attach files to `mailto:`, so it presents
explicit download/attach steps for approval PDFs/photos.

Generate a server-side approval PDF from an immutable reviewed-revision snapshot using a
versioned HTML/CSS template and headless-PDF runtime. Retain the familiar appearance but add
`FOR CUSTOMER PO APPROVAL — NOT A TAX INVOICE`, document version and generation time. Store it
as a Review Document. Do not automate Excel: it depends on an Office runtime and is not robust
in Azure Functions. GreenTree remains the final accounting-invoice owner.

## Security, errors and concurrency

Invoices, pricing, POs and photos are confidential. Manager routes/server actions validate a
delegated caller; server values are server-only. Add least-privilege manager grants only for
these tables/File columns; no anonymous access. Enforce file type/size/page/count allowlists,
safe errors, malware scanning decision and retention limits before production. Never log PDF
text, PO numbers, email body or file content.

Use ETags for Review/current-revision/prerequisite transitions. Recheck the invoice key/current
revision at import confirmation. Return safe 412 refresh/retry guidance with no automatic retry
of uncertain uploads. Stage File rows then atomically link/activate them; define retention for
failed staging. Activity is append-only and every success reloads the authoritative review.

## Testing and deployment

Maintain de-identified fixture PDFs: normal, multi-line, missing/ambiguous Job, duplicate/
revision, malformed and total mismatch. Unit-test parser normalisation, matching, state,
correction and diffing; service-test limits, ETags/change sets/File upload; component-test
keyboard/focus/responsive panes; run approved manager-role smoke tests with no real email.
PDF generation needs render/pixel and extracted-text verification. Deployment requires an
approved server parser/renderer dependency and possibly managed scanning settings—explicit
security/deployment gates, never Vite variables.

## Phased implementation (all unchecked)

### Phase 1 — approved contract and preflight

- **Scope/dependencies:** approve fixture PDFs, limits/retention, role owner and schema; one
  cached read-only metadata/role preflight. Requires product-owner approval.
- **Areas/schema:** `docs/`, `scripts/`; all proposed tables/choices/keys/relationships only.
- **Acceptance/tests/docs:** collision/privilege report; update this plan and a schema document.

### Phase 2 — schema, roles and typed foundation

- **Scope:** idempotent provision/verify, typed contracts and pure state/extraction/diff helpers.
- **Dependencies/areas:** Phase 1; `scripts/`, `src/alpha/chargeable-invoices/`, schema docs.
- **Schema:** approved tables/File columns/keys/manager grants.
- **Acceptance/tests/docs:** one-connection publish/verify without business rows; domain tests;
  schema document and README update.

### Phase 3 — authenticated intake and import review

- **Scope:** upload/extract preview, batch validation, exact Job matching, per-file selection,
  duplicate choice, atomic confirmation and source-PDF storage.
- **Dependencies/areas/schema:** Phase 2; `api/chargeableinvoice*`, feature services/hook/UI;
  no schema beyond Phase 2.
- **Acceptance/tests/docs:** valid subset imports despite invalid files; no uncertain match;
  immutable revision retrievable; server security/deployment documentation.

### Phase 4 — queue and split-screen exception review

- **Scope:** route/navigation, derived table tabs, workspace, Start Review, Waiting, PO/photo
  decisions, corrections and timeline.
- **Dependencies/areas/schema:** Phase 3; feature screen/table/workspace, route/sidebar; none.
- **Acceptance/tests/docs:** preview changes nothing; prerequisites derive queue; safe ETag
  conflict and keyboard/focus tests; feature architecture update.

### Phase 5 — revised invoices, documents and correction comparison

- **Scope:** revised upload, diff classifications, photo upload, technician `mailto:`, correction instructions.
- **Dependencies/areas/schema:** Phases 3–4; parser/diff/document/workspace services; none.
- **Acceptance/tests/docs:** every PDF/value retained; classifications visible; email unsent;
  file retry/cleanup tests and security update.

### Phase 6 — PO approval documents and handoff

- **Scope:** reviewed snapshot, approval PDF render/store/download, recipient selection,
  PO-request `mailto:`, PO number and Ready derivation.
- **Dependencies/areas/schema:** Phases 2–5 plus approved branding; server renderer and workspace;
  optional contact-purpose decision.
- **Acceptance/tests/docs:** PDF has non-invoice marker and correct totals; missing PO/photos
  blocks Ready; renderer/security/manual-compose tests; deployment docs.

### Phase 7 — release readiness

- **Scope/dependencies:** retention/cleanup decision, manager smoke/accessibility/performance,
  monitoring/safe errors and rollback; requires all prior phases.
- **Acceptance/tests/docs:** non-production fixture run, no real email/accounting mutation,
  `npm test`, lint, build, diff check and release documentation.

## Future extensions

Accounts/Nargiza roles/processed state, GreenTree integration, job-card retention, portal-photo
linkage, automated mail/attachment sending, inbound mail, contact defaults, customer rules,
assignment, AI summaries and accounting integration extend Review/Revision/Document/Activity
without rewriting historical records.
