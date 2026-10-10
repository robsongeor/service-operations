# Feature retirement and compatibility runbook

Source review: 10 October 2026, `f73f3d6`. **Nothing was removed during the audit.**
This document identifies candidates, not permission to delete production data or infrastructure.
See the [audit](../reviews/2026-10-10-application-audit.md) for current release risks.

## Mandatory procedure

1. Recheck imports, route references, tests, scripts, CSS and runtime/configuration selection at
   the commit being changed. This snapshot can become stale.
2. For a data/backend feature, inventory real records, active links, scheduled consumers,
   application identities and **both V1 and V2** deployments read-only. Source searches alone
   cannot prove there are no consumers.
3. Define the replacement, evidence-retention policy, user-visible behavior, rollback and owner.
   Obtain explicit approval for data deletion or cloud changes; avoid combining those with source cleanup.
4. Remove one boundary per change. Migrate callers before deleting shared helpers/styles.
5. Run affected behavior tests, complete tests, lint, production build and `git diff --check`.
   Existing failures must be tracked separately; do not hide new failures in the baseline.
6. Exercise direct URLs, browser refresh/back navigation, restricted accounts and both deployment
   configurations. For backend retirement, test existing tokens/files/history, scheduled jobs and rollback.
7. Observe an agreed rollout window before decommissioning old infrastructure. Retain backups and
   audit evidence; a code rollback cannot restore deleted records or expired/revoked links.

## Low-risk source candidates — still require verification

| Candidate | Source evidence | Removal procedure / what would break |
| --- | --- | --- |
| `src/alpha/job-api-test/JobApiTestScreen.tsx` and its CSS | No current route/import consumer found | Recheck repository-wide references, remove screen and only exclusively owned CSS, build both variants. Do not delete shared API helpers used by GreenTree review |
| `src/alpha/test-screen/TestScreen.tsx` | No current route/import consumer found | Check developer scripts/deep links, then remove isolated screen. Its imported shared services are not thereby obsolete |
| `src/alpha/customers/CustomerOpenJobsTab.tsx` | Current dashboard uses `CustomerJobsTab`; no importer of old tab found | Remove after checking tests and open-Job filtering replacement; test Customer Jobs navigation and status filters |
| `src/alpha/customers/SiteMaintenanceSettingsDrawer.tsx` | No current importer found | Remove component only after recheck. **Keep its CSS:** `SiteSettingsDrawer` and Site Check schedule settings import it. Move/rename shared styles first if cleaning filenames |
| Dormant prototype Customer-create branch | Dashboard retains local draft creation while shared picker has a real create path | Prove no action sets this mode, remove only unreachable branch/state. Do not remove the real inline Customer/Site creation APIs |

Useful checks include `rg -n "JobApiTestScreen|TestScreen|CustomerOpenJobsTab|SiteMaintenanceSettingsDrawer" src tests scripts`
and a repository-wide filename/import search. Re-run after each removal; absence from one route
file is not enough. None of these candidates justify a Dataverse table deletion.

## Active compatibility features — not safe to remove now

### V2 → V1 Job Card bridge

The V2 workflow sets `VITE_JOB_CARD_SHARED_BACKEND=v1-production`; marked requests are proxied
to fixed V1 endpoints. V1 owns the configured links, submissions, private evidence and reviews.
Deleting V1, its storage/settings, the proxy or its headers now can break existing technician
links, photos and office reviews. Simply clearing the flag is not a migration.

Before retirement:

- Choose a shared destination, copy/configure the complete backend contract and inventory tokens,
  lifecycle records, Blob references, reviewer authorization and email configuration.
- Keep existing token URLs and signatures valid or provide a deliberately approved compatibility route.
- Prove V2 reconciliation and interactive review read the same store; avoid separate partial datasets.
- Test generation, delivery, submit/retry, multiple technicians, review, revoke, historical downloads,
  anonymous rejection, restricted reviewer rejection and rollback.
- Cut over callers first; stop old writes deliberately; reconcile counts and references before
  removing anything. Retain evidence under the agreed retention policy.

### Legacy Dataverse Job Card / submission services

Azure Job-level cards did not replace Site Check assignment submissions or historical Dataverse
evidence. `usesAzureJobCards` retains a Site Check exception. Removing old tables, credentials,
photo APIs or submission helpers breaks that path and historical access.

