# Release Readiness

Audit date: 23 July 2026

Audited branch: `codex/wof-management`

Audit basis: static code inspection plus local production build and lint. No live Dataverse records were created, edited, completed, or deleted during this audit.

## Proposed Version

`v1.2.0`, after the implemented blocker fixes pass live Dataverse and deployed API smoke tests. The scope contains several substantial operational features, so a minor release is more appropriate than a patch.

## Executive Summary

**Ready pending live Dataverse smoke testing**

The two code blockers identified by the audit have been resolved:

1. Job Lookup now requires a Dataverse bearer token that the API validates through `WhoAmI` before it reads upstream credentials or calls the upstream service.
2. Service Job completion now reloads authoritative Job, Equipment, and service-plan state and submits all completion writes in one atomic Dataverse `$batch` change set with ETag concurrency checks and idempotent retry verification.

The application must not be tagged or deployed as `v1.2.0` until both changes are exercised live. In particular, the Dataverse target must confirm atomic change-set behavior, ETag conflict handling, timeout recovery, and A/B/C plan results. Five automated proxy security tests now pass, but there is still no browser, integration, or Service-completion unit test framework.

## Git State

- Baseline branch: `codex/wof-management`
- Baseline HEAD: `9169fa3` (`feat: expand service operations workflows`)
- Remote relationship at audit start: branch was up to date with `origin/codex/wof-management`.
- Baseline working tree: clean.
- Baseline `git diff` and `git diff --check`: clean.
- Unrelated work mixed into the baseline: none detected.
- Audit safely proceeded: yes.
- Current uncommitted work: the isolated audit fixes plus this report and proposed changelog organization.
- No commit, push, merge, rebase, tag, or deployment was performed.

## Validation Results

| Command/check | Result | Notes |
| --- | --- | --- |
| `git status` | Passed | Clean at audit start. |
| `git branch --show-current` | Passed | `codex/wof-management`. |
| `git log --oneline --decorate -20` | Passed | Reviewed recent WOF, Quote, Jobs, Scheduler, and deployment history. |
| `git diff` | Passed | Empty at audit start. |
| `git diff --check` | Passed | Passed at audit start. |
| `npm install` | Skipped appropriately | `node_modules` and `package-lock.json` were already present; no lockfile change required validation. |
| Baseline `npm run build` | Passed automatically | TypeScript project build and Vite production build passed; Vite reported only a chunk-size warning over 500 kB. |
| First post-fix `npm run build` | Failed, then fixed | TypeScript correctly rejected nullable active accounts passed to MSAL. Each token helper was given an explicit no-active-account guard. |
| Blocker-fix `npm test` | Passed automatically | Five API tests cover anonymous rejection before fetch, invalid token rejection, authenticated forwarding, safe missing-configuration handling, and upstream error redaction. |
| Final `npm run build` | Passed automatically | 303 modules transformed; only the existing chunk-size warning remains. |
| `npm run lint` | Passed automatically | ESLint passed at baseline, after the first fix, and after the corrected account guards. |
| Final `git diff --check` | Passed automatically | No whitespace errors. Git emitted only expected LF-to-CRLF working-copy notices on Windows. |
| Other automated tests | Not available | There is no browser, Dataverse integration, end-to-end, or TypeScript unit-test framework. Type checking runs inside `npm run build`. |

Final `git status`, `git diff --stat`, and the complete diff are reviewed before release handoff. The working tree preserves the isolated audit fixes and adds only the two blocker fixes, their API tests, and release documentation.

## Module Test Results

