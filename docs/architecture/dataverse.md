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

Coordinators acquire one delegated token for a logical load/mutation and pass it to all
participating services. Related reads are selected/expanded or run in parallel, duplicate
in-flight loads are coalesced, and refreshes reload only the authoritative affected
projection. Administrative workflows use one authenticated connection per invocation and
batch metadata retrieval instead of reconnecting for each table or field.

Site Check creation composes the canonical Job payload builder with one Dataverse change
set: occurrence create, ETag-guarded schedule active-pointer update, and all Equipment Job
creates. Content-ID references link the schedule and Jobs to the newly created occurrence;
any nested failure rolls back the entire set. Creation preflight and reconciliation reuse
one supplied delegated token. An unknown result is accepted only when the request-key
occurrence exists, the schedule points to it, and the linked Job count equals the immutable
expected count.
The replay path avoids Equipment and mechanic reads after locating its request-key record;
new-request schedule, Equipment, and mechanic preflight reads run in parallel. An active
pointer after a negative request-key lookup is an immediate concurrent-manager conflict,
without repeating the lookup.

## Important Business Rules

- Never infer relationship truth from display text.
- Never invent schema names or Choice values.
- Historical child records are preserved.
- A current-state field does not replace historical records.
- Equipment Customer is derived, not duplicated.
- Atomic workflows use ETags to reject stale changes.
- Interactive authentication is never a Dataverse retry strategy.
- `WhoAmI`, metadata, and record reads are not repeated per child row when one validation or
  batched query can cover the operation.

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
