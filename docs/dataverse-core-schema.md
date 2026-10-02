# Dataverse Core Schema Map

This document records the core operational tables and relationship paths used by Service
Operations. It is the first reference for deciding where Customer, Site, Contact, Equipment,
and Job information is stored. Feature-specific schema documents remain authoritative for
additional columns and workflows.

## Core tables

| Business record | Logical name | Entity set | Important relationships |
| --- | --- | --- | --- |
| Customer | `gr_customer` | `gr_customers` | Root customer/account record. |
| Site | `gr_site` | `gr_sites` | `gr_Customer` points to the owning Customer. Site name and physical address belong here. |
| Contact | `gr_contact` | `gr_contacts` | Stores the person's name, phone, and email. A Contact is not the Site relationship itself. |
| Site Contact | `gr_sitecontact` | `gr_sitecontacts` | Junction record: `gr_Site` points to Site and `gr_Contact` points to Contact. This is how Contacts are associated with Sites. |
| Equipment | `gr_equipment` | `gr_equipments` | `gr_Site` points to its current Site. Customer is derived through that Site. |
| Job | `gr_job` | `gr_jobs` | May point directly to `gr_Equipment`, `gr_Site`, `gr_Contact`, and `gr_Mechanic`. Customer is derived through Site; the selected Contact is the underlying Contact from a Site Contact association. |
| Job Book Entry | `gr_jobbookentry` | `gr_jobbookentries` | Intake ledger with current Equipment, Customer, Site, Contact, Mechanic, and promoted-Job lookups plus snapshots. Its direct `gr_Contact` lookup retains the selected Site Contact before promotion. |

## Relationship flow

1. Select a Customer.
2. Query Sites whose `gr_Customer` lookup matches that Customer.
3. Select a Site.
4. Query `gr_sitecontact` rows whose `gr_Site` lookup matches that Site.
5. Present each linked `gr_Contact` as a Contact option.
6. A managed Job stores the selected `gr_contact` ID in its direct `gr_Contact` lookup.

The Site Contact junction constrains which Contacts are valid for a Site. It is not currently
stored on a Job. Never infer these relationships from matching display names.

## Job Book Contact extension

The optional `gr_jobbookentry.gr_Contact` lookup is provisioned and published. Set
`VITE_JOB_BOOK_CONTACT_LOOKUP_ENABLED=true` in each deployed build so the drawer loads Contacts
through `gr_sitecontact` and saves the selected underlying Contact, matching the managed Job contract.

The idempotent metadata definition lives in
`scripts/manage-job-book-intake-schema.ps1`. Provisioning is a deliberate Dataverse migration and
grants the restricted Job Book role read access to Site Contact and read/append-to access to Contact.
Deployment must still include a target-user smoke test.