| Module | Result | Notes |
| --- | --- | --- |
| Authentication and identity | Verified by code inspection; requires live manual test | Stable account identity is centralized. Jobs, Equipment, Mechanics, and Pricing hooks were corrected to use the active account. Multiple cached accounts with no active selection remain an unresolved edge case. |
| Navigation and routing | Passed automatically and by code inspection | All remaining sidebar items have routes. The temporary Job API Test route and broken Settings link were removed. Overview remains a placeholder and no catch-all Not Found route exists. |
| Jobs table | Verified by code inspection; requires live manual test | Job Type/status tabs, Unconfirmed separation, search, sorting, sticky-through setting, default/current view priority, reset, and persisted-state validation are implemented. Pagination and user-selectable visible columns are not implemented. |
| Job create/edit | Verified by code inspection; requires live manual test | Typed relationship IDs and WOF creation restrictions are present. Equipment movement failure is swallowed after Job creation and must be resolved before relying on the invariant. |
| Service Job completion | Code fix implemented; requires live manual test | One authoritative service now validates the saved Service Job/Equipment/Service Type and sends Job, Equipment, and applicable plans in an atomic change set. ETags and completed-state verification protect concurrency and retries. |
| Scheduler | Verified by code inspection; requires live manual test | Shared Job Type colors cover the full card, the badge is removed, Customer is primary, tabs and display settings persist, and Unconfirmed Jobs are excluded. Drag/drop and resize interactions are not implemented. |
| Equipment Manager | Verified by code inspection; requires live manual test | Shared create/edit mapping preserves Date Only WOF/REGO values and REGO implies WOF Required. Delete is locally blocked when loaded Job history exists. Maintenance-history writes are multi-request and non-atomic. |
| Customer Dashboard | Verified by code inspection; requires live manual test | Customer selection, summaries, collapsible Sites, Site Dataverse create/update, Equipment drawer entry, Site-prefilled creation, and Site-scoped bulk import are present. Customer creation and Customer-level details remain local prototypes. |
| Bulk Equipment Import | Verified by code inspection; requires live manual test | TSV parsing, date normalization, row selection, duplicate decisions, immutable Site context, sequential creation, and retry state are implemented. Authorization is client-side only. |
| Quotes and Pricing | Verified by code inspection; requires live manual test | Quote relationships use stable IDs, Author uses immutable Dataverse `createdby`, My Quotes uses Entra object ID, and list relationships are loaded without N+1 calls. Multi-record line/header saves can partially succeed. |
| WOF / REGO | Verified by code inspection; requires live manual test | List and detail queries retain Inspection, Job, and Equipment IDs. Sorting/date handling, shared Equipment editing, qualification filtering, protected Job Type, and orphan-only delete safeguards are implemented. Passed WOF summary automation is deferred. |
| Technicians and Qualifications | Verified by code inspection; requires live manual test | Qualifications load in shared requests, date/overlap validation is centralized, and deactivate preserves history. Dataverse roles—not the UI—must prevent self-grant. |
| Site management | Verified by code inspection; requires live manual test | Site create/update retains the Customer lookup. There is no standalone Site management route. |
| Settings persistence | Verified by code inspection | Jobs, Jobs default view, Scheduling, and WOF settings use validated account-scoped `sessionStorage`. There is intentionally no global `/settings` screen after the audit fix. |
| Job Lookup proxy | Passed automated security tests; requires deployed test | Missing/invalid bearer tokens are rejected before upstream access. Valid tokens are checked with Dataverse `WhoAmI`. Static Web Apps role rules were not used because the SPA uses custom MSAL rather than `/.auth`. |
| Documentation | Failed | `README.md` materially understates current modules, routes, statuses, schema, and maturity. `AI_CONTEXT.md` also contains contradictory WOF-expiry wording. |
| Responsive/accessibility | Verified partially by code inspection; requires manual test | Tables generally provide horizontal overflow and controls use semantic buttons. Shared drawers and several confirmation/editor dialogs do not provide a complete focus trap/restore pattern. |

## Release Blockers

| ID | Severity | Affected area and reproduction | Likely root cause | Files involved | Recommended fix | Fixed in audit |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Blocker | Original issue: `/api/joblookup` could be called without an authenticated identity and would use server-held credentials. | The HTTP trigger had no user-level boundary check; hiding the temporary screen did not protect the Function. | `api/joblookup/index.js`, `tests/joblookup.test.cjs`, `api/local.settings.json.example`, `vite.config.ts`, `src/alpha/job-api-test/JobApiTestScreen.tsx`, `package.json` | Implemented: require a bearer token, validate it against the configured Dataverse `WhoAmI`, and only then validate input/read credentials/call upstream. The retained diagnostic caller supplies its active-account token, and raw upstream errors are no longer forwarded. Live requirement: configure server-only `DATAVERSE_URL` and test the deployed Function with missing, expired, and valid tokens. Residual risk: bearer validation adds a Dataverse dependency to lookup availability. | **Code fixed; live test pending.** |
| B2 | Blocker | Original issue: Service completion used separate Job snapshot, plan, Equipment, and final-status writes that could partially succeed. | Multi-record completion was orchestrated as independent client REST calls. | `src/alpha/jobs/completion/serviceCompletionApi.ts`, `src/alpha/jobs/hooks/useJobs.ts`, `src/alpha/jobs/services/jobsApi.ts`, `src/alpha/equipment/servicePlans/servicePlanApi.ts` | Implemented: authoritative reload, saved relationship/type validation, one atomic Dataverse change set, ETag `If-Match` guards, already-completed verification, and authoritative refresh after errors. Live requirement: test A/B/C, every failure boundary, timeout-after-submit, and two-user concurrency. Residual risk: the raw multipart implementation requires verification against the target Dataverse environment. | **Code fixed; live test pending.** |

