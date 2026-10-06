param([switch]$DetailedSteps)

# Offline plan renderer only. No Dataverse connection or mutation operation is present.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$root = Join-Path $repository 'dataverse\job-registration'
$readiness = Get-Content -LiteralPath (Join-Path $root 'readiness-manifest.json') -Raw | ConvertFrom-Json
$contract = Get-Content -LiteralPath (Join-Path $root 'contract.json') -Raw | ConvertFrom-Json
$plan = Get-Content -LiteralPath (Join-Path $root 'deployment-plan.json') -Raw | ConvertFrom-Json
$roles = Get-Content -LiteralPath (Join-Path $repository 'dataverse\access\unified-workflow-role-policy.json') -Raw | ConvertFrom-Json
$roleGrants = Get-Content -LiteralPath (Join-Path $repository 'dataverse\access\unified-workflow-role-grants.json') -Raw | ConvertFrom-Json
$assignments = Get-Content -LiteralPath (Join-Path $repository 'dataverse\access\unified-workflow-assignment-plan.json') -Raw | ConvertFrom-Json

function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Same-Set([object[]]$Left, [object[]]$Right) {
    (@($Left | ForEach-Object { [string]$_ } | Sort-Object -Unique) -join '|') -eq
        (@($Right | ForEach-Object { [string]$_ } | Sort-Object -Unique) -join '|')
}

Require ($plan.status -eq 'dry-run-review-only-not-approved-for-provisioning') 'Deployment plan status is unsafe.'
Require (-not $plan.provisioningIncluded -and -not $plan.deploymentIncluded -and -not $plan.assignmentIncluded -and -not $plan.featureEnableIncluded) 'Dry-run plan must exclude all mutations.'
Require (-not $plan.featureFlagDuringDeployment) 'Feature flag must remain disabled.'
Require (@($readiness.columns).Count -eq 12) 'Expected exactly 12 proposed columns.'
Require (@($readiness.regionalTables).Count -eq 4) 'Expected four regional ledgers.'
Require (@($readiness.customApis).Count -eq 5) 'Expected five Custom APIs.'
Require (@($readiness.customApis | Group-Object name | Where-Object Count -ne 1).Count -eq 0) 'Custom API names must be unique.'
Require (@($roles.profiles).Count -eq 4 -and $roles.default -eq 'deny') 'Expected four default-deny role profiles.'
Require ($roleGrants.status -eq 'approved-for-flag-off-provisioning' -and $roleGrants.baselineRole -eq 'Basic User' -and $roleGrants.depth -eq 'Global') 'Restricted role grant manifest is not approved or uses an unsafe baseline.'
Require (Same-Set @($roleGrants.profiles.profile) @('office','book')) 'Expected exact Office and Book role grant profiles.'
$expandedRolePrivileges = [Collections.Generic.List[object]]::new()
foreach ($grantProfile in $roleGrants.profiles) {
    foreach ($tableProperty in $grantProfile.tables.PSObject.Properties) {
        foreach ($operation in @($tableProperty.Value)) {
            Require (@($roleGrants.alwaysExcludedOperations) -notcontains [string]$operation) "$($grantProfile.profile) grants excluded $operation on $($tableProperty.Name)."
            $expandedRolePrivileges.Add([pscustomobject]@{ profile=[string]$grantProfile.profile; privilege="prv$operation$($tableProperty.Name)" })
        }
    }
}
Require (@($expandedRolePrivileges | Group-Object profile,privilege | Where-Object Count -ne 1).Count -eq 0) 'Duplicate restricted-role privilege detected.'
foreach ($excluded in $roleGrants.alwaysExcludedPrivileges) { Require (@($expandedRolePrivileges | Where-Object privilege -eq $excluded).Count -eq 0) "Restricted role manifest contains excluded privilege $excluded." }
foreach ($api in $readiness.customApis) {
    foreach ($profileName in @('office','book')) {
        $shouldAllow = @($roles.profiles | Where-Object profile -eq $profileName)[0].allowedApis -contains $api.name
        $hasPrivilege = @($expandedRolePrivileges | Where-Object { $_.profile -eq $profileName -and $_.privilege -eq $api.executePrivilege }).Count -eq 1
        Require ($hasPrivilege -eq $shouldAllow) "$profileName ExecutePrivilegeName grant mismatch for $($api.name)."
    }
}
Require (-not $assignments.assignmentIncluded -and -not $assignments.removalIncluded) 'Assignment plan must remain review-only.'
Require (@($assignments.intendedUsers).Count -eq 11) 'Expected the agreed eleven-account roster.'
Require (@($assignments.intendedUsers | Group-Object upn | Where-Object Count -ne 1).Count -eq 0) 'Duplicate roster account detected.'
foreach ($user in $assignments.intendedUsers) { Require (@($roles.profiles | Where-Object profile -eq $user.profile).Count -eq 1) "Unknown target profile for $($user.upn)." }
$roleTestPilots = @($assignments.roleTestPilots)
Require (@($roleTestPilots | Group-Object upn | Where-Object Count -ne 1).Count -eq 0) 'Duplicate role-test pilot detected.'
foreach ($pilot in $roleTestPilots) {
    $rolloutUser = @($assignments.intendedUsers | Where-Object upn -eq $pilot.upn)
    Require ($rolloutUser.Count -eq 1) "$($pilot.upn) must be exactly one rollout user."
    Require ([string]$rolloutUser[0].dataverseAdmission -eq 'present') "$($pilot.upn) is not admitted for role testing."
    Require ([string]$rolloutUser[0].profile -eq [string]$pilot.homeProfile) "$($pilot.upn) test home profile differs from the rollout profile."
    Require (@($pilot.constraints).Count -ge 4) "$($pilot.upn) is missing controlled role-test safeguards."
}

