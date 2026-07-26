# Site Checks Dataverse Schema

## Status

**Provisioned and verified 26 July 2026; Equipment ownership and Schedule Equipment scope
extension provisioned and verified 26 July 2026; Manual Equipment selection schema and its
composite key provisioned and verified Active 26 July 2026.**

This document owns the detailed Site Checks Dataverse contract. The tables, columns,
navigation properties, relationship schema names, alternate keys, Choice values, and delete
behaviors below were provisioned through the approved combined schema tool on 26 July 2026.
Application constants may use the confirmed contracts below.

Use the confirmed values below as application constants only after the alternate keys are
verified Active. Never run provisioning from an application build or deployment.

## Provisioning result — 26 July 2026

The explicitly approved `-Mode Provision -LoginPrompt Never` invocation:

- reused one cached Dataverse connection and opened no interactive sign-in prompt;
- created `gr_sitecheckschedule` and `gr_sitecheck`;
- created all scalar columns and six approved lookup relationships;
- added nullable `gr_job.gr_sitecheck`;
- added Site Check `122830004` to `gr_jobtypechoices`;
- published the affected tables and global Choice once;
- created both alternate keys; and
- passed same-session structural read-back verification.

The provisioning command exited successfully. A later single cached, read-only `-Mode
Verify -LoginPrompt Never` invocation confirmed the complete schema and both alternate keys
as Active. Neither invocation opened a sign-in prompt. No security roles were changed.

## Inspection and authentication workflow

The combined schema-management owner is
[`../scripts/manage-site-checks-schema.ps1`](../scripts/manage-site-checks-schema.ps1).
It is designed to:

- create no Dataverse connection during offline definition validation;
- create exactly one `CrmServiceClient` during a live invocation;
- default to `LoginPrompt=Never`, reusing a cached session or failing without opening a
  prompt;
- retrieve Site, Equipment, Job, and Mechanic metadata in one
  `RetrieveMetadataChangesRequest`;
- query solution membership using the same connection; and
- optionally make one aggregate Equipment-by-Site request that returns only the maximum
  count required for transaction sizing;
- provision idempotently only when `-Mode Provision` is deliberately supplied; and
- publish and post-verify through that same single connection, avoiding a second sign-in.

Offline validation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/manage-site-checks-schema.ps1 `
  -ValidateDefinition `
  -ValidateSdk
```

Cached-session inspection, which must fail rather than prompt:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/manage-site-checks-schema.ps1 `
  -Mode Inspect `
  -LoginPrompt Never
```

An invocation with `-LoginPrompt Auto` may open Microsoft sign-in. Codex must show the exact
request plan and obtain approval before running it. A failed or cancelled attempt is not
automatically repeated.

Provisioning is intentionally a separate execution gate. Product/schema approval does not
authorise this command:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File scripts/manage-site-checks-schema.ps1 `
  -Mode Provision `
  -LoginPrompt Never
