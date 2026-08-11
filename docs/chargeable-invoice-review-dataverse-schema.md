# Chargeable Invoice Review Dataverse schema

## Status and verified preflight

The product owner approved this schema/role design and its V1 retention, 5 MiB file-limit,
document wording, allowlist/scanning and deferred-assignment decisions on 11 August 2026. The
six-table schema and the unassigned `Chargeable Invoice Manager` role were provisioned,
published and read back on 11 August 2026. Role assignment and any organisation file-limit
change remain separately gated.

The 11 August 2026 read-only preflight used one interactive connection and made no writes. It
confirmed all six proposed table names and ten relationship names are unused; existing reference
contracts are present and User-owned; `ServiceOperationsNew` is the single unmanaged solution;
`Service Operations` is the single unmanaged base role with global reference-table access;
`Chargeable Invoice Manager` does not exist; and maximum upload size is 5,242,880 bytes (5 MiB).

## Ownership and security

All six tables are **User-owned** to match Job, Customer, Site, Equipment, Contact, Site Contact
and Mechanic. A new unmanaged **Chargeable Invoice Manager** role supplies the shared queue with
organisation-depth Create, Read, Write, Append and Append To on the six new tables, but no Delete,
Assign or Share. V1 does not add new-table privileges to the widely used **Service Operations**
role. Existing global reference access is verified rather than widened. Role assignment is a
separate approved action using an explicit manager list.

## Choices

The following numeric values were provisioned after collision verification.

| Choice | Labels and provisioned values |
| --- | --- |
| Match status | Matched exactly `122830000`; Matched manually `122830001`; Unmatched `122830002`; Ambiguous `122830003` |
| Import status | Staging `122830000`; Active `122830001`; Failed `122830002` |
| Waiting on | Technician `122830000`; Customer `122830001`; Nargiza / Accounts `122830002`; Sales `122830003`; Management `122830004`; Other `122830005` |
| Photos status | Not requested `122830000`; Requested `122830001`; Received `122830002` |
| Terminal disposition | Ready to Process `122830000`; Do Not Process `122830001` |
| Line type | Labour `122830000`; Parts `122830001`; Other `122830002` |
| Correction type | Header field `122830000`; Story `122830001`; Change line `122830002`; Add line `122830003`; Remove line `122830004` |
| Correction comparison | Outstanding `122830000`; Matched in revision `122830001`; Not made `122830002`; Superseded `122830003` |
| Document type | GreenTree Invoice `122830000`; Approval PDF `122830001`; Supporting Photo `122830002`; Customer PO `122830003`; Job Card `122830004`; Other `122830005` |
| Upload status | Pending `122830000`; Complete `122830001`; Failed `122830002` |

Activity event is one bounded Choice with sequential named constants for Invoice Uploaded, Job
Matched, Review Started, Correction Added/Changed, Waiting Changed, Technician Selected, Photo
Request Prepared, Photos Received, Revised Invoice Uploaded, Revision Compared, PO Requirement
Changed, Approval PDF Generated, PO Request Prepared, PO Received, Ready to Process, Do Not
Process and Manual Note.

## Chargeable Invoice Review

Schema `gr_ChargeableInvoiceReview`; expected entity set `gr_chargeableinvoicereviews`.

| Display name | Logical name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Name | `gr_name` | Text 200 | Yes | Primary name; invoice number. |
| Invoice Number | `gr_invoicenumber` | Text 50 | Yes | Alternate key and stable GreenTree identity. |
| Invoice Date | `gr_invoicedate` | Date Only | Yes | Confirmed source value. |
| GreenTree Reference | `gr_greentreereference` | Text 50 | Yes | Normalised `Our Ref`. |
| Job | `gr_job` | Lookup Job | App-required | Optional schema for recovery; confirmed import requires it. |
| Customer | `gr_customer` | Lookup Customer | No | Current context; historical display is on Revision. |
| Site | `gr_site` | Lookup Site | No | Current context. |
| Equipment | `gr_equipment` | Lookup Equipment | No | Equipment remains optional. |
| Match Status | `gr_matchstatus` | Choice | Yes | Import accepts exact/manual matches. |
| Import Status | `gr_importstatus` | Choice | Yes | Recoverable import state. Staging/Failed rows are excluded from the active queue. |
| Review Started On | `gr_reviewstartedon` | Date/time | No | Explicit Start Review only. |
| Waiting On | `gr_waitingon` | Choice | No | Null means not waiting. |
| Waiting Note | `gr_waitingnote` | Multiline 4,000 | No | App-required while waiting. |
| PO Required | `gr_porequired` | Yes/No | No | Null means undecided. |
| PO Number | `gr_ponumber` | Text 100 | No | Manager-confirmed, distinct from extracted Order No. |
| PO Received On | `gr_poreceivedon` | Date/time | No | Requires PO Number. |
| Photos Required | `gr_photosrequired` | Yes/No | No | Manual V1 decision. |
| Photos Status | `gr_photosstatus` | Choice | No | Used when photos are required. |
| Photo Request Technician | `gr_photorequesttechnician` | Lookup Mechanic | No | Deliberate selection, never inferred from allocation. |
| Photo Request Prepared On | `gr_photorequestpreparedon` | Date/time | No | Preparation, not delivery proof. |
| PO Request Prepared On | `gr_porequestpreparedon` | Date/time | No | Preparation, not delivery proof. |
| Current Revision | `gr_currentrevision` | Lookup Revision | No | Set after atomic persistence. |
| Disposition | `gr_disposition` | Choice | No | Null while active. |
| Disposition On | `gr_dispositionon` | Date/time | No | Terminal transition time. |
| Disposition Reason | `gr_dispositionreason` | Multiline 4,000 | No | Required for Do Not Process. |

