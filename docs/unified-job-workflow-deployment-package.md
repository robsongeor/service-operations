# Unified Job workflow — deployment package review

Status: validated signed local package. No Dataverse provisioning, plugin/API registration, role
assignment, application deployment or feature enablement has occurred.

## Dry-run result — 6 October 2026

The offline planner validates one ordered compatible deployment unit:

1. Preflight and export current schema, app assignments, direct/team Dataverse roles and settings.
2. Add 12 nullable columns and Registered `122830004` to four regional ledger Choice definitions.
3. Upload one owner-approved strong-name-signed `ServiceOperations.UnifiedJobWorkflow` `1.0.0.0`
   sandbox assembly containing four plugin types.
4. Create five synchronous global Custom APIs with exact request/response contracts and non-empty
   `ExecutePrivilegeName` values.
5. Register 29 synchronous PreOperation guard steps with no filtering attributes: 15 number-invariant
   steps at order 10 and 14 restricted-access steps at order 20. Every required Update/Delete step
   has its exact `Before` image.
6. Create/reconcile four default-deny access profiles and inject verified Dataverse role IDs through
   secure plugin configuration.
7. Deploy the compatible application while `VITE_UNIFIED_JOB_WORKFLOW_ENABLED=false`.
8. Run controlled allowed/denied tests with all four profiles and all four regional books.
9. Treat feature enablement as a later, separate approval.

The approved live read-only sequence check confirmed all four expected AutoNumber formats and all
four Active unique Job-number keys. Current maximum/provisional next evidence is Auckland
`147173`/`147174`, Waikato `WJ1547`/`WJ1548`, Hastings `HJ12252`/`HJ12253`, and Christchurch
`CJ23858`/`CJ23859`. These are not approved seeds and must be recalculated immediately before cutover.

Machine-readable sources:

- [`deployment-plan.json`](../dataverse/job-registration/deployment-plan.json)
- [`readiness-manifest.json`](../dataverse/job-registration/readiness-manifest.json)
- [`contract.json`](../dataverse/job-registration/contract.json)
- [`unified-workflow-role-policy.json`](../dataverse/access/unified-workflow-role-policy.json)
- [`unified-workflow-assignment-plan.json`](../dataverse/access/unified-workflow-assignment-plan.json)

