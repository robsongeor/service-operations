# Public Portal Service Identity

## Confirmed environment

- Dataverse environment: `https://org0d4246d7.crm6.dynamics.com`
- Tenant: `liftrucksnz` (`a348f38c-33d0-4ce9-a0df-6a66cc0562a1`)
- Root Business Unit: `org0d4246d7`
- Service identity label: `Public Portal Service`
- Security role name: `Public Portal Service`

Read-only discovery on 25 July 2026 found no existing Service Operations portal Application
User and no candidate portal role. Microsoft-managed identities must not be repurposed.

The existing `Service Operations React App`
(`9e9edbea-dfee-4995-aa1f-e9d10d16e093`) is a public SPA registration with two SPA redirect
URIs and no confidential-client credential. It is not suitable for the server identity:
combining browser sign-in and the public portal's confidential credential would weaken
credential separation, lifecycle control, and auditability.

## Required Microsoft Entra App Registration

Created and verified on 25 July 2026:

- Name: `Service Operations Public Portal`
- Application (client) ID: `dfad95a1-0541-47f0-b599-cb09b7181c72`
- Application Object ID: `72b93428-33fb-4f59-84cd-5c6c53e350a3`
- Account type: this organizational directory only
- Redirect URI: none
- Public client and implicit grant: disabled
- Platform configuration: none
- Configured API permissions: none
- Client credential: created 25 July 2026
- Credential description: `Public Portal Dataverse Server Credential`
- Credential expiry: 21 January 2027
- Rotation: replace before expiry and revoke the superseded credential after validation
- Intended server variable: `DATAVERSE_CLIENT_SECRET`

Dataverse client-credentials authorization is supplied by the Dataverse Application User and
its security role. No delegated Microsoft Graph permission or unrelated tenant-wide consent
is required. Azure's default delegated Microsoft Graph `User.Read` permission was removed.

For a later credential task, prefer a certificate or workload identity; otherwise use a
client secret stored only in the server environment.

Never store a credential in the repository, browser bundle, Dataverse Job records, logs, or
API responses.

## Application User

Created and verified on 25 July 2026:

- Dataverse Application User ID: `4322873e-ce87-f111-ab10-0022489917ff`
- Dataverse display name: `# Service Operations Public Portal`
- Application ID: `dfad95a1-0541-47f0-b599-cb09b7181c72`
- Business Unit: `org0d4246d7`
- Business Unit ID: `a145dc02-0cf8-f011-8406-7ced8d3256b4`
- State: enabled
- Access mode: application user (`4`)
- Licensed user: no
- Assigned security role: `Public Portal Service`

Power Platform derives the Dataverse display name from the selected Microsoft Entra
registration; the supported creation flow does not expose a separate user-name field. The
service identity and its future least-privilege security role remain labelled
`Public Portal Service` in the project architecture.

## Least-privilege role

Created and assigned on 25 July 2026:

- Role name: `Public Portal Service`
- Role ID: `3b0845b7-ceb7-48c6-8cf2-a8dd90a20850`
- Business Unit: `org0d4246d7`
- Assigned Application User: `4322873e-ce87-f111-ab10-0022489917ff`
- Other roles assigned to the Application User: none

| Table | Read | Create | Write | Append / Append To | Reason |
| --- | --- | --- | --- | --- | --- |
| Job | Organization | None | Organization | Append To | Find by token hash, persist submission fields, and receive child relationships |
| Equipment | Organization | None | None | None | Return make/model/fleet and validate current meter |
| Site | Organization | None | None | None | Return minimal Site name |
| Customer | Organization | None | None | None | Return minimal Customer name |
| Job Card Submission Time Entry | Organization | Organization | Organization | Append | Persist submitted time and travel |
| Job Material | Organization | Organization | Organization | Append | Persist submitted Parts as generic materials |
| Job Photo | Organization | Organization | Organization | Append | Persist photo metadata and File content |

No Delete, Assign, or Share privilege is granted on these business tables. Dataverse
requires child Append and parent Job Append To to create the prepared lookup relationships.

Dataverse automatically added its platform minimum privileges when the custom role was
created. These cover SDK/plugin metadata and SharePoint integration internals:

- Read Plugin Assembly, Plugin Type, SDK Message, SDK Message Processing Step, and SDK
  Message Processing Step Image
- Create, Read, and Write SharePoint Data
- Read SharePoint Document

They are platform-managed baseline privileges copied into a new custom role, not access to
the Service Operations business tables. Direct role verification confirmed there are no
other privileges.

Dataverse roles grant Write at table level, not to a seven-column allowlist. The server-side
`JobSubmissionService` therefore constructs a fixed submission payload containing only:

- `gr_techniciansubmissionhourmeter`
- `gr_techniciansubmissionstory`
- `gr_techniciansubmissionsubmittedon`
- `gr_techniciansubmissiontokenused`
- `gr_jobcardstatus`
- `gr_jobcardsubmittedon`

Authenticated office link generation writes token hash, created, expiry, and used state
through the office user's delegated identity.

The management application requests a fresh link immediately before preparing an existing
technician email. The endpoint returns the raw token once; the browser uses it only to build
the email URL and does not place it in browser storage. Generating another link replaces the
stored hash, refreshes creation and expiry, resets the used flag for the new token, and
therefore invalidates the previous unused link. The UI confirms this replacement when the
loaded Job metadata indicates that an active unused link already exists.

If Dataverse-enforced column restrictions are required, enable column security and introduce
a dedicated Field Security Profile as a separate reviewed change.

## Verification after identity creation

Role-scoped impersonation on 25 July 2026 confirmed that the Application User can read Job,
Equipment, Site, and Customer records. Direct privilege inspection confirmed organisation
Job Write and no Job Create, Delete, Assign, Share, Append, or Append To privilege. It also
confirmed no privileges on unrelated Service Operations business tables.

Authenticated client-credential smoke testing on 25 July 2026 confirmed:

1. Token acquisition succeeded for the Dataverse audience, tenant, and Application ID.
2. `WhoAmI` resolved to Application User `4322873e-ce87-f111-ab10-0022489917ff`.
3. Job, Equipment, Site, and Customer reads returned `200`.
4. Equipment, Site, and Customer writes returned `403`.
5. Job delete and unrelated Quote read returned `403`.
6. The public lookup returned only the documented minimal projection.
7. The fixed submission payload succeeded once and a concurrent repeat was rejected as
   already used.
8. Operational Job Status, Completed Date, Equipment and Site relationships remained
   unchanged, and all temporary submission fields were restored after testing.

Expanded submission verification on 25 July 2026 also confirmed that the Application User
can create and read Time Entry, Job Material, and Job Photo children, upload and download
the Job Photo File value, and commit the final Job submission state in one change set.
Delete, Assign, and Share remain unavailable. Job Write is necessarily table-scoped, so the
fixed server-side payload remains the column-level security boundary.

Live Job Create, Assign, and Share actions were not attempted because doing so against an
operational record would be unsafe. Their absence was verified directly from the assigned
role's privilege set.

The credential is stored locally in Windows Credential Manager under
`ServiceOperations/PublicPortalDataverse`; the secret value is not recorded in the
repository. Configure `DATAVERSE_URL`, `DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`, and
`DATAVERSE_CLIENT_SECRET` only in the production server environment during the approved
deployment task.