Built-in owner, created/modified user/time and ETag own audit, last-updated display and
concurrency. Do not duplicate actor display names.

## Invoice Revision

Schema `gr_ChargeableInvoiceRevision`; entity set `gr_chargeableinvoicerevisions`. Required
Review + Revision Number is a composite alternate key. Persist extraction version/confidence,
invoice number/date, raw Order No, GreenTree reference, account/customer/site snapshots,
headline, fleet/make/model/serial, meter, Date of Job, service interval/next due, repair
description, work completed, subtotal, GST rate/amount, total and exact extraction JSON. Values
are immutable. Required Source Document identifies the original PDF.

## Invoice Line

Schema `gr_ChargeableInvoiceLine`; entity set `gr_chargeableinvoicelines`. Required Revision +
Line Key is a composite alternate key. Persist type, description, quantity Decimal, unit price
Currency, extended price Currency, sort order, confidence and raw text. Rows are immutable.

## Review Correction

Schema `gr_ChargeableInvoiceCorrection`; entity set `gr_chargeableinvoicecorrections`. Require
Review and Source Revision; Source Line is optional. Persist correction type, field key, original
snapshot, requested text, requested line type/description/quantity/unit price, comparison status
and optional Matched Revision. Original extracted values are never mutated.

## Review Document

Schema `gr_ChargeableInvoiceDocument`; entity set `gr_chargeableinvoicedocuments`. Require
Review; Revision is optional. Persist document type, File (`gr_file`), its Dataverse-generated
`gr_filename` companion, content type, byte count, generated template version, source snapshot hash,
required upload status and optional safe upload error (Multiline 1,000). A document begins Pending,
becomes Complete only after the File write succeeds, and becomes Failed when a known failure is
recorded. Source invoice PDFs are
immutable and V1 managers have no Delete privilege.

File bytes cannot participate in the metadata change set. A first import therefore creates a
Staging review and Pending document, uploads the file, and only then atomically creates the
immutable revision/lines/activity and activates the review. A failed first import remains
recoverable and hidden from the active queue; retry reuses that review rather than creating a
duplicate. Existing Active reviews remain Active while a later revision document is staged.

The approved V1 policy keeps the verified **5 MiB per-upload limit** and provides clear client
and server validation. It does not change the organisation limit or silently compress source
PDFs. Any future file-limit or photo-compression change requires separate approval and reverifies
existing File workflows.

## Review Activity

Schema `gr_ChargeableInvoiceActivity`; entity set `gr_chargeableinvoiceactivities`. Require
Review; allow optional Revision, Document and Correction. Persist event Choice, safe detail and
occurred-on; built-in createdby is the actor. Activity is append-only in the application and
managers receive no Delete.

## Relationships and preservation

- Job/Customer/Site/Equipment/Mechanic deletion removes the lookup only; reviews survive.
- Review-to-child relationships use Restrict; no V1 UI/role deletes historical records.
- Current Revision uses Restrict and is set only after revision/document/lines succeed.
- User ownership does not make the queue private; organisation-depth manager grants share it.

## Provisioning and verification

`scripts/manage-chargeable-invoice-review-schema.ps1` exposes `Inspect`, `Provision` and
`Verify`. The original approved run created the metadata and unassigned role, published, then verified
the contract and all 30 organisation-depth grants. It created no business rows, assigned no
users or teams, did not change the organisation limit, and did not grant the new tables to
Service Operations. The recoverable staging columns above are approved in the authoritative
contract but remain pending a separately authorised provisioning run.