$assemblyTypes = @($plan.assembly.types | ForEach-Object { [string]$_ })
foreach ($api in $readiness.customApis) {
    Require (-not [string]::IsNullOrWhiteSpace([string]$api.executePrivilege)) "$($api.name) is missing ExecutePrivilegeName."
    Require ($assemblyTypes -contains [string]$api.pluginType) "$($api.name) references a plugin type outside the assembly."
    $contractApi = @($contract.apis | Where-Object name -eq $api.name)
    Require ($contractApi.Count -eq 1) "$($api.name) has no unique behavioural contract."
    Require (-not [bool]$contractApi[0].isFunction -and [string]$contractApi[0].binding -eq 'Global' -and [string]$contractApi[0].allowedCustomProcessingStepType -eq 'None') "$($api.name) must remain an unbound action with custom processing disabled."
    Require (Same-Set @($api.requests) @($contractApi[0].parameters.PSObject.Properties.Name)) "$($api.name) request parameters differ from the contract."
    $contractResponse = if ($contractApi[0].PSObject.Properties['response']) { $contractApi[0].response } else { $contract.response }
    Require (Same-Set @($api.responses) @($contractResponse.PSObject.Properties.Name)) "$($api.name) response properties differ from the contract."
}
foreach ($profile in $roles.profiles) {
    $readinessRole = @($readiness.roles | Where-Object profile -eq $profile.profile)
    Require ($readinessRole.Count -eq 1) "Role profile $($profile.profile) is not unique."
    Require (Same-Set @($profile.allowedApis) @($readinessRole[0].allowedApis)) "Role API gate mismatch for $($profile.profile)."
}
foreach ($privilegeGroup in @($readiness.customApis | Group-Object executePrivilege)) {
    $authorizationSets = @($privilegeGroup.Group | ForEach-Object {
        $apiName = [string]$_.name
        (@($roles.profiles | Where-Object { @($_.allowedApis) -contains $apiName } | ForEach-Object profile | Sort-Object) -join ',')
    } | Sort-Object -Unique)
    Require ($authorizationSets.Count -eq 1) "ExecutePrivilegeName $($privilegeGroup.Name) is shared by APIs with different authorized profiles."
}

