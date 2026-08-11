# Chargeable Invoice Review implementation plan

## Planning status

- [x] Repository, branch, architecture, schema, current file/email handling, and representative PDF inspected.
- [x] V1 boundaries, data model, state derivation, security model, and phased delivery proposed.
- [x] Initial four-file GreenTree extraction fixture set inspected and scenario expectations recorded.
- [x] Reusable read-only Dataverse preflight script created and locally validated.
- [x] Product owner approved the proposed schema/role contract, 5 MiB V1 limit, immutable
  retention, extraction contract, approval-document wording, upload allowlists/scanning release
  gate, and deferred manager-role assignment on 11 August 2026.
- [x] Dataverse read-only preflight completed in one explicitly approved interactive session;
  names, reference contracts, solution, role prerequisites and upload limit were inspected
  without writes.
- [x] Six-table schema and unassigned manager role provisioned, published and verified after
  explicit approval on 11 August 2026; no business rows or assignments were created.
- [x] Phase 3 intake, duplicate/revision decisions, manual exact Job recovery and recoverable
  server-side import implemented locally; staging columns provisioned and verified after
  explicit approval. Release smoke remains.
- [ ] Implementation phases below.

## Problem and V1 scope

GreenTree invoices and attached technician paperwork currently act as a physical shared queue.
V1 replaces those piles with a manager-only, shared digital review queue. Managers batch-upload
GreenTree PDF invoices, review exceptions beside the source PDF, request/track corrections,
photos and POs, prepare—not send—emails, and return work to the existing GreenTree/accounts
process when no management work remains. It never changes operational Job Status.

The four representative documents confirm a one-page, text-bearing commercial layout with
job/date, customer/site/contact/equipment, story, priced labour/material rows and GST totals.
Extraction must be format-specific and confidence-scored until the contract is approved; the
uploaded PDF remains the authority. V1 excludes GreenTree integration/retrieval,
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

Persist `New`, `In review`, `Waiting`, and a terminal management disposition; the UI derives
queue placement from events instead of exposing many editable statuses. V1 terminal
dispositions are `Ready to Process` and `Do Not Process`. The latter is required when a
commercial decision determines that the work must not be charged; it requires an explanatory
note and remains in History.

| Tab | Derived rule |
| --- | --- |
| All | Every matching review. |
| New | No `reviewStartedOn`; opening a PDF changes nothing. |
| In Progress | Started, not waiting, not ready. |
| Waiting | An active waiting reason/note exists. |
| Ready to Process | Terminal disposition is Ready to Process. |
| History | Ready-to-process and do-not-process reviews plus superseded/replaced revisions. |

Ready is allowed only with no active wait, a PO number when PO is required, and received
photos when photos are required. Managers explicitly start review, set PO/photos requirements,
create exception corrections and manage Waiting. `Corrections → Process` records correction
instructions then reaches ready without requiring a returned revision. Further action remains
open through its actual prerequisite, not another broad status.

## Provisioned Dataverse model

Use User ownership, matching every verified reference table, with organisation-depth grants in
a new dedicated `Chargeable Invoice Manager` role. The preflight confirmed every proposed table
and relationship name is unused, the target solution is unmanaged, and the existing Service
Operations role already has global reference-table access. Exact fields, Choices, relationships
and privileges are owned by
[`../chargeable-invoice-review-dataverse-schema.md`](../chargeable-invoice-review-dataverse-schema.md).

| Table | Key fields/relationships | Purpose |
| --- | --- | --- |
| Chargeable Invoice Review (`gr_chargeableinvoicereview`) | alternate key `gr_invoicenumber`; optional Job, Customer, Site, Equipment; current revision; review/wait/PO/photo/ready fields | One durable review per GreenTree invoice number. |
| Invoice Revision (`gr_chargeableinvoicerevision`) | required Review; revision number; extracted header/totals JSON; extraction status/confidence; source-document | Immutable imported version; unique Review + revision. |
| Invoice Line (`gr_chargeableinvoiceline`) | required Revision; extracted line key; Labour/Parts/Other; description, quantity, unit price, total, order | Immutable structured extraction; unique Revision + line key. |
| Review Correction (`gr_chargeableinvoicecorrection`) | required Review/Revision; optional source Line; field, original snapshot, requested value, matched state | Append-only story/line change request. |
| Review Document (`gr_chargeableinvoicedocument`) | required Review; optional Revision; document type; File plus native filename companion; content type/size; generated snapshot/version | Original/revised PDFs, approval PDFs, PO, photos. |
| Review Activity (`gr_chargeableinvoiceactivity`) | required Review; optional Revision/Document/Correction; event Choice; safe detail; actor/on | Automatic timeline and manual notes. |

