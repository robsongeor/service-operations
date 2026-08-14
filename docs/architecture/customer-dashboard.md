# Customer Dashboard Architecture

## Purpose

Customer Dashboard provides a customer-centred operational view across Sites, Equipment,
Jobs, Quotes, and road compliance.

## Architecture

The dashboard composes data owned by other features. It may coordinate navigation and local
presentation state, but it does not create a separate Customer data model or reimplement
Equipment, Job, Quote, or WOF rules.

## Major Dataverse Relationships

- Customer owns Sites.
- Sites relate to Contacts and Equipment.
- Equipment and Jobs expose operational history within the selected Customer.
- WOF summaries use the current Equipment relationship and compliance state.

## Shared Components and APIs

Customer selection uses the shared searchable selector. Customer and Site editing uses the
shared drawer presentation while retaining Customer-owned forms and services. Embedded Job
and Equipment actions delegate to their feature workflows.

The Customer search opens with its input focused when the dashboard route mounts, so keyboard
input can begin immediately. The selected Customer ID is retained in account-scoped browser
session storage. Leaving the Customer route and returning during the same signed-in browser
session restores that Customer after the authoritative Customer collection loads, while an
explicit route `customerId` remains able to select a different Customer. Missing or stale stored
IDs are discarded without creating local Customer state or issuing an additional Dataverse request.

The Customer edit drawer owns Customer-default PO Contacts: exactly one primary emailed Contact
plus optional CC Contacts selected through the shared searchable selector. Site Settings reuses the
editor with an explicit inherit-or-override choice. Site overrides are limited to Contacts linked to
that Site and replace the complete Customer default. Both saves replace only their scope in one
ETag-guarded Dataverse changeset; removing an override restores inheritance.

Each persisted Site section can transfer multiple existing Equipment records to that Site.
The transfer uses the shared drawer and confirmation presentation, displays each machine's
current Customer and Site, and delegates the narrow Site-lookup mutation to the Equipment
workflow. Successful moves update the dashboard projection immediately; failures remain
selected for an individual retry.

Each persisted Site also owns an optional `gr_defaultmaintenanceprofile` Choice using the
same numeric values as Equipment `gr_maintenanceprofile`. Site Settings can save that
default and, only after explicit selection and confirmation, apply it to existing Equipment.
New Equipment inherits the selected Site default unless the user explicitly chooses another
profile. Transfers may explicitly adopt the destination default; otherwise the existing
Equipment profile is preserved.

Persisted Sites expose one settings-icon entry point for management. The combined Site
Settings drawer keeps Details and Settings form state mounted while switching tabs. Bulk Add
Equipment is launched from its tab with the current Customer and Site supplied automatically;
the existing bulk-import workflow remains responsible for parsing, review, validation,
correction, and creation.

The same combined drawer includes a mounted Site Checks tab. A single customer-scoped Site
Checks hook supplies the dashboard and the selected Site's settings, avoiding a second
loader or token request. It resolves the active account and acquires silently once. Enabled
schedules require a frequency and Date Only next-due value. First save
posts the schedule collection and relies on the active one-Site alternate key to reject
concurrent duplicates; later saves require the loaded ETag. The lookup alternate-key URL is
not addressable in the target environment. Disabling preserves cadence values, history,
generated Jobs, and any active occurrence, and requires confirmation when an occurrence is
active. Schedule persistence is independent from Site details and maintenance-profile
saves.

Each Schedule also owns an Equipment Scope. Existing/null scope means All Equipment.
Liftrucks Rentals Only includes only Equipment whose explicit Equipment Ownership is
Liftrucks Rental; Customer-owned and Not classified Equipment are excluded. If the
authoritative filtered query returns no Equipment, starting is blocked. Historical
occurrences and Jobs retain their original Equipment set when ownership or scope later
changes.

Manual Selection is a third scope. Site Settings must reuse the Transfer Equipment
searchable multi-select and selected-item summary, limited to Equipment currently assigned
to the Site. Persisted selection rows belong to the Schedule through
`gr_sitecheckscheduleequipment`; newly assigned Equipment is not automatically selected.
At creation time, the authoritative workflow intersects saved IDs with its fresh Site
Equipment query, so transferred-away or otherwise stale selections cannot generate Jobs.
Zero current matches blocks creation. Historical occurrences and Jobs are unaffected by
later selection changes.

The temporary-availability rule runs after Schedule scope filtering.
Equipment marked In Workshop or Temporarily Off-site receives no Job for that occurrence
and waits for the next normal occurrence after returning to Available at Site. The creation
transaction records an immutable exclusion snapshot. The Equipment marker is shown in the
Customer Dashboard Equipment drawer only when the Equipment's current Site has an enabled
Schedule. No catch-up workflow is created.

Enabled schedules appear as compact state summaries in their Site headers. Customer summary
counts cover Up to date, Due, Overdue, and In progress only; disabled and invalid schedules
are excluded. Each count is a keyboard-accessible toggle that filters the Sites tab, with an
announced result count and explicit clear action. The Site Checks domain projection owns
state, count, and operational-Job progress calculation; the dashboard only renders it.
Each enabled Site exposes one context-aware details action: an active occurrence is labelled
View Current Site Check and opens Summary; otherwise the same action is labelled Site Check
History and opens History. The header never renders separate current and history buttons.
Disabled schedules render no Site Check status, Run, Current, or History content in the Site
header. Their occurrence and Job history remains stored and becomes accessible again if the
Schedule is re-enabled.

