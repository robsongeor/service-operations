# Maintenance Profiles and Service Programmes — Dataverse changes

## Provisioning status

Provisioned and published in the `ServiceOperationsNew` solution on 24 July 2026 by
`scripts/setup-maintenance-programmes-schema.ps1`.

- All nine columns below were verified from live Dataverse metadata.
- 189 existing Equipment records were backfilled to Service Programme = ICE Standard
  and Maintenance Profile = Standard.
- Power Type was intentionally left unset because no authoritative classification source
  was available. It was not inferred from Equipment names, makes, models, or descriptions.
- The provisioning script is idempotent and can be rerun to verify the schema and backfill
  only missing safe defaults.

## Confirmed existing schema

- Equipment: `gr_equipment` / `gr_equipments`.
- Equipment Service Plan: `gr_equipmentserviceplan` / `gr_equipmentserviceplans`.
- Existing plan fields include `gr_servicetype`, `gr_intervalhours`,
  `gr_lastcompleteddate`, `gr_lastcompletedhours`, `gr_nextduehours`,
  `gr_nextduedate`, and `gr_active`.
- Equipment has `gr_currenthourmeter` and `gr_servicetrackingenabled`.
- No authoritative Equipment power, fuel, drive, or engine classification was found
  in the current queries, types, schema documentation, or application mappings.

## Required new Equipment columns

The following columns are provisioned in the `ServiceOperationsNew` solution.

| Display name | Recommended schema/logical name | Type | Required/default | Purpose |
|---|---|---|---|---|
| Power Type | `gr_PowerType` / `gr_powertype` | Local Choice | Optional; Other/Unknown | ICE, Electric, Other/Unknown classification |
| Service Programme | `gr_ServiceProgramme` / `gr_serviceprogramme` | Local Choice | Optional; ICE Standard | Authoritative active service-level rule |
| Maintenance Profile | `gr_MaintenanceProfile` / `gr_maintenanceprofile` | Local Choice | Optional; Standard | Authoritative time-frequency rule |
| Custom A Enabled | `gr_CustomAEnabled` / `gr_customaenabled` | Yes/No | Optional; Yes | Custom programme A applicability |
| Custom B Enabled | `gr_CustomBEnabled` / `gr_custombenabled` | Yes/No | Optional; No | Custom programme B applicability |
| Custom C Enabled | `gr_CustomCEnabled` / `gr_customcenabled` | Yes/No | Optional; Yes | Custom programme C applicability |
| Custom A Interval Days | `gr_CustomAIntervalDays` / `gr_customaintervaldays` | Whole Number | Optional | Custom profile A time interval |
| Custom B Interval Days | `gr_CustomBIntervalDays` / `gr_custombintervaldays` | Whole Number | Optional | Custom profile B time interval |
| Custom C Interval Days | `gr_CustomCIntervalDays` / `gr_customcintervaldays` | Whole Number | Optional | Custom profile C time interval |

Choice contracts proposed by the typed application model:

- Power Type: ICE `122830000`, Electric `122830001`, Other/Unknown `122830002`.
- Service Programme: ICE Standard `122830000`, Electric Standard `122830001`,
  Custom `122830002`.
- Maintenance Profile: High Usage `122830000`, Standard `122830001`,
  Low Usage `122830002`, Custom `122830003`.

The first release uses typed, seeded definitions rather than new administration tables.
Stable numeric values are used; display labels are never business keys. A later
administration release can replace these Choices with definition tables without changing
the resolved configuration consumed by the application.

## Migration

1. Create and publish the columns above.
2. Backfill existing Equipment to Maintenance Profile = Standard and Service Programme =
   ICE Standard. This preserves current A/B/C behavior.
3. Do not infer Electric from Make, Model, description, or hour-meter data.
4. Supply or review authoritative power-type data before classifying Equipment as Electric.
5. For confirmed Electric Equipment, set Power Type = Electric and Service Programme =
   Electric Standard. Keep A and C plans active, set existing B plans inactive, and do
   not delete B plan history or historical B Jobs.
6. Equipment without new values remains safe because application fallbacks are Standard
   + ICE Standard.

Changing programme synchronizes plan applicability: inactive plans retain their completion
history; missing newly applicable plans are created with an unknown baseline and no invented
completion.

## Query and payload impact

The shared Equipment query and authoritative completion Equipment query select all new
columns. Equipment create/update payloads write them. Service completion loads all plans,
including inactive historical plans, so an old B Job remains readable and can be completed
without activating B in the current Electric schedule.

## Security roles

- Operational users: read Power Type, Service Programme, and Maintenance Profile; read
  custom settings; update those Equipment columns only if programme changes are part of
  their role; read Equipment Service Plans.
- Maintenance managers: update Equipment programme/profile and activate/deactivate or
  create Equipment Service Plans.
- Ordinary users should not manage global definition contracts.
- Existing Job and service-completion privileges remain required.

No history table, Job, completed plan value, or B-service record is deleted by this feature.
