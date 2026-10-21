# Job Book user access plan

Recorded status: thirteen-account Entra and Dataverse roster and home branches re-audited live on
21 October 2026.
The restricted-access server guard is recorded deployed; named-user acceptance remains required.
The 10 October source audit found the guard disagrees with approved mechanic and Equipment
editing capabilities. See [release gates](../../RELEASE_READINESS.md) and
[audit A01](../reviews/2026-10-10-application-audit.md#a01--client-permissions-and-server-allowlists-disagree).
Do not treat the intended matrix below as proof that every operation succeeds.

## Live audit

The [3 October read-only audit](JOB_BOOK_ACCESS_AUDIT.md) confirms the original ten Entra accounts.
On 20 October a fresh live Entra/Dataverse inventory reconciled the expanded thirteen-account roster.
Bruce's superseded FullAccess claim was removed after ServiceCoordinator was verified. Paul and James
were assigned JobBookAdmin in both systems, their former broad/default assignments were removed, and
both received verified Auckland home branches. On 21 October a second exact audit verified all 13
application/Dataverse role pairs without broader overlapping workflow roles; the remaining seven
blank home branches were then set to Auckland through owner-approved single-user plans and verified
with zero mismatches. See the audit for the original snapshot and rollout history.

## Role decisions

| Business role | Decision | Implementation status |
| --- | --- | --- |
| Full access | George only; unrestricted application access | Existing `ServiceOperations.FullAccess` profile |
| Service coordinator | Bruce, Andy and Pubudu; operational management with the approved restricted screen set | `ServiceOperations.ServiceCoordinator` is assigned in Entra and Dataverse |
| Office Admin | Jess and Nargiza; entry, corrections, technician assignment/email, markers and review | `ServiceOperations.JobCardAdmin` is assigned in Entra and Dataverse |
| Job Book Admin | Martin, Lance, Ranjani, Ashneel, Kaizer, Paul and James; eligible-entry Void allowed; corrections remain allowed after coordinator handoff; mechanic selection permitted; no technician email, review or GT/Timecloud marker changes | `ServiceOperations.JobBookAdmin` is assigned in Entra and Dataverse |
| Job Book only | Obsolete | No restricted Admin account retains this Entra assignment |

Keep Service coordinator distinct from Full access. Do not assign Bruce, Andy or Pubudu FullAccess: a
remaining FullAccess claim would bypass the coordinator screen restrictions. Future changes must cover both UI capabilities and
authoritative server/Dataverse permissions, including other roles and team grants.

Unrestricted access here means access within Service Operations. It does not imply Microsoft
tenant administration, bypassing data-integrity rules or authority to rewrite permanent numbers.

## Intended users

Assignments and home branches below were verified live on 21 October 2026. Everyone uses an
individual work account.

| Person/account | Intended role | Identity basis |
| --- | --- | --- |
| George — `georger@liftrucks.co.nz` | Full access | Verified role; Auckland home branch |
| `brucef@liftrucks.co.nz` | Service coordinator | Verified role; Auckland home branch |
| `andyl@liftrucks.co.nz` | Service coordinator | Verified role; Christchurch home branch |
| `pubudu@liftrucks.co.nz` | Service coordinator | Verified in Entra and Dataverse with Auckland home branch. |
| Jess — `jessamynb@liftrucks.co.nz` | Office Admin | Verified role; Auckland home branch |
| Nargiza — `nargiza@liftrucks.co.nz` | Office Admin | Verified role; Auckland home branch |
| `martinh@liftrucks.co.nz` | Job Book Admin | Verified role; Auckland home branch |
| `lancec@liftrucks.co.nz` | Job Book Admin | Verified role; Auckland home branch |
| `ranjani@liftrucks.co.nz` | Job Book Admin | Verified role; Auckland home branch |
| `ashneelk@liftrucks.co.nz` | Job Book Admin | Verified role; Auckland home branch |
| `kaizerg@liftrucks.co.nz` | Job Book Admin | Verified role; Auckland home branch |
| Paul — `paulr@liftrucks.co.nz` | Job Book Admin | Verified in Entra and Dataverse with Auckland home branch. |
| James — `jamesa@liftrucks.co.nz` | Job Book Admin | Verified in Entra and Dataverse with Auckland home branch. |

## Job Card review access decision

Job Card review, including marking a card Processed in GreenTree, is limited to:

- George through Full access.
- Service coordinators Bruce, Andy and Pubudu.
- Office Admins Jess and Nargiza.

Martin, Lance, Ranjani, Ashneel, Kaizer, Paul and James are Job Book Admins. They do not receive Job Card
review access. Both Admin groups are intended to work across regional Job Books when those books are
enabled; the current production rollout enables Auckland only.

The JobBookAdmin profile permits correction and mechanic selection but must separate these from technician email,
GT/Timecloud marker writes and review access. The existing JobBookOnly profile cannot substitute:
it does not permit corrections to managed Jobs. Keep Office Admin on the existing JobCardAdmin
profile and implement the distinct restricted profile, including navigation, landing route and
server/Dataverse enforcement. Job Card API/private evidence access must match the approved
reviewer set. Inspect existing production reviewers before applying a reconciled manifest.
The live authoritative yellow-cliff backend reviewer allowlist was re-read on 20 October 2026. The current reviewer
set is George, Bruce, Andy, Pubudu, Jess and Nargiza. Recreate only this approved reviewer set
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

George confirmed that both Job Book Admins and Office Admins (Jess and Nargiza) may:

- Create Customers and Sites.
- Explicitly move Equipment between Sites/Customers. Persist the Equipment Site relationship;
  Customer follows Site. Preserve historical Job locations and evidence.
- Update existing Equipment details, including the descriptive details discussed (make/model
  and serial number) and WOF/REGO compliance fields. Reuse the canonical Equipment workflow, with concurrency
  protection.

This extends the earlier narrow location-only exception for both Admin groups. Define and test the
actual allowed Equipment fields before provisioning rather than reusing a broad editing capability
that also unlocks unrelated actions. Permission to edit details is not permission to delete Equipment,
rewrite historical meter/service evidence, change maintenance plans or perform bulk imports.
The restricted Equipment screen therefore includes WOF/REGO compliance fields but omits maintenance summaries,
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
- Job Card reviews and office review actions only for Jess and Nargiza, as specified above;
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

| Screen | Job Book Admin | Office Admin (Jess and Nargiza) |
| --- | --- | --- |
| Job Book | Entry, mechanic selection, factual corrections and eligible Void; no email or GT/Timecloud tick writes | Entry, mechanic selection, corrections, eligible Void, assigned-tech email and GT/Timecloud tick writes |
| Customers | Separate screen; view and create Customers/Sites; no general editing of existing Customer/Site master records | Same |
| Equipment | Separate screen; view, update agreed Equipment details and explicitly move Equipment between Sites | Same |
| Job Card reviews | No access | Review and approved office processing actions |
| Quotes | No additional access agreed for this role | Existing read-only access retained |
| Service coordination | No access | No access |

These are intended navigation and action boundaries. They must also hold for direct links,
related-record drawers and API requests. The profiles and restricted screens are implemented;
the current signed server guard is `1.0.24.0`. All 14 restricted-access and 15 numbering-invariant
steps are enabled and independently verified. That deployment evidence still does not prove every
capability above works with real restricted accounts.

## Agreed Service Coordinator navigation

Service Coordinators can use Customers, Equipment, WOF, Service Jobs,
Job Card Reviews, Job Book, Scheduling, Quotes and Pricing. Job Import is restricted to Full Access.

They cannot open Overview, Staff, Maintenance Booking, Greentree Review, Equipment Photos, Equipment Map, Job Map, Site Checks,
Chargeable Invoices or Checklist Admin. These items are absent from the menu and their direct URLs
fail closed. George's FullAccess profile remains unrestricted.

### Mandatory provisioning before live use

The 7 October record describes additive ServiceCoordinator testing for Bruce while retaining
FullAccess. On 20 October the live replacement was reverified and Bruce's FullAccess assignment was
removed; he now has only ServiceCoordinator in this application and `Service Operations` in
Dataverse. Andy and Pubudu also have only the reviewed ServiceCoordinator application profile.
George remains the sole intended FullAccess user. Real-account allowed/denied workflow acceptance
remains separate from assignment verification.

## Decisions still needed

- [x] Both Admin groups may view and work across regional Job Books once those books are enabled;
  no user-level regional restriction is planned. Auckland is the only production Job Book currently
  enabled. Existing action permissions still apply.
- [x] The thirteen target identities and current Service Operations assignments were reverified live on 20 October 2026.
- [x] Job Book Admins may Void eligible entries under the existing reason, retention, marker,
  coordinator-membership and concurrency safeguards.
- [x] Job Book Admins may create Customers/Sites, explicitly move Equipment and update Equipment details.
- [x] Office Admins Jess and Nargiza receive the same Equipment-detail editing permission as Job Book Admins.
- [x] Job Book Admins have separate Customers and Equipment screens, with the agreed permissions;
  Office Admins retain those screens too.
- [ ] Reconcile the approved Equipment-detail scope with the server allowlist: fleet/aliases,
  make/model, serial, Site and approved WOF/REGO edits. Current guard excludes compliance while the
  client sends it. Maintenance plans, ownership changes and historical readings are not implied.
- [x] Define the Service coordinator screen boundary and deny the eight excluded direct routes.
- [x] Use the reviewed named roster in the V3 yellow-cliff acceptance environment; real-account
  operation checks remain open.

## Implementation and rollout checks

- [x] Add the distinct ServiceCoordinator frontend profile and restricted screen boundary.
  Entra provisioning is recorded; effective-role and real-user acceptance remain open.
- [ ] Accept the implemented JobBookAdmin profile separately from JobBookOnly and JobCardAdmin.
  Verify corrections, mechanic selection and eligible Void; deny email, marker writes, review and coordinator operations
  through both the UI and direct APIs.
- [ ] Implement and verify the approved Customer/Site creation, Equipment movement and detail-edit
  permissions; test stale saves, historical preservation and denial of unrelated actions.
- [x] Verify all thirteen target accounts, environment access, existing roles/team membership and
  authoritative permissions. Do not infer permissions from Staff records or menu visibility.
- [x] Provision/assign the reviewed roles through separately authorized rollout actions and verify
  the final direct assignments.
- [ ] Test each role with its actual account, including denied actions and direct API requests.
- [ ] Keep George's FullAccess and the coordinator role distinct in the assignment manifest.
- [x] Reconcile the live authoritative Job Card reviewer allowlist to the approved six users, preserving
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