Due and Overdue Sites expose Run Site Check. The Site Check-owned drawer reuses the shared
drawer shell and existing searchable technician selector. It keeps Customer, Site,
frequency, and due date concise, collapses the normally included Equipment list, and keeps
unavailable exceptions prominent. Managers can mark Equipment Available at Site,
Temporarily Off-site, or In Workshop inline rather than leaving the workflow. Submit
re-reads schedule, active mechanic, and Site Equipment authoritatively with one silent token.
Inline Equipment availability PATCHes, the occurrence, Schedule lock, Jobs, and exclusion
snapshots share one ETag-protected atomic change set. After success the existing details
drawer opens directly on Jobs & Equipment so Job Book copy/paste is immediately available.
A drawer-session UUID is retained
for safe explicit retry, and the creation action is disabled while the atomic transaction
and reconciliation run.

In-progress Sites expose the shared-pattern Site Check details drawer, and every persisted
Schedule exposes permanent History even when disabled. Summary, Jobs & Equipment, and
History tabs show snapshot cadence, technician, timestamps, operational-Job progress, and
integrity warnings. History and generated rows are newest-first/bounded Dataverse pages;
the Job query expands Equipment and current technician in one request. Row actions open the
canonical Job or Equipment drawer over the retained Site Check drawer and restore focus on
close. Successful creation opens the authoritative occurrence directly. Concurrent initial
drawer reads coalesce silent token acquisition and never trigger interactive sign-in.
Closing the combined Site Settings drawer also restores focus to the exact Site settings
button that invoked it.

The Jobs & Equipment tab also owns the Job Book handoff. It loads every generated Job in
stable creation order, exports headerless tab-separated Mechanic, Model, Fleet Number,
Company, Description, Address, Suburb, and City columns, and accepts one numeric Job number
per line in that same order. The update is one ETag-protected Dataverse change set and
reloads the authoritative rows after success. Site address parts use the existing
comma-separated `gr_address` convention; no separate address columns are inferred.

The details drawer exposes a permanent-delete action behind explicit confirmation. The
Site Check occurrence and every generated Job are deleted in one ETag-protected change set;
an active Schedule pointer is cleared first. The Schedule, due configuration, Equipment
scope, and manual selections remain. Successful deletion refreshes both dashboard Site
Checks and Jobs projections.

## Important Business Rules

- Site Equipment is grouped by the actual Site relationship.
- Equipment Customer is derived through Site.
- Current WOF expiry comes from the loaded Equipment summary, not a historical inspection
  snapshot.
- Date Only values use shared WOF formatting.
- Disclosure and view state is keyed by durable Dataverse IDs and scoped to the selected
  Customer so local mutations do not reset unrelated sections.
- Equipment transfer changes the current Equipment Site lookup and may explicitly adopt the
  destination maintenance default. It never rewrites historical Jobs, service plans, or
  maintenance history.
- The Last Known Hour Meter recorded date is derived from the latest already-loaded completed
  Job containing an hour-meter reading, avoiding per-row Dataverse requests.
- Disabled Site Check schedules do not participate in status reporting or allow new checks,
  but their historical data is never cleared.
- PO routing is current configuration. It never proves email delivery or PO receipt and does not
  rewrite historical invoices when recipients change.
- The PO Contacts editor can create an emailed Dataverse Contact inline through the canonical
  Contact workflow. Customer-default contacts belong to the Main customer by default and need no
  Site link; the manager chooses a Site only for a location-specific contact. A Site override fixes
  the new Contact to that Site through the existing Site Contact relationship. The new Contact is
  immediately selected as Primary or CC, but the routing rows are not changed until the manager
  separately saves PO recipients.

## Extension Points

Add new customer-centred summaries by composing existing typed feature data or shared query
expansions. New editing actions should open the owning feature workflow.

## Implementation Constraints

Avoid per-row requests when related values can be loaded through the parent query. Do not
copy domain calculations into dashboard components or use temporary UI IDs as durable keys.

## Related Files and Documents

- [`../../src/alpha/customers/CustomerDashboardScreen.tsx`](../../src/alpha/customers/CustomerDashboardScreen.tsx)
- [`../../src/alpha/customers/CustomerDrawer.tsx`](../../src/alpha/customers/CustomerDrawer.tsx)
- [`../../src/alpha/customers/SiteSettingsDrawer.tsx`](../../src/alpha/customers/SiteSettingsDrawer.tsx)
- [`../../src/alpha/customers/EquipmentTransferDrawer.tsx`](../../src/alpha/customers/EquipmentTransferDrawer.tsx)
- [Equipment](equipment.md)
- [Jobs](jobs.md)
- [Site Checks implementation tracker](../features/SITE_CHECKS_IMPLEMENTATION_PLAN.md)
- [Site Checks Dataverse schema](../site-checks-dataverse-schema.md)
- [Shared components](shared-components.md)
