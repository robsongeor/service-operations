# Codex Pre-Prompt

Use these instructions before every Service Operations task.

## Start

1. Read `AI_CONTEXT.md`, `CURRENT_STATE.md`, and `docs/README.md`.
2. Run:

   ```bash
   git status --short
   git branch --show-current
   git log -3 --oneline
   ```

3. Use `docs/README.md` to select only the relevant architecture and schema documents.
4. Inspect only directly related source files and immediate dependencies.
5. Briefly summarise the existing architecture, reusable components/services, data model,
   business-rule owners, intended scope, and risks before implementing.

Do not perform a full repository scan unless explicitly required. Preserve unrelated
working-tree changes.

## Dataverse and sign-in efficiency

- Prefer confirmed schema documentation, source contracts, and existing verification output
  before making a live Dataverse request.
- Consolidate required live metadata inspection into one read-only session and one batched
  request plan. Reuse the same authenticated service/token for the whole phase.
- Do not run several scripts that each create a new interactive Dataverse connection when
  one combined inspection or provisioning script can perform the work.
- Never trigger an interactive sign-in merely to inspect local code or documentation.
- Before running a command that may open a Dataverse or Microsoft sign-in prompt, state why
  live access is required and obtain the user's approval. Do not automatically repeat a
  failed or cancelled sign-in prompt.
- Provisioning scripts must support read-only preflight and must create one connection per
  invocation. Provision, publish, and post-verify in the same approved invocation where safe.
- In application code, acquire delegated tokens silently through the active-account helper.
  Do not call login redirect/popup from feature rendering, background refresh, or retry
  loops. An interaction-required result must become one explicit user action.

## Implement

- Reuse existing shared components and canonical feature workflows.
- Components render; hooks coordinate; services access Dataverse; domain helpers own rules.
- Keep changes localised and avoid duplicate or unrelated refactoring.
- Preserve historical operational records.
- Use authoritative IDs, relationships, logical names, and named Choice constants.
- Avoid N+1 requests and use atomic, concurrency-safe workflows where consistency requires.
- Refresh authoritative affected data after successful mutations.
- Follow the security boundaries in `AI_CONTEXT.md`.

Consult `docs/architecture/reusable-components.md` before creating UI.

## Keep Documentation Current

Documentation is part of implementation. Update the authoritative owner when behaviour or
architecture changes:

- `AI_CONTEXT.md`: durable project-wide rules or boundaries only.
- `CURRENT_STATE.md`: branch, readiness, unfinished work, blockers, and next task.
- `TODO.md`: prioritised backlog; update when agreed work is added, completed, reprioritised,
  or removed.
- `docs/architecture/<subsystem>.md`: workflows, UI, services, rules, security, or extension
  points.
- `docs/architecture/reusable-components.md`: reusable components or business-rule owners.
- `docs/<schema>.md`: Dataverse contracts, permissions, or provisioning status.
- `docs/README.md`: document additions, moves, or reading routes.
- `README.md`: top-level setup or navigation.

Avoid duplicating explanations; update one authoritative document and cross-link it. If no
documentation change is required, state why in the final report.

## Validate

For normal implementation work, run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Verify relevant tests, documentation links, scope, and absence of secrets. Report
pre-existing failures separately.

## Authority

Do not commit, push, merge, deploy, provision Dataverse, change cloud configuration, create
credentials, or send real communications unless explicitly requested.

## Report

Summarise changes, reuse, data/API impact, validation, documentation updates, blockers, and
remaining deployment or manual work.
