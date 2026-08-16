param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [Guid]$RoleId = '3b0845b7-ceb7-48c6-8cf2-a8dd90a20850',
    [Guid]$ApplicationUserId = '4322873e-ce87-f111-ab10-0022489917ff'
)

$ErrorActionPreference = 'Stop'
$pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$pacTools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
if (-not $pacTools) { throw 'Power Apps CLI SDK assemblies were not found.' }
@('Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll') |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $pacTools $_)) | Out-Null }
$connectionString = @('AuthType=OAuth',"Url=$EnvironmentUrl",'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d','RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97','LoginPrompt=Auto') -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

$role = $service.Retrieve('role',$RoleId,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
if ([string]$role['name'] -ne 'Public Portal Service') { throw 'Configured role is not Public Portal Service.' }
$user = $service.Retrieve('systemuser',$ApplicationUserId,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('applicationid','isdisabled'))
if ([bool]$user['isdisabled'] -or [Guid]$user['applicationid'] -ne [Guid]'dfad95a1-0541-47f0-b599-cb09b7181c72') {
    throw 'Configured Public Portal Service Application User is incompatible or disabled.'
}

$query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
$query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
$query.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'prvReadServiceEndpoint')
$privilege = $service.RetrieveMultiple($query).Entities | Select-Object -First 1
if (-not $privilege) { throw 'Dataverse privilege prvReadServiceEndpoint was not found.' }

$retrieve = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
$retrieve.RoleId = $RoleId
$current = ($service.Execute($retrieve)).RolePrivileges | Where-Object { $_.PrivilegeId -eq $privilege.Id } | Select-Object -First 1
if ($current -and $current.Depth -eq [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
    Write-Output 'Public Portal Service already has Organization Read on Service Endpoint.'
} else {
    $entry = [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
    $entry.PrivilegeId = $privilege.Id
    $entry.Depth = [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global
    $add = [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
    $add.RoleId = $RoleId
    $add.Privileges = @($entry)
    $service.Execute($add) | Out-Null
    Write-Output 'Granted Organization Read on Service Endpoint to Public Portal Service.'
}

$verified = ($service.Execute($retrieve)).RolePrivileges | Where-Object { $_.PrivilegeId -eq $privilege.Id } | Select-Object -First 1
if (-not $verified -or $verified.Depth -ne [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
    throw 'Service Endpoint Read privilege verification failed.'
}
Write-Output 'Verified Public Portal Service realtime platform privilege.'
