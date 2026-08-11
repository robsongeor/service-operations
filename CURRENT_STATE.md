# Current State

Branch: `codex/chargeable-invoice-review`

## Deployment status

- Version `v1.3.0` contains Technician Job Card Submission Phases 1 and 2 and the modular
  architecture knowledge base.
- The expanded Dataverse schema, relationships, and least-privilege role updates were
  provisioned, published, verified, and passed a second idempotency run on 25 July 2026.
- Version `v1.3.0` is the current production release.
- Production server-only portal settings must be present for public submission endpoints to
  authenticate to Dataverse.

## Unfinished work

- Chargeable Invoice Review Phases 1–6 and the Phase 7 local release-readiness baseline are
  complete. Explicitly gated target-environment smoke, role assignment and release validation
  remain. The approved staging
  columns are provisioned and verified; release flags remain disabled and the manager role remains
  unassigned. One explicitly approved interactive read-only verification passed again on
  12 August 2026 without any Dataverse write.
- Approve and provision the minimum Site Check deletion privileges, then smoke-test the
  in-app occurrence deletion action as the intended Service Operations role.

- Run a Site Checks Site Settings smoke test as an assigned non-admin Service Operations user.
- Run the combined Site Checks Phase 8 target-environment validation: verified maximum-Site
  request observation, non-admin creation/completion, manual accessibility, and rollback
  review. Use one existing signed-in session and do not automatically retry authentication.
- Confirm the four server-only `DATAVERSE_*` settings are present in the production
  Static Web App / Function environment.
- Run a production-safe Technician Job Card smoke test.

## Recent milestone

The manager-only Chargeable Invoice Review implementation plan is approved for phased work.
Four representative, single-page GreenTree PDFs were visually and structurally inspected
without modifying the originals. They confirm stable labelled invoice/header/equipment/totals
regions but variable optional PO, story, meter and service content. The plan now records four
real workflow fixtures: Waiting on Sales with a possible Do Not Process disposition, technician
photo/PO approval, part-price correction plus new Labour/Consumables lines, and a technician-
verified Date of Job correction. Extracted Order No remains source evidence and never
automatically proves PO receipt. No Dataverse, application, cloud or email mutation occurred.

The approved Chargeable Invoice Review Dataverse preflight then completed through one
interactive connection after the no-prompt attempt safely stopped. It confirmed all six proposed
table names and ten relationship names are unused; required User-owned reference contracts and
the unmanaged target solution are present; Service Operations has global reference access; the
dedicated Chargeable Invoice Manager role does not yet exist; and the organisation upload limit
is 5 MiB. A detailed User-owned schema and dedicated manager-role proposal is documented. No
metadata, privileges, assignments, business rows, files or configuration were changed.

The product owner approved the proposed six User-owned tables, dedicated unassigned manager
role, 5 MiB V1 file limit, immutable history, approval-PDF wording and file allowlists. The
original malware-scanning release-gate decision was explicitly withdrawn on 12 August 2026;
V1 now has no malware-scanning integration or setting. This confirms the Phase 1 contract but is
not itself authorisation to provision Dataverse or create/grant the role.

The first local Phase 2 foundation slice is implemented: named Choice constants and typed Review,
Line and Correction contracts plus pure primary-queue, Waiting, Ready-to-Process and Do-Not-
Process rules. Five focused tests cover explicit review start, Waiting precedence, terminal
history, PO/photo prerequisites and required no-charge reasoning. Full regression tests, lint,
production build and whitespace validation pass. No route, UI, service, Dataverse metadata,
role or business record was created by this slice.

After separate explicit external-write approval, the six-table schema, Restrict relationships,
three alternate keys and 5 MiB File contract were provisioned and published. The unassigned
manager role has the approved 30 organisation-depth grants and no new-table Delete/Assign/Share
grants. A later read-only verification confirmed active keys, the full schema/role contract and
zero user/team assignments. No business rows were created.

The remaining Phase 2 pure domain foundation is now implemented. A structured GreenTree
extraction boundary normalises whitespace, currency, Date Only values, line categories and
stable line keys into immutable Revision/Line drafts while preserving raw evidence. It reports
required-field, malformed-number and totals/GST mismatches without inventing or repairing
values. Outstanding header, story, changed-line, added-line and removed-line corrections compare
conservatively against a later revision; duplicate candidate lines remain Not Made rather than
being falsely matched. Ten focused tests pass with de-identified synthetic evidence.

