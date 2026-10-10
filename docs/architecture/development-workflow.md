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

### Read-only local Job Card preview

The normal Vite middleware mirrors V2's temporary shared-backend hand-off when the ignored local
setting `VITE_JOB_CARD_SHARED_BACKEND=v1-production` is explicitly present. It uses the same bounded
submission/review proxy as deployed V2, forwards only the delegated Dataverse authorization header
and still relies on the shared backend's reviewer allowlist. This mode can perform permitted writes;
use it only for deliberate live development under an approved reviewer identity.

After explicit approval to read live Job Cards, a local launcher can add the opt-in Vite plugin
`scripts/dev/jobCardReadOnlyProxy.mjs` while keeping the normal application configuration. It is not
installed by default and does not participate in production builds. Use existing ignored local
Microsoft settings and a loopback-only server with outbound HTTPS access; never copy Azure storage
keys or bypass office authentication to populate a preview.

The plugin runs before the ordinary local Job Card handler and sends only authenticated review GETs
to the fixed production origin. The live API still validates the delegated identity and reviewer
allowlist. Queue/history/detail/photo reads are supported; non-GET review methods are rejected locally
with 405. It forwards only the delegated header and Accept, rejects redirects, bounds response size
and duration, and returns private/no-store responses. It does not cache/log tokens, forward cookies,
or proxy other API routes. UI writes are also disabled and a live/read-only notice is shown through
the development-only `VITE_JOB_CARD_READ_ONLY` flag supplied by the plugin. Other application areas
retain their normal permissions. The server-side method gate, not the flag, is the write boundary.

Synthetic proxy tests cover authentication, method/route restrictions, header isolation, private photo
bytes, error/redirect/size failure handling and plugin ordering. Do not use real mutations for a
read-only smoke check. Current machine-local launch details belong in `CURRENT_STATE.md`.

### Other administrative actions

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