Render and validate the plan offline:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/plan-unified-job-workflow-deployment.ps1 -DetailedSteps
```

## Assembly readiness

`scripts/build-unified-job-workflow-plugin.ps1 -Mode Verify` compiles all four plugin types to a
temporary assembly, verifies the `1.0.0.0` identity and plugin type set, emits assembly/source hashes,
then removes the temporary output. Verification passed.

`-Mode Package` refuses to run without both an existing owner-approved strong-name key and an output
directory. It never creates a key, connects to Dataverse or deploys the result. The reviewed local
package was produced on 6 October 2026 with assembly version `1.0.0.0`, public key token
`0edea2881bb8578c` and assembly SHA-256
`621a914b204f0c1bef8243924212fe3533c6ef4f7cf8e558cbae0351b10af45f`. Its manifest hash and token
match the DLL, and all four plugin types load with the Dataverse SDK. Production use remains blocked
until key recovery is proven and the separate provisioning gates are approved.
The reviewed `r2` package adds the exact registration/allocation child-write boundary required by
the restricted roles. The original non-`r2` package is superseded and must not be deployed.
The [signing-key custody policy](unified-job-workflow-signing-key.md) requires the private `.snk` to
remain outside the repository, prevents artifact overwrite, and retains only the public token plus
assembly/source hashes in the package manifest.

## Role and assignment readiness

The review-only assignment plan preserves the agreed eleven-account roster: one Full, two
Coordinator, two Office Admin and six Job Book Admin users. Eight accounts still require Dataverse admission and
licensing review. Existing unrelated assignments are explicitly preserved. Bruce retains current
FullAccess until the added Coordinator path passes with his real account; old access is removed only
after the replacement succeeds.

Pubudu was the third Office Admin rollout user and live Office Admin pilot. The replacement Office
Admin role was verified and the broader `Service Operations` role was removed with exact before/after
verification on 7 October 2026. The broader role was then temporarily restored, additively, for
permission-gap diagnosis, and the Entra `ServiceOperations.ServiceCoordinator` role was temporarily
assigned for the restricted Service Operations Manager test. Both temporary additions were removed
with exact before/after verification on 7 October 2026; the Office Admin assignments and unrelated
roles were preserved. On 9 October 2026 Pubudu was switched from Office Admin to Job Book Admin in
both Entra and Dataverse; unrelated roles and the legacy JobBookOnly app assignment were preserved.
The shared backend reviewer allowlist still requires a Contributor to remove Pubudu and verify denial.
Repeat the Job Book Admin denial tests before production sign-off. The
cutover requires a fresh assignment export, one workflow role at a time, preservation of
unrelated platform roles and explicit approval. Pubudu performs the account sign-in and MFA; no
credential is collected.

The approved live read-only admission recheck on 6 October 2026 found George, Bruce and Pubudu present.
George currently holds Basic User, Site Check Checklist Administrator and System Administrator;
Bruce holds Service Operations. Pubudu now holds Service Operations - Job Book Admin. Andy, Jess, Nargiza, Martin, Lance, Ranjani, Ashneel and Kaizer are
still absent from Dataverse. No intended account had a returned team-derived role in this audit.

The secure plugin configuration requires the exact business-unit Dataverse role IDs for Full,
Coordinator, Office and Book profiles. Any overlapping direct/team grant that restores a denied
capability is a stop condition. The separate Job Card reviewer allowlist must be reconciled for Full,
Coordinator and Office only.

## Rollback

Rollback is flag-first. Disable the unified flag, disable the new APIs/steps as one reviewed unit and
redeploy the last compatible flag-off application. Restore changed assignments from the immediate
pre-change export. Retain nullable schema, numbers, ledgers, links and completed business history;
never delete or renumber records as generic rollback.

## Remaining approval blockers

- The Entra `ServiceOperations.ServiceCoordinator` application role is provisioned and assigned
  additively to Bruce. Complete his named-user acceptance test, then remove temporary FullAccess only
  after the restricted role passes.
- Keep the 15 shared Dataverse Job number/ledger invariant steps disabled while V1 still requires
  manual Job Number entry. V2 blocks manual entry in its frontend during this explicitly accepted
  overlap. When V1 is retired or migrated, enable and verify the invariant steps as a separate
  cutover so direct Dataverse, integration and stale-client writes are also rejected.
- Complete signing-key recovery backup; the owner-approved key and corrected `r2` package exist.
- Capture secure restricted-role IDs after role creation; the exact 29 registrations are validated offline.
- Admit/license the eight missing Dataverse users and select controlled pilot accounts.
- Approve AutoNumber cutover ownership and recalculate the verified provisional sequence evidence.
- Approve package output, provisioning window, backup/export owner and rollback operator.
- Approve provisioning separately; later approve feature enablement separately again.

## Validation

The offline planner now verifies the complete API request and response property sets, action binding
and processing policy, unique API names, exact authorized-profile sets for every shared
`ExecutePrivilegeName`, the 15 number-invariant plus 14 restricted-access registrations, and every
required pre-image column. The strengthened plan and all 46 compiled plugin tests pass. The refreshed
read-only target audit confirmed all four proposed privilege names exist and every current
`System Administrator` and `Service Operations` business-unit role record passes its intended API
privilege gate. The Office Admin and Job Book Admin roles do not yet exist, so their final role IDs
and privilege sets can only be captured after separately approved role provisioning.

- dry-run planner: passed;
- temporary assembly compilation/type/version verification: passed;
- full application suite: 785 tests passed;
- focused workflow suite: 50 tests passed;
- compiled workflow plugin checks: 46 passed;
- compiled restricted-access checks: 64 passed;
- production application build, PowerShell parsing, JSON validation and diff checks: passed.
