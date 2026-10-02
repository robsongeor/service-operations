# Regional Job Books

## Decision

Each operating area owns a separate Dataverse Intake table and AutoNumber sequence. The React
screen, drawer, row model, paging, filters, and API implementation remain shared and select a table
through `src/alpha/job-book/jobBookConfig.ts`.

| Job Book | Dataverse table | Entity set | AutoNumber format |
| --- | --- | --- | --- |
| Auckland | `gr_jobbookentry` | `gr_jobbookentries` | `{SEQNUM:6}` |
| Waikato | `gr_waikatojobbookentry` | `gr_waikatojobbookentries` | `WJ{SEQNUM:4}` |
| Hastings | `gr_hastingsjobbookentry` | `gr_hastingsjobbookentries` | `HJ{SEQNUM:5}` |
| Christchurch | `gr_christchurchjobbookentry` | `gr_christchurchjobbookentries` | `CJ{SEQNUM:5}` |

`SEQNUM` length is minimum padding, not a maximum. For example, Waikato continues from `WJ9999`
to `WJ10000`. Each primary Job Number column keeps the existing 30-character capacity.

Managed `gr_job` rows remain in one table. The Job Book screen assigns them to a register from their
exact number format and excludes unknown formats from all four books for migration review.

## Release gates

- `VITE_REGIONAL_JOB_BOOKS_ENABLED=false` keeps the current Auckland-only screen and prevents users
  from opening the empty regional tables before their legacy rows are migrated.
- `VITE_REGIONAL_JOB_BOOK_ALLOCATION_ENABLED=false` allows migrated regional registers to be
  reviewed while keeping New entry disabled for Waikato, Hastings, and Christchurch.
- Auckland allocation remains unchanged throughout the staged rollout.

Both regional gates remain false in the Azure workflow until migration and cutover are verified.

## Schema provisioning

The existing idempotent schema utility owns all four tables; there are no copied regional schema
scripts. Run it once for each new book under Windows PowerShell 5.1:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-job-book-intake-schema.ps1 -Mode Provision -Book Waikato -LoginPrompt Never -UserName georger@liftrucks.co.nz
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-job-book-intake-schema.ps1 -Mode Provision -Book Hastings -LoginPrompt Never -UserName georger@liftrucks.co.nz
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-job-book-intake-schema.ps1 -Mode Provision -Book Christchurch -LoginPrompt Never -UserName georger@liftrucks.co.nz
```

Regional `Provision` creates and publishes the schema and grants the full and Job Book Only roles,
but deliberately does not set a production seed. No row may be created while allocation is gated.

On 14 September 2026, Waikato, Hastings, and Christchurch were provisioned in production and then
read back independently. Every expected column and lookup is present, all three Job Number keys are
Active, and both application roles have their required privileges. The tables remain empty and no
regional sequence has been seeded or consumed.

## Migration and cutover

For each regional book:

1. Export and retain the source spreadsheet as the migration evidence.
2. Import its existing rows into the matching table with their historical Job Number values and
   `Legacy` stage. Do not ask Dataverse to generate numbers during import.
3. Reconcile source count, imported count, duplicate numbers, and rejected rows.
4. Run `-Mode Cutover -Book <Area>`. Cutover is blocked when a regional table contains no imported
   rows. It calculates the next sequence from both imported Intake rows and existing managed Jobs,
   sets the table seed to maximum + 1, and verifies the schema, alternate key, and roles.
5. Create one controlled test entry, confirm the allocated format and next value, and void the test
   entry rather than deleting it.
6. Enable regional views for target-user review. Enable regional allocation only after every book
   passes its reconciliation and controlled allocation test.

Example cutover command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage-job-book-intake-schema.ps1 -Mode Cutover -Book Waikato -LoginPrompt Never -UserName georger@liftrucks.co.nz
```

The production seed is therefore derived at migration time; it is not hard-coded during feature
development.
