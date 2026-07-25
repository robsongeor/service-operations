# Development Workflow

## Starting a task

1. Read `AI_CONTEXT.md` and `CURRENT_STATE.md`.
2. Verify `git status --short`, the current branch, and the last three commits.
3. Use [`docs/README.md`](../README.md) to choose only the relevant architecture and schema
   documents.
4. Inspect the smallest directly related source-file set and its immediate dependencies.
5. Preserve unrelated working-tree changes.

## Implementation rules

- Reuse shared components and established feature workflows.
- Keep business rules in their existing domain owner.
- Keep Dataverse requests in services, not components.
- Use strong TypeScript types and named Choice constants.
- Keep changes localised and avoid unrelated refactoring.
- Update authoritative documentation when architecture or schema changes.

## Validation

Normal full validation is:

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Use narrower checks while iterating, then run the full set once before handoff. Report
pre-existing failures separately.

## Administrative actions

Code changes do not imply permission to provision Dataverse, deploy, commit, push, create
credentials, or change cloud configuration. Perform those actions only when explicitly
requested, using read-only preflight and post-action verification.

## Documentation ownership

- `AI_CONTEXT.md`: durable project-wide rules and document routing.
- `CURRENT_STATE.md`: current branch, readiness, unfinished work, and blockers.
- `docs/architecture/`: subsystem and cross-cutting architecture.
- `docs/*.md`: detailed schemas and operational references.
- `CHANGELOG.md` and Git history: completed release history.

## Related documents

- [Knowledge base index](../README.md)
- [Reusable components](reusable-components.md)
- [Dataverse](dataverse.md)
- [Deployment](deployment.md)
