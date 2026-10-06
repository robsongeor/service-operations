# Job Book user access plan

Status: agreed role direction and proposed eleven-account roster, updated 6 October 2026.
No live roles, assignments or permissions have been changed. This is the rollout access manifest;
account identities and effective permissions must be verified before assignment.

## Live audit

The [3 October read-only audit](JOB_BOOK_ACCESS_AUDIT.md) confirms the original ten Entra accounts.
A 6 October read-only check also confirms Pubudu is present in Dataverse alongside George and Bruce;
the other eight rollout users remain absent. The old Job Book
Only role has broad writes and must not be reused unchanged. See the audit for exact current
assignments, missing role definitions and the proposed implementation/onboarding order.

## Role decisions

| Business role | Decision | Implementation status |
| --- | --- | --- |
| Full access | George only; unrestricted application access | Existing `ServiceOperations.FullAccess` profile |
| Service coordinator | Bruce and Andy; initially the same application capabilities as Full access, with restrictions to be defined later | Separate role proposed as `ServiceOperations.ServiceCoordinator`; not yet implemented or provisioned |
| Office Admin | Jess, Nargiza and Pubudu; entry, corrections, technician assignment/email, markers and review | Existing `ServiceOperations.JobCardAdmin` client profile; authoritative permissions still require verification |
| Job Book Admin | Five entry/correction users; eligible-entry Void allowed; corrections remain allowed after coordinator handoff; no technician assignment/email, review or GT/Timecloud marker changes | Proposed distinct `ServiceOperations.JobBookAdmin`; not implemented or provisioned |
| Job Book only | Not planned for this rollout | Keep existing implementation; do not assign it as part of rollout |

Keep Service coordinator distinct from Full access even while capabilities match. Do not assign
Bruce or Andy FullAccess merely to achieve temporary parity: a remaining FullAccess claim would
bypass later coordinator restrictions. Future changes must cover both UI capabilities and
authoritative server/Dataverse permissions, including other roles and team grants.

Unrestricted access here means access within Service Operations. It does not imply Microsoft
tenant administration, bypassing data-integrity rules or authority to rewrite permanent numbers.

## Intended users

All assignments below are planned, not performed. Everyone uses an individual work account.

| Person/account | Intended role | Identity basis |
| --- | --- | --- |
| George — `georger@liftrucks.co.nz` | Full access | Existing project owner account; verify target identity |
| `brucef@liftrucks.co.nz` | Service coordinator | Supplied by George |
| `andyl@liftrucks.co.nz` | Service coordinator | Supplied by George |
| `pubudu@liftrucks.co.nz` | Office Admin / live pilot | Supplied by George; Dataverse admission and current Service Operations role verified read-only |
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

Martin, Lance, Ranjani, Ashneel and Kaizer are Job Book Admins. They do not receive Job Card
review access. Both Admin groups may work across all four Job Books.

The new JobBookAdmin profile must separate correction rights from technician assignment/email,
GT/Timecloud marker writes and review access. The existing JobBookOnly profile cannot substitute:
it does not permit corrections to managed Jobs. Keep Office Admin on the existing JobCardAdmin
profile and implement the distinct restricted profile, including navigation, landing route and
server/Dataverse enforcement. Job Card API/private evidence access must match the approved
reviewer set. Inspect existing production reviewers before applying a reconciled manifest.
The live shared V1 backend reviewer allowlist was reconciled on 6 October 2026 for George, Bruce,
Andy, Jess, Nargiza and Pubudu. This setting must be recreated and verified when the permanent
V2/shared backend replaces the temporary proxy.

## Job Book Admin correction scope

- Create Job Book entries and correct Equipment, Customer/Site, Contact, description and PO.
- Continue making those factual corrections after the same Job enters Service coordination.
- May mark eligible entries Void with a required reason. Preserve the allocated number, original
  evidence and audit history. Existing eligibility rules still apply: coordinator-managed work and
  entries marked entered in GreenTree or Timecloud cannot use this Void action. Require current
  versions and atomic Job/ledger updates where linked; reject concurrent changes safely.
- Do not change initial/later technician assignment, send technician emails, review Job Cards,
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
  and serial number). Reuse the canonical Equipment workflow, with concurrency protection.

This extends the earlier narrow location-only exception for both Admin groups. Define and test the
actual allowed Equipment fields before provisioning rather than reusing a broad editing capability
that also unlocks unrelated actions. Permission to edit details is not permission to delete Equipment,
rewrite historical meter/service evidence, change maintenance plans or perform bulk imports.
General editing of existing Customer/Site master records has not been requested. Creating new
records and selecting a destination do not authorize silently changing shared names/addresses.
Job corrections remain distinct from explicit Equipment movement or master-record edits.

