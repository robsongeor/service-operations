# Customer Dashboard Architecture

## Purpose

Customer Dashboard provides a customer-centred operational view across Sites, Equipment,
Jobs, Quotes, and road compliance.

## Architecture

The dashboard composes data owned by other features. It may coordinate navigation and local
presentation state, but it does not create a separate Customer data model or reimplement
Equipment, Job, Quote, or WOF rules.

## Major Dataverse Relationships

- Customer owns Sites.
- Sites relate to Contacts and Equipment.
- Equipment and Jobs expose operational history within the selected Customer.
- WOF summaries use the current Equipment relationship and compliance state.

## Shared Components and APIs

Customer selection uses the shared searchable selector. Customer and Site editing uses the
shared drawer presentation while retaining Customer-owned forms and services. Embedded Job
and Equipment actions delegate to their feature workflows.

Each persisted Site section can transfer multiple existing Equipment records to that Site.
The transfer uses the shared drawer and confirmation presentation, displays each machine's
current Customer and Site, and delegates the narrow Site-lookup mutation to the Equipment
workflow. Successful moves update the dashboard projection immediately; failures remain
selected for an individual retry.

Each persisted Site also owns an optional `gr_defaultmaintenanceprofile` Choice using the
same numeric values as Equipment `gr_maintenanceprofile`. Site Settings can save that
default and, only after explicit selection and confirmation, apply it to existing Equipment.
New Equipment inherits the selected Site default unless the user explicitly chooses another
profile. Transfers may explicitly adopt the destination default; otherwise the existing
Equipment profile is preserved.

## Important Business Rules

- Site Equipment is grouped by the actual Site relationship.
- Equipment Customer is derived through Site.
- Current WOF expiry comes from the loaded Equipment summary, not a historical inspection
  snapshot.
- Date Only values use shared WOF formatting.
- Disclosure and view state is keyed by durable Dataverse IDs and scoped to the selected
  Customer so local mutations do not reset unrelated sections.
- Equipment transfer changes the current Equipment Site lookup and may explicitly adopt the
  destination maintenance default. It never rewrites historical Jobs, service plans, or
  maintenance history.
- The Last Known Hour Meter recorded date is derived from the latest already-loaded completed
  Job containing an hour-meter reading, avoiding per-row Dataverse requests.

## Extension Points

Add new customer-centred summaries by composing existing typed feature data or shared query
expansions. New editing actions should open the owning feature workflow.

## Implementation Constraints

Avoid per-row requests when related values can be loaded through the parent query. Do not
copy domain calculations into dashboard components or use temporary UI IDs as durable keys.

## Related Files and Documents

- [`../../src/alpha/customers/CustomerDashboardScreen.tsx`](../../src/alpha/customers/CustomerDashboardScreen.tsx)
- [`../../src/alpha/customers/CustomerDrawer.tsx`](../../src/alpha/customers/CustomerDrawer.tsx)
- [`../../src/alpha/customers/EquipmentTransferDrawer.tsx`](../../src/alpha/customers/EquipmentTransferDrawer.tsx)
- [Equipment](equipment.md)
- [Jobs](jobs.md)
- [Shared components](shared-components.md)