The Review holds invoice number/date, GreenTree reference, match confidence/status,
`reviewStartedOn/By`, waiting-on Choice (Technician, Customer, Accounts, Sales, Management,
Other), waiting note, `poRequired`, PO number/received-on, `photosRequired`, photo lifecycle
(Not requested/Requested/Received), selected photo-request technician, prepared timestamps,
terminal disposition/on/by/reason, and current-revision lookup. Revision snapshots contain customer/site/
equipment display data shown in its PDF. Keep original-extraction JSON for source fidelity but
normalise searchable headers and lines into columns.

`Order No` extracted from GreenTree is immutable revision evidence and is separate from the
manager-confirmed PO number. It may be `.`, a bare number, or labelled text such as `PO # ...`.
It can be offered as a candidate for deliberate adoption, but must never automatically mark PO
Received or satisfy the ready-to-process prerequisite.

## Fixture evidence and scenario acceptance cases

All four supplied files are single-page, machine-readable PDFs, not scans. The parser should
use positional words/table coordinates rather than plain text lines: long story text is split
mid-word in the extraction stream, currency symbols are inconsistently attached, and customer
address columns can interleave in plain text.

Reliable labelled fields across the set are Tax Invoice number, invoice date, page, Our Ref,
Order No, account/customer and site blocks, headline description, Fleet No, make, model, serial,
service meter, Date of Job, service interval, next service due, optional Description of Repair
Work, optional Work Completed, typed Labour/Parts rows, subtotal, GST rate/amount and total.
Blank service/meter/story sections are valid. Fleet text may concatenate site/customer and fleet
tokens, so authoritative Equipment comes from the matched Job; extracted fleet remains evidence.
Every import recalculates line totals, subtotal, GST and total and flags—not silently repairs—any
mismatch.

The initial acceptance scenarios are:

| Our Ref | Workflow fixture |
| --- | --- |
| `144849` | Start Review, set Waiting on Sales with a note about sale/trade-in confirmation, then resolve either to Ready to Process or Do Not Process with a required reason. |
| `145156` | PO Required + Photos Required; deliberately select the actual technician, prepare an unsent photo-request email, upload/mark photos received, generate approval PDF, prepare PO request, record confirmed PO, then derive Ready. The extracted Order No does not satisfy the PO step automatically. |
| `145421` | Add corrections against existing part pricing and add requested Labour and Consumables lines that do not exist in the source revision. An existing extracted PO does not bypass corrections. |
| `145554` | Flag Date of Job as a structured header correction, wait on the deliberately selected technician, and compare a later revised invoice against the requested date. |

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
remain visible for a manager. A correction may target a header field, story, existing line field,
line deletion, or a requested new line with category/description/quantity/rate/price. Requested
new lines compare against later revisions without inventing a source-line relationship.

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

### Approved V1 decisions

- Use the six proposed User-owned tables and dedicated Chargeable Invoice Manager role.
- Keep the verified 5 MiB organisation limit; validate each file clearly and do not change it.
- Retain imported revisions, corrections and activity history without V1 deletion actions.
- Label approval documents `FOR CUSTOMER PO APPROVAL — NOT A TAX INVOICE`.
- Allow only validated PDFs and supported images; production malware-scanning readiness remains
  a release gate.
- Provision the role unassigned; manager assignments require a later explicit user list/action.

## Testing and deployment

Maintain approved de-identified derivatives of the four initial fixtures plus missing/ambiguous
Job, duplicate/revision, malformed and total-mismatch variants. Do not commit customer invoice
PDFs or extracted customer data. Unit-test parser normalisation, matching, state,
correction and diffing; service-test limits, ETags/change sets/File upload; component-test
keyboard/focus/responsive panes; run approved manager-role smoke tests with no real email.
PDF generation needs render/pixel and extracted-text verification. Deployment requires an
approved server parser/renderer dependency and possibly managed scanning settings—explicit
security/deployment gates, never Vite variables.

## Phased implementation

### Phase 1 — approved contract and preflight

- **Scope/dependencies:** approve fixture PDFs, limits/retention, role owner and schema; one
  cached read-only metadata/role preflight. Requires product-owner approval.
- **Areas/schema:** `docs/`, `scripts/`; all proposed tables/choices/keys/relationships only.
- **Acceptance/tests/docs:** collision/privilege report; update this plan and a schema document.

### Phase 2 — schema, roles and typed foundation

- **Status:** complete locally and in the approved Dataverse environment on 11 August 2026.
- **Scope:** idempotent provision/verify, typed contracts and pure state/extraction/diff helpers.
- **Dependencies/areas:** Phase 1; `scripts/`, `src/alpha/chargeable-invoices/`, schema docs.
- **Schema:** approved tables/File columns/keys/manager grants.
- **Acceptance/tests/docs:** one-connection publish/verify without business rows; domain tests;
  schema document and README update.

