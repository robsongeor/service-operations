param(
    [Parameter(Mandatory=$true)][Guid]$ApplicationId,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never'
)

# Read-only identity inspection. It never emits credentials, tokens or business records.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }

$sdkRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$toolsPath = Get-ChildItem -LiteralPath $sdkRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
Require (-not [string]::IsNullOrWhiteSpace($toolsPath)) 'Power Apps CLI SDK assemblies were not found.'
'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll' |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $toolsPath $_)) | Out-Null }

$connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
if ($UserName) { Require ($UserName -match '^[^;\s@]+@[^;\s@]+$') 'Invalid account hint.'; $connection += ";UserName=$UserName" }
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
Require $service.IsReady "Dataverse sign-in failed: $($service.LastCrmError)"

try {
    $userQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuser')
    $userQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid','applicationid','isdisabled')
    $userQuery.Criteria.AddCondition('applicationid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$ApplicationId)
    $users = @($service.RetrieveMultiple($userQuery).Entities)
    Require ($users.Count -eq 1) 'Expected exactly one Dataverse application user for the supplied application ID.'
    $user = $users[0]

    $membership = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuserroles')
    $membership.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid')
    $membership.Criteria.AddCondition('systemuserid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$user.Id)
    $roles = @($service.RetrieveMultiple($membership).Entities | ForEach-Object {
        $role = $service.Retrieve('role',[Guid]$_['roleid'],[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
        [ordered]@{ id=$role.Id; name=[string]$role['name'] }
    })
    [ordered]@{
        applicationId = $ApplicationId
        applicationUserId = $user.Id
        enabled = ($user.Attributes.Contains('isdisabled') -and -not [bool]$user['isdisabled'])
        directRoles = $roles
        mutationsPerformed = $false
    } | ConvertTo-Json -Depth 4
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