```

Run it only after explicit Dataverse-mutation approval. It reuses cached authentication,
creates or validates the approved schema, publishes affected metadata, and performs read-back
verification in the same process. If cached authentication is unavailable, it fails without
prompting. A later `-Mode Verify` invocation is needed only when an alternate-key index remains
pending; it is read-only and also uses the cached session by default.

The expected live request budget is one connection, one metadata request, two solution
queries, and—only when explicitly requested—one aggregate data-profile request.

## Live inspection result — 26 July 2026

The cached-session inspection completed with `LoginPrompt=Never`. It created one connection,
made the documented read-only requests, opened no interactive prompt, and performed no
writes.

## Existing dependencies requiring live verification

| Dependency | Confirmed live result |
| --- | --- | --- |
| Site | `gr_site` / `gr_sites`; user-owned; ID `gr_siteid`; primary name `gr_address`; in solution |
| Site → Customer | Lookup `gr_customer`; navigation `gr_Customer`; relationship `gr_site_Customer_gr_customer`; delete `RemoveLink` |
| Equipment | `gr_equipment` / `gr_equipments`; user-owned; ID `gr_equipmentid`; primary name `gr_fleet`; in solution |
| Equipment → Site | Lookup `gr_site`; navigation `gr_Site`; relationship `gr_equipment_Site_gr_site`; delete `RemoveLink` |
| Job | `gr_job` / `gr_jobs`; user-owned; ID `gr_jobid`; primary name `gr_jobnumber`; in solution |
| Mechanic | `gr_mechanic` / `gr_mechanics`; user-owned; ID `gr_mechanicid`; primary name `gr_name`; in solution |
| Job Type | `gr_job.gr_jobtype`; global `gr_jobtypechoices`; values confirmed below |
| Job Status | `gr_job.gr_status`; global `gr_status`; values confirmed below |
| Job Card Status | `gr_job.gr_jobcardstatus`; global `gr_jobcardstatus`; values confirmed below |
| Job relationships | `gr_Equipment`, `gr_Mechanic`, `gr_Site`, and `gr_Contact` confirmed; no Job → Customer lookup exists |
| Existing alternate keys | None on Site, Equipment, Job, or Mechanic |
| Solution | All four tables are components of `ServiceOperationsNew` |
| Largest Site | 22 Equipment; aggregate returned no names or customer data |

### Confirmed existing Choice values

| Choice | Label | Value |
| --- | --- | ---: |
| Job Type | Breakdown | `122830000` |
| Job Type | Service | `122830001` |
| Job Type | Workshop | `122830002` |
| Job Type | WOF | `122830003` |
| Job Status | Allocated | `122830000` |
| Job Status | Unallocated | `122830001` |
| Job Status | Waiting for parts | `122830002` |
| Job Status | Complete | `122830003` |
| Job Status | Review | `122830004` |
| Job Status | Unconfirmed | `122830005` |
| Job Card Status | Not sent | `122830000` |
| Job Card Status | Sent | `122830001` |
| Job Card Status | Submitted | `122830002` |
| Job Card Status | Closed | `122830003` |

Dataverse labels Job Status `122830004` as **Review**. Current application code labels the
same value **Completion Review**. Site Checks will continue using the numeric contract and
must not silently rename this existing application label; reconciliation is a separate
product/documentation decision.

## Confirmed table: Site Check Schedule

| Property | Confirmed value |
| --- | --- |
| Display name | Site Check Schedule |
| Schema name | `gr_SiteCheckSchedule` |
| Logical name | `gr_sitecheckschedule` |
| Entity set | `gr_sitecheckschedules` |
| Ownership | Organisation-owned |
| Primary ID | `gr_sitecheckscheduleid` |
| Primary name | `gr_name` |
| Activity | No |

### Confirmed columns

| Display name | Confirmed schema/logical name | Type | Required/default | Purpose and constraints |
| --- | --- | --- | --- | --- |
| Name | `gr_Name` / `gr_name` | Text 200 | Required | Generated display label; not a business key |
| Site | `gr_Site` / `gr_site` | Lookup → Site | Required | One schedule per Site; alternate-key member |
| Enabled | `gr_Enabled` / `gr_enabled` | Yes/No | Required; No | Authoritative participation flag |
| Frequency | `gr_Frequency` / `gr_frequency` | Local Choice | Required when enabled; no default | Weekly, Fortnightly, Monthly |
| Equipment Scope | `gr_EquipmentScope` / `gr_equipmentscope` | Local Choice | Optional; default All Equipment | All Equipment, Liftrucks Rentals Only, or Manual Selection; existing null values are interpreted as All Equipment |
| Next Due Date | `gr_NextDueDate` / `gr_nextduedate` | Date Only | Required when enabled | Indexed reporting boundary |
| Last Completed Date | `gr_LastCompletedDate` / `gr_lastcompleteddate` | Date Only | Optional | Written by rollover only |
| Active Site Check | `gr_ActiveSiteCheck` / `gr_activesitecheck` | Lookup → Site Check | Optional; null | ETag-guarded active lock and navigation pointer |

### Confirmed keys and relationships

- Alternate key `gr_sitecheckschedule_site_key` on `gr_site` enforces one schedule
  per Site.
- Site relationship `gr_sitecheckschedule_Site_gr_site`, navigation `gr_Site`.
- Active relationship `gr_sitecheckschedule_ActiveSiteCheck_gr_sitecheck`,
  navigation `gr_ActiveSiteCheck`.
- Site delete behavior must preserve operational history; use Restrict or approved
  Referential behavior, never cascade-delete Site Checks or Jobs.
- Active Site Check delete behavior must not cascade. Application users cannot delete active
  or historical occurrences in version 1.

## Confirmed table: Site Check

| Property | Confirmed value |
| --- | --- |
| Display name | Site Check |
| Schema name | `gr_SiteCheck` |
| Logical name | `gr_sitecheck` |
| Entity set | `gr_sitechecks` |
| Ownership | Organisation-owned |
| Primary ID | `gr_sitecheckid` |
| Primary name | `gr_name` |
| Activity | No |

### Confirmed columns

| Display name | Confirmed schema/logical name | Type | Required/default | Purpose and constraints |
| --- | --- | --- | --- | --- |
| Name | `gr_Name` / `gr_name` | Text 200 | Required | Generated history label |
| Schedule | `gr_SiteCheckSchedule` / `gr_sitecheckschedule` | Lookup → Site Check Schedule | Required | Recurring owner; indexed |
| Site | `gr_Site` / `gr_site` | Lookup → Site | Required | Immutable occurrence context; must match schedule |
| Assigned Technician | `gr_AssignedTechnician` / `gr_assignedtechnician` | Lookup → Mechanic | Required | Initial summary technician |
| Status | `gr_Status` / `gr_status` | Local Choice | Required; In Progress | Initial values In Progress and Complete only |
| Started On | `gr_StartedOn` / `gr_startedon` | Date and Time, User Local | Required | Creation timestamp |
| Completed On | `gr_CompletedOn` / `gr_completedon` | Date and Time, User Local | Optional | Rollover timestamp |
| Frequency Snapshot | `gr_FrequencySnapshot` / `gr_frequencysnapshot` | Local Choice | Required | Immutable occurrence cadence |
| Due Date Snapshot | `gr_DueDateSnapshot` / `gr_duedatesnapshot` | Date Only | Required | Immutable due/late boundary; indexed |
| Expected Job Count | `gr_ExpectedJobCount` / `gr_expectedjobcount` | Whole Number, min 1 | Required | Creation integrity snapshot |
| Creation Request Key | `gr_CreationRequestKey` / `gr_creationrequestkey` | Text 100 | Required | Unique replay identifier; never displayed |

### Confirmed keys and relationships

- Alternate key `gr_sitecheck_creationrequestkey_key` on
  `gr_creationrequestkey`.
- Relationships/navigation properties:
  - `gr_sitecheck_SiteCheckSchedule_gr_sitecheckschedule` / `gr_SiteCheckSchedule`;
  - `gr_sitecheck_Site_gr_site` / `gr_Site`;
  - `gr_sitecheck_AssignedTechnician_gr_mechanic` / `gr_AssignedTechnician`.
- Schedule/Site delete does not cascade.
- Status contains no Cancelled or Skipped value in version 1.

## Confirmed Job change

| Display name | Confirmed schema/logical name | Type | Required/default | Purpose |
| --- | --- | --- | --- | --- |
| Site Check | `gr_SiteCheck` / `gr_sitecheck` | Lookup → Site Check | Optional on Job | Required by protected Site Check creation; indexed for progress |

Existing Jobs remain null and receive no backfill. The relationship must not cascade-delete
Jobs. Generated Jobs continue using the canonical existing Site, Equipment, Mechanic, and
any verified Customer relationship behavior.

Relationship `gr_job_SiteCheck_gr_sitecheck`, navigation `gr_SiteCheck`, delete
behavior Restrict.

## Confirmed Equipment ownership extension

| Display name | Confirmed schema/logical name | Type | Required/default | Purpose |
| --- | --- | --- | --- | --- |
| Equipment Ownership | `gr_OwnershipType` / `gr_ownershiptype` | Local Choice | Optional; null means Not classified | Explicitly distinguishes Customer-owned Equipment from Liftrucks rental Equipment |

No Equipment rows were backfilled during provisioning. Existing null values remain
**Not classified**. The application must never infer ownership from Fleet Number, Customer,
Site, make/model, or other free text.

## Confirmed table: Site Check Schedule Equipment

| Property | Confirmed value |
| --- | --- |
| Display name | Site Check Schedule Equipment |
| Schema name | `gr_SiteCheckScheduleEquipment` |
| Logical name | `gr_sitecheckscheduleequipment` |
| Entity set | `gr_sitecheckscheduleequipments` |
| Ownership | Organisation-owned |
| Primary ID | `gr_sitecheckscheduleequipmentid` |
| Primary name | `gr_name` |
| Activity | No |

This table stores current Manual Selection configuration only. It is not copied into
historical occurrences and it does not replace the parent lookup on generated Jobs.

### Confirmed columns, relationships, and key

| Display name | Confirmed schema/logical name | Type | Required/default | Purpose and constraints |
| --- | --- | --- | --- | --- |
| Name | `gr_Name` / `gr_name` | Text 200 | Required | Generated display label; not a business key |
| Site Check Schedule | `gr_SiteCheckSchedule` / `gr_sitecheckschedule` | Lookup → Site Check Schedule | Required | Parent recurring configuration |
| Equipment | `gr_Equipment` / `gr_equipment` | Lookup → Equipment | Required | One explicitly selected Equipment record |

- Schedule relationship
  `gr_sitecheckscheduleequipment_SiteCheckSchedule_gr_sitecheckschedule`, navigation
  `gr_SiteCheckSchedule`, referenced navigation
  `gr_sitecheckschedule_scheduleequipment`, delete behavior Restrict.
- Equipment relationship `gr_sitecheckscheduleequipment_Equipment_gr_equipment`, navigation
  `gr_Equipment`, referenced navigation `gr_equipment_sitecheckschedules`, delete behavior
  Restrict.
- Composite alternate key
  `gr_sitecheckscheduleequipment_scheduleequipment_key` on
  `gr_sitecheckschedule, gr_equipment` prevents duplicate selections. It was created and
  structurally verified on 26 July 2026. The immediate read-only verification reported
  Pending and the next cached verification confirmed Active.
- No Customer or Site lookup is duplicated. Current Site membership is validated through
  the authoritative Site Equipment query at creation time.

## Confirmed Choice changes

| Choice | Options | Numeric values |
| --- | --- | --- |
| Site Check Frequency (local) | Weekly `122830000`; Fortnightly `122830001`; Monthly `122830002` | Provisioned and verified |
| Site Check Status (local) | In Progress `122830000`; Complete `122830001` | Provisioned and verified |
| Equipment Ownership (local on Equipment) | Customer Owned `122830000`; Liftrucks Rental `122830001`; null is Not classified | Provisioned and verified |
| Site Check Equipment Scope (local on Schedule) | All Equipment `122830000`; Liftrucks Rentals Only `122830001`; Manual Selection `122830002`; existing null is treated as All Equipment | Provisioned and structurally verified |
| Existing global Job Type | Site Check `122830004` | Provisioned and verified |

The provisioning tool inserts/verifies labels and values idempotently and reads them back
after publish. Application constants use this verified result.

## Confirmed temporary Equipment availability extension

Approved, provisioned, published, and structurally verified on 26 July 2026. A later cached
read-only verification confirmed the alternate key Active. The separately approved
Service Operations grants were provisioned and verified at Organisation depth.

### Confirmed Equipment column

| Business purpose | Display name | Confirmed schema/logical name | Type | Required/default | Relationships/indexing | Security | Migration/backfill |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Record whether Equipment is physically available for its next Site Check | Site Check Availability | `gr_SiteCheckAvailability` / `gr_sitecheckavailability` | Local Choice: Available at Site `122830000`; Temporarily Off-site `122830001`; In Workshop `122830002` | Optional; null resolves to Available at Site | No relationship or alternate key; include in existing Site Equipment projection | Uses existing Equipment Read/Write boundary; field is exposed only when current Site has an enabled Schedule | No backfill; existing null values remain eligible |

The value is current Equipment master data, not Site configuration. UI visibility is
conditional: show/edit it only when the Equipment's current Site has an enabled recurring
Site Check Schedule. Hiding the field after disable or transfer does not clear it.

### Confirmed exclusion snapshot table

| Property | Confirmed value |
| --- | --- |
| Display name | Site Check Equipment Exclusion |
| Schema/logical name | `gr_SiteCheckEquipmentExclusion` / `gr_sitecheckequipmentexclusion` |
| Entity set | `gr_sitecheckequipmentexclusions` |
| Ownership | Organisation-owned |
| Primary ID | `gr_sitecheckequipmentexclusionid` |
| Primary name | `gr_name` |

| Business purpose | Display name | Confirmed schema/logical name | Type | Required/default | Relationships/indexing | Security | Migration/backfill |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Parent occurrence | Site Check | `gr_SiteCheck` / `gr_sitecheck` | Lookup → Site Check | Required | Restrict; alternate key component | Organisation-depth Create/Read/Append/Append To required; Delete only if approved occurrence deletion must remove snapshots | None |
| Excluded asset | Equipment | `gr_Equipment` / `gr_equipment` | Lookup → Equipment | Required | Restrict; alternate key component | Same table privileges; existing Equipment Read/Append To | None |
| Immutable reason | Availability Snapshot | `gr_AvailabilitySnapshot` / `gr_availabilitysnapshot` | Local Choice using the same labels and allocated numeric values as Equipment availability | Required | Queryable with occurrence | Same table privileges | None |
| Display label | Name | `gr_Name` / `gr_name` | Text 200 | Required/generated | Not a business key | Same table privileges | None |

Composite alternate key:
`gr_sitecheckequipmentexclusion_sitecheckequipment_key` on Site Check + Equipment. It
prevents retry duplication. Starting an occurrence creates either one Job or one exclusion
snapshot per in-scope Equipment in the same existing transaction, so operation-count growth
remains one child operation per candidate. No catch-up record or Job is created later. The
key is Active. Application creation writes each occurrence, its generated Jobs, and these
snapshots in one atomic change set.

## Proposed Phase 15 technician access and Email Dispatch extension

**Provisioned for the approved token-access design. Email Dispatch is not a runtime dependency.**
These proposed columns belong on confirmed `gr_sitecheck`:

| Business purpose | Display / schema / logical name | Type | Required/default | Key, security, migration |
| --- | --- | --- | --- | --- |
| Store only an occurrence token hash | Site Check Technician Access Token Hash / `gr_SiteCheckTechnicianAccessTokenHash` / `gr_sitechecktechnicianaccesstokenhash` | Single line text, 64 | Optional; null | Proposed unique alternate key `gr_sitecheck_technicianaccesstokenhash_key`; office writes, portal service reads; no backfill |
| Record issue time | Site Check Technician Access Token Created On / `gr_SiteCheckTechnicianAccessTokenCreatedOn` / `gr_sitechecktechnicianaccesstokencreatedon` | Date and time, User Local | Optional; null | Replaced with hash/expiry; no backfill |
| Bound access | Site Check Technician Access Token Expires On / `gr_SiteCheckTechnicianAccessTokenExpiresOn` / `gr_sitechecktechnicianaccesstokenexpireson` | Date and time, User Local | Optional; null | Seven-day service default; accepted bound 1–720 hours; no backfill |
| Audit revocation | Site Check Technician Access Token Revoked On / `gr_SiteCheckTechnicianAccessTokenRevokedOn` / `gr_sitechecktechnicianaccesstokenrevokedon` | Date and time, User Local | Optional; null | Cleared on issue/reissue and set on explicit revoke; no backfill |

No Used flag is proposed because one occurrence token supports several independent Job Card
submissions. It remains valid until expiry, replacement, explicit revocation, deletion, or
operational occurrence completion. Replacement changes the stored hash; raw tokens are
never stored.

Extend confirmed organisation-owned Email Dispatch:

| Change | Exact proposed contract | Relationships/defaults | Security/migration |
| --- | --- | --- | --- |
| Add occurrence owner | Site Check / `gr_SiteCheck` / `gr_sitecheck` lookup → `gr_sitecheck` | Optional; relationship `gr_sitecheck_emaildispatches`; Referential/Restrict, no cascade | Existing rows remain null; office workflow only |
| Permit occurrence-only dispatch | Change confirmed Job lookup `gr_Job` / `gr_job` required level from Application Required to Optional | Service enforces exactly one of Job or Site Check | Existing rows retain Job; no rewrite |

The confirmed entity set remains `gr_emaildispatchs`. Existing recipient, subject, body,
sent/error, requested/completed, Job Assignment, and Power Automate trigger contracts remain
unchanged. No new Choice is required.

Read-only preflight result (2026-07-26): one cached connection with `LoginPrompt=Never`
confirmed that all four proposed Site Check token columns and the proposed key are absent;
Email Dispatch `gr_job` exists as an Application Required Lookup; and the proposed
`gr_sitecheck` Lookup/relationship is absent. The existing
`gr_sitecheck_creationrequestkey_key` is Active. No metadata, privileges, data, or solution
components were changed.

Proposed security delta:

- Public Portal Service: Organisation Read on Site Check only. No Site Check Create, Write,
  Delete, Append, Append To, Assign, or Share; no Email Dispatch privilege.
- Service Operations: no privilege delta. The preflight verified Organisation-depth
  Create/Read/Write/Append/Append To on Email Dispatch and Read/Append/Append To on Site
  Check.
- Public responses never expose token fields, Email Dispatch content, or unrelated Jobs.

The Public Portal Service preflight found no inspected Site Check or Email Dispatch
privileges. Provision only Organisation Read on Site Check after explicit approval; do not
add Email Dispatch or Site Check mutation privileges.

Provisioning result (2026-07-26):

- all four Site Check token columns are provisioned and published;
- `gr_sitecheck_technicianaccesstokenhash_key` is Active;
- optional `gr_emaildispatch.gr_sitecheck` and
  `gr_sitecheck_emaildispatches` are provisioned with Restrict delete behaviour;
- Public Portal Service has Organisation Read on Site Check and no inspected mutation or
  Email Dispatch privilege; and
- `gr_emaildispatch.gr_job` remains Application Required. Dataverse returned success for
  three SDK update attempts but did not retain the required-level change, even though the
  column is unmanaged, valid for update, and reports that Required Level can be changed.

Do not retry this mutation without a new evidence-based approach. The product owner
subsequently chose the working Jobs-table `mailto:` handoff, so the retained required Job
lookup is not a Site Checks blocker. Site Checks must not write the optional Email Dispatch
Site Check lookup, and no separate dispatch table is approved for provisioning.

## Phase 16 checklist foundation

**Provisioned, published, and verified on 26 July 2026.**

Local architecture inspection confirmed no generic checklist model to reuse.
`gr_wofinspection` remains WOF-specific. The proposal reuses canonical Job,
`gr_jobphoto`, `gr_jobcardsubmissiontimeentry`, and `gr_jobmaterial` ownership while adding
normalized checklist definitions and answers. The product owner approved the schema,
Choice values, initial organisation-wide template scope, and least-privilege security
model. Provisioning used one cached `LoginPrompt=Never` connection and did not create or
change business data:

| Confirmed table/extension | Key columns and relationships | Required/default and constraints |
| --- | --- | --- |
| `gr_sitecheckchecklisttemplate` | `gr_templatecode` Text(100), `gr_version` Whole Number, optional self lookup `gr_supersedestemplate` | Organisation-owned; `gr_active` Yes/No required default Yes; alternate key Code + Version; immutable after use |
| `gr_sitecheckchecklisttemplateitem` | required `gr_checklisttemplate`; `gr_itemkey` Text(100); group, prompt, type, order, required/comment/photo rules | Organisation-owned; alternate key Template + Item Key; immutable with parent |
| `gr_sitecheckschedule.gr_checklisttemplate` | optional lookup to Template | Existing rows null; selected version must be active and valid |
| `gr_sitecheckchecklistsnapshotitem` | required `gr_sitecheck`; required `gr_job`; optional source Template Item; copied item key, wording, type, order, and rules | Organisation-owned; alternate key Job + Item Key; immutable |
| `gr_sitecheckchecklistresponse` | required `gr_job`, `gr_snapshotitem`, `gr_submittedon`, `gr_technician`; typed optional choice/decimal/text fields and comment | Organisation-owned; alternate key Job + Snapshot Item; one compatible answer; immutable after submission |
| `gr_jobphoto.gr_checklistresponse` | optional lookup to Response; canonical Job lookup remains required | Response Job must match photo Job; existing photos null |

Confirmed entity sets:

- `gr_sitecheckchecklisttemplates`
- `gr_sitecheckchecklisttemplateitems`
- `gr_sitecheckchecklistsnapshotitems`
- `gr_sitecheckchecklistresponses`

Provisioned local `gr_responsetype`: Pass / Fail / Not applicable `122830000`, Yes / No
`122830001`, Number `122830002`, Text `122830003`. Proposed `gr_choiceanswer`: Pass
`122830000`, Fail `122830001`, Not applicable `122830002`, Yes `122830003`, No
`122830004`. These are new local Choice values owned by these checklist columns.

No historical backfill is proposed. Existing Schedules remain checklist-free until a
template is selected. Only new occurrences snapshot a selected template. Service
Operations manages templates and reads submitted responses; Public Portal Service receives
only Snapshot Read and Response Create/Read/Append/Append To plus the minimum Job Photo
relationship delta verified necessary. The preflight found Public Portal Service already
had Organisation Write/Append on Job Photo and Append To on Job. Provisioning added the
missing new-table privileges and Append To on Mechanic; it did not grant Template,
Template Item, or Schedule mutation, Snapshot mutation, Response Write/Delete, or broader
Site Check mutation.

Same-session verification confirmed the four key definitions. Dataverse initially reported
each index as `Pending`, and one later cached, read-only verification confirmed all four
`Active`:

- `gr_sitecheckchecklisttemplate_code_version_key`
- `gr_sitecheckchecklisttemplateitem_template_itemkey_key`
- `gr_sitecheckchecklistsnapshotitem_sitecheck_itemkey_key`
- `gr_sitecheckchecklistresponse_job_snapshot_key`

Future audits can use
`manage-site-checks-schema.ps1 -Mode VerifyChecklist -LoginPrompt Never`; do not re-provision
or use an interactive login merely to repeat a passing check. No template content was
seeded; actual prompts and item-level mandatory/evidence rules remain a separate
product-content approval.

### Phase 19 checklist administration security

Approved, provisioned, and verified on 26 July 2026. Checklist publication uses the existing versioned tables and does
not require new schema. The dedicated unmanaged **Site Check Checklist Administrator** role
is assigned only to the verified Dataverse user for `georger@liftrucks.co.nz` and receives
Organisation Read/Create/Write/Append/Append To on Template and Template Item, with no
Delete. The broad Service Operations role retains Organisation Read and Append To on those
tables but loses Create/Write/Delete/Append. Append To remains operationally necessary for
Schedule and immutable Snapshot relationships to target published definitions; it does not
permit definition mutation. Provisioning and verification are owned by the
`ProvisionChecklistAdminSecurity` and `VerifyChecklistAdminSecurity` modes of the combined
schema script and must use one cached no-prompt connection.

The first no-prompt provisioning connection created the unmanaged role and added its ten
privileges, then stopped before assignment/removal on a local SDK collection error. The
corrected idempotent continuation assigned the role only to the verified administrator,
removed the eight broad mutation grants, retained Organisation Read/Append To for
operational relationship use, and passed same-session verification. No schema or business
records were changed.

### Per-Equipment checklist correction provisioned

The product owner subsequently confirmed that one Site Check occurrence may contain ICE
and Electric Equipment, with one checklist per generated machine Job. Existing
`gr_equipment.gr_powertype` is the authoritative Template selector. The currently
original Snapshot Item Site Check + Item Key contract could not distinguish overlapping
item keys across per-Job checklists.

The following approved delta was provisioned and structurally verified on 26 July 2026.
The replacement alternate-key definition exists and its Dataverse index was still
`Pending` at the final read-only check; it must be confirmed `Active` before occurrence
integration:

A subsequent single cached no-prompt verification on 26 July 2026 confirmed the replacement
key `Active`; all four checklist alternate keys and the Phase 16 schema/security contract
passed verification.

### Provisioned version-1 checklist content

On 26 July 2026 the product owner explicitly approved and provisioned two organisation-wide
active Templates:

- `SITE_CHECK_ICE`, version 1, with 23 Items; and
- `SITE_CHECK_ELECTRIC`, version 1, with 22 Items.

The authoritative exact seed manifest is `scripts/site-check-checklist-v1.json`. A
no-prompt preflight confirmed zero matching rows, then one atomic transaction created both
Templates and all 45 Items. Exact read-back verification passed. Inspection answers are
required; failed inspection items require comments; photos are optional in v1; and
`meter.service-hours` is a required Number response. Do not edit these version-1 rows in
place after occurrence snapshots use them; create a new Template version instead.

- add required `gr_job` lookup to `gr_sitecheckchecklistsnapshotitem`;
- retain required `gr_sitecheck` for occurrence-level loading;
- replace the Site Check + Item Key alternate key with Job + Item Key;
- create no backfill because no Snapshot Item rows exist;
- leave Schedule Template lookup null and unused in v1; and
- resolve missing and Other / Unknown Equipment Power Type to the active ICE Template
  without updating Equipment; label the runtime selection as defaulted.

This delta is not approved or provisioned. See
`features/SITE_CHECK_CHECKLIST_CONTENT_PROPOSAL.md`.

## Indexes, alternate keys, and query support

- Schedule: alternate key on Site; index/query support for Enabled + Next Due Date and Active
  Site Check.
- Site Check: alternate key on Creation Request Key; indexes/query support for Schedule,
  Site, Status, Due Date Snapshot, and Assigned Technician.
- Job: index/query support for Site Check lookup and operational Job Status.
- Site Check Schedule Equipment: composite alternate key on Schedule + Equipment; query
  selections by Schedule and intersect with current Site Equipment at run time.
- Provisioning must verify alternate-key status reaches Active before dependent application
  code is released.

Dataverse-managed index details are verified from alternate-key/metadata state where exposed;
the application must use lookup GUIDs and typed Choice values, never display text.

Microsoft documents Lookup columns as valid alternate-key members and permits up to 1,000
individual requests in a Web API batch. The largest observed Site needs 24 change-set
operations (one Site Check create, one schedule lock update, and 22 Job creates), leaving
substantial operation-count headroom. Phase 4 must still measure the constructed payload and
fail safely if it exceeds the verified request-size boundary.

References:

- [Define alternate keys in Dataverse](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/define-alternate-keys-reference-records)
- [Execute Web API batch operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/execute-batch-operations-using-web-api)

## Security proposal

Exact role names and privileges require approval:

- Operational readers: read schedules and Site Checks.
- Site Check managers: create/update schedules; create Site Checks and generated Jobs; read
  Site, Equipment, and Mechanic.
- Completion-capable users: update generated Job Status and the constrained Site
  Check/Schedule rollover fields.
- No version 1 role receives Site Check delete through the application workflow.

If field-level constrained rollover cannot be expressed safely with existing user roles,
stop for an authenticated server-workflow decision rather than grant broad privileges.

The combined schema tool now includes read-only `AuditSecurity` mode. It uses one cached
connection, retrieves no user names, and reports only unmanaged roles assigned to enabled
human users plus relevant privilege depths. Its first invocation on 26 July 2026 connected
without a prompt and performed no writes, but report formatting stopped on a single-object
PowerShell array edge case. After explicit approval, the corrected retry completed with one
cached connection, no prompt, no user identities, and no writes.

### Security audit result — 26 July 2026

- The cached connection has Basic User and System Administrator; this was used only to
  perform the audit.
- One unmanaged role is actively assigned to enabled human users: `Service Operations`
  (`3da914a0-cc84-f111-ab0e-7ced8d3278bf`).
- Service Operations already has global Create/Read/Write/Append/Append To access for Job,
  Site, Equipment, and Mechanic (and broader existing privileges not changed here).
- It has no Site Check Schedule or Site Check privileges.
- No separate actively assigned unmanaged manager role exists, so version 1 cannot express a
  narrower manager cohort without creating a new role and making explicit user assignments.

Recommended version 1 delta is to add only organisation-depth Create, Read, Write, Append,
and Append To for `gr_sitecheckschedule` and `gr_sitecheck` to Service Operations. Do not add
Delete, Assign, or Share. Existing target-table privileges already support the required
lookups and generated Job workflow.

After explicit approval, `ProvisionSecurity` ran once on 26 July 2026 using one cached
connection with no prompt. It added the ten grants and verified every grant at organisation
depth in the same invocation. It did not add Delete, Assign, or Share and made no user
assignment changes. The mode remains idempotent for future verification/recovery.

The later in-app occurrence deletion workflow requires organisation-depth Delete on
`gr_sitecheck`. That privilege is **not provisioned** for Service Operations and remains a
separate explicit approval gate. Existing Job Delete access must also be confirmed in the
same read-only audit before provisioning; do not infer it from Create/Read/Write access.

## Migration and data preservation

- No Site is enabled automatically.
- No schedule or Site Check history is fabricated.
- No historical Job is reclassified or linked.
- No existing Equipment ownership value is fabricated or backfilled.
- Existing Schedule Equipment Scope nulls retain the prior All Equipment behavior.
- No manual selection rows are backfilled. Existing Schedules therefore retain their prior
  All Equipment or Liftrucks Rentals Only behavior.
- New Job lookup is nullable.
- Disabling preserves all records.
- Relationship behavior is explicitly non-cascading for operational history.
- Rollback removes application exposure but retains provisioned schema and data.

## Provisioning gate

Before Provision mode is run:

- [x] Complete the single approved live inspection.
- [x] Record exact existing metadata and Choice values above.
- [x] Approve all product decisions listed in the implementation tracker.
- [x] Approve exact proposed schema, lookup/navigation names, Choice values, keys, ownership,
  and migration approach.
- [x] Confirm operation-count headroom against the largest Site.
- [x] Audit, approve, provision, and verify the exact security-role privilege changes.
- [x] Measure the constructed creation payload before Phase 4 release: the representative
  22-Equipment change set is 24 operations and 15,820 UTF-8 bytes, below the application
  4 MiB safety guard and the documented 1,000-operation limit.
- [x] Obtain explicit permission to modify Dataverse.

The original approved schema has been provisioned, its two alternate keys are Active, and
its approved Service Operations security privileges have been provisioned and verified.
The separately approved Manual Selection schema is provisioned and its composite key is
Active. A read-only audit initially confirmed Service Operations had no selection-table
privileges. After separate explicit approval, the tool added and verified organisation-depth
Create, Read, Delete, Append, and Append To for `gr_sitecheckscheduleequipment`. It did not
add Write, Assign, or Share and made no user-assignment changes.
