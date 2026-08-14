# WOF Architecture

## Purpose

WOF manages road-compliance work and inspection history for road-registered Equipment. Jobs
provide the operational scheduling backbone; WOF records preserve compliance-specific state.

## Architecture

Road eligibility is resolved by the shared Equipment compliance domain. WOF screens and
Customer Dashboard summaries consume that result rather than implementing their own
eligibility tests. Inspection records remain readable even when Equipment later becomes
ineligible for new WOF work.

The WOF Management screen is the office work queue for this lifecycle. It derives an
operational workflow status from the Equipment expiry, latest WOF Inspection, linked Job,
and confirmed schedule option. Due Soon or Expired Equipment opens the shared Job creation drawer with
WOF, Equipment, Customer, and Site preselected. Existing work opens the manager-facing
shared Job edit drawer in place on the WOF screen; the WOF feature does not implement a
second Job editor. Successful Job mutations refresh only the WOF workflow datasets needed
by the affected row.

## Major Dataverse Relationships

- WOF inspections reference Equipment.
- WOF work uses Jobs for operational scheduling and technician workflows.
- Equipment holds current registration, REGO expiry, WOF expiry, and compliance state.
- Historical inspections and Jobs are retained across compliance transitions.

See `docs/wof-dataverse-schema.md` for schema detail.

## Shared Components and APIs

`equipmentCompliance.ts` owns typed compliance choices and eligibility. Shared Date Only
helpers parse, format, load, and save WOF and registration dates without timezone shifts.

## Important Business Rules

- Road Registered Equipment is eligible for new WOF work.
- Deregistered and Off Road Equipment is excluded from new selection and operational WOF
  summaries.
- A confirmed On-road to Off-road transition clears the Equipment registration number,
  REGO expiry, and WOF expiry. Jobs and inspections remain preserved.
- An existing WOF record may retain ineligible Equipment for historical readability.
- Returning Off-road Equipment to On-road requires the current registration number.
- Date Only values must retain their calendar date across environments.
- Only one unfinished WOF cycle may exist per Equipment. Creation must recheck Dataverse
  immediately before saving and direct the user to the existing Job when one is present.
- If Job creation succeeded but its WOF Inspection write failed, retrying from the WOF queue
  repairs the missing Inspection link against that active Job instead of creating a duplicate.
- A completed Inspection remains ready for office administration until its new expiry is
  written to the Equipment record. The Equipment then returns to normal expiry monitoring.
- A WOF Job cannot transition to Complete until a valid new expiry is supplied. Completion
  also requires the shared, visible Job Completion Date. That date defaults to today, may be
  corrected to a non-future date, is written to the Job Completed Date, and owns the WOF Inspection
  date. The hour-meter reading date remains separate when its gated schema is enabled. Completion
  resolves the Inspection through its explicit Job lookup, verifies its Equipment against
  the Job Equipment, updates and confirms the Inspection and authoritative Equipment
  expiry, and only then completes the Job. Never infer this relationship from text fields.

## Extension Points

A future registration-history child table can record state transitions while the Equipment
fields continue representing current state. Additional compliance regimes should extend the
typed eligibility domain.

## Implementation Constraints

Use the authoritative compliance Choice for decisions. Compatibility fields may mirror
writes or support unmigrated records but must not become new sources of truth. Never run
Date Only values through local timezone conversion.

## Related Files and Documents

- [`../../src/alpha/wof/WofScreen.tsx`](../../src/alpha/wof/WofScreen.tsx)
- [`../../src/alpha/wof/hooks/useWof.ts`](../../src/alpha/wof/hooks/useWof.ts)
- [`../../src/alpha/wof/services/wofApi.ts`](../../src/alpha/wof/services/wofApi.ts)
- [`../../src/alpha/wof/utils/wofRules.ts`](../../src/alpha/wof/utils/wofRules.ts)
- [WOF Dataverse schema](../wof-dataverse-schema.md)
- [Jobs](jobs.md)
- [Equipment](equipment.md)
