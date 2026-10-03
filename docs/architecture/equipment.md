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
The Equipment Manager and Customer Dashboard open the Equipment drawer immediately, then load only
that Equipment's linked Jobs in the background. History exposes distinct loading, failed/retry,
empty, and populated states. Closing the drawer clears those focused rows and invalidates the active
request so a late Dataverse response cannot appear against a subsequently opened Equipment record.
The Equipment Manager register does not wait for complete Customer, Site, or Equipment Service Plan
directories. Customer and Site filters are derived from the Site/Customer relationships already
expanded on the shared Equipment projection. Maintenance summaries use a shared query for only the
visible page; choosing Data Status sorting intentionally expands that query to the filtered result so
the sort remains authoritative. A failed maintenance-summary query is labelled Unavailable rather
than being mistaken for Not Configured. Create/edit drawers use abortable, eight-result Customer
search and selected-Customer Site loading. The administrative CSV workflow is the deliberate
exception: it loads the complete Site and Service Plan references only after an authorised user
selects a file, because import validation and maintenance synchronisation require authoritative IDs.
Equipment Map remains another explicit exception because it needs every addressed Site for its
location projection, but it skips the global Service Plan collection.
The operational Job Status badge reuses the established status palette while Job Type and Job Card
status remain neutral, keeping the primary workflow state visually distinct.
The Equipment Manager table derives a linked-Job count from the already loaded Jobs projection,
matches relationships by case-insensitive Equipment GUID, and exposes that count as a sortable Jobs
column. It includes all linked historical Jobs regardless of status, matching the drawer history
count, without per-row Dataverse requests or new schema.
Equipment with linked Job history remains protected from deletion. The disabled Delete Equipment
control exposes that preservation reason through a hover and keyboard-focus tooltip instead of
occupying the drawer footer with persistent warning text.

## Equipment location during Job creation

Standard Create Job and new Legacy Job Book Intake share `JobEquipmentLocation` and
`useEquipmentLocation`. Equipment remains the searchable entry point. A linked Customer/Site/address
appears in a read-only tile; **Edit** reveals the existing bounded `JobCustomerField` and
dependent `JobSiteContactFields`. An unlinked persisted machine opens the location fields directly.
Unknown equipment and Intake-only machine snapshots retain their existing non-master-data flow.

The tile presentation is `JobLocationSummary`, also reused by the existing Intake edit drawer.
That drawer displays its saved location snapshot and reveals entry-only relationship fields through
**Edit**; it does not mount the current-Equipment move hook or refresh away the recorded location.

Both location editors expose **Add new customer** through the existing `JobCustomerField` /
`CustomerRelationshipPicker` inline Customer-and-first-Site form, including verified-address input.
For an already-selected Customer, the Site dropdown also exposes **Add new site**, using
`JobSiteCreatePanel` extracted from the existing Jobs relationship form. The Customer is fixed while
that panel is open; cancelling preserves the previous selection. The new Site is created under that
Customer's ID and selected without creating another Customer or moving Equipment. Both destination
paths reuse `createEquipmentSite` for identical duplicate/retry checks and `sitesApi.createSite`
for persistence. Site name is editable, with the existing verified-address-derived default.
`useEquipmentLocation` owns the shared creation action and reuses `customersApi.createCustomer` and
`sitesApi.createSite` with one delegated token. An exact bounded Customer-name check reuses a single
existing match and rejects ambiguous matches. An identical Site is reused; a same-named Site with
a different address is not overwritten. Confirmed Customer creation is remembered across Site
failure/retry within the open editor. These are sequential existing-service writes, not an atomic
pair: errors explicitly identify a saved Customer, and uncertain results require checking/retry.
There is no automatic rollback/delete; simultaneous matching creations still need a separately
approved uniqueness rule if strict name uniqueness is required.

Customer/Site creation saves real master records immediately and selects the destination without
moving Equipment. **Save equipment location** remains a separate explicit action. Cancelling the
entry does not delete those records. While the inline create form is open, both the outer Job/Intake
submit and location save are blocked; while creation is saving, switching/closing is blocked too.
Created records remain in the selected projection across a delayed list read, and Customer Dashboard
queries are invalidated without a whole-directory reload.

**Save equipment location** is an explicit, immediate asset update, independent of creating a Job
or allocating an Intake number. Cancelling the new Job afterwards does not undo an already-saved
move. Cancel location edit performs no write. A pending location edit blocks the Job/Intake submit;
the drawer cannot close or switch Equipment while a move is saving. Contact remains Job-specific
and is cleared when the committed Site changes. Existing Job and Intake editors retain their
recorded relationship workflow rather than silently adopting the machine's current location.

`equipmentLocationWorkflow` verifies persisted IDs, a concrete Equipment ETag, and the destination
Site's authoritative Customer. It reuses `updateEquipmentSite` with `If-Match`, sending only
`gr_Site@odata.bind` (no maintenance adoption, customer lookup, equipment identity, or history writes).
Missing versions fail closed. A 412 exposes refresh/review recovery; a 403 explains the permission
problem. An uncertain network result requires refreshing before repeating the move. Successful
conditional writes update the current draft/shared Equipment projection and invalidate obsolete
Equipment/Job Book index snapshots. Index background callbacks are generation-guarded. This action
does not initiate a full Equipment-directory reload.

The canonical create drawer supplies the client-only `equipmentLocationHandled` flag so `useJobs`
does not perform its older implicit Equipment move a second time after creating the Job. Other
existing Job-save callers retain their current contract. The flag is not a Dataverse column.

Both restricted roles now have the separately approved **client capability** `canMoveEquipment`;
`canEditEquipment` remains Full Access only. The separately approved `canCreateEquipmentDestination`
client capability also permits both restricted roles to create a Customer/first Site or add a Site to
an existing selected Customer in this
panel only. `canEditCustomers` stays Full Access only: existing master records and the reference
screens remain read-only. This is a presentation boundary, not
server-side field authorization. Live permissions remain approval-gated: review Equipment Write/
Append and Site Read/Append To, and enforce the approved Site-only write boundary with an appropriate
Dataverse server-side control before production rollout. A general table-level Write grant alone
must not be described as a Site-only security boundary. No roles or schema were provisioned for
this change. Before release, separately approve Customer Create/Read/Append To and Site
Create/Read/Append/Append To plus any required baseline privileges; no Customer/Site Write/Delete
is needed for inline creation. Dataverse permissions cannot restrict a table Create grant to this
one UI, so any required operation-only boundary needs server enforcement as well.

## Important Business Rules

- A Job may be created without Equipment, but every transition to Complete requires linked
  Equipment and a completion hour-meter reading.
- When a saved Job establishes a Site, linked Equipment moves to that Site and local state
  reflects the change.
- Current configuration changes must not delete Jobs, inspections, or service history.
- Creating a Job from the Equipment drawer prepares the shared Job editor reference data before
  rendering, then defaults the authoritative Equipment, its current Site, derived Customer, and
  sole Site Contact when one exists. It uses the canonical Job creation workflow and services.
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
  history. Full Site and Service Plan references are loaded only when this workflow starts.
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
- Service history is hierarchical for both completed Jobs and manually entered historical
  baselines. A C Service satisfies C, B, and A; a B Service satisfies B and A; and an A Service
  satisfies only A. Each lower plan uses the newest qualifying completion as its baseline and
  recalculates its own hour and calendar due thresholds from that completion.

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
