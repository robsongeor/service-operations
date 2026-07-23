# Changelog

## Unreleased

- Added explicit per-field Fleet/Serial duplicate overrides and per-row import selection to the Customer Dashboard bulk Equipment review workflow.
- Made WOF table Equipment values open the shared authoritative Equipment drawer and added the confirmed `gr_regoexpiry` Dataverse field with shared editing, display, and persistent sorting.
- Added accessible collapsible Customer Dashboard Site Equipment sections with smart defaults, per-Site session state, and Expand All/Collapse All controls.
- Fixed Edit WOF orphan cleanup by loading authoritative Inspection details and allowing only planned Inspection records with no linked Job to be deleted.
- Added a shared Job Completion framework with a dedicated Service workflow for immutable completion hour readings, Equipment hour updates, maintenance-plan progression, validation, and large-increase confirmation.
- Added an admin-only Customer Dashboard Site bulk paste workflow with immutable Customer/Site context, TSV review, date-only normalization, duplicate validation, sequential creation, and partial-failure retry protection.
- Fixed shared Equipment edit initialization so Dataverse Current WOF Expiry values remain visible and are preserved when Equipment is edited from Customer Dashboard Sites.
- Opened Customer Dashboard Add Site directly on the reusable Customer drawer Sites tab and completed robust Dataverse Site creation/update persistence, Customer binding, response handling, and save-state cleanup.
- Added Registration and current WOF Expiry to Customer Dashboard site equipment tables, and made create-equipment WOF auto-enabling respond consistently to controlled Registration value changes.
- Replaced the Customer Dashboard’s separate search and customer dropdown with the shared searchable selector.
- Split Quote relationships into Equipment, Job, Customer, and Author columns and added immutable Author visibility to the Quote editor.
- Added a user-specific Jobs “Freeze columns through” setting with calculated sticky-column offsets.
- Improved shared Equipment creation with automatic REGO/WOF normalisation, searchable Customer-filtered Sites, Customer Dashboard Site actions, and reliable date-only WOF expiry persistence.
- Added the global Unconfirmed Job status, including a Jobs tab, persisted default-view support, amber status styling, and allocation/Scheduling protection.
- Added protected deletion for incomplete WOF records, including explicit Scheduler cleanup and linked Job removal.
- Fixed the Edit Customer drawer so existing Site name and address changes update their Dataverse records without changing the Customer relationship.
- Added the Dataverse foundation and initial protected WOF / REGO management screen.
- Added technician qualification summaries and add, edit and deactivate management from the Mechanics page.
- Improved WOF creation with shared inline Equipment creation, operational table columns, Customer/expiry sorting and per-user Due Soon settings.
- Added editing for existing WOF records, including linked Job, inspection, assignment and schedule updates with protected completed-Job equipment.