Use the existing creation/move workflows and make their independent save boundaries clear:
cancelling a Job entry does not undo an already saved Customer, Site or Equipment move.
Duplicate checks, retry recovery, exact-version saves and server-side permissions must be verified.
Both Admin groups have the same approved creation, movement and Equipment-detail editing scope.
Both Admin groups have separate Customers and Equipment screens, alongside Job Book.
The precise Equipment field allowlist remains an implementation decision.

## Office Admin scope retained for review

- Job Book entry and permitted factual corrections, including GT/Timecloud entry markers.
- Job Card reviews and office review actions only for Jess, Nargiza and Pubudu, as specified above;
  original technician evidence stays protected.
- Assigned-technician email through the approved workflow; coordinator management and later
  reassignment/scheduling remain excluded. Initial assignment in unified registration follows the
  Job Book design and still requires real integration.
- Read-only Quotes. Customer/Site creation, explicit Equipment movement and Equipment-detail
  editing match Job Book Admin permissions above. Existing Customer/Site master-record editing
  remains outside the agreed scope.

This list describes intended duties, not a claim that all production authorization is implemented.
Job Card API reviewer authorization is separate from the application role and must be configured
and tested for the final approved reviewer roster.

## Agreed Admin navigation

| Screen | Job Book Admin | Office Admin (Jess, Nargiza and Pubudu) |
| --- | --- | --- |
| Job Book | Entry, factual corrections and eligible Void; no technician assignment/email or GT/Timecloud tick writes | Entry, corrections, eligible Void, approved initial assignment/email and GT/Timecloud tick writes |
| Customers | Separate screen; view and create Customers/Sites; no general editing of existing Customer/Site master records | Same |
| Equipment | Separate screen; view, update agreed Equipment details and explicitly move Equipment between Sites | Same |
| Job Card reviews | No access | Review and approved office processing actions |
| Quotes | No additional access agreed for this role | Existing read-only access retained |
| Service coordination | No access | No access |

These are intended navigation and action boundaries. They must also hold for direct links,
related-record drawers and API requests. The profiles and restricted screens are now implemented
locally; no live Microsoft assignments have changed. The draft server guard is not deployed.

## Decisions still needed

- [x] Both Admin groups may view and work across all four regional Job Books; no regional restrictions.
  Their existing action permissions still apply.
- [x] George confirmed Jess, Nargiza and Pubudu email addresses. Pubudu's target identity is verified; the other target identities still require verification before assignment.
- [x] Job Book Admins may Void eligible entries under the existing reason, retention, marker,
  coordinator-membership and concurrency safeguards.
- [x] Job Book Admins may create Customers/Sites, explicitly move Equipment and update Equipment details.
- [x] Jess, Nargiza and Pubudu receive the same Equipment-detail editing permission as Job Book Admins.
- [x] Job Book Admins have separate Customers and Equipment screens, with the agreed permissions;
  Office Admins retain those screens too.
- [x] Define the local Equipment field allowlist: fleet, alternate fleet numbers, make, model,
  serial and Site. Excludes maintenance, compliance, ownership and historical readings;
  production enforcement still needs acceptance tests.
- [ ] Define later Service coordinator restrictions; temporary parity is the current instruction.
- [ ] Select the pilot users from this roster and confirm the acceptance-test environment.

## Implementation and rollout checks

- [x] Add and test the distinct ServiceCoordinator frontend profile and its initial capability parity.
  The matching Entra role is not yet created or assigned.
- [ ] Implement JobBookAdmin separately from JobBookOnly and JobCardAdmin. Verify corrections
  before/after handoff and eligible-entry Void; deny assignment/email, marker writes, review and coordinator operations
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

## Local implementation status (3 October 2026)

Frontend role/navigation checks and the sample walkthrough now distinguish Job Book Admin,
Office Admin and Service coordinator. Job Book Admin cannot assign/email technicians, change
entry markers, open reviews or use coordinator screens. Both Admin profiles have separate
Customers and Equipment screens with creation and restricted Equipment editing. Equipment
saves use an exact ETag and only the field allowlist above.

The [draft Dataverse guard](../../dataverse/access/README.md) has offline policy tests but is
not installable yet: registration, linked Void and initial dispatch must be integrated first.
The open implementation checkboxes above intentionally include real API and actual-account
verification, which local UI checks cannot satisfy. Microsoft user provisioning, licensing,
role assignments and permanent V2 backend provisioning remain outstanding. The shared V1 reviewer
allowlist is configured; named-user testing is still required.

Latest local verification, including the bounded production-worklist, readiness, specialist-allocation, migration-policy and deployment-plan slices: all 785 tests in
`npm test` pass, the
production build passes, the transactional registration/workflow suite passes 46 checks and the
separate offline guard suite passes 62 checks. Browser checks confirmed
the Job Book Admin menu, disabled marker controls, successful restricted Equipment
detail save and denial of a direct Job Card review link. The sample API returned
403 for a marker update with the current ETag and for coordinator listing.
These checks use synthetic identities/data. Full lint still reports the three
pre-existing effect-state errors in EquipmentDrawer and MaintenanceBookingScreen.
