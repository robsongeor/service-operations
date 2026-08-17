# Maintenance Architecture

## Purpose

Maintenance determines which service levels apply to Equipment, when each level is due, and
how completed Service Jobs advance maintenance state.

## Architecture

Default Maintenance Profile and Service Programme are independent inputs resolved into one
configuration by the shared maintenance domain module. Programme selects applicable service
levels; Profile supplies maximum/fallback time intervals. Pure calculation and status helpers
remain separate from Dataverse reads and writes.

Service completion is a coordinated workflow under the generic Jobs completion framework.
It reloads authoritative records, validates the request, and applies Job, Equipment, and
plan updates atomically.

## Major Dataverse Relationships

- Equipment owns its maintenance configuration and current hour reading.
- Equipment stores the Date Only value `gr_currenthourmeterrecordeddate` alongside its
  current hour reading. The two values are saved together; `modifiedon` is not a substitute.
- Equipment Service Plan records represent A, B, and C state.
- Every completed Job references Equipment and saves its completion reading. Service Jobs also
  save Service Type and advance the applicable maintenance plans.
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
- Every Job type contributes completion readings equally to the Equipment usage forecast.
  Estimated readings remain usable but reduce confidence. Isolated bad readings are ignored,
  while a sustained lower sequence is treated as a meter reset and starts a new segment.
- When completed Jobs contain usable meter evidence, the reading from the latest dated completed
  Job is the operational Last Known Hour Meter for displays, completion comparisons, service-due
  calculations, and forecasts. The Equipment current-meter fields are a fallback only when no such
  Job reading exists; a stale Equipment snapshot is not appended to Job evidence.
- Job meter dates are Date Only, so time-of-day precision is unavailable. Forecasting retains
  closely dated readings as evidence but does not calculate a usage rate until accepted readings
  span at least seven calendar days; this avoids treating an overnight interval as a full day.
  Interval rates and their consistency influence are weighted by elapsed days, so longer baselines
  carry proportionally more weight than adjacent-day observations.
- The expanded Average Machine Usage panel explains its confidence in plain language using the
  actual limiting evidence, such as readings outside the 360-day forecast window, an insufficient
  date span, stale evidence, inconsistent usage, anomalies, resets, or estimated readings. Job type
  and Site do not affect confidence.
- Usage history is ordered by the Job meter-recorded date, falling back to Completed Date only for
  legacy rows. Older Service readings do not roll current Equipment or newer active plan state back.
- Each configured service plan derives a read-only Next Service recommendation from the forecast date
  when average usage reaches its due-hour threshold once forecast confidence is at least 40%. Below
  that threshold, or when the forecast is unsafe or unavailable, the stored profile calendar date is
  the fallback.
  The compact service disclosure keeps the effective interval beside the A, B, or C Service title and
  shows Last Completed and Next Due By dates at a glance. When Last Completed is linked to a Job, its
  compact summary also shows that Job number and recorded completion hours; due-hour calculations, interval reasoning,
  and other saved completion history expand on demand. The summary states whether
  calendar, projected hours, or both determined the recommendation and carries forecast confidence
  when hours determine it. An overdue recommendation says Book now. Missing or unsafe usage forecasts
  fall back to the profile date recalculated from the plan's last-completed baseline.
- Once the usage forecast reaches a score of 40 or higher, has a positive average, and has no confirmed
  meter reset, each service level converts its fixed hour interval into the authoritative live time
  interval and may schedule earlier or later than the manager-selected profile. The saved Default
  Maintenance Profile is used only when confidence is below 40% or the forecast is unavailable or
  unsafe. The UI keeps the forecast confidence and scheduling source visible on each service plan.
- After every Job completion with an hour-meter reading, the completion workflow reloads authoritative
  Jobs, Equipment, and service plans, recalculates the 360-day forecast, and persists each active
  plan's effective `gr_nextduedate`. At 40% confidence or higher this is the projected due-hour date;
  otherwise it is the current profile interval applied to the last-completed date. Service completion
  additionally resets the satisfied A/B/C baselines and due-hour thresholds before this recalculation.
  The estimator does not create Jobs or Scheduler options.
- The historical service baseline workflow is a temporary/manual bridge for maintenance not
  represented by Jobs, especially newly entered Equipment. It is labelled separately from Job-backed
  usage forecasting. When completed Job meter evidence exists, the form does not offer to replace
  the Job-authoritative Last Known Hour Meter. New fallback readings require a date and default to
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
