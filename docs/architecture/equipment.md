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
- WOF inspections and registration fields preserve compliance history and current state.

## Shared Components and APIs

Equipment editing uses the shared drawer shell, sections, confirmation UI, form dialog, and
searchable selectors. Maintenance calculations and road-compliance eligibility live in
typed domain helpers consumed across features.

## Important Business Rules

- A Job never requires Equipment.
- When a saved Job establishes a Site, linked Equipment moves to that Site and local state
  reflects the change.
- Current configuration changes must not delete Jobs, inspections, or service history.
- Customer is not stored directly on Equipment.
- Current Hour Meter is presented as “Last Known Hour Meter”; the stored contract remains
  unchanged.
- Road compliance determines whether Equipment can participate in new WOF work.

## Extension Points

New asset classifications and configuration should extend typed Equipment models and shared
domain resolvers. Registration history may become a child-table model without changing the
meaning of the current-state Equipment fields.

## Implementation Constraints

Do not add redundant Customer lookups or infer asset classification from free text. Confirm
Dataverse schema before adding fields. Apply Equipment changes through feature services and
keep dependent screens synchronized.
