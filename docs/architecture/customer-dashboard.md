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

## Important Business Rules

- Site Equipment is grouped by the actual Site relationship.
- Equipment Customer is derived through Site.
- Current WOF expiry comes from the loaded Equipment summary, not a historical inspection
  snapshot.
- Date Only values use shared WOF formatting.
- Disclosure and view state is keyed by durable Dataverse IDs and scoped to the selected
  Customer so local mutations do not reset unrelated sections.
- Equipment transfer changes only the current Equipment Site lookup. It never rewrites the
  Site relationship retained on historical Jobs or other operational history.

## Extension Points

Add new customer-centred summaries by composing existing typed feature data or shared query
expansions. New editing actions should open the owning feature workflow.

## Implementation Constraints

Avoid per-row requests when related values can be loaded through the parent query. Do not
copy domain calculations into dashboard components or use temporary UI IDs as durable keys.
