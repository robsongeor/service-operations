# Service Coordination V3 — managed worklist release plan

Status: source, signed Dataverse backend, isolated yellow-cliff V3 pilot, operational integrations
and historical managed/Auckland migration deployed; restricted-user live acceptance and go/no-go
remain open.

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

## Historical migration

The approved read-only production snapshot exported at `2026-10-21T05:12:10Z` contained 1,396
Jobs. Its deterministic plan contained:

| Classification | Count | Treatment |
| --- | ---: | --- |
| Active historical Jobs requiring change | 254 | Set managed `true` and branch Auckland |
| Already Auckland within the active change set | 204 | Membership changes; branch remains Auckland |
| Branchless within the active change set | 50 | Membership changes and branch becomes Auckland |
| GreenTree Closed | 1,142 | Excluded; no write |
| Finalised, Void, inactive or plan exceptions | 0 | No write |

Plan hash:
`7cff8625c2dd0806d05d7bd97c418b9b759dbe9cdd8775fdfabc3d53ab4352ec`

The owner explicitly approved that exact hash. Apply used the original row ETags, checkpoint file,
two-field allowlist and zero-exception plan. Its audit recorded 207 updates, three already-applied
rows and 44 conditional PATCH races; every invocation used the same approved hash and proposed
values. A fresh authoritative snapshot at `2026-10-21T05:18:23Z` verified all 254 active planned
rows as managed Auckland and every one of the 1,142 excluded terminal rows unchanged at its original
state and ETag. There were zero mismatches and zero missing rows. Rollback remains conflict-safe: it
restores only rows whose exact post-Apply ETag and values remain unchanged, preserving newer work.

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

## Acceptance evidence

On 21 October 2026, the live V3 Full Access walkthrough passed without creating or changing a Job.
It loaded the 254-record managed worklist, resolved George's home branch to Auckland, switched
between Home branch, All branches and the empty personal watchlist, opened and cancelled the
Service Coordination create drawer, and displayed the Job Book membership controls. A fresh
read-only roster audit verified all 13 enabled named users have exactly their intended application
role and matching Dataverse workflow role, with no broader overlapping workflow role.

The isolated local walkthrough then verified the restricted UI boundaries: Office Admin and Job
Book Admin cannot open Service Coordination; Job Book Admin cannot email technicians or change
coordinator membership; Service Coordinator can add an unmanaged numbered Job Book entry, stop
managing a managed Job and open the managed worklist. The focused access, workflow and Job Book
suites passed 289 tests. This simulation does not replace a sign-in under each restricted production
account.

The audit also found seven Auckland rollout users without a Dataverse home branch: Jess, Nargiza,
Martin, Lance, Ranjani, Ashneel and Kaizer. They were added to the reviewed Auckland mapping, and
the owner approved each exact single-user production plan. Apply changed only
`gr_homebranch=122830000`. The automatic live Verify step reported one verified row, zero
mismatches and `onboardingComplete: true` for every user. Home branch remains a default rather than
an access boundary: participating Service Coordinators may still select All branches, while regional
Job Book creation uses the explicitly selected regional book.

## Release gates

1. [x] Review the source diff, plugin package and six-Custom-API manifest.
2. [x] Verify the full automated suite and signed plugin tests.
3. [x] Export a fresh live snapshot and approve its exact plan hash/counts.
4. [x] Deploy and verify assembly `1.0.24.0` plus `gr_UnmanageJobBookJob` without changing human role
   assignments beyond the existing Full/Coordinator privilege boundary.
5. [ ] V3 is deployed to yellow-cliff and the approved GreenTree/TimeCloud settings passed read-only
   production smoke tests. Full Access live acceptance and the restricted-role simulation passed;
   run Service Coordinator, Job Book Admin and Office Admin acceptance under real named accounts
   while V2 remains available.
6. [x] Apply and independently verify the approved migration; the authenticated watchlist boundary
   returned 200 with no invalid managed/terminal rows.
7. [x] Apply and verify the seven approved Auckland home-branch plans. Run named-role branch,
   all-branches, membership and watchlist UI acceptance under real restricted accounts.
8. Record explicit go/no-go approval before treating V3 as released.
