# Current State

Branch: `codex/site-checks`

## Deployment status

- Version `v1.3.0` contains Technician Job Card Submission Phases 1 and 2 and the modular
  architecture knowledge base.
- The expanded Dataverse schema, relationships, and least-privilege role updates were
  provisioned, published, verified, and passed a second idempotency run on 25 July 2026.
- Version `v1.3.0` is the current production release.
- Production server-only portal settings must be present for public submission endpoints to
  authenticate to Dataverse.

## Unfinished work

- Run a Site Checks Site Settings smoke test as an assigned non-admin Service Operations user.
- Run the combined Site Checks Phase 8 target-environment validation: verified maximum-Site
  request observation, non-admin creation/completion, manual accessibility, and rollback
  review. Use one existing signed-in session and do not automatically retry authentication.
- Confirm the four server-only `DATAVERSE_*` settings are present in the production
  Static Web App / Function environment.
- Run a production-safe Technician Job Card smoke test.

## Recent milestone

The approved Manual Site Check Equipment selection schema was provisioned and published on
26 July 2026 using one cached `LoginPrompt=Never` connection. Schedule Equipment Scope now
includes Manual Selection `122830002`. The new organisation-owned
`gr_sitecheckscheduleequipment` table has required Schedule and Equipment lookups with
Restrict behavior and a composite Schedule + Equipment alternate key. Same-session
structural verification passed; an immediate read-only check found the new key Pending and
the next cached verification confirmed it Active. A read-only privilege audit confirmed the
Service Operations role initially had no access to the new table. After separate explicit
approval, Create, Read, Delete, Append, and Append To were added and verified at Organisation
depth. Write, Assign, Share, user assignments, data rows, and other privileges were unchanged.

Manual Selection application integration is complete locally. The Site Checks coordinator
loads all Schedule selections in one batched request using the existing silent token. Site
Settings reuses the shared searchable multi-select and removable selected summary. Schedule
and selection additions/removals save in one ETag-aware Dataverse change set. Run preview
and authoritative creation both intersect saved IDs with current Site Equipment, so stale
transferred-away rows cannot create Jobs and zero current matches are blocked. Focused Site
Checks and Customer Dashboard tests, lint, and production build pass.

A signed-in desktop smoke on Air New Zealand / Can Park Auckland verified that Manual
Selection exposes exactly the three current-Site machines and that selection/removal updates
the summary. The smoke caught and corrected a hidden-panel JSX placement error before any
save. The completed write check created one enabled Weekly Schedule due 26 July 2026 with
FN1579 as its only manual selection. Reload preserved the Schedule and selection, Customer
summary showed one Due Site, and Run Site Check preview showed one included machine, two
excluded machines, and one Job to be created. The preview was cancelled, so no occurrence or
Job was created. Phase 10 is complete.

At the user's explicit request, all Site Checks test data was permanently removed on
26 July 2026. One atomic transaction cleared one active Schedule pointer and deleted two
Schedules, two occurrences, and three parent-linked Site Check Jobs. A second idempotent
verification widened the Job predicate to include both the parent lookup and Job Type
`122830004`; it confirmed zero Schedules, zero occurrences, and zero Site Check Jobs remain.
The schema, Choice columns, relationships, and application implementation remain intact.

Equipment Ownership and Site Check Equipment Scope application integration is complete.
The canonical Equipment drawer reads and writes Not classified, Customer owned, and
Liftrucks rental through `gr_ownershiptype`; create, normal edit, bulk create, and CSV edit
paths preserve the nullable classification. Site Settings reads and writes
`gr_equipmentscope` through the existing ETag-aware Schedule workflow. One shared inclusion
policy filters both the Run drawer preview and the authoritative preflight; rental-only
scope excludes Customer-owned and Not classified Equipment and blocks creation at zero
matches. Existing/null scope remains All Equipment and historical occurrences are
unchanged. Full tests, lint, and production build pass.

