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
Equipment lists reuse the feature-owned data-quality evaluator and accessible indicator so
identity, On-road compliance, and missing maintenance history are calculated consistently.

## Important Business Rules

- A Job never requires Equipment.
- When a saved Job establishes a Site, linked Equipment moves to that Site and local state
  reflects the change.
- Current configuration changes must not delete Jobs, inspections, or service history.
- Customer is not stored directly on Equipment.
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
