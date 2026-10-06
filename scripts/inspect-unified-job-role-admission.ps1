param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [string[]]$AdditionalUpn = @(),
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Read-only intended-user admission and direct/team role audit. No user creation, licensing,
# role creation, assignment, removal, team change or application mutation is present.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$plan = Get-Content -LiteralPath (Join-Path $repository 'dataverse\access\unified-workflow-assignment-plan.json') -Raw | ConvertFrom-Json

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    $path
}
function Import-Sdk {
    $path = Get-ToolsPath
    'Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll' |
        ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $path $_)) | Out-Null }
}
function Connect-Dataverse {
    $connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
    if (-not [string]::IsNullOrWhiteSpace($UserName)) { $connection += ";UserName=$($UserName.Trim())" }
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}
function Find-Users($Service, [string]$Upn) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuser')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid','domainname','internalemailaddress','isdisabled','accessmode')
    $query.Criteria.FilterOperator = [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    $query.Criteria.AddCondition('domainname', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Upn)
    $query.Criteria.AddCondition('internalemailaddress', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Upn)
    @($Service.RetrieveMultiple($query).Entities | Group-Object Id | ForEach-Object { $_.Group[0] })
}
function Read-RoleNames($Service, [guid]$UserId, [bool]$TeamDerived) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    if ($TeamDerived) {
        $teamRoles = $query.AddLink('teamroles', 'roleid', 'roleid')
        $membership = $teamRoles.AddLink('teammembership', 'teamid', 'teamid')
        $membership.LinkCriteria.AddCondition('systemuserid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $UserId)
    } else {
        $userRoles = $query.AddLink('systemuserroles', 'roleid', 'roleid')
        $userRoles.LinkCriteria.AddCondition('systemuserid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $UserId)
    }
    @($Service.RetrieveMultiple($query).Entities | ForEach-Object { [string]$_['name'] } | Sort-Object -Unique)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $results = [Collections.Generic.List[object]]::new()
    $auditAccounts = [Collections.Generic.List[object]]::new()
    foreach ($intended in $plan.intendedUsers) { $auditAccounts.Add($intended) }
    $knownAccounts = @($plan.intendedUsers | ForEach-Object { ([string]$_.upn).Trim().ToLowerInvariant() })
    foreach ($candidate in $AdditionalUpn) {
        $normalized = ([string]$candidate).Trim().ToLowerInvariant()
        if (-not $normalized -or $knownAccounts -contains $normalized -or @($auditAccounts | ForEach-Object { ([string]$_.upn).Trim().ToLowerInvariant() }) -contains $normalized) { continue }
        if ($normalized -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Invalid additional account UPN: $candidate" }
        $auditAccounts.Add([pscustomobject]@{ upn=$normalized; profile='test-candidate' })
    }
    foreach ($intended in $auditAccounts) {
        $users = @(Find-Users $service ([string]$intended.upn))
        if ($users.Count -ne 1) {
            $results.Add([pscustomobject]@{ Account=$intended.upn; Target=$intended.profile; Admission=$(if ($users.Count) { "CONFLICT ($($users.Count))" } else { 'MISSING' }); DirectRoles=''; TeamRoles='' })
            continue
        }
        $user = $users[0]
        $disabled = $user.Attributes.ContainsKey('isdisabled') -and [bool]$user['isdisabled']
        $direct = @(Read-RoleNames $service $user.Id $false)
        $team = @(Read-RoleNames $service $user.Id $true)
        $results.Add([pscustomobject]@{
            Account = $intended.upn
            Target = $intended.profile
            Admission = if ($disabled) { 'DISABLED' } else { 'Present' }
            DirectRoles = $direct -join ', '
            TeamRoles = $team -join ', '
        })
    }
    $results | Format-Table -AutoSize -Wrap
    $notReady = @($results | Where-Object Admission -ne 'Present')
    Write-Output "Read-only role admission audit completed: $($plan.intendedUsers.Count) intended accounts plus $($results.Count - $plan.intendedUsers.Count) test candidate(s); $($notReady.Count) require admission review. No changes were made."
    if ($notReady.Count) { exit 2 }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