Phase 3 preview foundations are implemented locally. The authenticated Azure Function validates
the delegated identity once, verifies access to the new Review table, enforces PDF signature,
MIME, exact byte count, 5 MiB, five-page and bounded-text limits, extracts positional text through
server-side PDF.js, and performs one exact bounded Job Number query using Our Ref. It returns no
write payload and creates no business row or File. Client validation rejects unsupported files
before encoding. Both server release flags remain disabled. Local read-only parsing of all four
supplied PDFs extracted their invoice/reference, Labour/Parts lines and totals with zero domain
validation issues; the originals were not modified or copied into the repository.

The new `/chargeable-invoices` batch screen is also wired locally in the main route/sidebar. It
reuses Page Header and Metric Strip, accepts at most 20 PDFs, acquires one silent token per batch
action, runs at most two previews concurrently, and keeps valid results usable when another file
fails. Duplicate invoice numbers require an explicit revised-import or skip decision; incomplete
imports are retryable, and unmatched rows offer a bounded exact Job Number recovery. Import
re-parses and revalidates server-side, stages Review/Document metadata, uploads the immutable PDF,
then atomically creates Revision/Lines/Activity and activates the Review. No live import was run.

Phase 19 Checklist Administration is implemented locally and its approved Dataverse
least-privilege boundary is provisioned. The admin-only `/site-checks/checklists` route
loads ICE/Electric definitions, edits validated local drafts, and atomically publishes a
new immutable version while deactivating the previous version with ETag protection.
`georger@liftrucks.co.nz` is the sole assignee of the new unmanaged **Site Check Checklist
Administrator** role. Service Operations retains Template/Item Read and operational Append
To but no longer has Create, Write, Delete, or Append. Same-session verification passed
without schema/business-row changes or an interactive sign-in prompt. Signed-in admin UI
and separate non-admin direct-write denial smoke tests remain.

The product direction for the next Site Checks expansion is approved and recorded as
Phases 14–18 in the authoritative tracker. Phase 14 is complete: the authenticated
`/site-checks` workspace shows enabled Sites across Customers, defaults to Needs attention,
supports state metrics plus combined operational filters, and reuses the existing
Run/details drawers. It uses one silent token, paged Site/technician references, bounded
100-Site Schedule scopes, batched occurrence/progress reads, and lazy per-Site Equipment;
it does not load global Jobs or Equipment. Customer, Job, and Equipment links reach their
canonical management context. A signed-in desktop smoke loaded three enabled Sites, verified
Due and technician filters, opened the active Summary drawer, loaded the three-machine
creation review without submitting it, and verified Escape/focus return. No authentication
prompt or Dataverse write occurred.
Technicians will receive one occurrence-level assignment experience while retaining one
independent Job and Job Card per Equipment. Future checklist definitions will be versioned
and snapshotted, technician submission will remain separate from operational completion,
and findings will require explicit office review before creating follow-up Jobs or Quotes.
No new schema is approved or provisioned by this design decision; bulk access, checklist,
and findings schema/security changes retain explicit approval gates.

Phase 15 local inspection and the consolidated live read-only preflight are complete. The
preflight used one
cached `LoginPrompt=Never` connection and made no changes. It confirmed that the four
proposed Site Check token columns/key and Email Dispatch Site Check relationship are absent,
that Email Dispatch Job is currently required, that Service Operations already has the
necessary Organisation-depth relationship privileges, and that Public Portal Service
currently has no Site Check privilege. The proposal adds four optional token-lifecycle
columns plus a token-hash alternate key on Site
Check, adds an optional Site Check lookup to Email Dispatch, and changes its required Job
lookup to optional with an application-enforced exactly-one-owner rule. Public Portal
Service would receive only Organisation Read on Site Check. At the preflight stage no
schema, role, flow, server, email, or application mutation had been performed.

Phase 15 schema/security provisioning was then explicitly approved. The four token fields,
published optional Email Dispatch Site Check relationship, Active token-hash key, and only
Organisation Read on Site Check for Public Portal Service are now provisioned and verified.
Email Dispatch Job remains Application Required: Dataverse returned success for three
required-level update attempts but retained the old value, despite reporting the column as
unmanaged, updateable, and changeable. No further blind retries should be made. This is no
longer a Phase 15 blocker: the working Jobs-table email action was traced to secure-link
generation followed by a `mailto:` handoff, and the product owner selected that mechanism
instead of Power Automate. The optional Email Dispatch Site Check relationship is unused;
no separate dispatch table should be provisioned. Phase 15 application implementation has
started locally: the shared Site Check assignment service, Azure Function wrapper, and Vite
middleware implement authenticated link generation/revocation and anonymous minimal
occurrence/Job lookup. The client reuses the Jobs-table email validator and `mailto:`
builder with Site Check-specific subject/body. The manager **Send to technician** action and
unauthenticated read-only `/portal/site-check/:token` assignment list are wired. Six focused
tests, lint, and production build pass.