Inventory all Site Check and legacy links/records, design an evidence-preserving migration and
test assignment-to-occurrence completion before retirement. Do not repurpose the anonymous Azure
portal to call Dataverse as a shortcut.

### Legacy `ServiceOperations.JobBookOnly` role

The restricted-user cleanup is recorded as complete for the reviewed eight-user cohort; this
audit did not re-enumerate live assignments. Compatibility remains in client routes, scripts and
tests. Removing an assignment is different from deleting the Entra role definition or a Dataverse role.

Check all direct/group assignments, effective mixed roles, V1 consumers, tokens/session refresh
and the replacement JobBookAdmin access. Migrate assignments and verify named users first; then
remove fallback code/tests/configuration in a separate change. Deleting the role prematurely can
deny access to forgotten users. Removing Entra assignments does not remove Dataverse permissions.

### Separate regional books and registration/numbering compatibility

Regional-book flags are false in V2, but staging tables, historical ledgers, migration tools and
V1 workflows remain dependencies. Numbering invariant guards are recorded registered but disabled
for V1 compatibility. Do not equate a disabled guard or feature flag with obsolete functionality.

Read-only inventory number allocations, uniqueness, linked/promoted/voided entries and each live
writer. Rehearse migration and counter seeding; compare counts and exact numbers. Stop incompatible
writers before enabling stricter invariants. Deleting ledgers or turning guards off risks duplicate
or reused job numbers; enabling them prematurely can reject V1 saves. Use the dedicated migration
and deployment runbooks, with backups and rollback, rather than deleting feature folders.

### `Unconfirmed`, `WAITING_FOR_PARTS`, and coordinator-managed data

- `Unconfirmed` still participates in forms, filters/preferences, scheduling and dispatch checks.
  Count affected live Jobs and decide the replacement state before removing the option. Migrate
  saved filters and test edit/dispatch of historical rows, or they may become hidden/uneditable.
- `WAITING_FOR_PARTS` is an internal constant whose persisted value is displayed as **Action
  Required**. Renaming the symbol is possible; changing/deleting the Dataverse Choice value
  without migration corrupts meaning. Audit every serializer, filter and integration first.
- The obsolete-looking **Manage job** UI does not make `gr_coordinatormanaged` obsolete. Registration
  and void eligibility still inspect the field. Remove conversion UI separately; migrate backend
  invariants before deleting the column or APIs, or valid voids may be refused and invalid ones allowed.

## Reuse migrations, not feature removals

| Item | Safe approach |
| --- | --- |
| `JobsTableSortIcon` compatibility wrapper | Migrate WOF and Quotes imports to the shared owner, test sorting/accessibility, then remove wrapper |
| Custom mechanic/equipment selectors | Extend shared selector contracts for portal placement, async search, action rows and focus first; migrate with keyboard tests. Deleting them loses supplier/unknown-equipment or drawer behavior |
| `JobBookPrototypeScreen` name | Live `/job-book` route. Rename imports/tests/docs only; it is not an unused prototype |
| `GreentreeEquipmentTestScreen` name | Live `/equipment/greentree-test` review route. Review operational consumers before any removal |
| `/mechanics` route and `mechanics` filenames | Route is a Staff compatibility redirect; Dataverse still uses mechanic schema. Preserve deep links or announce migration. Never rename/delete schema as a UI-label cleanup |
| `realtime-api` old handler directories | v4 `src/functions` wrappers still require handlers in the older directory layout. Migrate imports/runtime deployment before deleting them; otherwise Functions fail to load |
| Direct Add Site header button | Removed from Customer header intentionally. Shared inline Site creation and existing Site settings remain in use; do not delete those capabilities with the button |

## Disabled or unfinished is not obsolete

External-supplier assignment, hour-meter classification, Site Check release gates and invoice
import/approval switches represent incomplete/controlled rollout, not dead features. The owner
has requested hiding unfinished Customer Info editing; its stored operational data and working
Site settings must be preserved. Implement that UI restriction before considering unused draft
code cleanup. Keep a clear backlog entry for persistence rather than leaving a misleading Save button.

## Required removal evidence record

For each approved retirement, record: exact commit and artifacts; dependency search results;
live inventory date and scope (no secrets); replacement/migration; before/after record and file
counts; affected-role/browser tests; scheduled-consumer tests; rollback rehearsal; retention
decision; and release owner. If any dependency is unresolved, label the item **blocked**, not safe.