$steps = [Collections.Generic.List[object]]::new()
$invariant = $plan.guardSteps[0]
Require ($invariant.stage -eq 'PreOperation' -and $invariant.mode -eq 'Synchronous' -and [int]$invariant.executionOrder -eq 10) 'Number invariant step contract changed.'
Require (@($invariant.filteringAttributes).Count -eq 0) 'Number invariant must have no filtering attributes.'
foreach ($table in $invariant.tables) {
    foreach ($message in $invariant.messages) {
        $image = $invariant.images.$message
        $columns = @()
        if ($image) { $columns = if ($table -eq 'gr_job') { @($image.jobColumns) } else { @($image.ledgerColumns) } }
        $steps.Add([pscustomobject]@{ Order=10; Plugin=$invariant.pluginType; Message=$message; Table=$table; Image=$(if ($image) { $image.alias } else { '' }); Columns=($columns -join ',') })
    }
}
$access = $plan.guardSteps[1]
Require ($access.stage -eq 'PreOperation' -and $access.mode -eq 'Synchronous' -and [int]$access.executionOrder -eq 20) 'Restricted-access step contract changed.'
Require (@($access.filteringAttributes).Count -eq 0 -and [bool]$access.secureConfigurationRequired) 'Restricted-access steps require no filters and secure configuration.'
foreach ($registration in $access.registrations) {
    foreach ($table in $registration.tables) {
        $image = $registration.image
        $steps.Add([pscustomobject]@{ Order=20; Plugin=$access.pluginType; Message=$registration.message; Table=$table; Image=$(if ($image) { $image.alias } else { '' }); Columns=$(if ($image) { @($image.columns) -join ',' } else { '' }) })
    }
}
Require ($steps.Count -eq 29) "Expected 29 guard steps; found $($steps.Count)."
Require (@($steps | Where-Object Order -eq 10).Count -eq 15) 'Expected exactly 15 number-invariant registrations.'
Require (@($steps | Where-Object Order -eq 20).Count -eq 14) 'Expected exactly 14 restricted-access registrations.'
Require (@($steps | Where-Object { $_.Message -in @('Update','Delete') -and $_.Plugin -like '*JobNumberInvariantPlugin' -and $_.Image -ne 'Before' }).Count -eq 0) 'Invariant Update/Delete steps require Before images.'
Require (@($steps | Group-Object Plugin,Message,Table | Where-Object Count -ne 1).Count -eq 0) 'Duplicate guard step registration detected.'
Require (Same-Set @($invariant.images.Update.jobColumns) @('gr_jobnumber')) 'Job invariant image columns changed.'
Require (Same-Set @($invariant.images.Delete.jobColumns) @('gr_jobnumber')) 'Job invariant delete image columns changed.'
$ledgerInvariantColumns = @('gr_jobnumber','gr_registeredjob','gr_registrationfingerprint','gr_stage')
Require (Same-Set @($invariant.images.Update.ledgerColumns) $ledgerInvariantColumns) 'Ledger invariant update image columns changed.'
Require (Same-Set @($invariant.images.Delete.ledgerColumns) $ledgerInvariantColumns) 'Ledger invariant delete image columns changed.'
$equipmentAccess = @($access.registrations | Where-Object { $_.message -eq 'Update' -and @($_.tables) -contains 'gr_equipment' })
$jobAccess = @($access.registrations | Where-Object { $_.message -eq 'Update' -and @($_.tables) -contains 'gr_job' })
$ledgerAccess = @($access.registrations | Where-Object { $_.message -eq 'Update' -and @($_.tables) -contains 'gr_jobbookentry' })
Require ($equipmentAccess.Count -eq 1 -and @($equipmentAccess[0].image.columns).Count -eq 0) 'Equipment access image must remain identity-only.'
Require ($jobAccess.Count -eq 1 -and (Same-Set @($jobAccess[0].image.columns) @('gr_registrationvoid'))) 'Job access image columns changed.'
Require ($ledgerAccess.Count -eq 1 -and (Same-Set @($ledgerAccess[0].image.columns) @('gr_stage','gr_registeredjob','gr_promotedjob','gr_entered','gr_timecloudentered'))) 'Ledger access image columns changed.'

Write-Output 'Unified Job workflow deployment dry-run'
Write-Output "Environment: $($plan.environment)"
Write-Output "Solution: $($plan.solutionUniqueName)"
Write-Output 'Mutations: NONE. Feature flag: OFF.'
Write-Output "Schema: $(@($readiness.columns).Count) columns; Registered stage on $(@($readiness.regionalTables).Count) ledgers."
Write-Output "Assembly: $($plan.assembly.name); $($assemblyTypes.Count) plugin types; strong name required."
Write-Output "Custom APIs: $(@($readiness.customApis).Count); every ExecutePrivilegeName is non-empty."
Write-Output "Guard steps: $($steps.Count) synchronous PreOperation registrations; no filtering attributes."
Write-Output "Roles: $(@($roles.profiles).Count) default-deny profiles; secure role IDs required."
Write-Output "Restricted grants: $($expandedRolePrivileges.Count) explicit organization-depth privileges over a Basic User baseline; Delete/Assign/Share excluded."
Write-Output "Assignments: $(@($assignments.intendedUsers).Count) reviewed accounts; $(@($assignments.intendedUsers | Where-Object dataverseAdmission -ne 'present').Count) require target admission review; no assignment operation included."
Write-Output "Role-test pilots: $($roleTestPilots.Count) rollout account(s); sequential role changes remain separately approval-gated."
Write-Output 'Ordered units:'
$index = 0
foreach ($unit in $plan.orderedUnits) { $index++; Write-Output ("  {0}. {1}" -f $index, $unit) }
Write-Output 'Custom APIs:'
$readiness.customApis | Select-Object name, pluginType, executePrivilege | Format-Table -AutoSize
if ($DetailedSteps) { Write-Output 'Expanded guard steps:'; $steps | Sort-Object Order, Plugin, Table, Message | Format-Table -AutoSize -Wrap }
Write-Output 'Rollback is flag-first and preserves schema, numbers, ledgers and completed business history.'
Write-Output 'Dry-run validation passed. No changes were made.'
