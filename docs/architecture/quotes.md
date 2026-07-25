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

## Important Business Rules

- A Job may be linked to a Quote but does not require one.
- Quote linkage must not alter Job Status.
- Author identity is the persisted creator, never a display-name inference.
- Revisions and historical Quotes are preserved.

## Extension Points

Future approval, pricing, document-generation, or conversion workflows should build on the
Quote identity and revision model while coordinating explicitly with Jobs.

## Implementation Constraints

Avoid per-row Dataverse lookup requests. Preserve creator and revision history. Keep
commercial state distinct from operational Job and Job Card state.

## Related Files and Documents

- [`../../src/alpha/quotes/QuotesScreen.tsx`](../../src/alpha/quotes/QuotesScreen.tsx)
- [`../../src/alpha/quotes/PricingScreen.tsx`](../../src/alpha/quotes/PricingScreen.tsx)
- [`../../src/alpha/quotes/services/quotesApi.ts`](../../src/alpha/quotes/services/quotesApi.ts)
- [`../../src/alpha/quotes/services/pricingApi.ts`](../../src/alpha/quotes/services/pricingApi.ts)
- [Quotes Dataverse schema](../quotes-dataverse-schema.md)
- [Jobs](jobs.md)
- [Dataverse](dataverse.md)
