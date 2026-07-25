# Current State

Branch: `v1-deployment`

## Deployment status

- Version `v1.3.0` contains Technician Job Card Submission Phases 1 and 2 and the modular
  architecture knowledge base.
- The expanded Dataverse schema, relationships, and least-privilege role updates were
  provisioned, published, verified, and passed a second idempotency run on 25 July 2026.
- Version `v1.3.0` is the current production release.
- Production server-only portal settings must be present for public submission endpoints to
  authenticate to Dataverse.

## Unfinished work

- Confirm the four server-only `DATAVERSE_*` settings are present in the production
  Static Web App / Function environment.
- Run a production-safe Technician Job Card smoke test.

## Recent milestone

The local expanded smoke test passed against Dataverse on Job 145408 with two Time & Travel
entries, three Job Materials, two downloadable Job Photos, Further Work, Safety Issue, and
one-time replay protection. Operational Job Status, Completed Date, Equipment relationship,
Equipment hour meter, maintenance, and assignments remained unchanged. The test identified
and fixed the required Dataverse change-set `Content-ID` headers.

## Next task

Verify the production server settings and run the production-safe smoke test. Do not expose
the client secret through Vite or browser configuration. See `TODO.md` for the prioritised
backlog beyond this immediate release task.