The product owner resolved the Static Web App Contributor/RBAC and missing environment
configuration and then confirmed the client secret exposed in a supplied screenshot was
rotated and replaced in the Static Web App environment. Never copy the old or current value
into source, documentation, logs, or responses.

Post-rotation full regression tests, lint, and production build pass. The localhost public
route rendered its safe temporary-error response because the local API process does not
have the rotated server identity. The management tab was signed out after reload; no token,
Dataverse write, mailto handoff, or real communication was created. Live validation remains
pending one user-initiated localhost sign-in plus local server identity configuration or a
deployed endpoint.

The subsequent signed-in manager smoke verified **Send to technician** on both active
Cardinal Site Checks. Drury's 17 Jobs and Puhinui's two Jobs were correctly blocked because
their generated Jobs do not all have numeric Job Numbers. No token, Dataverse write, mail
client, or communication was created. Successful end-to-end link validation awaits a
genuinely numbered in-progress occurrence; production Job Numbers must not be assigned only
to facilitate a test.

Phase 16 schema, proposed Choice values, initial organisation-wide template scope, and the
least-privilege security model were explicitly approved and provisioned on 26 July 2026.
One cached, no-prompt preflight confirmed the four table names and two extension lookup names
were unused and inspected only metadata/role grants. A second single cached connection
created and published the versioned Template/Item, occurrence Snapshot Item, per-Job
Response, Schedule Template selection, and optional Job Photo Response relationship.
Same-session structural, Choice, relationship, key-definition, and role-grant verification
passed without creating or changing business data. All four alternate keys were initially
Pending; one later cached, read-only `VerifyChecklist` check confirmed all four Active and
reverified the schema/security contract. No checklist content was seeded; actual prompts
and item-level required/comment/photo rules remain a separate product approval before
application integration.

The first Phase 16 application-foundation slice is complete locally. It adds typed Template,
Template Item, Snapshot Item, Response, response-type, and choice-answer contracts; strict
paged Dataverse reads using the four metadata-confirmed entity sets; active-template and
item-integrity validation; and deterministic immutable snapshot payload construction.
Schedule reads now include the optional selected-Template lookup. It does not add template
administration, seed checklist content, change occurrence creation, change technician
submission, or write business data. The focused 52-test Site Checks suite, lint, and
production build pass.

The two supplied legacy fortnightly check sheets have been extracted and compared without
modifying the originals. The product owner clarified that one technician link opens all
machine Jobs, but each Job must receive the checklist selected from its Equipment Service
Data. Existing `gr_equipment.gr_powertype` (ICE/Electric/Other or Unknown) is authoritative.
The unseeded content proposal defines separate complete ICE and Electric Templates. Its
required schema correction was approved and provisioned on 26 July 2026: Snapshot Item now
has a required Job lookup and Job + Item Key alternate key while retaining Site Check for
occurrence reads. A cached no-prompt preflight confirmed zero Snapshot rows and the required
Service Operations relationship privileges before the old key was replaced; structural
verification passed without creating business rows.
The replacement alternate-key definition exists but its Dataverse index remained `Pending`
at the final no-prompt read-only check. Do not repeatedly poll; confirm `Active` in the next
relevant Dataverse session before occurrence integration.
A later single cached no-prompt verification confirmed it `Active` and all Phase 16
schema/security contracts passed. Local Snapshot Item types, reads, and creation payloads
now require the generated Job binding. A pure domain resolver selects Electric only for
Electric Power Type and selects ICE for ICE, Other / Unknown, and missing values, with the
latter cases labelled **ICE checklist (defaulted)**. Focused tests and lint pass.
The exact Phase 16 checklist v1 content and rules were explicitly approved and provisioned
on 26 July 2026. A cached no-prompt preflight found zero matching rows. One subsequent
cached no-prompt connection atomically created `SITE_CHECK_ICE` v1 with 23 Items and
`SITE_CHECK_ELECTRIC` v1 with 22 Items, then verified every row against
`scripts/site-check-checklist-v1.json`. Answers are required, failed inspection items
require comments, photos are optional, and the service-meter reading is a required Number.
No operational or customer business rows were created or changed. The next implementation
slice was completed locally: authoritative creation loads and validates the required active
Templates, selects per Equipment Power Type, and adds every per-Job immutable Snapshot Item
to the same atomic change set as the occurrence and generated Jobs. The Run review labels
each machine's checklist and explicitly marks ICE fallback. Missing or invalid content
blocks before writing. The verified 22-machine ICE case produces 530 operations within the
enforced limits. The focused 54-test suite, lint, and production build pass. No occurrence
was created during this validation.

