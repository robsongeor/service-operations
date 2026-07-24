# Shared Components Architecture

## Purpose

Shared components provide consistent presentation and interaction patterns without taking
ownership of feature state or business rules.

## Architecture

Feature screens compose tables, drawers, and page controls. Components render values and
raise actions; hooks coordinate state; services access Dataverse; pure helpers calculate
and validate domain state.

The shared layer contains presentation primitives and genuinely cross-feature helpers.
Feature-specific forms, mappings, and workflows remain with their owning feature.

## Shared Components and APIs

- Shared drawer shell, sections, confirmation, and small form dialog provide consistent
  panel and modal presentation.
- `SearchableSelect` combines search and selection for related records.
- Account helpers provide one source of truth for signed-in identity and preference keys.
- Domain calculation, Date Only, validation, and compliance helpers are reused wherever the
  same rule appears.
- Shared table metadata should own column labels, order, widths, and sticky offsets.

## Important Business Rules

- Shared presentation must not embed feature-specific Dataverse writes.
- User preferences are scoped to the resolved signed-in account.
- Loading, empty, failure, validation, and destructive-confirmation states are explicit.
- Successful mutations update local state or reload authoritative data; browser refresh is
  not a state-management strategy.
- Business rules have one owner and are not copied between screens.

## Extension Points

Promote a component or helper only when multiple features share the same stable contract.
Keep extension APIs typed and presentation-focused. Add feature adapters when shared UI needs
feature-owned data.

## Implementation Constraints

Do not create a universal component that couples unrelated feature workflows. Reuse existing
CSS and interaction patterns. Keep accessibility, keyboard behavior, and destructive
confirmation consistent across consumers.
