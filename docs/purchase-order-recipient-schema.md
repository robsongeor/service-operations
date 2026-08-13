# Purchase Order Recipient Dataverse Schema

## Purpose

`gr_PurchaseOrderRecipient` stores current customer-facing email routing used when requesting a
purchase order. It is configuration, not proof that an email was delivered or a PO was received.

## Table

Schema `gr_PurchaseOrderRecipient`; entity set `gr_purchaseorderrecipients`; User-owned; primary
name `gr_name`.

| Display name | Logical name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Name | `gr_name` | Text 200 | Yes | Generated scope/role/contact label. |
| Customer | `gr_customer` | Lookup Customer | Yes | Owns defaults and Site overrides. |
| Site | `gr_site` | Lookup Site | No | Null is Customer default; populated is a complete Site override. |
| Contact | `gr_contact` | Lookup Contact | Yes | Supplies the current name and email. |
| Recipient Role | `gr_recipientrole` | Choice | Yes | `122830000` Primary; `122830001` CC. |
| Sort Order | `gr_sortorder` | Whole number | Yes | Primary is zero; CC order follows selection. |

Customer, Site and Contact relationships use Restrict deletion. Built-in owner, timestamps and ETag
provide configuration audit and optimistic concurrency.

## Rules

- A configured scope has exactly one Primary and zero or more unique CC contacts.
- The Primary cannot also be CC.
- Site rows replace the complete Customer default; recipients are never silently merged.
- Removing all Site rows restores Customer inheritance.
- Customer defaults may use an emailed Contact owned by the Main customer or associated through
  one of the Customer's Sites. Site overrides are limited to Contacts associated with that Site.
- Managers may create a new emailed Contact inline while configuring PO routing. Creation uses the
  existing `gr_contact` table and, when a specific Site is chosen, `gr_sitecontact`; it adds no
  column or relationship to this table. The Contact must have a name and valid email address.
- Saving atomically deletes the ETag-checked current scope and creates its replacement. It changes no
  Contact, other Site, invoice, Job, or historical review evidence.
- Chargeable Invoice Review resolves one effective set and opens an editable `mailto:` draft with
  Primary in To and the rest in CC. Nothing is sent automatically.

## Security and provisioning

The unmanaged `Service Operations` and `Chargeable Invoice Manager` roles receive organisation-depth
Create, Read, Write, Delete, Append and Append To. Assign and Share are not added. Provisioning is
owned by `scripts/manage-chargeable-invoice-review-schema.ps1` and remains idempotent.
