# WOF Architecture

## Purpose

WOF manages road-compliance work and inspection history for road-registered Equipment. Jobs
provide the operational scheduling backbone; WOF records preserve compliance-specific state.

## Architecture

Road eligibility is resolved by the shared Equipment compliance domain. WOF screens and
Customer Dashboard summaries consume that result rather than implementing their own
eligibility tests. Inspection records remain readable even when Equipment later becomes
ineligible for new WOF work.

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
- Compliance transitions do not erase registration values, expiry values, Jobs, or
  inspections.
- An existing WOF record may retain ineligible Equipment for historical readability.
- Re-registration requires the current registration number.
- Date Only values must retain their calendar date across environments.

## Extension Points

A future registration-history child table can record state transitions while the Equipment
fields continue representing current state. Additional compliance regimes should extend the
typed eligibility domain.

## Implementation Constraints

Use the authoritative compliance Choice for decisions. Compatibility fields may mirror
writes or support unmigrated records but must not become new sources of truth. Never run
Date Only values through local timezone conversion.