The former blockers remain release gates—not open code defects—until the listed live Dataverse smoke tests, schema checks, role checks, and deployed API tests are completed.

## High-Priority Findings

| ID | Severity | Affected area and reproduction | Likely root cause | Files involved | Recommended fix | Fixed in audit |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | High | Create a Job with Equipment at a different Site, then make the Equipment Site PATCH fail. Job creation still returns success and only logs the Site failure. | The post-create Equipment movement catches and swallows the exception after the Job has already been created. | `src/alpha/jobs/hooks/useJobs.ts` | Add an explicit recovery result/notice and retry action keyed to the created Job, or move this invariant into an atomic server-side operation. Avoid throwing a generic create failure that encourages duplicate Job creation. | No. |
| H2 | High | Save a Passed WOF. Equipment `gr_currentwofexpiry` and `gr_lastwofcompleted` are not updated from the completed Inspection. | Transactionally safe WOF completion automation was deliberately deferred. Documentation currently contains contradictory wording about whether the update occurs. | `src/alpha/wof/hooks/useWof.ts`, `src/alpha/wof/services/wofApi.ts`, `docs/wof-dataverse-schema.md`, `AI_CONTEXT.md` | Implement an atomic Passed-WOF completion operation, or clearly exclude completion from the release and retain manual Equipment summary updates. Correct the contradictory context wording. | No. |
| H3 | High | Click **Create Customer**, enter Customer-level details, and save. The new Customer and its information exist only in React state and disappear on reload. | Customer create/info/contact persistence is explicitly still a prototype while the action is exposed in the operational Customer Dashboard. | `src/alpha/customers/CustomerDashboardScreen.tsx`, `src/alpha/customers/CustomerDrawer.tsx` | Hide the create action for this release or complete confirmed Dataverse persistence in a later scoped task. Keep the current protection that prevents prototype IDs reaching Job payloads. | No. |
| H4 | High | Fail a later request during WOF create/edit, Quote header/line save, Equipment maintenance save, Unconfirmed cleanup, or Site batch changes. Earlier Dataverse requests may remain committed. | The client coordinates multiple REST calls without Dataverse transactions or durable recovery tracking. | `src/alpha/wof/hooks/useWof.ts`, `src/alpha/wof/services/wofApi.ts`, `src/alpha/quotes/services/quotesApi.ts`, `src/alpha/equipment/servicePlans/servicePlanApi.ts`, `src/alpha/jobs/hooks/useJobs.ts`, `src/alpha/customers/CustomerDashboardScreen.tsx` | Add live failure-path tests and recovery guidance now; prioritize atomic server operations for compliance, completion, and financial workflows. | No. |
| H5 | High | Delete a normal Job with schedule options, assignments, office updates, or Quotes. The client deletes only the Job and assumes Dataverse relationship behavior. | Cascade/restrict behavior is not documented or verified for every dependent relationship. | `src/alpha/jobs/hooks/useJobs.ts`, `src/alpha/jobs/services/jobsApi.ts`, related Dataverse relationship configuration | Verify each relationship's delete behavior in metadata and a test environment. Either block deletion with clear dependent-record guidance or perform an explicit, approved cleanup that preserves required Quote/history data. | No. |
| H6 | High | Start with multiple cached MSAL accounts and no active account. The app passes the login gate, but active-account hooks do not choose by array order, so screens can remain in initial loading state. | Correct refusal to guess an account is not paired with an account-selection/re-authentication screen. | `src/App.tsx`, `src/auth/useActiveMsalAccount.ts` | Present an account-selection/sign-in recovery state before rendering data routes. | No. |
| H7 | High | Run the available package scripts. Only the Job Lookup API now has automated tests; high-risk UI and Dataverse workflows remain uncovered. | Automated testing was not previously established and this blocker task added only dependency-free API tests. | `package.json`, `tests/joblookup.test.cjs` | Add focused TypeScript rule tests, mocked batch-response/failure tests, and a small authenticated Dataverse end-to-end smoke suite. | Partially; five API security tests added. |
| H8 | High | Attempt silent token acquisition after consent/session expiry. Main hooks report a data-load error but do not offer interactive token recovery. | All Dataverse access depends on `acquireTokenSilent` with no centralized interaction-required fallback. | Production data hooks under `src/alpha/**/hooks`, `src/auth/` | Centralize token acquisition and handle MSAL interaction-required errors with an intentional re-authentication action. | No. |
| H9 | High | Invoke bulk Equipment creation through the browser/client code as an otherwise authorized Dataverse user whose email is not the allowlisted address. | The trimmed/case-insensitive check controls UI and handlers only; Dataverse privileges are the real security boundary. | `src/alpha/equipment/utils/bulkEquipmentImport.ts`, `src/alpha/equipment/components/BulkEquipmentImportDrawer.tsx`, Dataverse security roles | Enforce the administrative distinction through Dataverse roles, a server-side endpoint, or a role claim. Treat the current email check as convenience only. | No. |
| H10 | High | With more than one cached account, compare the active account to tokens previously acquired by Jobs, Equipment, Mechanics, and Pricing. Those hooks used `accounts[0]`. | Four production hooks bypassed the shared active-account source of truth. | `src/alpha/jobs/hooks/useJobs.ts`, `src/alpha/equipment/hooks/useEquipmentManager.ts`, `src/alpha/mechanics/hooks/useMechanics.ts`, `src/alpha/quotes/hooks/usePricingItems.ts` | Use `useActiveMsalAccount` consistently. | **Yes.** |
| H11 | High | Select **Job API Test** or **Settings** from the sidebar. One exposed a temporary diagnostic screen; the other had no route. | Development/prototype navigation remained in the production shell. | `src/App.tsx`, `src/Sidebar.tsx` | Remove unfinished production navigation and the temporary route. | **Yes.** |

