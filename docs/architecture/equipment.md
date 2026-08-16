# Equipment Architecture

## Purpose

Equipment is the durable asset record connecting a physical machine to its current operating
Site, maintenance configuration, service history, registration, and road compliance.

## Architecture

The Equipment feature owns asset editing and Equipment-specific domain rules. It exposes
typed data and shared APIs to Jobs, Customer Dashboard, Maintenance, and WOF. Derived
Customer information is presented through the Equipment's Site rather than stored as a
second relationship.

## Major Dataverse Relationships

- Equipment belongs to one Site.
- Site belongs to Customer; Equipment Customer is therefore derived.
- Jobs may reference Equipment.
- Equipment Service Plans are children of Equipment.
- WOF inspections preserve compliance history. Registration fields represent current state
  and are cleared after a confirmed On-road to Off-road transition.

## Shared Components and APIs

Equipment editing uses the shared drawer shell, sections, confirmation UI, form dialog, and
searchable selectors. Maintenance calculations and road-compliance eligibility live in
typed domain helpers consumed across features.
Both create and edit modes use the same searchable Customer and Site relationship workflow. Users
may create a Customer and its first Site inline; duplicate Customer names are redirected to the
existing record, and Equipment continues to store only the selected Site relationship.
Equipment lists reuse the feature-owned data-quality evaluator and accessible indicator so
identity, On-road compliance, and missing maintenance history are calculated consistently.
The primary Fleet Number remains the current/Greentree-facing identifier. Equipment may also store
multiple normalized Alternate Fleet Numbers for former Liftrucks numbers and Customer- or
Site-specific codes. These aliases are searchable across Equipment selection workflows and appear
under the primary number in Equipment Manager. Changing the primary number through the canonical
drawer preserves its previous value as an alternate; operational snapshots continue using the
primary value.
The Equipment drawer Job History keeps the original linked Job context and distinguishes the Job's
created date from its completed date. Each card also shows the recorded completion hours, including
an Estimated marker where applicable; missing completion evidence is labelled rather than inferred.
The Job description sits beside the Job number and truncates visually with its full value retained
as hover text so long descriptions do not displace the created date or card layout.
The operational Job Status badge reuses the established status palette while Job Type and Job Card
status remain neutral, keeping the primary workflow state visually distinct.
The Equipment Manager table derives a linked-Job count from the already loaded Jobs projection,
matches relationships by case-insensitive Equipment GUID, and exposes that count as a sortable Jobs
column. It includes all linked historical Jobs regardless of status, matching the drawer history
count, without per-row Dataverse requests or new schema.
Equipment with linked Job history remains protected from deletion. The disabled Delete Equipment
control exposes that preservation reason through a hover and keyboard-focus tooltip instead of
occupying the drawer footer with persistent warning text.

## Important Business Rules

- A Job may be created without Equipment, but every transition to Complete requires linked
  Equipment and a completion hour-meter reading.
- When a saved Job establishes a Site, linked Equipment moves to that Site and local state
  reflects the change.
- Current configuration changes must not delete Jobs, inspections, or service history.
- Alternate Fleet Numbers identify the same Equipment record; they never create duplicate assets,
  change Site ownership, or replace the Equipment Dataverse ID as the relationship key.
- Customer is not stored directly on Equipment.
- Completed Job evidence is authoritative for the Last Known Hour Meter: the latest dated completed
  Job reading supplies the displayed value and service calculations. The stored Equipment current
  value is retained as a fallback only when no usable completed Job reading exists.
- Current Hour Meter is presented as “Last Known Hour Meter”; the stored contract remains
  unchanged.
- Equipment Ownership is explicit current master data: Not classified, Customer owned, or
  Liftrucks rental. Not classified is stored as null; ownership is never inferred from
  identifiers, Customer, Site, or free text.
- Proposed Site Check Availability is separate current master data. Its marker is exposed
  only while the Equipment's current Site has an enabled recurring Site Check Schedule.
  Hidden values survive Schedule disablement and Site transfers; null means Available at
  Site for backward compatibility. The Customer Dashboard Equipment drawer supplies the
  enabled-Site scope and is the Site Check availability management surface.
- Road compliance determines whether Equipment can participate in new WOF work.
- Equipment CSV maintenance is restricted to the explicitly authorised administrator.
  Imports match only by Equipment Dataverse ID, ignore blank cells by default, validate
  stable Site IDs and typed values, and require review plus confirmation before updating
  current master fields. They never create or delete Equipment or rewrite operational
  history.
- The Equipment Maintenance tab derives average usage from completed Jobs of every type. It
  shows a confidence score and identifies estimates, isolated suspect readings, and reset
  sequences. Suspect readings are ignored; a confirmed reset begins a new calculation segment.
  When Job evidence exists, stale Equipment snapshot values do not participate in anomaly detection.
  Usage remains unavailable until accepted Date Only readings span at least seven days.
- Maintenance keeps an Average Machine Usage summary above service history with hours per day and
  confidence always visible; its supporting evidence, quality signals, and secondary rates are in a
  native expandable disclosure. The separate Set Historical Baseline action belongs to Service
  History and Due Dates and is explicitly limited to maintenance not represented by Jobs; completed
  Service Jobs remain the normal workflow.

## Extension Points

New asset classifications and configuration should extend typed Equipment models and shared
domain resolvers. Registration history may become a child-table model without changing the
meaning of the current-state Equipment fields.

## Implementation Constraints

Do not add redundant Customer lookups or infer asset classification from free text. Confirm
Dataverse schema before adding fields. Apply Equipment changes through feature services and
keep dependent screens synchronized.

## Related Files and Documents

- [`../../src/alpha/equipment/EquipmentScreen.tsx`](../../src/alpha/equipment/EquipmentScreen.tsx)
- [`../../src/alpha/equipment/components/EquipmentDrawer.tsx`](../../src/alpha/equipment/components/EquipmentDrawer.tsx)
- [`../../src/alpha/equipment/services/equipmentManagerApi.ts`](../../src/alpha/equipment/services/equipmentManagerApi.ts)
- [Maintenance](maintenance.md)
- [Customer Dashboard](customer-dashboard.md)
- [WOF/REGO](wof.md)
- [Dataverse](dataverse.md)
