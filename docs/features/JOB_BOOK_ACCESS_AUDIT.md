# Microsoft access audit — Job Book rollout

Read-only audit performed 3 October 2026 using George's existing Azure sign-in.
No role definitions, grants, assignments, environment settings or business data were changed.

## Target verified

- Tenant: `a348f38c-33d0-4ce9-a0df-6a66cc0562a1`.
- App: Service Operations React App, client ID `9e9edbea-dfee-4995-aa1f-e9d10d16e093`.
- Enterprise application ID: `2026a5a5-70a4-43fb-bc61-f4de80c3f550`.
- Dataverse: `https://org0d4246d7.crm6.dynamics.com`.
- Dataverse WhoAmI succeeded as the current owner session.

## Entra findings

All ten planned accounts exist, are enabled, and are Member accounts. Jess and Nargiza's
confirmed email addresses resolve successfully; Jess's stored capitalization is immaterial.

Only two application roles currently exist: `ServiceOperations.FullAccess` and
`ServiceOperations.JobBookOnly`. ServiceCoordinator, JobCardAdmin and JobBookAdmin do not yet
exist in this app registration. The enterprise app currently has assignment-required disabled.
Do not infer the deployed application's role-enforcement flag from that separate Entra setting.

| User | Current app assignment | Agreed target | Dataverse user found |
| --- | --- | --- | --- |
| George | FullAccess plus default access | FullAccess | Yes |
| Bruce | FullAccess | ServiceCoordinator | Yes |
| Andy | None returned | ServiceCoordinator | No |
| Jess | JobBookOnly | JobCardAdmin (Office Admin) | No |
| Nargiza | JobBookOnly | JobCardAdmin (Office Admin) | No |
| Martin | JobBookOnly | JobBookAdmin | No |
| Lance | JobBookOnly | JobBookAdmin | No |
| Ranjani | None returned | JobBookAdmin | No |
| Ashneel | None returned | JobBookAdmin | No |
| Kaizer | JobBookOnly | JobBookAdmin | No |

The app assignment response contained user assignments only, with no group assignments or next page.
Paul has default app access and Pubudu has JobBookOnly outside the agreed ten-user roster.
Preserve those assignments until their business access is explicitly reviewed. The duplicate
default entry for George is not an additional named role and is not removed by this audit.

## Dataverse findings

Users were checked by Entra object ID, then independently by email/domain name. Only George and
Bruce were found from the ten-user roster. The other eight need environment onboarding/eligibility
verification before a security role can be assigned. Absence here does not establish why they are
missing and does not prove a missing licence. Licensing and environment admission were not audited.

| Existing user | Direct roles | Team grants inspected |
| --- | --- | --- |
| George | System Administrator, Basic User, Site Check Checklist Administrator | Default organization team; no security roles returned |
| Bruce | Service Operations | Default organization team; no security roles returned |

Two Service Operations-named roles were returned:

- **Service Operations**, ID `3da914a0-cc84-f111-ab0e-7ced8d3278bf`: 334 privilege entries.
  Includes organization-depth Job/Equipment/Customer/Site create/read/write and broad additional
  actions including delete. This supports Bruce's existing work but requires deliberate mapping
  to the future coordinator permission profile. Do not remove it during this audit.
- **Service Operations - Job Book Only**, ID `de9416c1-ddaf-f111-aaac-6045bde57026`: 120 privilege
  entries. Includes organization-depth Create/Read/Write on Jobs, Equipment and Customers, plus
  regional ledger Create/Read/Write/Append/Append To. It is not a safe drop-in role for the new
  restricted requirements. Table write grants alone cannot restrict technician assignment,
  operational fields, GT/Timecloud markers or master-data fields to the agreed allowlists.

These counts describe retrieved role privileges, not the number of accessible tables. This audit
did not establish whether separately registered plugins or field-security profiles restrict every
write. That enforcement must be inspected and tested before claiming effective field-level safety.

## Required change package and order

1. Implement the distinct ServiceCoordinator and JobBookAdmin client profiles and route/capability
   tests locally; retain the existing JobCardAdmin value for Jess/Nargiza. Coordinators initially
   have FullAccess-equivalent application capabilities but keep a distinct assignment.
2. Specify the permitted Equipment fields and inspect existing server enforcement. Implement
   authoritative allowlists for Job corrections, Equipment edits/moves, markers, initial technician
   assignment and Void. Include Customer/Site creation, historical preservation and ETag checks.
   Merely copying a Dataverse role or hiding controls does not satisfy these requirements.
3. Prepare a reviewed Dataverse privilege manifest for Office Admin and Job Book Admin. Include
   actual API/table dependencies and allowed operations, plus the verified server protection.
   Do not grant the old Job Book Only role unchanged to the eight missing users.
4. Verify environment admission/licensing arrangements and onboard Andy plus the seven office users
   using the authorized Microsoft process. Test using their individual accounts.
5. Create the missing Entra role definitions with stable values: ServiceCoordinator, JobCardAdmin
   and JobBookAdmin. Preserve existing role IDs/definitions and unrelated assignments.
6. Assign the target application and Dataverse roles only after the compatible application/server
   version is available for testing. Move Bruce off FullAccess as part of the verified coordinator
   transition, not before his current work is protected. Replace the five relevant JobBookOnly
   assignments with the appropriate new roles; keep George FullAccess.
7. Separately inspect/reconcile the Job Card API reviewer allowlist for George, Bruce, Andy, Jess
   and Nargiza. Its current deployed contents were not inspected in this audit. Preserve unrelated
   existing access pending review; verify the five Job Book Admins cannot use review/private evidence APIs.
8. Test sign-in, each permitted action, direct API denial, multi-user conflicts and existing
   coordinator workflows. Decide and verify Entra assignment-required and client role enforcement
   separately; do not switch either blindly while onboarding is incomplete.

This package is a preparation plan, not a grant script or authorization to deploy. A final privilege
manifest cannot be safely fixed until the field restrictions and backend enforcement are defined.

## Evidence and limits

Live reads used Entra app/service-principal definitions and assignments, a Graph batch containing
ten GET identity requests, Dataverse WhoAmI, scoped user reads, direct/team role reads and
RetrieveRolePrivilegesRole for the two Service Operations roles. Access tokens stayed in process
memory and were not written to report files. Raw identity/role evidence is under ignored `.tmp/`.

One initial CLI query lost its filter at the Windows command wrapper; its unfiltered result was
not used to establish scoped role findings. Corrected scoped queries and the independent identity
cross-check supplied the results above. No data mutation occurred.

Not yet verified: licences/environment admission, live reviewer settings, deployed frontend flags,
all server/field-security enforcement, named-user end-to-end access and migration readiness.

Related: [agreed user access plan](JOB_BOOK_ACCESS_PLAN.md),
[rollout plan](JOB_BOOK_ROLLOUT_PLAN.md).
