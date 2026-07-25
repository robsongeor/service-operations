param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [Guid]$RoleId = '3b0845b7-ceb7-48c6-8cf2-a8dd90a20850'
)

$ErrorActionPreference = 'Stop'
$pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$pacTools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1
if (-not $pacTools) { throw "Power Apps CLI SDK assemblies were not found under $pacRoot." }
@('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll') |
    ForEach-Object { [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $_)) | Out-Null }

$connectionString = @(
    'AuthType=OAuth'
    "Url=$EnvironmentUrl"
    'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d'
    'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97'
    'LoginPrompt=Auto'
) -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

$role = $service.Retrieve('role', $RoleId, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
if ([string]$role.Attributes['name'] -ne 'Public Portal Service') {
    throw "Role $RoleId is not Public Portal Service."
}

$privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
$privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
$privilegeQuery.Criteria.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Like, '%gr_%')
$allPrivileges = $service.RetrieveMultiple($privilegeQuery).Entities
$currentRequest = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
$currentRequest.RoleId = $RoleId
$currentIds = [System.Collections.Generic.HashSet[Guid]]::new()
($service.Execute($currentRequest)).RolePrivileges | ForEach-Object { $currentIds.Add($_.PrivilegeId) | Out-Null }

$requiredNames = @(
    'prvAppendTogr_Job',
    'prvCreategr_JobCardSubmissionTimeEntry',
    'prvReadgr_JobCardSubmissionTimeEntry',
    'prvWritegr_JobCardSubmissionTimeEntry',
    'prvAppendgr_JobCardSubmissionTimeEntry',
    'prvCreategr_JobMaterial',
    'prvReadgr_JobMaterial',
    'prvWritegr_JobMaterial',
    'prvAppendgr_JobMaterial',
    'prvCreategr_JobPhoto',
    'prvReadgr_JobPhoto',
    'prvWritegr_JobPhoto',
    'prvAppendgr_JobPhoto'
)

$toAdd = [System.Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
foreach ($name in $requiredNames) {
    $metadata = $allPrivileges | Where-Object { [string]$_.Attributes['name'] -ieq $name } | Select-Object -First 1
    if (-not $metadata) { throw "Required Dataverse privilege was not found: $name" }
    if ($currentIds.Contains($metadata.Id)) {
        Write-Output "Role already has $name"
        continue
    }
    $rolePrivilege = [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
    $rolePrivilege.PrivilegeId = $metadata.Id
    $rolePrivilege.Depth = [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global
    $toAdd.Add($rolePrivilege)
}

if ($toAdd.Count -gt 0) {
    $request = [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
    $request.RoleId = $RoleId
    $request.Privileges = $toAdd.ToArray()
    $service.Execute($request) | Out-Null
    Write-Output "Added $($toAdd.Count) least-privilege entries to Public Portal Service."
} else {
    Write-Output 'Public Portal Service already has all required expanded-submission privileges.'
}

$verify = ($service.Execute($currentRequest)).RolePrivileges
foreach ($name in $requiredNames) {
    $metadata = $allPrivileges | Where-Object { [string]$_.Attributes['name'] -ieq $name } | Select-Object -First 1
    $actual = $verify | Where-Object { $_.PrivilegeId -eq $metadata.Id } | Select-Object -First 1
    if (-not $actual -or $actual.Depth -ne [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
        throw "Role verification failed for $name."
    }
}
Write-Output 'Verified expanded-submission role privileges at Organization depth.'