Phase 17 has started locally. The secure Site Check assignment endpoint now loads Snapshot
Items and returns only those attached to Jobs still authorised by the occurrence token and
assigned technician. The portal now has a machine selector and grouped immutable checklist
display with response-rule hints. It remains intentionally read-only until checklist
Responses, Job Card fields, and token/job replay protection are committed through one
canonical server-side per-Job transaction. Six assignment tests and lint pass.
That transaction is now implemented locally: each request revalidates the occurrence token,
technician, Job membership/state, and Snapshot ownership; validates every required answer,
numeric meter reading, and failed-item comment; then atomically creates Responses and marks
only Job Card Status Submitted using the Job ETag. Operational Job Status is untouched.
Replay/concurrent writes are rejected by ETag and alternate keys, and the portal advances
to the next unsubmitted machine. Time, parts, photos, search, unsaved-change warnings, and
an end-to-end portal smoke remain. Eight focused assignment tests and build pass.
Canonical time entries and Job Materials now join checklist Responses and the Job Card
update in the same atomic transaction. The portal also supports machine search, automatic
continue-to-next, and an unsaved-input confirmation when switching machines. Optional photo
upload, whole-page navigation guarding, accessibility/recovery/browser validation, and an
end-to-end portal smoke remain. Eight focused assignment tests, lint, and build pass.
Optional photos now reuse the canonical Job Photo preparation, validation, idempotent
upload-key, Job relationship, and file-column upload path. A whole-page `beforeunload`
warning complements machine-switch confirmation, and preview URLs are released on reset.
Live authenticated portal/file smoke validation remains outstanding.
The complete repository regression suite, lint, production build, and `git diff --check`
pass. Release preparation excludes the unrelated untracked `docs/wiki/` directory. The
branch is ready to push; deployment and production-safe authenticated/manual validation
remain separate explicit actions.
A localhost assignment-link 503 was diagnosed as an unnecessary public Mechanic expansion:
the least-privilege portal identity correctly lacked Mechanic Read and Dataverse returned
403. The public projection no longer expands or exposes Mechanic; GUID-based assignment
authorization is unchanged and no new privilege is required. Local middleware now includes
the `submitJob` route and safe console diagnostics. Tests/build pass. The environment had
zero Snapshot rows, so the existing pre-integration occurrence must be recreated to test
the checklist itself.
The product owner decided missing and Other/Unknown Power Type defaults to the ICE Template
without changing Equipment Service Data; preview and technician UI must show **ICE checklist
(defaulted)**. Checklist content and comment/photo rules still await explicit approval.
No Dataverse business rows or application behaviour changed.

Starting a Site Check is now one compact review flow. The drawer selects the technician,
collapses included Equipment, keeps unavailable exceptions visible, and allows persistent
availability changes inline. Those Equipment updates now share the existing atomic
occurrence/Schedule/Job/exclusion transaction. Successful creation opens directly on Jobs &
Equipment for immediate Job Book copy/paste.

Enabled Site headers now use one context-aware Site Check details action instead of separate
current and history buttons. In progress opens the current occurrence Summary; other enabled
states open History through the same details drawer.

Phase 13 temporary Equipment availability is implemented locally. The Equipment marker is
available from the Customer Dashboard Equipment drawer only when the current Site has an
enabled recurring Schedule. In Workshop and Temporarily Off-site Equipment are excluded
after Schedule scope filtering, snapshotted in the same atomic occurrence transaction, and
reconsidered only at the next normal occurrence after returning; no catch-up Job is created.
The schema is provisioned and published, its composite key is Active, and the approved
Service Operations Create/Read/Delete/Append/Append To privileges are verified at
Organisation depth. Run preview and occurrence history expose exclusion reasons.

