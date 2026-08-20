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

`QuoteEditorDialog` is the canonical create/edit workflow. The authenticated app shell owns a
lazy `QuoteEditorOverlayProvider`, so Jobs, Customer Dashboard, Scheduler, WOF, and Chargeable
Invoice Review can open that editor over their current screen rather than navigating away. The
overlay and its Quote data do not mount until requested. A Job drawer closes before its Quote opens,
while non-Job workspaces remain underneath the higher-layer editor. The standalone Quotes register
continues to use the same editor.

The editor composes the persisted Quote title from protected linked-record context in the order
`Job number - Equipment fleet/serial - Job description`. Users may append their own wording, but
cannot remove those available contextual parts through the editor. Job selection presents both the
Job number and description in the closed control and search results.
On desktop, Author keeps one bounded column and Quote title consumes the remaining first-row editor
width; responsive layouts return both fields to the ordinary single-column flow.
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
The sanitized source PDF is tracked at
[`../templates/liftrucks-invoice-template.pdf`](../templates/liftrucks-invoice-template.pdf) so a
new development checkout has the portable design reference. Runtime rendering intentionally uses
the flattened `api/assets/chargeable-invoice-approval-template.png` copy so hidden source-invoice
text cannot survive in generated documents.
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

Quote lines retain the compact visible column-heading row so Catalogue Item, Description, Category,
Quantity, Unit, Unit Price, Extended, and GST remain easy to scan. Their inputs also keep accessible
names. The Quote register bounds the Job column, and both the register and the editor's selected Job
control truncate oversized displayed values with an ellipsis while retaining the full value as a
hover title.

The Job drawer does not load the Quote register. Opening its Quotes tab starts one shared bounded
query for at most 50 Quote headers linked to that Job. Customer Dashboard similarly loads Quotes
only for the selected Customer when its Quotes tab opens. These focused readers have independent
loading and retry states and do not block Job core or relationship editing.

The standalone Quote register is a continuation-safe account-scoped Operational Data Client query.
It renders independently of editor reference data and reuses its last accepted result across route
changes. Pricing and Staff start only after an editor is requested, but use separate shared
account-scoped keys with five-minute unobserved retention. The Pricing screen and every Quote editor
therefore reuse one catalogue value; Quote editors also reuse the same Staff directory as Jobs.
Pricing readiness governs the line editor, while Staff loading or failure affects only PO email
routing and exposes a scoped retry without blocking Quote editing. Job, Customer, and active
Equipment choices use debounced `$top=8` remote searches;
opening a selector performs only its bounded initial search. Existing linked records seed the editor,
and a new Quote opened from a Job hydrates that exact Job by ID before applying its Customer and
Equipment defaults. Existing Quotes opened from another screen use one exact-ID Quote query and one
bounded Quote Line query rather than downloading the whole register. All relationship requests are
abortable and closing the editor releases its transient search results.

Successful Quote create, update, and delete operations patch the shared register and exact-record
keys immediately, then publish a content-free, account/environment-scoped cross-tab invalidation.
Because Quote register rows expand Job and Equipment labels, matching Job or Equipment events also
invalidate observed Quote projections. Reconnect and visibility recovery re-read observed Quote
queries. There is no approved dedicated Quote server event yet, so changes made by another user are
guaranteed to recover on the bounded recovery path rather than through a Quote-specific push event.

Chargeable Invoice Review reuses the Quote identity, status labels, pricing-category labels and
line reader in a read-only `Related quotes` panel. It performs one bounded header query for the
matched Job when the review opens (maximum 50 Quotes), then loads at most 200 Quote Lines only when
the manager expands a Quote. Opening the full editor uses the app-shell overlay so the invoice
review state is preserved in place.

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
- Pricing Items provide defaults only. Operators can activate/deactivate them or permanently delete
  one after explicit confirmation. Existing Quote Line snapshots retain copied values; Dataverse
  relationship or permission errors block deletion and remain visible to the operator.

## Extension Points

Future approval, pricing, document-generation, or conversion workflows should build on the
Quote identity and revision model while coordinating explicitly with Jobs.

## Implementation Constraints

Avoid per-row Dataverse lookup requests. Preserve creator and revision history. Keep
commercial state distinct from operational Job and Job Card state. Quote PDF generation must
remain client-local and must not require Chargeable Invoice server flags or authentication.
Editor-only support must not block the Quote register. Relationship selectors must use bounded,
abortable remote search while preserving existing direct Quote selections and Job-derived defaults.

## Related Files and Documents

- [`../../src/alpha/quotes/QuotesScreen.tsx`](../../src/alpha/quotes/QuotesScreen.tsx)
- [`../../src/alpha/quotes/PricingScreen.tsx`](../../src/alpha/quotes/PricingScreen.tsx)
- [`../../src/alpha/quotes/QuoteEditorOverlayProvider.tsx`](../../src/alpha/quotes/QuoteEditorOverlayProvider.tsx)
- [`../../src/alpha/quotes/services/quotesApi.ts`](../../src/alpha/quotes/services/quotesApi.ts)
- [`../../src/alpha/quotes/services/pricingApi.ts`](../../src/alpha/quotes/services/pricingApi.ts)
- [Quotes Dataverse schema](../quotes-dataverse-schema.md)
- [Jobs](jobs.md)
- [Dataverse](dataverse.md)
