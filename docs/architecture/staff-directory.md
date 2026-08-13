# Staff Directory Architecture

## Purpose and boundary

The Staff screen is the internal people directory for Service Operations. It replaces the
Mechanics label in the UI without replacing the existing Dataverse `gr_mechanic` table or any
Job, assignment, qualification, WOF, Site Check, or Chargeable Invoice relationships.

`MechanicsScreen`, `useMechanics`, and `mechanicsApi` retain their source filenames for a
low-risk migration. The canonical route is `/staff`; `/mechanics` redirects for saved links.

## Staff classifications

Every staff row may record a Department and whether the person can be assigned Jobs.

- Existing rows with a blank assignment flag are treated as assignable for backward compatibility.
- Only active, assignable staff appear in Job, scheduling, Site Check, WOF, and photo-request technician selectors.
- Active staff with a valid email may appear in internal email recipient selectors, whether or not they are assignable.
- Active staff with a valid email and `CC on customer emails` enabled are copied on Quote and
  Chargeable Invoice customer PO drafts. Blank, invalid, inactive and non-opted-in rows are excluded.
- Qualifications and technician vehicle fields are shown only for assignable staff.
- Deactivation removes a person from both assignment and internal-recipient choices while preserving history.

`src/alpha/mechanics/staffDirectory.ts` owns these cross-feature rules and Department labels.

## Email workflow

Chargeable Invoice amendment handoff uses the shared `SearchableSelect` to choose any active
emailed staff member. If exactly one active Accounts person exists, that person is suggested;
the manager can always select somebody else. Opening the draft remains an explicit user action
and nothing is sent automatically.

Customer PO To/CC routing remains owned by Customer/Site Purchase Order Recipient configuration.
Internal staff and external customer recipients are deliberately separate domains. External routing
still owns To and external CC; opted-in internal addresses are appended to CC, normalised and
deduplicated. The setting does not affect technician photo requests or amendment handoff drafts.

## Data and services

- Existing table: `gr_mechanic` / `gr_mechanics`.
- Added columns: `gr_department`, `gr_jobassignmentenabled`, `gr_customeremailccenabled`.
- UI mutations: `src/alpha/mechanics/services/mechanicsApi.ts`.
- Read-only consumers load both columns and apply the shared assignment rule client-side. Until
  those columns are provisioned, schema-level `400` responses fall back to the legacy Mechanics
  select so Jobs and other established workflows continue to load; legacy rows remain assignable.
- Schema provisioning: `scripts/manage-staff-directory-schema.ps1`; it requires separate approval.

See [Staff Directory Dataverse schema](../staff-directory-dataverse-schema.md).
