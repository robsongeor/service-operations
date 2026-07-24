# Reusable Components

This is the first UI inventory to consult before implementing a component or workflow.
Reuse or extend an existing contract when it fits; do not assume a generic component exists
because a similar visual pattern appears in more than one feature.

## Shared Presentation Primitives

| Component | Location | Use |
| --- | --- | --- |
| `EditDrawerShell` | `src/alpha/shared/drawer/EditDrawerShell.tsx` | Standard right-hand drawer layout, header, loading state, actions, and close behaviour. |
| `EditDrawerSection` | `src/alpha/shared/drawer/EditDrawerSection.tsx` | Consistent grouping and spacing inside drawers. |
| `EditDrawerConfirmation` | `src/alpha/shared/drawer/EditDrawerConfirmation.tsx` | Confirmation within drawer workflows, including destructive or consequential actions. |
| `EditDrawerFormDialog` | `src/alpha/shared/drawer/EditDrawerFormDialog.tsx` | Small supporting form dialog opened from a drawer. |
| `DrawerTabs` | `src/alpha/shared/drawer/DrawerTabs.tsx` | Accessible, responsive drawer tab navigation with active and validation-error states. |
| `SearchableSelect` | `src/alpha/shared/searchable-select/SearchableSelect.tsx` | Searchable, keyboard-accessible selection. Supports single selection and optional backward-compatible multi-selection. Consumers own selected-item summaries and removal UI. |
| `FormSwitch` | `src/alpha/shared/form-switch/FormSwitch.tsx` | Compact accessible boolean switch with visible state text, keyboard behavior, disabled state, and focus styling. |
| `MetricStrip` | `src/alpha/shared/metric-strip/MetricStrip.tsx` | Compact, wrapping dashboard summary of semantic label/value pairs with optional warning and danger emphasis. |
| `PageHeader` | `src/alpha/shared/page-header/PageHeader.tsx` | Standard sticky management-page header with optional eyebrow, subtitle, and responsive action area. |

Use the shared drawer CSS and interaction patterns with these components. Feature state,
validation, permissions, and Dataverse writes remain in the owning feature.

## Feature-Owned Reusable Workflows

These are not generic primitives, but they are the canonical implementations for their
business workflow and should be embedded through thin feature adapters when needed.

| Component | Location | Use |
| --- | --- | --- |
| `JobEditDrawer` | `src/alpha/jobs/components/JobEditDrawer.tsx` | Manager-facing Job details and editing. Do not build a feature-specific Job editor. |
| `JobCreateDrawer` | `src/alpha/jobs/components/JobCreateDrawer.tsx` | Standard Job creation, including pre-populated values and constrained Job Type options. |
| `JobDrawerShell` | `src/alpha/jobs/components/JobDrawerShell.tsx` | Job-specific composition of the shared drawer shell. |
| `EquipmentDrawer` | `src/alpha/equipment/components/EquipmentDrawer.tsx` | Primary Equipment create/edit workflow and its related operational information. |
| `EquipmentDataQualityIndicator` | `src/alpha/equipment/components/EquipmentDataQualityIndicator.tsx` | Keyboard-accessible Critical/Warning Equipment data-quality disclosure used by Equipment lists. |
| `CustomerDrawer` | `src/alpha/customers/CustomerDrawer.tsx` | Primary Customer editing workflow. |
| `WofEditorDrawer` | `src/alpha/wof/components/WofEditorDrawer.tsx` | WOF/REGO record editing. |
| `WofJobDrawer` | `src/alpha/wof/components/WofJobDrawer.tsx` | Thin WOF adapter around the existing Job drawer and Job loading flow. |
| `BulkEquipmentImportDrawer` | `src/alpha/equipment/components/BulkEquipmentImportDrawer.tsx` | Existing bulk Equipment import workflow. |
| `EquipmentTransferDrawer` | `src/alpha/customers/EquipmentTransferDrawer.tsx` | Existing multi-equipment Customer/Site transfer workflow. |

Tables are currently feature-owned (`JobsTable` and `EquipmentTable`). Reuse their established
compact styling and interaction patterns where appropriate, but do not treat them as a
generic `DataTable`.

## Shared Business and Domain Logic

Business rules must have one owner even when several screens display the result.

| Owner | Location | Responsibility |
| --- | --- | --- |
| Equipment compliance | `src/alpha/equipment/compliance/equipmentCompliance.ts` | Road-compliance eligibility and related choices. |
| Equipment data quality | `src/alpha/equipment/dataQuality/equipmentDataQuality.ts` | Shared identity, road-compliance, and recorded maintenance-history evaluation. |
| WOF rules | `src/alpha/wof/utils/wofRules.ts` | WOF workflow/status derivation and Date Only handling. |
| Maintenance configuration | `src/alpha/equipment/servicePlans/maintenanceConfiguration.ts` | Maintenance configuration rules. |
| Service-plan calculations | `src/alpha/equipment/servicePlans/servicePlanCalculations.ts` | Service-plan calculations. |
| Service-plan status | `src/alpha/equipment/servicePlans/servicePlanStatus.ts` | Maintenance/service-plan status derivation. |
| Job completion | `src/alpha/jobs/completion/` | Job completion orchestration and completion-side effects. |

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
