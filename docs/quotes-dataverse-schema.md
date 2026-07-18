# Quotes Dataverse setup

This document defines the first version of quotes for Service Operations.

## Product rules

- Every quote is linked to a job.
- A job can have multiple quotes and revisions.
- Quote line prices are exclusive of GST.
- GST defaults to 15% and is calculated from the subtotal.
- Pricing catalogue items provide defaults only. When a catalogue price changes, existing quotes do not change.
- A quote line stores its own description, quantity, unit price, and extended price as a historical snapshot.
- Users can override a catalogue description or price on an individual quote.
- All operational users should be able to view all quotes and pricing items.

Use organisation-owned Dataverse tables if the environment's security model allows it. If the existing Service Operations tables are user/team-owned, use the same ownership type and grant organisation-wide access through the app's security role.

## Choices

### Quote status

| Label | Value |
| --- | ---: |
| Draft | `122830000` |
| Sent | `122830001` |
| Accepted | `122830002` |
| Declined | `122830003` |
| Expired | `122830004` |

### Pricing category

| Label | Value |
| --- | ---: |
| Labour | `122830000` |
| Parts | `122830001` |
| Service | `122830002` |
| Consumables | `122830003` |
| Other | `122830004` |
| Travel | `122830005` |

## Pricing items table

Create a table with display name **Pricing Item**, plural name **Pricing Items**, and schema name `gr_PricingItem`.

Expected entity set: `gr_pricingitems`.

| Display name | Schema name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Name | `gr_name` | Text | Yes | Primary name, for example `Standard labour` |
| Code | `gr_code` | Text | No | Short code such as `LABOUR` |
| Category | `gr_category` | Choice | Yes | Use Pricing category choice |
| Description | `gr_description` | Multiple lines of text | No | Default quote-line description |
| Unit label | `gr_unitlabel` | Text | Yes | For example `hour`, `each`, or `job` |
| Unit price | `gr_unitprice` | Currency | Yes | Default price excluding GST |
| Taxable | `gr_taxable` | Yes/No | Yes | Default `Yes` |
| Sort order | `gr_sortorder` | Whole number | No | Controls display order |

Use the table's built-in **Status** field to activate or deactivate pricing items instead of adding a second custom Active field.

Create the first record:

| Field | Value |
| --- | --- |
| Name | Standard labour |
| Code | LABOUR |
| Category | Labour |
| Unit label | hour |
| Unit price | 120.00 |
| Taxable | Yes |
| Active | Yes |

The Pricing page will manage these records. Future records can include consumables, travel, standard services, and commonly quoted parts.

## Quotes table

Create a table with display name **Quote**, plural name **Quotes**, and schema name `gr_Quote`.

Expected entity set: `gr_quotes`.

| Display name | Schema name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Name | `gr_name` | Text | Yes | Primary name; can match quote number/title |
| Quote number | `gr_quotenumber` | Autonumber | Yes | Suggested format `Q-{SEQNUM:5}` |
| Job | `gr_Job` | Lookup to Job | Yes | Parent job |
| Quote status | `gr_quotestatus` | Choice | Yes | Default Draft |
| Revision | `gr_revision` | Whole number | Yes | Default `1` |
| Quote date | `gr_quotedate` | Date only | Yes | Default current date in the app |
| Valid until | `gr_validuntil` | Date only | No | Optional expiry date |
| Notes | `gr_notes` | Multiple lines of text | No | Customer-facing or internal notes |
| GST rate | `gr_gstrate` | Decimal number | Yes | Store `0.15`, default from app |
| Subtotal | `gr_subtotal` | Currency | Yes | Sum of quote lines |
| GST | `gr_gst` | Currency | Yes | Rounded to two decimals |
| Total | `gr_total` | Currency | Yes | Subtotal plus GST |

Customer, site, contact, and equipment are displayed from the linked job for the MVP. A later PDF/versioning phase can add snapshot fields if historical documents must remain unchanged after job details are edited.

## Quote lines table

Create a table with display name **Quote Line**, plural name **Quote Lines**, and schema name `gr_QuoteLine`.

Expected entity set: `gr_quotelines`.

| Display name | Schema name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Name | `gr_name` | Text | Yes | Primary name; usually a short description |
| Quote | `gr_Quote` | Lookup to Quote | Yes | Parent quote |
| Pricing item | `gr_PricingItem` | Lookup to Pricing Item | No | Source catalogue item, if used |
| Category | `gr_category` | Choice | Yes | Snapshot of pricing category |
| Description | `gr_description` | Multiple lines of text | Yes | Editable line description |
| Quantity | `gr_quantity` | Decimal number | Yes | Allow values such as `1.5` hours |
| Unit label | `gr_unitlabel` | Text | No | Snapshot such as `hour` or `each` |
| Unit price | `gr_unitprice` | Currency | Yes | Snapshot price excluding GST |
| Extended price | `gr_extendedprice` | Currency | Yes | Quantity multiplied by unit price |
| Taxable | `gr_taxable` | Yes/No | Yes | Snapshot from pricing item |
| Sort order | `gr_sortorder` | Whole number | Yes | Preserves the line order |

Configure the Quote-to-Quote Lines relationship to cascade-delete quote lines when a quote is deleted. Do not cascade-delete a quote when its linked job is deleted without first deciding how quote history should be retained.

## Calculation rules

Use decimal-safe rounding to two currency places:

```text
extended price = round(quantity * unit price, 2)
subtotal       = sum(extended prices)
GST            = round(subtotal * GST rate, 2)
total          = subtotal + GST
```

For the Cardinal EX1805 example:

```text
subtotal = 3774.65
GST      = 566.20
total    = 4340.85
```

## Application routes

- `/quotes` — quote list, filters, totals, and quote editor
- `/pricing` — pricing catalogue and standard rate maintenance

The job editor will show linked quotes and provide a **Create quote** action after the standalone Quotes page is working.

## Build sequence

1. Create the two choices and three Dataverse tables.
2. Confirm the actual entity-set and lookup navigation-property names from Dataverse metadata.
3. Add TypeScript quote and pricing types.
4. Add Dataverse API services for pricing items, quotes, and quote lines.
5. Build the Pricing page.
6. Build the Quotes list and editor with automatic totals.
7. Add quote access to the job editor.
8. Add PDF generation, revisions, and email in a later phase.