## Accepted Limitations

These are candidates for explicit acceptance, not silent assumptions:

| Severity | Limitation | Recommendation |
| --- | --- | --- |
| Medium | Jobs has no pagination or user-selectable visible-column setting. | Accept only for the current data volume; add server paging before the dataset grows. |
| Medium | Scheduler has no drag/drop or resize interaction; scheduling changes use the Job drawer. | Document the supported interaction rather than implying drag/drop support. |
| Medium | Customer Dashboard and Equipment Manager each load broad Jobs/Equipment relationship sets; Customer Dashboard mounts both hooks, duplicating some requests. | Profile with production-like row counts and consolidate query ownership later. |
| Medium | Shared full Equipment creation exists, but Job create still has a smaller feature-owned inline Equipment form/API. | Consolidate on one create model in a later scoped refactor. |
| Medium | Shared drawer/confirmation architecture does not consistently trap focus, restore focus, or close on Escape. | Complete keyboard and screen-reader testing before broad rollout. |
| Medium | Some screens expose raw Dataverse error details in expandable UI. | Log diagnostic detail safely and show a user-oriented correlation/error message. |
| Medium | Overview remains a placeholder; there is no Not Found route and page-specific document titles are not managed. | Hide Overview or define its release purpose; add route fallback and titles. |
| Medium | The production bundle reports a JavaScript chunk over 500 kB. | Add route-level lazy loading after functional blockers are resolved. |
| Low | Sortable table controls do not consistently expose `aria-sort`. | Add consistent accessible sort state. |
| Low | Old `src/alpha/test-screen` and the now-unrouted Job API Test UI remain in source, including a `console.log`. | Remove in a separate cleanup after deciding the integration's future. |
| Low | No formal error boundary, telemetry, or operational correlation IDs are present. | Add after the release-critical data-consistency work. |

Intentional WOF delete behavior is not a defect: only a planned, incomplete WOF Inspection with no linked Job is eligible for cleanup. A WOF with a linked Job is protected, even if it is incomplete.

## Dataverse Changes Still Required

No new logical name was invented or provisioned during this audit. The following assumptions must be confirmed in the target environment before release:

