# WOF / REGO Dataverse schema

The schema below was provisioned and published in the `ServiceOperationsNew` solution on 22 July 2026 by `scripts/setup-wof-schema.ps1`.

## Confirmed existing tables

| Table | Logical name | Entity set | Primary ID | Primary name |
|---|---|---|---|---|
| Job | `gr_job` | `gr_jobs` | `gr_jobid` | `gr_jobnumber` |
| Equipment | `gr_equipment` | `gr_equipments` | `gr_equipmentid` | `gr_fleet` |
| Mechanic | `gr_mechanic` | `gr_mechanics` | `gr_mechanicid` | `gr_name` |

`gr_job.gr_jobtype` is the global `gr_jobtypechoices` choice. WOF has confirmed value `122830003`.

## Equipment additions

| Display name | Logical name | Type | Required/default | Purpose |
|---|---|---|---|---|
| Registration Number | `gr_registrationnumber` | Text (100) | Optional | Current equipment REGO |
| WOF Required | `gr_wofrequired` | Yes/No | Optional; No | Includes equipment in WOF compliance tracking |
| Current WOF Expiry | `gr_currentwofexpiry` | Date only | Optional | Current active expiry |
| Last WOF Completed | `gr_lastwofcompleted` | Date only | Optional | Most recent passed inspection date |
| REGO Expiry | `gr_regoexpiry` | Date only | Optional | Current registration expiry |

## New tables

| Table | Logical name | Entity set | Primary ID |
|---|---|---|---|
| Qualification Type | `gr_qualificationtype` | `gr_qualificationtypes` | `gr_qualificationtypeid` |
| Technician Qualification | `gr_technicianqualification` | `gr_technicianqualifications` | `gr_technicianqualificationid` |
| Service Provider Type | `gr_serviceprovidertype` | `gr_serviceprovidertypes` | `gr_serviceprovidertypeid` |
| Service Provider | `gr_serviceprovider` | `gr_serviceproviders` | `gr_serviceproviderid` |
| WOF Inspection | `gr_wofinspection` | `gr_wofinspections` | `gr_wofinspectionid` |

All five are organisation-owned and use `gr_name` as their primary name.

### Qualification Type

- `gr_code`: required text; stable integration key by application convention.
- `gr_active`: Yes/No, default Yes.
- Seed record: `WOF_CERTIFIED` / WOF Certified.

### Technician Qualification

- `gr_technician`: required lookup to Mechanic (N:1).
- `gr_qualificationtype`: required lookup to Qualification Type (N:1).
- `gr_certificatenumber`: optional text.
- `gr_validfrom`, `gr_expirydate`: optional Date only.
- `gr_active`: Yes/No, default Yes.
- `gr_notes`: optional multiline text.

### Service Provider Type and Service Provider

Provider Type contains required `gr_code`, `gr_active`, and seed `WOF_INSPECTOR` / WOF Inspector. Service Provider contains required `gr_providertype` (N:1), optional contact fields, address and notes, plus `gr_active` defaulting to Yes.

### WOF Inspection

- Required lookups: `gr_job` to Job and `gr_equipment` to Equipment.
- Optional performer lookups: `gr_internalinspector` to Mechanic and `gr_externalprovider` to Service Provider. Application validation makes them mutually exclusive.
- Snapshots: `gr_registrationnumbersnapshot`, `gr_previouswofexpiry`.
- Outcome fields: `gr_inspectiondate`, `gr_newwofexpiry`, `gr_wofresult`, `gr_certificatenumber`, `gr_notes`.
- WOF Result values: Planned `122830000`, Passed `122830001`, Failed `122830002`, Cancelled `122830003`.

## Security roles required

Operational users require read on Qualification Type, Technician Qualification, Service Provider Type and Service Provider; read/create/update on WOF Inspection; read/update of the four Equipment WOF fields; and their existing Job privileges. Managers need create/update privileges for qualifications and providers. Technicians should not receive permission to grant their own qualifications.

## Data setup

1. Assign `WOF_CERTIFIED` Technician Qualification records to eligible Mechanics.
2. Create Service Provider records linked to `WOF_INSPECTOR`.
3. Backfill Equipment Registration Number, WOF Required and Current WOF Expiry.
4. Review role privileges, publish security changes, and test with a non-administrator account.

Passed-WOF completion automation remains deferred until its cross-record update can be made transactionally safe. Current creation already reports when the Job succeeds but the Inspection or schedule step fails.

## WOF table preferences

No additional Dataverse schema is required for WOF table settings. The Due Soon threshold and
table sort are structured, validated, account-scoped session preferences. The default threshold
is 30 days. The operational Customer and Site values prefer the linked Job's Site
and Customer so historical context is retained, then falls back to the Equipment's current
relationship. WOF Inspection expiry snapshots remain historical and are not used as the main
table's current expiry.

## Edit consistency

Editing uses the existing Job and WOF Inspection records. The application updates the linked
Job first, then the WOF Inspection, then creates, updates or removes the schedule when needed.
Each partial failure is reported explicitly, and the screen reloads only when all requested
steps succeed. No additional Dataverse columns are required for editing.

## Delete consistency

Dataverse cascade behaviour was not explicitly configured by the WOF provisioning script and
is not assumed by the application. The cleanup workflow only deletes planned, incomplete WOF
Inspection records whose Job lookup is empty. A WOF Inspection with a linked Job is protected;
the cleanup does not delete its Job or Job Schedule Options. Equipment registration and WOF
summary fields are never changed by this workflow.

Users performing this action require Delete privileges for WOF Inspection. No additional
tables or columns are required.