A signed-in desktop target smoke on Air New Zealand / Can Park Auckland passed on 26 July
2026 without another authentication prompt. With a temporary Weekly Schedule, FN1579 marked
In Workshop, and Anura assigned, preview showed two included machines and one unavailable
machine. Creation produced exactly two Jobs and one immutable FN1579 exclusion snapshot;
the details drawer showed `0/2`, both Jobs, and the In Workshop reason. The in-app atomic
delete then removed the occurrence, two Jobs, and exclusion. FN1579 was restored to Available
at Site and the temporary Schedule was disabled, returning all Customer summary counts to
zero and removing Site Check content from the Site header.

Disabled Site Check Schedules now render no Site Check summary or actions in the Site header,
including History. Stored occurrences and Jobs remain unchanged and become accessible again
if the Schedule is re-enabled.

Controlled in-app Site Check deletion is implemented locally. The details drawer confirms
the permanent action, loads all generated Jobs, then atomically clears an active pointer and
deletes Jobs before the occurrence using ETags. Schedule cadence, scope, and manual
selections remain. Service Operations does not currently have Site Check Delete privilege;
provisioning remains a separate explicit approval gate.

At the user's explicit request, the current Site Check test occurrence and its generated
Jobs were permanently removed on 26 July 2026. One cached, no-prompt transaction cleared
one active Schedule pointer, deleted one Site Check occurrence and three Site Check Jobs,
and verified zero occurrences and Site Check Jobs remained while preserving the existing
Schedule. The administration tool now has a narrow `PurgeOccurrences` mode so future
occurrence cleanup cannot inadvertently delete Schedule settings or manual selections.
A later repeat cleanup removed one newly created occurrence with no generated Jobs, cleared
its active pointer, and again verified zero occurrences and Site Check Jobs while preserving
the Schedule.

Site Check Job Book allocation is implemented locally. The details drawer loads every
generated Job in stable creation order, copies the requested eight headerless TSV columns,
accepts one numeric Job number per line, validates the exact mapping, and writes every
number in one ETag-protected atomic change set before authoritative reload. It reuses the
existing comma-separated Site address convention, silent authentication, and generated-Job
query; no schema or sign-in flow changed. Newly generated Jobs use the shared occurrence
description `<Frequency> checks for <Monday week-start date>` calculated from the start time
in New Zealand.

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

Chargeable Invoice Review Phase 2 is complete. On 11 August 2026 the explicitly approved six
user-owned tables, columns, Restrict relationships, three alternate keys and 5 MiB File column
were provisioned and published. The unassigned `Chargeable Invoice Manager` role was created
with the approved 30 organisation-depth Create/Read/Write/Append/Append To grants and no
Delete/Assign/Share grants; verification confirmed no user or team assignments. No business
rows were created and the organisation upload limit and `Service Operations` role were not
changed.

Phase 3 is complete locally, and the approved Review Import Status plus Document Upload
Status/Error columns are provisioned and verified. The next gated work is a de-identified
manager-role smoke covering new import, revised import, failure recovery and access denial
before enabling either release flag. Manager role assignments, deployment,
enabling File-write flags, server dependency/configuration changes and all real
communications retain separate explicit approval gates. The remaining Site Checks release
gates, production server-settings verification and Technician Job Card smoke test remain
separate outstanding release work.

Chargeable Invoice Review Phase 4 has started locally. The route now defaults to a bounded
Active-only review queue with derived New/In Progress/Waiting/Ready/History filters and search;
PDF intake remains an explicit sibling mode. An accessible focus-return workspace loads current
revision fields, lines, retained documents, corrections and append-only activity. Start Review
and Waiting changes use one ETag-protected Review + Activity change set. Staging/Failed imports
and operational Job mutations are excluded. Deliberate PO/photo decisions and explicit Ready to
Process / Do Not Process confirmations are also implemented under the same concurrency/audit
boundary; extracted Order No is never adopted automatically, Ready rechecks unresolved
corrections, and Do Not Process requires a reason. The Invoice tab loads the current Revision's
immutable source PDF only on deliberate request through delegated Dataverse access, validates its
byte count and revokes its local object URL when replaced or closed.
Structured correction authoring is now implemented for supported header fields, repair/work
stories, change/remove existing lines and requested new Labour/Parts/Other lines. Draft validation
requires meaningful changes and captures immutable Revision/Line evidence. Correction creation,
an ETag-enforcing Review sentinel update and append-only Activity commit atomically; new corrections
begin Outstanding and block Ready. Phase 4 is complete locally.