The Equipment ownership/Site Check scope schema extension was approved, provisioned,
published, and verified on 26 July 2026 through the existing single-connection,
`LoginPrompt=Never` tool. Equipment now has optional `gr_ownershiptype` (Customer Owned or
Liftrucks Rental; null is Not classified), and Site Check Schedule has optional/default-All
`gr_equipmentscope` (All Equipment or Liftrucks Rentals Only). No data rows, privileges,
relationships, or historical records changed. The first idempotent pass created Equipment
Scope and exposed a wrapped DateTimeBehavior comparison bug before publish; the corrected
retry recognized that compatible column, created Equipment Ownership, published both
tables, and passed same-session verification.

The approved target-environment Site Checks lifecycle passed for Air New Zealand / Can Park
Auckland on 26 July 2026. The signed-in session created and reloaded an enabled Monthly
Schedule, created one occurrence with exactly three Equipment Jobs assigned to Anura, and
completed FN1579, FN2461, and FN2464 through operational Job Status. The final Job
atomically completed the occurrence and rolled the Schedule to 26 August 2026. Customer
summary counts became Up to date `1`, Due `0`, Overdue `0`, and In progress `0`; History
retained a Complete `3/3` entry. Operational Jobs excluded the Site Check records, the
dedicated Site Check view retained all three completed Jobs, and Scheduler continued to
exclude Site Checks. This proves the lifecycle for the signed-in account but does not by
itself prove that account is least-privilege non-admin.

Site Checks Phase 8 offline hardening is complete. Request budgets, 22-Equipment transaction
size, batching, paging, N+1 avoidance, silent-token coalescing, disabled-history
preservation, and absence of interactive authentication/DELETE paths are locally tested.
The new operations guide owns the single-session smoke test and non-destructive rollback.
Phase 8 remains In progress for target-environment and manual accessibility validation.
An existing authenticated Codex-browser session completed a no-write pass without another
sign-in prompt: disabled-Schedule dashboard exclusion, the Site Checks settings surface,
Operational/Site Check/All Jobs semantics, Scheduler type exclusion, and initial labelled
drawer focus were rendered successfully. The 390 CSS-pixel audit found document-level
horizontal overflow (444 pixels on Customer Dashboard and wider on Scheduler), but the
product owner confirmed mobile/narrow responsive layouts are not supported and this is not
a release blocker. Manual desktop Tab/Escape, screen-reader, and 200% zoom validation
remains open alongside the non-admin write/completion, maximum-Site, and rollback checks.
Authenticated desktop validation also found and fixed Site Settings focus return: Escape
closes the drawer and focus now returns to the exact invoking Site settings button. Focused
Customer Dashboard and Site Checks tests pass; manual Tab traversal, screen-reader reading
order, and desktop 200% zoom remain open.
The Site Checks tracker was reconciled with its status summary, the Customer Dashboard
architecture now records focus return, and the Unreleased changelog records the completed
subsystem work and remaining release gates.

Site Checks Phase 7 and the final Phase 4 navigation item are complete locally. Current,
post-start, completed, and permanent disabled-Schedule history access share an accessible
Site Check details drawer with Summary, Jobs & Equipment, and History tabs. History and
generated rows use continuation-safe 25-record pages; Job rows expand Equipment and current
technician without N+1 requests. Canonical Job and Equipment drawers retain the parent and
restore focus. Concurrent initial reads coalesce silent token acquisition, with no
interactive sign-in path.

Site Checks Phase 6 is complete locally. Both Jobs table and drawer operational-status
mutations now route generated Jobs through one Site Check completion service. It performs
authoritative parent/sibling reads, expected-count integrity validation, ETag concurrency,
atomic final Job/occurrence/Schedule rollover, NZ Date Only cadence calculation, 412/retry
reconciliation, and completed-parent reopen blocking. Job Card Status remains independent.
Jobs and mounted dashboard projections refresh after mutations. Focused and full regression
tests, lint, and production build pass without live Dataverse access or sign-in prompts.

Site Checks Phase 5 is complete locally. Jobs now defaults to Operational, which excludes
Site Check Type; a dedicated Site Checks tab and explicitly unfiltered All jobs remain.
Versioned view/default migration maps legacy All to Operational while preserving existing
status, search, office/schedule, sort, reset, and sticky-column behavior. A shared Jobs-owned
Scheduler eligibility rule excludes Unconfirmed and Site Check Jobs from projection and
create/confirm/update mutations. Scheduler tabs omit Site Check, while historical erroneous
options remain stored, hidden, and counted for review. Focused tests, lint, and build pass.

