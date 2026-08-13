# Quotes Architecture

## Purpose

Quotes represent commercial proposals and revisions associated with Customers, Equipment,
and operational work.

## Architecture

Quotes remain a separate feature from Jobs. They can link to Jobs without being required for
Job creation or controlling operational Job state. Quote presentation, editing, revisions,
and Dataverse access stay feature-owned.

## Major Dataverse Relationships

- A Quote relates to a Customer and may relate to Equipment and a Job.
- Author is the immutable built-in Dataverse `createdby` relationship.
- Revisions belong to the Quote workflow and preserve historical identity.

See `docs/quotes-dataverse-schema.md` for schema detail.

## Shared Components and APIs

Quote forms use shared presentation and selection components where applicable. Register
rows should obtain related Customer, Equipment, Job, and Author data through the existing
query and lookup expansions.

The editor composes the persisted Quote title from protected linked-record context in the order
`Job number - Equipment fleet/serial - Job description`. Users may append their own wording, but
cannot remove those available contextual parts through the editor. Job selection presents both the
Job number and description in the closed control and search results.
When a Job is selected, its related Customer (through Site) and Equipment populate the Quote fields
when those relationships are available. Existing direct Quote Customer and Equipment selections
remain authoritative when an existing Quote is first opened.

The saved Quote editor can generate a provisional quotation locally in the browser. It
reuses the approved GreenTree-style invoice template and the same Liftrucks logo used by
Chargeable Invoice Review. Generation reads the current editor draft, maps Quote Notes verbatim
to the Quote-only `Work Required` section, maps the current Quote lines and recalculated totals to the invoice body,
and downloads a PDF without changing Quote, Job, or invoice-review state. The document is clearly
marked `Provisional Quotation`, uses the linked Job number for both `Invoice No` and `Our Ref`,
and is not a tax invoice. Direct Quote Customer and Equipment
selections take precedence; the linked Job supplies fallback Customer, Site, Equipment, Job number,
and repair-description context.
The PDF party box stacks Customer, linked Job Site name, and linked Job Site address on the left.
Site identity for this document comes from the Job rather than an independently selected Equipment Site.
Completed GreenTree and Chargeable Invoice documents retain their existing `Work Completed` wording.
Supported browsers use the native Save File dialog so the user can choose the PDF filename and local
folder. The suggested filename is `Equipment - Job number.pdf`, using Fleet first and then Serial or
Make/Model when Fleet is unavailable; invalid Windows filename characters are replaced safely.
Browsers without the File System Access capability fall back to the normal browser download.
The saved Quote editor also opens an editable customer PO request email. Recipient routing reuses the
effective Purchase Order Recipient rules: a linked Job Site override takes precedence, otherwise the
Customer default is used, with configured CC contacts included. If neither scope is configured, the
draft opens with a blank recipient for the user to complete. The browser cannot attach the locally
generated PDF, so the action explicitly reminds the user to attach the saved provisional quotation;
nothing is sent and no email audit or Quote workflow state is written.
Active Staff explicitly marked `CC on customer emails` are appended to the draft CC list through the
shared Staff Directory rule. Customer/Site routing remains authoritative for external recipients.
The body uses a concise manager-written pattern: a direct request for an order number, the current
Quote Notes as the natural work explanation, and a short statement that the work awaits PO approval.
It avoids repeating invoice-style field labels already present in the attached provisional quotation.
Generated text follows the measured GreenTree typographic scale: approximately 10.92 pt for header
fields and totals, 12 pt for the Customer name, and 9.96 pt for narrative and ordinary invoice-line
content. Totals flow beneath the populated lines; only unusually dense line sets reduce line text.
The single-page template supports up to 20 Quote lines. Dense quotes reduce line text to the
established 7.5 pt minimum while keeping totals beneath the populated line region. The editor uses
this shared renderer limit rather than a separate UI-only threshold.

Chargeable Invoice Review reuses the Quote identity, status labels, pricing-category labels and
line reader in a read-only `Related quotes` panel. It performs one bounded header query for the
matched Job when the review opens (maximum 50 Quotes), then loads at most 200 Quote Lines only when
the manager expands a Quote. The full editor opens through `/quotes?quoteId=...` in a new tab so the
invoice review state is preserved.

## Important Business Rules

- A Job may be linked to a Quote but does not require one.
- Quote linkage must not alter Job Status.
- Related Quotes are supporting invoice-review context only; status and price differences do not
  create Corrections or block Ready to Process.
- Author identity is the persisted creator, never a display-name inference.
- Revisions and historical Quotes are preserved.
- Provisional quotation generation is available only after the Quote has a persisted Quote number.
- A numbered linked Job is required because its Job number identifies both `Invoice No` and `Our Ref`.
- The generated PDF reflects unsaved values currently visible in the editor. The user remains
  responsible for saving the Quote separately when those edits should persist to Dataverse.
- Saving refreshes the persisted Quote and Quote Line identities while leaving the editor open.
  Closing the editor is always a separate explicit action.

## Extension Points

Future approval, pricing, document-generation, or conversion workflows should build on the
Quote identity and revision model while coordinating explicitly with Jobs.

## Implementation Constraints

Avoid per-row Dataverse lookup requests. Preserve creator and revision history. Keep
commercial state distinct from operational Job and Job Card state. Quote PDF generation must
remain client-local and must not require Chargeable Invoice server flags or authentication.

## Related Files and Documents

- [`../../src/alpha/quotes/QuotesScreen.tsx`](../../src/alpha/quotes/QuotesScreen.tsx)
- [`../../src/alpha/quotes/PricingScreen.tsx`](../../src/alpha/quotes/PricingScreen.tsx)
- [`../../src/alpha/quotes/services/quotesApi.ts`](../../src/alpha/quotes/services/quotesApi.ts)
- [`../../src/alpha/quotes/services/pricingApi.ts`](../../src/alpha/quotes/services/pricingApi.ts)
- [Quotes Dataverse schema](../quotes-dataverse-schema.md)
- [Jobs](jobs.md)
- [Dataverse](dataverse.md)
