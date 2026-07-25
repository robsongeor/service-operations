# Maintenance Architecture

## Purpose

Maintenance determines which service levels apply to Equipment, when each level is due, and
how completed Service Jobs advance maintenance state.

## Architecture

Maintenance Profile and Service Programme are independent inputs resolved into one
configuration by the shared maintenance domain module. Programme selects applicable service
levels; Profile selects time intervals. Pure calculation and status helpers remain separate
from Dataverse reads and writes.

Service completion is a coordinated workflow under the generic Jobs completion framework.
It reloads authoritative records, validates the request, and applies Job, Equipment, and
plan updates atomically.

## Major Dataverse Relationships

- Equipment owns its maintenance configuration and current hour reading.
- Equipment stores the Date Only value `gr_currenthourmeterrecordeddate` alongside its
  current hour reading. The two values are saved together; `modifiedon` is not a substitute.
- Equipment Service Plan records represent A, B, and C state.
- Service Jobs reference Equipment and save their Service Type and completion reading.
- Historical Jobs and inactive plans remain readable.

## Shared Components and APIs

`maintenanceConfiguration.ts` resolves Programme and Profile rules. Calculation and status
helpers feed Equipment, Jobs, and Customer views. All Service completion entry points use
`completeServiceJobAtomically`.

## Important Business Rules

- Fixed hour intervals are A 250, B 1,000, and C 2,000.
- ICE Standard applies A/B/C; Electric Standard applies A/C.
- Service levels are cumulative: A satisfies A, B satisfies A and B, and C satisfies A, B,
  and C. The active Service Programme may remove levels; Electric Standard uses A and C, so
  Electric C satisfies A and C and never creates or updates B.
- High Usage intervals are 6 weeks/6 months/12 months.
- Standard intervals are 3/12/24 months.
- Low Usage intervals are 6/24/48 months.
- Custom intervals are positive whole-day values for enabled levels.
- Missing configuration falls back to Standard Profile + ICE Standard Programme.
- Inactive plans do not make Equipment due but retain history.
- Programme changes never delete history or invent a completion.
- A Service completion requires the expected Equipment, saved Service Type, and a whole,
  non-decreasing hour reading.
- Manual Maintenance History edits require a reading date. New manual readings default to
  the current New Zealand calendar date, while existing saved dates remain unchanged.

## Extension Points

Future Programmes or Profiles should extend the resolver contract. Definition tables may
replace seeded choices provided consumers continue receiving the same resolved configuration.

## Implementation Constraints

Never split atomic Service completion into separate writes. Use ETags for concurrency and
verify authoritative state before treating a retry as idempotent success. Never substitute
the current Equipment reading for a missing historical Job reading.

## Related Files and Documents

- [`../../src/alpha/equipment/servicePlans/maintenanceConfiguration.ts`](../../src/alpha/equipment/servicePlans/maintenanceConfiguration.ts)
- [`../../src/alpha/equipment/servicePlans/servicePlanCalculations.ts`](../../src/alpha/equipment/servicePlans/servicePlanCalculations.ts)
- [`../../src/alpha/jobs/completion/serviceCompletionApi.ts`](../../src/alpha/jobs/completion/serviceCompletionApi.ts)
- [Equipment](equipment.md)
- [Jobs](jobs.md)
- [Maintenance Dataverse schema](../maintenance-programmes-dataverse.md)
