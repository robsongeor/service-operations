# Site Checks Operations and Release Validation

## Purpose

This is the operator checklist for releasing, validating, and safely rolling back Site
Checks. Product architecture and implementation progress remain owned by the
[implementation tracker](features/SITE_CHECKS_IMPLEMENTATION_PLAN.md); exact Dataverse
contracts remain owned by the [schema document](site-checks-dataverse-schema.md).

## Cross-customer workspace

Open **Site Checks** from the main navigation to see enabled Site Check Sites across all
Customers. The initial **All enabled Sites** view shows every participating Site. **Needs attention** includes Overdue, Due, and In progress
Sites. Use the status totals or filters to focus by state, technician, frequency, due-date
range, Customer, or Site. **Start** opens the creation review, **Open** shows the active
occurrence, and **History** shows completed occurrences. When an active batch passes its
scheduled interval, **Open previous** remains available and **Start next batch** creates the
next occurrence without waiting for every Job in the previous batch to be completed.
Configuration remains in
the relevant Customer Dashboard Site Settings.

Selecting an occurrence in **History** expands its generated Jobs directly beneath that
batch. Completed Jobs remain visible there as read-only history cards; Job and Equipment
actions remain in the dedicated **Jobs & Equipment** tab. Selecting a history Job card opens
that Job drawer. Selecting the same Site Check header again collapses it; expanding another
Site Check automatically collapses the previously open batch.

Recurring due dates remain anchored to the configured cadence, rather than drifting based
on when the last Job happened to be completed. Completing Jobs from a replaced previous
batch closes that occurrence only; it never clears or rolls the newer active batch.

One-off Site Checks are an ad-hoc workflow, not a Weekly/Fortnightly/Monthly Schedule. Do
not represent a one-off by assigning a false cadence. That path requires its own explicit
creation mode and Dataverse contract before release.

## Authentication rule

Routine application validation must use an already signed-in Service Operations user and
silent MSAL token acquisition. It must never start repeated login popups or redirects.

Administrative verification defaults to the cached, no-prompt schema tool mode:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/manage-site-checks-schema.ps1 `
  -Mode Verify `
  -LoginPrompt Never
```

Do not retry with an interactive mode automatically. If the cached session is unavailable,
stop and arrange one deliberate user-owned authentication session.

## Destructive test-data cleanup

`manage-site-checks-schema.ps1 -Mode PurgeOccurrences -LoginPrompt Never` is the narrow
cleanup for deleting every Site Check occurrence and every Job linked to a Site Check or
classified as Job Type Site Check. One transaction clears active Schedule pointers, deletes
Jobs, then deletes occurrences. It verifies those targets are empty and that the Schedule
count is unchanged. Schedule configuration and manual Equipment selections are preserved.

`manage-site-checks-schema.ps1 -Mode PurgeData -LoginPrompt Never` is an exceptional,
explicitly authorised cleanup mode. It is not a rollback step. It resolves all Schedules,
occurrences, Jobs with a Site Check parent, and Jobs whose Job Type is Site Check; then one
Dataverse transaction clears active pointers and deletes Jobs, occurrences, and Schedules
in dependency order. It verifies all four target sets are empty afterward.

Never run this mode from application deployment, routine validation, or an inferred cleanup
request. Record counts first and require explicit confirmation that Schedules, history, and
generated Jobs may all be permanently deleted.

## Confirmed request budgets

| Operation | Expected requests |
| --- | --- |
| Customer dashboard, no active occurrences | One silent token acquisition and one Schedule query |
| Customer dashboard with active occurrences | One silent token acquisition; one Schedule query, one batched occurrence query, and one batched progress query |
| Open current details | Concurrent history and generated-Job page reads share one in-flight silent token request; each data page is one query |
| History or generated rows, additional page | One explicit page query using a validated Dataverse continuation link |
| Start new Site Check | One supplied silent token; one request-key lookup, three concurrent authoritative preflight reads, one atomic batch, then focused reconciliation reads |
| Same-key creation replay | One request-key lookup followed by focused Schedule pointer and linked-Job integrity reads; no Equipment/mechanic reload and no write |
| Operational status change | One supplied silent token and focused Job/parent/Schedule/sibling reads; non-final status uses one ETag PATCH |
| Final generated Job | Focused reads followed by one three-operation atomic change set; reconciliation reads occur only for concurrency or unknown outcomes |

The verified largest Site contains 22 Equipment. Its creation transaction is 24 operations
and 15,820 UTF-8 bytes, below the 1,000-operation platform limit and the application’s
conservative 4 MiB guard. Generated Job and history lists use 25-record pages and never
issue per-row Dataverse requests.

## Pre-release checks

- Run `npm test`, `npm run lint`, `npm run build`, and `git diff --check`.
- Confirm the Site Check schema and both alternate keys are Active using at most one
  approved cached-session verification.
- Confirm the Service Operations role has organisation-depth Create, Read, Write, Append,
  and Append To on both Site Check tables, with no Site Check Delete, Assign, or Share.
- Complete the non-admin smoke test below with an assigned Service Operations user.
- Review that the deployment contains no credentials, tokens, exported customer data, or
  server-only settings.

## Non-admin smoke test

Use one existing, assigned non-admin Service Operations session. Do not create users,
credentials, or role assignments for the test.

1. Open a persisted Site and save valid Site Check settings.
2. Disable and re-enable the Schedule; confirm cadence values and History remain.
3. Start a due Site Check with an active technician and confirm exactly one Job per current
   Site Equipment record.
4. Retry the same start action and confirm it reconciles rather than duplicating records.
5. Confirm generated Jobs appear in the Site Checks and truly unfiltered Jobs views, but
   not Operational or Scheduler views.
6. Submit or change Job Card Status and confirm operational Job Status and Site Check
   progress do not change.
7. Leave at least one generated Job incomplete until the next interval has passed. Confirm
   **Open previous** still opens it and **Start next batch** creates the new occurrence.
8. Complete the remaining Job from the previous batch. Confirm it closes only the previous
   occurrence and does not clear or roll the newer active batch.
9. Complete all Jobs in the newest batch. Confirm the occurrence completes, the active
   pointer clears, and the cadence-anchored next due date is retained.
10. Reopen one completed generated Job. Confirm its completion date clears, its occurrence
    returns to In progress, and the recurring Schedule or any newer active batch is unchanged.
11. Confirm Job and Equipment row navigation returns focus to the invoking details row.

Record only pass/fail and non-sensitive record identifiers. Do not paste tokens, customer
details, or raw Dataverse error bodies into documentation.

## Rollback

Application rollback means reverting Site Check UI/service exposure through the normal
application deployment process. It does not mean deleting Dataverse tables, columns,
choices, schedules, occurrences, or generated Jobs.

- Preserve the provisioned nullable Job lookup and all Site Check data.
- Preserve Job Type `122830004`; older application versions ignore it but must not
  reclassify historical Jobs.
- If creation must be paused before an application rollback, disable Schedules through the
  supported settings workflow. This preserves history and active operational evidence.
- Never clear active pointers or change completed records manually as a generic rollback.
  Data repair requires an individually reviewed recovery plan.
- Re-deployment may use the idempotent schema verification/provisioning tool only with the
  required explicit authority.

## Remaining release gates

The local implementation is not production-ready until:

- the non-admin smoke test passes;
- desktop keyboard, screen-reader, and 200% zoom manual checks pass; mobile/narrow
  responsive reflow is explicitly out of scope;
- the verified maximum-Site workflow is exercised in the target environment without
  exceeding the documented budgets; and
- deployment and rollback are reviewed for the target release.
