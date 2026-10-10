# Job Book user access plan

Recorded status: eleven-account Entra and Dataverse roster updated 9 October 2026; not re-audited live on 10 October.
The restricted-access server guard is recorded deployed; named-user acceptance remains required.
The 10 October source audit found the guard disagrees with approved mechanic and Equipment
editing capabilities. See [release gates](../../RELEASE_READINESS.md) and
[audit A01](../reviews/2026-10-10-application-audit.md#a01--client-permissions-and-server-allowlists-disagree).
Do not treat the intended matrix below as proof that every operation succeeds.

## Live audit

The [3 October read-only audit](JOB_BOOK_ACCESS_AUDIT.md) confirms the original ten Entra accounts.
A 9 October recheck confirms all eleven intended users are present in Dataverse. The obsolete
JobBookOnly Entra assignment was removed from all eight restricted Admin accounts after each
replacement role was verified. See the audit for the original snapshot and rollout history.

## Role decisions

| Business role | Decision | Implementation status |
| --- | --- | --- |
| Full access | George only; unrestricted application access | Existing `ServiceOperations.FullAccess` profile |
| Service coordinator | Bruce and Andy; operational management with the approved restricted screen set | Separate frontend profile implemented as `ServiceOperations.ServiceCoordinator`; Microsoft provisioning, Bruce assignment and named-user verification are mandatory go-live blockers |
| Office Admin | Jess, Nargiza and Pubudu; entry, corrections, technician assignment/email, markers and review | `ServiceOperations.JobCardAdmin` is assigned in Entra and Dataverse |
| Job Book Admin | Five entry/correction users; eligible-entry Void allowed; corrections remain allowed after coordinator handoff; mechanic selection permitted; no technician email, review or GT/Timecloud marker changes | `ServiceOperations.JobBookAdmin` is assigned in Entra and Dataverse |
| Job Book only | Obsolete | No restricted Admin account retains this Entra assignment |

Keep Service coordinator distinct from Full access. Do not assign Bruce or Andy FullAccess: a
remaining FullAccess claim would bypass the coordinator screen restrictions. Future changes must cover both UI capabilities and
authoritative server/Dataverse permissions, including other roles and team grants.

Unrestricted access here means access within Service Operations. It does not imply Microsoft
tenant administration, bypassing data-integrity rules or authority to rewrite permanent numbers.

## Intended users

Assignments below were verified on 9 October 2026. Everyone uses an individual work account.

| Person/account | Intended role | Identity basis |
| --- | --- | --- |
| George — `georger@liftrucks.co.nz` | Full access | Existing project owner account; verify target identity |
| `brucef@liftrucks.co.nz` | Service coordinator | Supplied by George |
| `andyl@liftrucks.co.nz` | Service coordinator | Supplied by George |
| `pubudu@liftrucks.co.nz` | Office Admin | Returned from Job Book Admin to Office Admin in Entra and Dataverse; obsolete JobBookOnly removed after replacement verification. |
| Jess — `jessamynb@liftrucks.co.nz` | Office Admin | Name and email confirmed by George |
| Nargiza — `nargiza@liftrucks.co.nz` | Office Admin | Name and email confirmed by George |
| `martinh@liftrucks.co.nz` | Job Book Admin | Supplied by George |
| `lancec@liftrucks.co.nz` | Job Book Admin | Supplied by George |
| `ranjani@liftrucks.co.nz` | Job Book Admin | Supplied by George |
| `ashneelk@liftrucks.co.nz` | Job Book Admin | Supplied by George |
| `kaizerg@liftrucks.co.nz` | Job Book Admin | Supplied by George |

## Job Card review access decision

Job Card review, including marking a card Processed in GreenTree, is limited to:

- George through Full access.
- Service coordinators Bruce and Andy.
- Office Admins Jess, Nargiza and Pubudu.

Martin, Lance, Ranjani, Ashneel and Kaizer are planned Job Book Admins. They do not receive Job Card
review access. Both Admin groups may work across all four Job Books.

The JobBookAdmin profile permits correction and mechanic selection but must separate these from technician email,
GT/Timecloud marker writes and review access. The existing JobBookOnly profile cannot substitute:
it does not permit corrections to managed Jobs. Keep Office Admin on the existing JobCardAdmin
profile and implement the distinct restricted profile, including navigation, landing route and
server/Dataverse enforcement. Job Card API/private evidence access must match the approved
reviewer set. Inspect existing production reviewers before applying a reconciled manifest.
The live shared V1 backend reviewer allowlist was reconciled on 6 October 2026 for George, Bruce,
Andy, Jess, Nargiza and Pubudu. Pubudu's restored Office Admin assignment agrees with that reviewer
allowlist. Recreate only this approved reviewer set
when the permanent V2/shared backend replaces the temporary proxy.

## Job Book Admin correction scope

- Create Job Book entries and correct Equipment, Customer/Site, Contact, description and PO.
- Continue making those factual corrections after the same Job enters Service coordination.
- May mark eligible entries Void with a required reason. Preserve the allocated number, original
  evidence and audit history. Existing eligibility rules still apply: coordinator-managed work and
  entries marked entered in GreenTree or Timecloud cannot use this Void action. Require current
  versions and atomic Job/ledger updates where linked; reject concurrent changes safely.
- Mechanic selection is permitted through the shared approved workflow. Do not send technician emails, review Job Cards,
  mark Processed in GreenTree or change GreenTree/Timecloud entry ticks.
- Do not change coordinator membership, scheduling, Job type, operational status, permanent
  numbers or original technician evidence through the correction workflow.
- Address follows the selected Site; correcting a Job does not implicitly move Equipment or
  rewrite shared Site details. Use the existing narrow correction service and exact ETags.
- Enforce field allowlists server-side; never grant broad Job Write and rely on hidden controls.

## Shared Admin Customer/Site and Equipment access

George confirmed that both Job Book Admins and Office Admins (Jess, Nargiza and Pubudu) may:

- Create Customers and Sites.
- Explicitly move Equipment between Sites/Customers. Persist the Equipment Site relationship;
  Customer follows Site. Preserve historical Job locations and evidence.
- Update existing Equipment details, including the descriptive details discussed (make/model
  and serial number) and WOF / REGO. Reuse the canonical Equipment workflow, with concurrency
  protection.

This extends the earlier narrow location-only exception for both Admin groups. Define and test the
actual allowed Equipment fields before provisioning rather than reusing a broad editing capability
that also unlocks unrelated actions. Permission to edit details is not permission to delete Equipment,
rewrite historical meter/service evidence, change maintenance plans or perform bulk imports.
The restricted Equipment screen therefore includes WOF / REGO but omits maintenance summaries,
maintenance/data-quality columns, maintenance-plan loading and Job history; those remain available
only through broader authorised operational roles.
General editing of existing Customer/Site master records has not been requested. Creating new
records and selecting a destination do not authorize silently changing shared names/addresses.
Job corrections remain distinct from explicit Equipment movement or master-record edits.

Use the existing creation/move workflows and make their independent save boundaries clear:
cancelling a Job entry does not undo an already saved Customer, Site or Equipment move.
Duplicate checks, retry recovery, exact-version saves and server-side permissions must be verified.
Both Admin groups have the same approved creation, movement and Equipment-detail editing scope.
Both Admin groups have separate Customers and Equipment screens, alongside Job Book.
Equipment workspace Customer/Site creation uses the same canonical verified-address component as
the Job drawer, rather than maintaining a separate inline new-Customer form.
The precise Equipment field allowlist remains an implementation decision.

## Office Admin scope retained for review

- Job Book entry and permitted factual corrections, including GT/Timecloud entry markers.
- Job Card reviews and office review actions only for Jess, Nargiza and Pubudu, as specified above;
  original technician evidence stays protected.
- Mechanic selection/reselection through the shared approved workflow, plus assigned-technician
  email. This does not grant broader coordination, scheduling or additional-assignment management.
  Server enforcement and post-delivery allocation remain acceptance blockers.
- Read-only Quotes, including a display-only existing-Quote popout with no editing, deletion,
  PDF-generation or PO-email actions. Customer/Site creation, explicit Equipment movement and Equipment-detail
  editing match Job Book Admin permissions above. Existing Customer/Site master-record editing
  remains outside the agreed scope.

This list describes intended duties, not a claim that all production authorization is implemented.
Job Card API reviewer authorization is separate from the application role and must be configured
and tested for the final approved reviewer roster.

## Agreed Admin navigation

| Screen | Job Book Admin | Office Admin (Jess, Nargiza and Pubudu) |
| --- | --- | --- |
| Job Book | Entry, mechanic selection, factual corrections and eligible Void; no email or GT/Timecloud tick writes | Entry, mechanic selection, corrections, eligible Void, assigned-tech email and GT/Timecloud tick writes |
| Customers | Separate screen; view and create Customers/Sites; no general editing of existing Customer/Site master records | Same |
| Equipment | Separate screen; view, update agreed Equipment details and explicitly move Equipment between Sites | Same |
| Job Card reviews | No access | Review and approved office processing actions |
| Quotes | No additional access agreed for this role | Existing read-only access retained |
| Service coordination | No access | No access |

These are intended navigation and action boundaries. They must also hold for direct links,
related-record drawers and API requests. The profiles and restricted screens are implemented;
the restricted server guard is recorded enabled from 9 October. The distinct numbering invariant
guards remain recorded disabled for V1 compatibility. Neither state proves the capabilities above
work with real restricted accounts.

## Agreed Service Coordinator navigation

Service Coordinators can use Customers, Equipment, WOF / REGO, Service Jobs,
Job Card Reviews, Job Book, Scheduling, Quotes and Pricing. Job Import is restricted to Full Access.

They cannot open Overview, Staff, Maintenance Booking, Greentree Review, Equipment Photos, Equipment Map, Job Map, Site Checks,
Chargeable Invoices or Checklist Admin. These items are absent from the menu and their direct URLs
fail closed. George's FullAccess profile remains unrestricted.

### Mandatory provisioning before live use

The 7 October record describes additive ServiceCoordinator testing for Bruce while retaining
FullAccess. The later roster is the intended destination; a fresh effective-role check and named-user
test are still needed before claiming both coordinators are restricted. Verify direct and team
grants for Bruce and Andy, then remove any obsolete FullAccess assignment only after the coordinator
path works. George remains the sole intended FullAccess user. This audit did not change assignments.

## Decisions still needed

- [x] Both Admin groups may view and work across all four regional Job Books; no regional restrictions.
  Their existing action permissions still apply.
- [x] George confirmed Jess, Nargiza and Pubudu email addresses. Pubudu's target identity is verified; the other target identities still require verification before assignment.
- [x] Job Book Admins may Void eligible entries under the existing reason, retention, marker,
  coordinator-membership and concurrency safeguards.
- [x] Job Book Admins may create Customers/Sites, explicitly move Equipment and update Equipment details.
- [x] Office Admins Jess, Nargiza and Pubudu receive the same Equipment-detail editing permission as Job Book Admins.
- [x] Job Book Admins have separate Customers and Equipment screens, with the agreed permissions;
  Office Admins retain those screens too.
- [ ] Reconcile the approved Equipment-detail scope with the server allowlist: fleet/aliases,
  make/model, serial, Site and approved WOF/REGO edits. Current guard excludes compliance while the
  client sends it. Maintenance plans, ownership changes and historical readings are not implied.
- [x] Define the Service coordinator screen boundary and deny the eight excluded direct routes.
- [ ] Select the pilot users from this roster and confirm the acceptance-test environment.

## Implementation and rollout checks

- [x] Add the distinct ServiceCoordinator frontend profile and restricted screen boundary.
  Entra provisioning is recorded; effective-role and real-user acceptance remain open.
- [ ] Accept the implemented JobBookAdmin profile separately from JobBookOnly and JobCardAdmin.
  Verify corrections, mechanic selection and eligible Void; deny email, marker writes, review and coordinator operations
  through both the UI and direct APIs.
- [ ] Implement and verify the approved Customer/Site creation, Equipment movement and detail-edit
  permissions; test stale saves, historical preservation and denial of unrelated actions.
- [ ] Verify all eleven target accounts, environment access, existing roles/team membership and
  authoritative permissions. Do not infer permissions from Staff records or menu visibility.
- [ ] Provision/assign roles only as a separately authorized rollout action after verification.
- [ ] Test each role with its actual account, including denied actions and direct API requests.
- [ ] Keep George's FullAccess and the coordinator role distinct in the assignment manifest.
- [x] Reconcile the live shared V1 Job Card reviewer allowlist to the approved six users, preserving
  existing authorized access. Repeat verification when the permanent V2/shared backend is provisioned.

Related: [rollout plan](JOB_BOOK_ROLLOUT_PLAN.md),
[Admin review design](JOB_CARD_ADMIN_REVIEW_IMPLEMENTATION_PLAN.md),
[Job Book design](JOB_BOOK_INTAKE_DESIGN.md).

## Historical implementation evidence

The 3 October local/sample verification and earlier 785-test result are preserved in Git
(`git show f73f3d6:docs/features/JOB_BOOK_ACCESS_PLAN.md`). They do not demonstrate current
real-user authorization and their “guard not installable” and “no assignment” statements were
superseded by later deployment and mechanic-selection decisions.

The current offline baseline is in the [10 October audit](../reviews/2026-10-10-application-audit.md):
835/838 Node tests, 64 restricted-policy checks, 47 registration checks and six lint errors.
The server-policy mismatch must be corrected before named-user acceptance can pass.
