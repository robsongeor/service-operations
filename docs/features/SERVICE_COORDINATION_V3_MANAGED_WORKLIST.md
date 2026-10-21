# Service Coordination V3 — managed worklist release plan

Status: source, signed Dataverse backend, isolated yellow-cliff V3 pilot and operational integrations
deployed; named-role acceptance and live migration remain held.

## Business boundary

- **Job Book** is the complete numbered Auckland Job record.
- **Service Coordination** contains only Jobs a service coordinator has chosen to manage.
- **My Watchlist** is a personal subset of those managed Jobs.
- A Job created in Job Book starts unmanaged.
- A Job created in Service Coordination starts managed.
- Full Access and Service Coordinator users may add a numbered Job Book Job to Service
  Coordination and may stop managing it later.
- Stopping management retains the Job, number, status, assignments, schedules and audit history.
- An unnumbered managed draft cannot be unmanaged; it must use the existing draft deletion path.
- Office Admin and Job Book Admin cannot change coordinator membership.

GreenTree Closed or Finalised Jobs are excluded at the server query boundary. Watchlist reads and
watch creation also require explicit managed membership and the same active GreenTree state.

## Dataverse workflow

`gr_ManageJobBookJob` remains the guarded exact-version membership action.
`gr_UnmanageJobBookJob` is the matching coordinator-only Custom API. It accepts only `JobId` and
`ExpectedJobRowVersion`, rejects Void and unnumbered Jobs, and writes only
`gr_coordinatormanaged=false`. It shares the reviewed coordinator-only execute privilege; Admin
profiles do not receive it. Signed assembly `1.0.24.0` and the six-API manifest were deployed and
independently verified on 21 October 2026. The scoped operation changed no roles, assignments,
workflow steps, business data, seeds or migration state.

## Historical migration dry run

The read-only production snapshot exported at `2026-10-21T04:47:38Z` contained 1,396 Jobs. The
current deterministic plan contains:

| Classification | Count | Treatment |
| --- | ---: | --- |
| Active historical Jobs requiring change | 254 | Set managed `true` and branch Auckland |
| Already Auckland within the active change set | 204 | Membership changes; branch remains Auckland |
| Branchless within the active change set | 50 | Membership changes and branch becomes Auckland |
| GreenTree Closed | 1,142 | Excluded; no write |
| Finalised, Void, inactive or plan exceptions | 0 | No write |

Plan hash:
`6d95606d55fecc00147c8cefb6423d3eb1ab923238ff1f5c14fcbaebdbf912da`

The count can change as real Jobs are created or closed. Therefore the snapshot and plan must be
regenerated immediately before approval. Apply requires the exact approved hash, the original row
ETag, a checkpoint file, the two-field allowlist and a zero-exception Plan. Verification rereads
every active planned row as managed Auckland and every excluded terminal row as unchanged, including
its original ETag. Rollback restores only rows
whose exact post-Apply ETag and values remain unchanged; newer user work is preserved as a conflict.

## Hosting boundary

V2 remains at `kind-wave-0cdea2200.2.azurestaticapps.net`. V3 is deployed to the former V1
yellow-cliff Static Web App from branch `v3-deployment`. Yellow-cliff must not be deleted: it is the
authoritative Job Card backend currently used by V2. The V3 client uses that backend same-origin;
V2 continues through its fixed proxy. Existing Job Card storage/email settings were preserved.

The V3 Service Coordination backend flag is enabled. Anonymous access fails with `401`; an
authenticated George smoke check resolved home branch Auckland, and the empty pre-migration
watchlist contained no invalid managed/terminal rows. With separate explicit approval, exactly the
15 GreenTree and TimeCloud operational settings were copied from V2 to V3 without changing V2 or
replacing any of yellow-cliff's 25 existing settings. All copied values matched their source in a
redacted comparison. Read-only production smoke checks returned 200 from GreenTree, TimeCloud
authentication and TimeCloud search. TimeCloud is configured in production mode with Job creation
enabled; verification did not create or change a Job or TimeCloud record.

## Release gates

1. [x] Review the source diff, plugin package and six-Custom-API manifest.
2. [x] Verify the full automated suite and signed plugin tests.
3. Export a fresh live snapshot and approve its exact plan hash/counts.
4. [x] Deploy and verify assembly `1.0.24.0` plus `gr_UnmanageJobBookJob` without changing human role
   assignments beyond the existing Full/Coordinator privilege boundary.
5. [ ] V3 is deployed to yellow-cliff and the approved GreenTree/TimeCloud settings passed read-only
   production smoke tests. Run Full Access, Service Coordinator, Job Book Admin and Office Admin
   acceptance while V2 remains available.
6. Apply and verify the approved migration, then confirm branch, all-branches and watchlist views.
7. Record explicit go/no-go approval before treating V3 as released.
