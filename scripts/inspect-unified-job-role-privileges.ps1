param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [string[]]$RoleNames = @('Basic User', 'Service Operations - Job Book Only', 'Service Operations'),
    [string]$PrivilegePattern = '^prv[A-Za-z]+gr_',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Read-only security-role privilege inventory. No role, privilege, assignment or data mutation exists.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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
function Read-All($Service, $Query) {
    $rows = [Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
    $Query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $Query.PageInfo.Count = 5000
    $Query.PageInfo.PageNumber = 1
    do {
        $page = $Service.RetrieveMultiple($Query)
        foreach ($row in $page.Entities) { $rows.Add($row) }
        if ($page.MoreRecords) { $Query.PageInfo.PageNumber++; $Query.PageInfo.PagingCookie = $page.PagingCookie }
    } while ($page.MoreRecords)
    @($rows)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('privilegeid','name')
    $privilegeNames = @{}
    foreach ($row in @(Read-All $service $privilegeQuery)) { $privilegeNames[$row.Id] = [string]$row['name'] }

    $result = [Collections.Generic.List[object]]::new()
    foreach ($roleName in $RoleNames) {
        $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
        $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name','businessunitid','ismanaged')
        $query.Criteria.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $roleName)
        $roles = @($service.RetrieveMultiple($query).Entities)
        if ($roles.Count -ne 1) { throw "Expected exactly one role named $roleName; found $($roles.Count)." }
        $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
        $request.RoleId = $roles[0].Id
        $grants = @($service.Execute($request).RolePrivileges | ForEach-Object {
            [pscustomobject]@{ name=$privilegeNames[$_.PrivilegeId]; depth=[string]$_.Depth }
        } | Sort-Object name)
        $result.Add([pscustomobject]@{
            role = $roleName
            roleId = $roles[0].Id
            managed = [bool]$roles[0]['ismanaged']
            totalPrivilegeCount = $grants.Count
            matchedPrivilegeCount = @($grants | Where-Object name -match $PrivilegePattern).Count
            matchedPrivileges = @($grants | Where-Object name -match $PrivilegePattern)
        })
    }
    $result | ConvertTo-Json -Depth 6
    Write-Output 'Read-only role privilege inventory completed. No changes were made.'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