| Area | Assumption to confirm | Status from repository |
| --- | --- | --- |
| WOF / REGO | `gr_wofinspections`, raw `_gr_job_value`/`_gr_equipment_value`, WOF Result values, WOF Job Type `122830003`, and Equipment `gr_regoexpiry` Date Only | WOF schema document says provisioned/published on 22 July 2026; live metadata and data smoke test still required. |
| Job status | Global `gr_status` includes Unconfirmed `122830005` and Completion Review `122830004` | Documented as confirmed; verify in target solution after publishing. |
| Service completion | Job `gr_hourmeter`, `gr_servicetype`, Equipment `gr_currenthourmeter`, and `gr_equipmentserviceplans` fields/lookups/choices | Used by code but not covered by a dedicated schema document in `docs/`; requires metadata verification. |
| Quotes | Quote/Pricing/Quote Line entity sets, choices, optional Job/Customer/Equipment lookups, built-in `createdby` expansion, and Quote Line cascade | Document describes expected setup, not a dated target-environment verification. |
| Sites | `gr_Site.gr_Customer` navigation property and update behavior | Used consistently; verify create/update with a non-admin user. |
| Job children | Schedule Option, Assignment, Office Update, Email Dispatch, and Quote relationship delete behavior | Setup docs/scripts exist for several tables; cascade/restrict behavior remains to be verified. |
| Technicians | Qualification and Provider lookup navigation properties plus stable codes `WOF_CERTIFIED` and `WOF_INSPECTOR` | Documented/provisioned; seed records and active data still need live confirmation. |
| Date fields | Equipment WOF/REGO expiries and WOF/qualification dates are Date Only; schedule/completion timestamps retain intended behavior | Code preserves Date Only strings; metadata behavior must match. |

## Dataverse Permissions Still Required

Test these with the actual least-privileged operational and manager roles, not an administrator account:

- Read/create/update/delete as intended on Jobs; append/append-to for Equipment, Mechanic, Site, Contact, Quotes, and child records.
- Read/create/update/delete behavior for Job Schedule Options, Job Assignments, Office Updates, and Email Dispatch.
- Read/create/update on Equipment plus delete only when operational policy allows it.
- Read/create/update on WOF Inspection; delete only for the approved orphan-cleanup role.
- Read on Qualification Type, Technician Qualification, Service Provider Type, and Service Provider for operational users.
- Create/update/deactivate Qualification and Provider records only for managers; technicians must not be able to grant their own qualifications.
- Quote/Pricing/Quote Line create/update/delete privileges and relationship append/append-to permissions.
- Site create/update plus append/append-to for Customer.
- Bulk-import capability enforced by security role/server authorization if it is intended to be admin-only.

## Security Notes

- B1's code gap is resolved by validating the caller's Dataverse bearer token through `WhoAmI` inside the API handler before any upstream access. The deployed behavior still requires live verification.
- `allowedRoles: ["authenticated"]` was not added to `staticwebapp.config.json`: those roles belong to Static Web Apps `/.auth`, while this SPA uses its own MSAL session. Adding the rule alone would reject legitimate app users without securing the custom session.
- The Function HTTP trigger remains reachable with `authLevel: "anonymous"` so bearer-authenticated requests can reach the handler; the handler itself returns 401 for missing/invalid tokens before reading credentials or calling upstream.
- The bulk Equipment email allowlist is a UI and client-handler check, not server authorization.
- Dataverse user impersonation means Dataverse roles remain the authoritative control for direct client API operations.
- The Lift Trucks upstream username/password are correctly read from non-`VITE_` server environment variables and are ignored locally. A numeric integration API key is hard-coded in the server code; confirm whether it is public configuration or a rotatable secret.
- No committed `.env` or plaintext username/password was found by the audit search.
- Quote Author relies on immutable Dataverse `createdby` and stable Entra object ID, not display-name matching.

## Manual Testing Still Required

Use a test environment with representative records and both operational and manager accounts.