Site Checks Phase 4 is complete locally. The canonical Job create mapping is reusable and
Site Check Job Type creation is protected from ordinary/WOF entry points. The atomic
creation service builds occurrence, ETag schedule lock, and all Equipment Jobs in one
Content-ID change set. The representative largest-Site fixture is 24 operations and 15,820
bytes, including inactive Equipment, with a conservative 4 MiB fail-before-request guard.
Authoritative preflight now reloads schedule, selected mechanic, and all Site Equipment with
one supplied silent token. Success and unknown outcomes reconcile request key, schedule
pointer, and exact Job count; retry never creates sequential partial records. Focused tests,
lint, and build pass. Due/Overdue Sites now open the Run Site Check drawer with Customer,
Site, cadence, required active technician, all Equipment/inactive labels, and Job count.
The drawer retains one UUID and start timestamp across retries and blocks double-clicks.
Replay avoids Equipment/mechanic reads and duplicate request-key lookups. Tests now cover
same-key replay, unknown outcomes, concurrent-manager pointer conflicts, inactive mechanics,
nested transaction failure, and partial-Job integrity mismatch. Confirmed success opens the
authoritative current-details view.

Site Checks Phase 3 Customer Dashboard status is complete locally. One customer-scoped,
focused Site Checks load now serves dashboard summaries and Site Settings without N+1 or
additional sign-in flows. Enabled Sites show compact status/progress; interactive Up to
date, Due, Overdue, and In progress counts filter, expand, announce, and focus the Sites
view. Disabled and invalid schedules are excluded from totals. Domain and accessibility
contract tests, the full suite, lint, and production build pass.

Site Checks Phase 2 Site Settings is implemented locally. The combined drawer now includes
independent enablement, frequency, and next-due editing; key-enforced creation; ETag updates;
authoritative refresh; and active-occurrence disable confirmation. Local tests, lint, and
build pass. Non-admin permission validation remains open.
The corrected cached read-only role audit completed without prompting or writes. Service
Operations is the only actively assigned unmanaged human role. The approved ten Site Check
grants were added and verified at organisation depth in one cached, no-prompt connection.
No destructive privilege or user assignment was added.

Site Checks Phase 1 is complete. Its foundations include verified Choice/type contracts, strict
Date Only cadence calculations, schedule validation/state, Job progress/integrity, and late
history rules. Focused Dataverse reads batch and deduplicate Site/occurrence scopes, while a
tested coordinator shares one silent token and coalesces concurrent identical loads.
The Site Checks hook resolves the active account, uses silent authentication only, rejects
stale results, and exposes explicit interaction-required state. Duplicate-active and
request-key replay validation is also implemented. The full regression suite, lint, and
production build pass.

The approved Site Checks Dataverse schema was provisioned and published on 26 July 2026
through one cached, no-prompt connection. Both tables, approved columns and relationships,
Job Type `122830004`, and alternate keys were created, and structural read-back verification
passed. A later single cached read-only verification confirmed both alternate keys Active.
The Service Operations role now has the verified non-destructive Site Check privileges.

The local expanded smoke test passed against Dataverse on Job 145408 with two Time & Travel
entries, three Job Materials, two downloadable Job Photos, Further Work, Safety Issue, and
one-time replay protection. Operational Job Status, Completed Date, Equipment relationship,
Equipment hour meter, maintenance, and assignments remained unchanged. The test identified
and fixed the required Dataverse change-set `Content-ID` headers.

## Next task

Complete the remaining Site Checks release gates: explicitly identify and test an assigned
least-privilege non-admin account, observe the verified maximum Site, validate
disable/re-enable preservation and deployment rollback, and perform the desktop keyboard,
screen-reader, and 200% zoom audit. Then complete Phases 2 and 8. The production
server-settings verification and Technician Job Card smoke test remain separate outstanding
release work.