The extraction boundary accepts structured evidence from the future positional PDF adapter. It
normalises labelled text, GreenTree dates/currency, stable line keys and typed immutable Revision
snapshots while preserving raw Order No and exact source evidence. Missing numeric evidence stays
null. Arithmetic mismatches are explicit issues and never rewrite the extracted values. Revision
comparison processes only outstanding corrections, uses exact header/story or stable-line
matching, requires a unique exact match for requested new lines, and leaves missing or ambiguous
changes as Not Made for manager review.

### Phase 3 — authenticated intake and import review

- **Status:** implemented locally; staging columns are provisioned and verified, while deployed
  release gates remain pending.
- **Scope:** upload/extract preview, batch validation, exact Job matching, per-file selection,
  duplicate choice, atomic confirmation and source-PDF storage.
- **Dependencies/areas/schema:** Phase 2; `api/chargeableinvoice*`, feature services/hook/UI;
  approved Review Import Status and Document Upload Status/Error staging columns.
- **Acceptance/tests/docs:** valid subset imports despite invalid files; no uncertain match;
  immutable revision retrievable; server security/deployment documentation.

The preview endpoint now validates `WhoAmI` and manager table access, enforces the PDF/5 MiB/page/
text bounds, uses server-side PDF.js positional text extraction, and performs one exact bounded
Job Number query from GreenTree Our Ref. It returns structured evidence only and performs no
Review, Revision, Line or Document write. Both server release flags default disabled until
manager assignments and malware-scanning readiness are separately approved.

The `/chargeable-invoices` screen reuses the shared Page Header and Metric Strip, accepts up to
20 PDFs, acquires one silent token per preview action, bounds concurrent previews, and preserves
per-file pending/ready/attention results. Exact, error-free new and retry previews are selected by
default. Active duplicates require explicit Import as revision or Skip. Unmatched rows can be
recovered only by another exact bounded Job Number lookup; ambiguous results remain blocked.

The confirmed import resends the source file to the authenticated server, which re-parses it and
rechecks the invoice identity, exact Job and duplicate decision. Because Dataverse File bytes
cannot join a metadata change set and V1 grants no Delete, first imports create a Staging Review
and Pending Document before the File write. One later change set creates immutable Revision,
Lines and Activity, links the Document, advances Current Revision and activates the Review under
ETag protection. Known failures retain safe Failed state for retry. Existing Active reviews stay
Active while a revised document is staged. No automatic retry occurs after an unknown outcome.

### Phase 4 — queue and split-screen exception review

- **Status:** complete locally: active queue, workspace, authenticated source-PDF viewing,
  structured correction authoring, Start/Waiting, PO/photo decisions and terminal confirmations.
- **Scope:** route/navigation, derived table tabs, workspace, Start Review, Waiting, PO/photo
  decisions, corrections and timeline.
- **Dependencies/areas/schema:** Phase 3; feature screen/table/workspace, route/sidebar; none.
- **Acceptance/tests/docs:** preview changes nothing; prerequisites derive queue; safe ETag
  conflict and keyboard/focus tests; feature architecture update.

The screen now defaults to an Active-import-only review queue and keeps PDF intake as an explicit
second mode. Derived New/In Progress/Waiting/Ready/History filters and bounded search do not persist
separate status. Opening a row loads its Review, revisions, lines, corrections, documents and
append-only activities through bounded delegated reads. The accessible drawer returns focus to
the invoking row and exposes Summary, Invoice and History tabs. Start Review and Waiting changes
use the loaded Review ETag and append Activity in the same Dataverse change set. This foundation
does not change Job status, treat Order No as a PO, or expose Staging/Failed imports.

PO Required, confirmed PO Number/received state, Photos Required and photo status are deliberate
manager inputs; changing PO Required never adopts extracted Order No. Ready to Process revalidates
all prerequisite fields and performs a fresh bounded unresolved-Correction check before its
explicit terminal confirmation. Do Not Process requires a started review, resolved Waiting and a
reason in a separate confirmation dialog. Both terminal transitions write disposition/time and
append Activity atomically under the Review ETag; neither changes Job status or communicates.

The Invoice tab resolves the current Revision's immutable Source Document and loads its File only
after a deliberate manager action through delegated Dataverse access. It validates the returned
byte count, renders the PDF from a local browser object URL, and revokes that URL when replaced or
when the workspace closes. No durable or anonymous File URL is exposed.

Review by exception can add supported header/story corrections, change or remove a current
source line, or request a new Labour/Parts/Other line. Validation requires a meaningful requested
value and preserves the current Revision/source-Line snapshot; it never mutates extracted data.
Correction, ETag sentinel Review update and Correction Added Activity share one change set, so a
stale workspace cannot append a correction. New corrections begin Outstanding and block Ready.

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
