# Current State

Branch: `codex/azure-job-card-review`

## Deployment status

- Version `v1.3.0` contains Technician Job Card Submission Phases 1 and 2 and the modular
  architecture knowledge base.
- The expanded Dataverse schema, relationships, and least-privilege role updates were
  provisioned, published, verified, and passed a second idempotency run on 25 July 2026.
- Version `v1.3.0` is the current production release.
- Production server-only portal settings must be present for public submission endpoints to
  authenticate to Dataverse.

## Unfinished work

- Provision the documented Azure Table, private Blob container, retention automation, and
  optional Azure Communication Services Email configuration.
- Configure server-only settings and run a production-safe Technician Job Card smoke test.
- Retire the legacy portal Application User only after confirming no other workflow uses it.

## Current implementation milestone

Technician public requests now use Azure Table/Blob storage only. Licensed office link
generation creates a minimum Dataverse snapshot with the office user's delegated token.
Submissions create an authenticated pending-review item and optional ACS email; no
technician action writes Dataverse. Local tests use memory storage and no real email.

## Previous production milestone

The local expanded smoke test passed against Dataverse on Job 145408 with two Time & Travel
entries, three Job Materials, two downloadable Job Photos, Further Work, Safety Issue, and
one-time replay protection. Operational Job Status, Completed Date, Equipment relationship,
Equipment hour meter, maintenance, and assignments remained unchanged. The test identified
and fixed the required Dataverse change-set `Content-ID` headers.

## Next task

Review infrastructure configuration, deploy through the approved release process, and run
the storage/replay/review smoke test. Do not expose Storage or ACS secrets through Vite.
