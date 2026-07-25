# Dataverse Architecture

## Purpose

Dataverse is the authoritative operational data store for Customers, Sites, Contacts,
Equipment, Jobs, schedules, assignments, Quotes, WOF, and maintenance plans.

## Architecture

The browser obtains delegated Dataverse access through MSAL and calls the Web API through
feature services. Components do not issue ad hoc Dataverse requests. Multi-record business
transitions use workflow services and atomic batch change sets where consistency requires
it.

Anonymous public-portal requests terminate at the server API. `JobSubmissionService` owns
token validation, minimal public Job lookup, validation, and submission persistence. It uses
a dedicated least-privilege Dataverse Application User; the public browser never receives
Dataverse access or server credentials.

The durable relationship chain is Customer → Site → Contact/Equipment → Job, with schedules,
assignments, Job Cards, Quotes, WOF inspections, and service plans attached to their owning
records.

## Major Relationships

- Site belongs to Customer.
- Contacts associate with Sites.
- Equipment belongs to Site and derives Customer through Site.
- Jobs reference Customer, Site, and optionally Equipment.
- Job Assignments, schedule options, and Office Updates belong to Jobs.
- Service Plans and WOF inspections belong to Equipment.
- Quotes may reference Customer, Equipment, and Job.

## Shared APIs and Validation

Feature services own OData queries, mappings, lookup bindings, and payloads. Domain helpers
own reusable choices, calculations, and validation. Workflows reload authoritative state
when concurrency matters and update local state after successful mutations.

## Important Business Rules

- Never infer relationship truth from display text.
- Never invent schema names or Choice values.
- Historical child records are preserved.
- A current-state field does not replace historical records.
- Equipment Customer is derived, not duplicated.
- Atomic workflows use ETags to reject stale changes.

## Extension Points

New tables and fields require a schema document and, where repeatability matters, an
idempotent provisioning or verification script. Prefer relationships and typed contracts
that extend existing ownership boundaries.

## Implementation Constraints

Confirm logical names, entity-set names, lookups, and Choice values from metadata, code, or
schema documentation. Use named constants, explicit null handling, minimal field selection,
and correct OData bindings. Do not provision or migrate Dataverse as an incidental coding
step.

## Related Files and Documents

- [Knowledge base schema map](../README.md#feature-architecture)
- [Shared services](shared-services.md)
- [Security](security.md)
- [`../../scripts`](../../scripts)
