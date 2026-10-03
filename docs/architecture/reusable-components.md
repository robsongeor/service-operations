# Reusable Components

This is the first UI inventory to consult before implementing a component or workflow.
Reuse or extend an existing contract when it fits; do not assume a generic component exists
because a similar visual pattern appears in more than one feature.

## Shared Presentation Primitives

Managed Job correction must reuse `JobEditDrawer` with `correctionsOnly`, through the
`JobCorrectionsDrawer` adapter and `useJobCorrections`. The shared core/relationship components
accept the same mode; `JobEquipmentField` hides creation when no create callback is provided.
Do not duplicate the editor or reuse the coordinator's broad `updateJob` for restricted saves.
`jobCorrectionsApi` owns the narrow payload, relationship checks and ETag contract. Recovery uses
the shared confirmation component. See [Jobs architecture](jobs.md#admin-corrections-3-october-2026-local-implementation).

| Component | Location | Use |
| --- | --- | --- |
| `EditDrawerShell` | `src/alpha/shared/drawer/EditDrawerShell.tsx` | Standard right-hand drawer layout, unique accessible title, initial dialog focus, Escape close, contained Tab navigation, header, loading state, actions, and close behaviour. Its optional `className` supports feature-owned responsive sizing/layout without changing other drawers. |
| `EditDrawerSection` | `src/alpha/shared/drawer/EditDrawerSection.tsx` | Consistent grouping and spacing inside drawers. |
| `EditDrawerConfirmation` | `src/alpha/shared/drawer/EditDrawerConfirmation.tsx` | Confirmation within drawer workflows, including destructive or consequential actions. |
| `EditDrawerFormDialog` | `src/alpha/shared/drawer/EditDrawerFormDialog.tsx` | Small supporting form dialog opened from a drawer. Supports optional destructive styling, feature-owned disabled or hidden submit states, and optional feature-owned dialog/fields classes for bounded responsive layouts; consumers still own validation and mutations. |
| `DrawerTabs` | `src/alpha/shared/drawer/DrawerTabs.tsx` | Accessible, responsive drawer tab navigation with active and validation-error states. |
| `SearchableSelect` | `src/alpha/shared/searchable-select/SearchableSelect.tsx` | Searchable, keyboard-accessible selection. Supports single selection, optional backward-compatible multi-selection, optional emphasized options for an authoritative/default record, and opt-in opening/focus of the search input on mount. Selected single values truncate with an ellipsis and retain their full hover title. Consumers own ordering, selected-item summaries and removal UI. |
| `FormSwitch` | `src/alpha/shared/form-switch/FormSwitch.tsx` | Compact accessible boolean switch with visible state text, keyboard behavior, disabled state, and focus styling. |
| `MetricStrip` | `src/alpha/shared/metric-strip/MetricStrip.tsx` | Compact, wrapping dashboard summary of semantic label/value pairs with optional warning/danger emphasis and optional keyboard-accessible value activation for feature-owned filtering. |
| `PageHeader` | `src/alpha/shared/page-header/PageHeader.tsx` | Standard sticky management-page header with optional eyebrow, subtitle, and responsive action area. |
| `TablePanel`, `TableToolbar` | `src/alpha/shared/table/` | Shared Jobs/Job Card review table shell, heading, labelled search and live result count. Feature owns search state and data. |
| `FilterPills` | `src/alpha/shared/table/FilterPills.tsx` | Single-choice pill group with pressed state; Jobs office attention and review reported-attention filters keep separate business meanings. |
| `TableSortButton`, `TableSortIcon` | `src/alpha/shared/table/` | Shared sort button, focus state and direction icon. Feature owns sorting and header `aria-sort`. The old Jobs icon import remains compatible for WOF/Quotes. |

Use the shared drawer CSS and interaction patterns with these components. Feature state,
validation, permissions, and Dataverse writes remain in the owning feature.

## Feature-Owned Reusable Workflows

These are not generic primitives, but they are the canonical implementations for their
business workflow and should be embedded through thin feature adapters when needed.

| Component | Location | Use |
| --- | --- | --- |
| `JobEditDrawer` | `src/alpha/jobs/components/JobEditDrawer.tsx` | Manager-facing Job details and editing. Do not build a feature-specific Job editor. Quotes and technician Assignments use its focused, tab-triggered loading callbacks rather than route-owned full collections. |
| `JobCreateDrawer` | `src/alpha/jobs/components/JobCreateDrawer.tsx` | Standard Job creation, including pre-populated Job and proposed Equipment values, constrained Job Type options, and the shared searchable relationship/create workflow. The shell and supplied exact defaults render immediately; shared Staff, exact Equipment/maintenance data, selected-Customer Sites, and selected-Site Contacts expose independent loading/error/retry states. Optional bounded lookup callbacks are the canonical remote-loading contract; proposed Equipment identifiers search existing records first and require confirmation before inline creation. |
| `JobEquipmentField` | `src/alpha/jobs/components/JobEquipmentField.tsx` | Canonical searchable Equipment selector and inline Equipment-details panel shared by standard Job creation and Legacy Job Book intake. Change opens/focuses replacement search without clearing the selection or its relationships; dismissing restores the tile, while an explicit result/No Equipment/unknown choice changes it. Optional `selectedEquipmentFallback` displays saved details when the selected ID is absent from the directory (including an empty ID for Intake snapshots); it never enters results or changes links. Feature adapters own whether an inline record is persisted to Dataverse or retained as an Intake snapshot. |
| `JobCustomerField` | `src/alpha/jobs/components/JobCustomerField.tsx` | Canonical Customer field shared by Job create/edit and Legacy Job Book intake. Composes the existing `CustomerRelationshipPicker` (including its inline Customer/Site panel and outside-click dismissal) with `useCustomerSearch`: eight filtered results, two-character remote threshold, 250ms debounce, cancellation, loading/error/retry states. Thin adapters own selected values, dependent-field changes, permissions, and writes. |
| `JobSiteContactFields` | `src/alpha/jobs/components/JobSiteContactFields.tsx` | Canonical dependent Site and Contact selectors, including loading, retry, empty, and optional inline-create actions. Site/address are hidden until Customer is selected or created; Contact appears once both Customer and Site are selected. Creation can opt into required Site/address presentation with a read-only address and accessible errors; hiding fields does not relax validation or change selections. Use after the shared Customer selector in all Job relationship forms. |
| `JobSiteCreatePanel` | `src/alpha/jobs/components/JobSiteCreatePanel.tsx` | Existing Jobs inline Site form extracted for reuse by Job relationships and the Equipment location editor. Collects Site name and a verified address with derived-name defaults, saving/error/cancel states. Callers own Customer identity, permissions, persistence and selection. |
| `JobLocationSummary` | `src/alpha/jobs/components/JobLocationSummary.tsx` | Canonical read-only Customer/Site/address tile with optional Edit action. Shared by Equipment location during creation, the saved Intake edit drawer, and newly confirmed inline Intake Customer/Site details; presentation only, so reading an entry never replaces historical relationships or moves Equipment. |
| `JobEquipmentLocation` | `src/alpha/jobs/components/JobEquipmentLocation.tsx` | Creation-only Equipment Customer/Site tile and explicit move form, shared by Create Job and new Job Book Intake. Composes `JobCustomerField` and the Site-only presentation of `JobSiteContactFields`; the parent retains the Contact-only presentation. `useEquipmentLocation` coordinates exact reads, permissions, draft isolation, conditional saves, and cache reconciliation. See Equipment architecture for the immediate-save and security contracts. |
| `SearchableMechanicSelect` | `src/alpha/jobs/components/SearchableMechanicSelect.tsx` | Canonical Mechanic selector for Job create/edit, Job tables, and Legacy Job Book Intake. Searches the cached Staff directory by name/email/phone, uses shared assignment eligibility, and renders at most eight matches plus Unassigned. Shared keyboard, outside-click, and exclusive-dropdown handling includes its portal. Optional `selectedName` preserves saved display text and `onSelectCustom` enables Intake-only outwork text without creating a Staff lookup or record. |
| `JobQuickActions` | `src/alpha/jobs/components/JobQuickActions.tsx` | Shared Jobs/Job Book copy-for-order-book and technician-email controls, optional visible labels, disabled reasons and delivery states. Callers own capability checks and row data. |
| `JobEmailComposer` | `src/alpha/jobs/components/JobEmailComposer.tsx` | Shared Jobs/Job Book technician email preview, subject/comments, and active-link replacement confirmation. `assignedRecipientOnly` locks the recipient for Admin; local sending is always disabled. |
| `JobCardHistoryPanel` | `src/alpha/job-card-reviews/JobCardHistoryPanel.tsx` | Read-only Azure link/submission history in the canonical Job drawer; reviewer authorization and loading are owned by the feature hook/API. |
| `JobQuotesDrawer` | `src/alpha/quotes/components/JobQuotesDrawer.tsx` | Read-only same-screen Quote context for a Job. Uses the shared drawer and bounded existing Quote readers; mount only while open under an account/Job-scoped parent key. No editor or mutations. |
| `JobDrawerShell` | `src/alpha/jobs/components/JobDrawerShell.tsx` | Job-specific composition of the shared drawer shell. |
| `EquipmentDrawer` | `src/alpha/equipment/components/EquipmentDrawer.tsx` | Primary Equipment create/edit workflow and related operational information. It renders the supplied editable Equipment core immediately, loads focused Service Plans only on Maintenance, and consumes the shared focused Job history for usage evidence and History. Optional abortable Customer-search and selected-Customer Site callbacks are the canonical bounded relationship contract; returned and inline-created records merge into the open drawer. Keep Customer/Site selection and inline creation here. |
| `EquipmentDataQualityIndicator` | `src/alpha/equipment/components/EquipmentDataQualityIndicator.tsx` | Keyboard-accessible Critical/Warning Equipment data-quality disclosure used by Equipment lists. |
| `CustomerDrawer` | `src/alpha/customers/CustomerDrawer.tsx` | Primary Customer editing workflow. |
| `WofEditorDrawer` | `src/alpha/wof/components/WofEditorDrawer.tsx` | WOF/REGO record editing. |
| `WofJobDrawer` | `src/alpha/wof/components/WofJobDrawer.tsx` | Thin WOF adapter around the existing Job drawer and Job loading flow. |
| `QuoteEditorDialog` / `QuoteEditorOverlayProvider` | `src/alpha/quotes/components/QuoteEditorDialog.tsx`, `src/alpha/quotes/QuoteEditorOverlayProvider.tsx` | Canonical Quote create/edit workflow plus a lazy app-shell overlay. Other screens request it through `useQuoteEditorOverlay`; they do not navigate away or build their own Quote editor. |
| `BulkEquipmentImportDrawer` | `src/alpha/equipment/components/BulkEquipmentImportDrawer.tsx` | Existing bulk Equipment import workflow. |
| `EquipmentTransferDrawer` | `src/alpha/customers/EquipmentTransferDrawer.tsx` | Existing multi-equipment Customer/Site transfer workflow. |

Tables and columns remain feature-owned (`JobsTable`, `EquipmentTable`, `JobCardReviewQueue`).
The location editor reuses the Customer picker's inline Customer/first-Site panel and its optional
`onCreateOpenChange` signal to guard outer submit actions. `useEquipmentLocation` owns persisted
destination creation for both drawers; do not substitute an Intake-only snapshot callback here.

Jobs and reviews share the primitives above and the opt-in `.operations-table` compact cell/header
styles; this is not a generic data-loading/editing `DataTable`. Reuse `JobTypeTabs`/`JobTypeBadge`
for Job types and `SearchableSelect` for review Customer/Technician filters. Do not couple the
review queue to the editable operational Jobs table or its mutation handlers.

## Shared Business and Domain Logic

Business rules must have one owner even when several screens display the result.

`jobs/domain/jobNumberPolicy.ts` owns the ordinary Jobs allocated-number and deletion guards.
`jobs/services/jobNumberGuard.ts` owns bounded authoritative number/version preflight. Editing and
completion reuse a number-free `buildJobUpdateFields`; do not add number writes to another editor
or bypass the conditional allocation path. This is the first local safety slice, not the future
server allocator; see [Jobs numbering](jobs.md#job-number-safety-foundation-3-october-2026).

| Owner | Location | Responsibility |
| --- | --- | --- |
| Equipment compliance | `src/alpha/equipment/compliance/equipmentCompliance.ts` | Road-compliance eligibility and related choices. |
| Equipment data quality | `src/alpha/equipment/dataQuality/equipmentDataQuality.ts` | Shared identity, road-compliance, and recorded maintenance-history evaluation. |
| WOF rules | `src/alpha/wof/utils/wofRules.ts` | WOF workflow/status derivation and Date Only handling. |
| Maintenance configuration | `src/alpha/equipment/servicePlans/maintenanceConfiguration.ts` | Maintenance configuration rules. |
| Service-plan calculations | `src/alpha/equipment/servicePlans/servicePlanCalculations.ts` | Service-plan calculations. |
| Service-plan status | `src/alpha/equipment/servicePlans/servicePlanStatus.ts` | Maintenance/service-plan status derivation. |
| Job completion | `src/alpha/jobs/completion/` and `src/alpha/site-checks/services/siteCheckCompletionApi.ts` | Job-type-owned completion orchestration and atomic completion-side effects, reached through `useJobs`. |
| No-equipment creation location | `src/alpha/jobs/domain/jobCreationLocation.ts` | Shared Customer/Site/non-empty-address validation for new managed Jobs and Job Book Intake without Equipment. Existing-record edits remain outside this rule; features own validation timing and writes. |
| Job Book entry lifecycle | `src/alpha/job-book/jobBookEntryWorkflow.ts` | Shared Intake edit/marker/Void eligibility and bounded required-reason rules across all regional books. Either GT or Timecloud marker blocks Void; the feature hook and existing form dialog handle confirmation/conflict recovery while the API owns exact-record preflight and conditional writes. |
| Job Card workflow boundary | `src/alpha/jobs/types/jobCardWorkflow.ts` | Distinguishes ordinary Azure Job Cards from the retained Site Check workflow and protects assignment removal when history is unavailable or referenced. |
| Saved Azure Job Card PDF | `src/alpha/job-card-reviews/jobCardReviewPdf.ts` | Browser-local paginated export of the authorized saved review only; no mutable Job lookup or private-photo fetch. |
| Azure Job Card photo ZIP | `src/alpha/job-card-reviews/jobCardPhotoDownload.ts` | NZ submission-date filename, safe numbered original-photo ZIP entries, bounded all-or-nothing archive construction and native/fallback save. Hook/API own token acquisition and private reads. |
| Primary Job email | `src/alpha/jobs/hooks/usePrimaryJobEmail.ts` and `services/primaryJobEmailWorkflow.ts` | Shared queue/delivery state, duplicate-send protection, local guard and optional exact-Job/assignment/message preflight. `useJobBookActions` is the bounded row adapter; neither a new mail transport nor a separate email template. |
| Numbered order-book copy | `src/alpha/jobs/utils/jobBookClipboard.ts` | One six-column numbered spreadsheet contract for Jobs and Job Book, including regional numbers, primary/alternate Fleets and Intake snapshots. |
| Editable email drafts | `src/alpha/jobs/utils/technicianMailto.ts` | Shared recipient-email validation and encoded `mailto:` construction. Feature services own subject/body rules and preparation audit. |
| Staff eligibility | `src/alpha/mechanics/staffDirectory.ts` | Department labels, backward-compatible Job-assignment eligibility, and active internal-email-recipient eligibility across Staff, Jobs, Site Checks, and Chargeable Invoice Review. |
| Operational realtime dispatch | `src/alpha/shared/realtime/` plus the feature event validators in `jobsRealtime.ts`, `equipmentRealtime.ts`, and `staffRealtime.ts` | One authenticated app-shell connection validates Job, Equipment, and Staff events, publishes browser-local notifications, coalesces dependent query invalidation, owns reconnect/visibility recovery, and shares resource-only local Job/Equipment invalidations across account/environment-scoped tabs. |
| Equipment CSV tools | `src/alpha/equipment/utils/equipmentCsv.ts` | Admin authorization, UTF-8 CSV serialization/parsing, stable-ID matching, blank-safe comparison, and staged Equipment change review. |

Use feature hooks and services for loading and mutations. Components render values and raise
actions; they do not duplicate Dataverse calls or domain calculations.

## Components Not Currently Shared

There is currently no generic application-wide `DataTable`, `StatusBadge`, `TypeTag`,
`FormField`, `DateField`, `LookupField`, `LoadingSpinner`, `EmptyState`, `Toast`, or separate
`MultiSelect` component.

Before introducing one, confirm that multiple features have the same stable contract. Prefer
extending `SearchableSelect` or the shared drawer primitives when their existing contract
fits. Do not create a generic abstraction solely to remove superficial markup duplication.

## Decision Rules

Before creating a component:

1. Check this inventory and the owning feature.
2. Reuse an existing component when its contract fits.
3. Extend it backward-compatibly when the behaviour is genuinely shared.
4. Keep feature-specific state, validation, permissions, and writes local.
5. Promote a new shared component only when multiple consumers share a stable contract.
6. Update this inventory when a reusable component is added, renamed, moved, or retired.

For the architectural boundary between shared presentation and feature ownership, also see
[Shared Components Architecture](shared-components.md).