The first Phase 5 slice is complete locally. Revised imports now re-evaluate at most 200 unresolved
Outstanding/Not Made Corrections on the server against the newly parsed immutable Revision. Exact
normalised header/story matching, stable source-line keys and unique structured added-line matches
avoid false positives. Revision/Lines, document activation, Review current revision, ETag-protected
Correction outcomes and a Revision Compared Activity commit atomically; unknown outcomes retain the
existing immutable Review/revision reconciliation. Matched rows identify their Revision, Not Made
rows remain unresolved for the next revision, and both states are visible in the workspace. No live
invoice was imported, no role was assigned, no release flag was enabled and no communication was sent.

The next Phase 5 slice is also complete locally. An opened workspace loads a bounded active
Mechanic list; deliberate technician selection, photo-request preparation and their Activities use
ETag-protected Review transitions. Prepare opens a validated editable `mailto:` draft and records
preparation only. Supporting-photo upload accepts at most 20 retained JPG/PNG/HEIC/HEIF files per
Review at 5 MiB each, verifies byte signatures and SHA-256 duplicates, stages Review Documents,
writes File bytes, then atomically completes the documents, records Photos Received and appends
Activity. Known failures retain safe Failed staging; uncertain finalisation reconciles without
automatic retry. Only Complete documents download. Focused tests cover mail composition, validation,
atomic finalisation and failed staging. No live file was uploaded and no email was sent.

Phase 5 is now complete locally. The workspace generates deterministic consolidated correction
instructions for clipboard copy or plain-text download from loaded immutable Review/Revision and
structured Correction evidence. Outstanding and Not Made items include explicit current/requested
header, story or line details; Matched and Superseded history is excluded. Malformed historic line
snapshots use a safe unavailable label. Generation creates no Dataverse mutation or Activity and
states that nothing was sent automatically. Focused tests cover filtering, evidence wording,
requested values, filename and workspace actions.

The first Chargeable Invoice Review Phase 6 slice added an authenticated server endpoint that
re-reads the current immutable Review/Revision/Lines, rejects stale, terminal, non-PO and
unresolved-correction states, and renders the familiar Liftrucks approval layout with the prominent
`FOR CUSTOMER PO APPROVAL - NOT A TAX INVOICE` marker. The versioned `pdf-lib` renderer produces
extractable A4 PDFs; a canonical SHA-256 snapshot hash reuses an existing matching Complete
document. New output stages as a Review Document and atomically completes with an Approval PDF
Generated Activity under the Review ETag. The workspace can generate and download the document.
De-identified extracted-text and visual render checks pass. No live document was generated, no
release flag was enabled and no deployment or communication occurred.

Chargeable Invoice Review Phase 6 is now complete locally. The workspace loads a bounded Site
Contact list only for the Review Site, supports deliberate Site Contact or manual recipient entry,
and gates PO-request preparation on the current Complete approval PDF, resolved Corrections and
received supporting photos when required. It lists every file for manual download/attachment and
requires explicit attachment confirmation before opening an editable `mailto:` draft. The Review
ETag transition records preparation timestamp and safe Activity only; recipient/body are not
persisted and no email is sent. First confirmed PO receipt now records the dedicated PO Received
Activity, while existing business rules continue to derive Ready. No live data, files or
communications were created.

Chargeable Invoice Review Phase 7 now has an authoritative local operations baseline. V1 retains
immutable Complete evidence and recoverable Pending/Failed staging with no automatic cleanup. The
operator checklist defines explicit role/deployment/flag gates, de-identified business and access
smoke tests, keyboard/screen-reader/zoom checks, bounded performance evidence, content-safe
monitoring and flags-first non-destructive rollback. Static release guards protect the disabled
defaults, least-privilege role, silent authentication, reusable accessible workspace and request/
file bounds. No role was assigned, flag changed, deployment performed, live row written or
communication sent.

Chargeable Invoice V1 no longer has malware-scanning integration or a readiness setting, by
explicit product-owner decision on 12 August 2026. Authenticated preview and Job lookup remain
available without a flag. Confirmed import and approval generation each retain their own disabled-
by-default server switch before creating or uploading Dataverse File evidence. Manager access,
strict file allowlists, bounded parsing/rendering, staged recovery and ETag protections remain;
none of those controls are represented as malware detection.

The Phase 7 release preflight reverified the live Dataverse metadata and role contract on
12 August 2026 through one explicitly approved interactive `Verify` session. All six tables,
staging fields, relationships, alternate keys, the 5 MiB File contract and all 30 organisation-
depth grants passed. The manager role remains unassigned with no Delete, Assign or Share. No
schema, configuration, role assignment or business row was changed.
