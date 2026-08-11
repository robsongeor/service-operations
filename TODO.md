# Service Operations Backlog

This is the authoritative prioritised backlog. Architecture belongs in `docs/architecture/`;
temporary release readiness belongs in `CURRENT_STATE.md`; completed work belongs in
`CHANGELOG.md`.

## Priority 0 — Production readiness

- [ ] Configure and verify the production server-only `DATAVERSE_URL`,
  `DATAVERSE_TENANT_ID`, `DATAVERSE_CLIENT_ID`, and `DATAVERSE_CLIENT_SECRET` settings.
- [ ] Run a production-safe Technician Job Card submission smoke test covering link
  generation, public lookup, submission, manager review, photo download, and replay
  rejection.

## Priority 1 — Security and reliability

- [ ] Replace the client-side Equipment CSV administrator email restriction with an
  authoritative server or Dataverse permission boundary.
- [ ] Review non-atomic multi-record workflows outside Service completion and Technician
  submission; document recovery behaviour or make them atomic where business consistency
  requires it.
- [ ] Define cleanup and retention for retry-staged Job Photo rows when a technician never
  completes the submission.
- [ ] Add production monitoring for public portal authentication, submission failures, and
  repeated temporary errors without logging secrets or submission content.

## Priority 2 — Product improvements

- [ ] Deliver the planned manager-only Chargeable Invoice Review workflow: Phases 1–6 are complete locally; continue Phase 7 retention/recovery decisions, de-identified manager/accessibility/performance smoke, role assignment and release validation. See [`docs/features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md`](docs/features/CHARGEABLE_INVOICE_REVIEW_IMPLEMENTATION_PLAN.md); role assignment and deployment retain explicit approval gates.
- [x] Implement Site Check temporary Equipment availability:
  enabled-Site-only marker, In Workshop/Temporarily Off-site exclusion, and occurrence
  exclusion snapshots; no catch-up Jobs.

- [ ] Deliver the approved Site Checks operational expansion in
  [`docs/features/SITE_CHECKS_IMPLEMENTATION_PLAN.md`](docs/features/SITE_CHECKS_IMPLEMENTATION_PLAN.md):
  cross-customer workspace, one-link bulk technician dispatch, versioned per-machine
  checklists, guided multi-machine submission, and reviewed findings. Phases 15–18 retain
  explicit schema/security approval gates.
- [ ] Add versioned Site Check checklist administration for
  `georger@liftrucks.co.nz`, including a dedicated least-privilege Dataverse role and
  immutable publish-new-version workflow; see Phase 19 of the Site Checks tracker.
- [ ] Complete persistent Customer creation and Customer-level information management;
  current Customer-level behaviour still includes local prototype boundaries.
- [ ] Decide whether Job Materials need quantity, part number, stock lookup, or inventory
  integration. Keep the technician label as **Parts** unless the user workflow changes.
- [ ] Consider technician/assignment grouping for time entries and submission evidence.
- [ ] Decide whether Further Work and Safety Issues should create reviewed office actions,
  Quotes, or follow-up Jobs. Do not automate these directly from technician input without
  an office approval step.

## Priority 3 — Quality and maintainability

- [ ] Add production-oriented end-to-end coverage for the highest-risk Job, WOF,
  maintenance, Equipment transfer, CSV import, and technician portal workflows.
- [ ] Review the current production bundle-size warning and introduce code splitting only
  where it materially improves load performance.
- [ ] Keep the modular knowledge base current and remove superseded limitations from release
  notes when their replacement is implemented.

## Backlog rules

- Add work here only when it is agreed, actionable, and not merely an architectural
  extension possibility.
- Link complex work to its authoritative architecture document rather than duplicating the
  design here.
- Move the currently active item to `CURRENT_STATE.md`.
- Remove completed items from this file and record user-visible results in `CHANGELOG.md`.
- Do not treat a checkbox as authorisation to provision, deploy, create credentials, send
  communications, or make destructive changes.