- Job Lookup API: confirm an unauthenticated request returns 401 with no upstream call; an expired/invalid bearer returns 401; a valid Dataverse bearer succeeds; missing server credentials returns a non-sensitive 500; and upstream errors/timeouts expose no response body or secrets.
- Authentication: one cached account, multiple cached accounts, expired silent token, sign-out/sign-in, and account-scoped settings isolation.
- Routes: direct-load every route, browser refresh, back/close behavior, narrow viewport, and unknown route.
- Jobs: each Job Type/status tab, Unconfirmed versus Unallocated, search/sort, sticky columns, default/current/reset state, old preference migration, inline create, normal edit, assignment cleanup, delete dependencies, and failed Equipment move.
- Completion: normal Job completion plus A, B, and C Service completion. Confirm the Job historical meter/status/date, Equipment current meter, exactly the expected A/B/C plans, and no duplicate plan advancement.
- Completion failure boundaries: force the Job PATCH, Equipment PATCH, first/later plan PATCH, ETag conflict, and network timeout after submission. Confirm the atomic change set leaves no partial writes or that authoritative retry detects the already-committed completion.
- Completion concurrency: open one Service Job in two sessions, complete it in the first, and confirm the second is rejected or recognized idempotently without advancing plans twice.
- Scheduler: all display modes, Job Type tabs/colors, WOF visibility, Unconfirmed exclusion, create/update/delete schedule options, deleted Job behavior, and persisted settings.
- Equipment: create/edit from all entry points, Customer/Site conflict clearing, typed/pasted/initial REGO auto-WOF behavior, WOF/REGO Date Only round-trip, maintenance history, Job history, and delete protection.
- Customer Dashboard: no/one/many Sites, no/many Equipment, missing optional relationships, collapse state across drawers/mutations, Site create/edit, Site-prefilled Equipment create, and duplicate-row checks.
- Bulk import: CRLF/LF/header/blank cells, every supported date format, invalid dates, batch/existing duplicates, explicit ignores, selection, partial failure/retry, immediate refresh, unauthorized account, and concurrent duplicate creation.
- Quotes: all tabs/statuses, My Quotes stable identity, blank relationships/Author, create/edit line calculations, rollback failure, and no author replacement.
- WOF: Due Soon persistence, all sort directions/blanks, Equipment button propagation, nested create draft preservation, qualification date boundaries, external provider, authoritative edit IDs, orphan-only delete, completed protection, and partial failure messages.
- Technicians: create/edit/deactivate, qualification overlap boundaries, expired/future/inactive states, WOF eligibility refresh, and least-privilege self-grant denial.
- Accessibility/responsive: keyboard-only searchable selects, focus order/trapping/restoration, sortable headers, validation announcements, color-independent statuses, horizontal tables, sticky-column bounds, drawers, and action overlap.
- Production infrastructure: configure server-only `DATAVERSE_URL`, run the Job Lookup authorization tests against the deployed Function, verify Static Web App/API runtime settings, deep links, and Power Automate/email dispatch behavior.

## Deployment Checklist

- [x] Implement B1 Job Lookup API bearer validation and safe errors.
- [x] Implement B2 atomic, authoritative, idempotent Service completion.
- [ ] Verify B1 against the deployed Function with missing, invalid, expired, and valid tokens.
- [ ] Verify B2 against live Dataverse for A/B/C, rollback, timeout, retry, and concurrency behavior.
- [ ] Decide and document disposition of all High findings.
- [ ] Confirm the release branch contains only intended commits.
- [ ] Return to a clean working tree after the approved release commit.
- [ ] Publish and verify all required Dataverse schema in the target environment.
- [ ] Confirm every documented Choice value and lookup navigation property.
- [ ] Update and test Dataverse security roles with non-administrator accounts.
- [ ] Confirm Azure/GitHub environment variables and server-only API settings.
- [ ] Confirm the Entra production redirect URI.
- [ ] Confirm the workflow's `v1-deployment` branch is the intended production branch.
- [ ] Run `npm run build`, `npm run lint`, and `git diff --check`.
- [ ] Complete the live manual smoke tests above.
- [ ] Create the approved release commit.
- [ ] Create the immutable release tag.
- [ ] Push the commit and tag.
- [ ] Verify Azure Static Web Apps deployment and Functions deployment.
- [ ] Smoke-test the deployed URL, deep links, Dataverse mutations, and rollback/recovery paths.
- [ ] Identify and record the rollback commit/tag and Dataverse rollback procedure.

## Recommended Release Version

`v1.2.0` after the blocker fixes pass live smoke testing. Do not tag the current code-inspected state.

## Recommended Release Commit Message

`fix: secure job lookup and service completion integrity`

## Recommended Git Tag

`v1.2.0`

## Documentation Follow-Up

- `README.md` is materially stale: it omits Customers, Equipment, Quotes, Pricing, WOF/REGO, qualifications, service completion, current routes, current status values, and most required entity sets. It also still describes Settings as a navigation item.
- `AI_CONTEXT.md` correctly declares the project not production-ready, but its WOF section says both that Equipment expiry is updated after a passed WOF and that this automation is deferred. Resolve that contradiction before the release handoff.
- The changelog's Unreleased section has been organized into Major Features, Improvements, Bug Fixes, and Known Limitations without assigning a final version.
