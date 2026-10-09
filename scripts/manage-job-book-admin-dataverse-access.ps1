param(
    [ValidateSet('Verify', 'SwitchPilot', 'SwitchToOfficeAdmin')]
    [string]$Mode = 'Verify',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$PilotUpn = 'pubudu@liftrucks.co.nz',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
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
function Find-User($Service, [string]$Upn) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuser')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid', 'domainname', 'internalemailaddress', 'isdisabled', 'businessunitid')
    $query.Criteria.FilterOperator = [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    $query.Criteria.AddCondition('domainname', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Upn)
    $query.Criteria.AddCondition('internalemailaddress', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Upn)
    @($Service.RetrieveMultiple($query).Entities | Group-Object Id | ForEach-Object { $_.Group[0] })
}
function Get-DirectRoles($Service, [Guid]$UserId) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid', 'name', 'businessunitid', 'ismanaged')
    $link = $query.AddLink('systemuserroles', 'roleid', 'roleid')
    $link.LinkCriteria.AddCondition('systemuserid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $UserId)
    @($Service.RetrieveMultiple($query).Entities | Sort-Object { [string]$_['name'] })
}
function Find-Role($Service, [string]$Name, [Guid]$BusinessUnitId) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid', 'name', 'businessunitid', 'ismanaged')
    $query.Criteria.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Name)
    $query.Criteria.AddCondition('businessunitid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $BusinessUnitId)
    @($Service.RetrieveMultiple($query).Entities)
}
function Write-RoleSummary([string]$Label, $Roles) {
    Write-Output "$Label for $PilotUpn`:"
    foreach ($role in $Roles) { Write-Output "- $($role['name']) [$($role.Id)]" }
}

Import-Sdk
$service = Connect-Dataverse
try {
    $who = $service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    Write-Output "Connected Dataverse operator $($who.UserId)."
    $users = @(Find-User $service $PilotUpn)
    Require ($users.Count -eq 1) "Expected one Dataverse user for $PilotUpn; found $($users.Count)."
    $user = $users[0]
    Require (-not [bool]$user['isdisabled']) "The Dataverse user $PilotUpn is disabled."
    $businessUnit = $user['businessunitid']
    Require ($null -ne $businessUnit -and $businessUnit.Id -ne [Guid]::Empty) 'The pilot has no verifiable business unit.'

    $officeDefinitions = @(Find-Role $service 'Service Operations - Office Admin' $businessUnit.Id)
    $bookDefinitions = @(Find-Role $service 'Service Operations - Job Book Admin' $businessUnit.Id)
    Require ($officeDefinitions.Count -eq 1) 'Expected exactly one Office Admin role in the pilot business unit.'
    Require ($bookDefinitions.Count -eq 1) 'Expected exactly one Job Book Admin role in the pilot business unit.'

    $before = @(Get-DirectRoles $service $user.Id)
    Write-RoleSummary "Direct roles before $Mode" $before
    $office = @($before | Where-Object { $_.Id -eq $officeDefinitions[0].Id })
    $book = @($before | Where-Object { $_.Id -eq $bookDefinitions[0].Id })
    $legacy = @($before | Where-Object { [string]$_['name'] -ceq 'Service Operations' })
    Require ($office.Count -le 1) 'Duplicate Office Admin role assignments found.'
    Require ($book.Count -le 1) 'Duplicate Job Book Admin role assignments found.'
    Require ($legacy.Count -eq 0) 'Refusing change because the broader legacy Service Operations role is assigned.'
    Require (($office.Count + $book.Count) -eq 1) 'Expected exactly one restricted Admin role; stop and inspect the account.'

    if ($Mode -eq 'SwitchPilot') {
        Require ($office.Count -eq 1) 'Refusing change because Office Admin is not assigned exactly once.'
        if ($book.Count -eq 0) {
            $references = [Microsoft.Xrm.Sdk.EntityReferenceCollection]::new()
            $references.Add($bookDefinitions[0].ToEntityReference())
            $service.Associate('systemuser', $user.Id, [Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'), $references)
        }

        $withReplacement = @(Get-DirectRoles $service $user.Id)
        Require (@($withReplacement | Where-Object { $_.Id -eq $bookDefinitions[0].Id }).Count -eq 1) 'Job Book Admin could not be verified before removing Office Admin.'
        Require (@($withReplacement | Where-Object { $_.Id -eq $officeDefinitions[0].Id }).Count -eq 1) 'Office Admin disappeared before the verified replacement was ready.'

        $references = [Microsoft.Xrm.Sdk.EntityReferenceCollection]::new()
        $references.Add($officeDefinitions[0].ToEntityReference())
        $service.Disassociate('systemuser', $user.Id, [Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'), $references)

        $after = @(Get-DirectRoles $service $user.Id)
        Require (@($after | Where-Object { $_.Id -eq $bookDefinitions[0].Id }).Count -eq 1) 'Job Book Admin is missing after the switch.'
        Require (@($after | Where-Object { $_.Id -eq $officeDefinitions[0].Id }).Count -eq 0) 'Office Admin is still assigned after the switch.'
        Require (@($after | Where-Object { [string]$_['name'] -ceq 'Service Operations' }).Count -eq 0) 'The broader legacy Service Operations role appeared during the switch.'
        Require ($after.Count -eq $before.Count) 'Unexpected direct-role count after the switch; stop and inspect the account.'
        foreach ($role in @($before | Where-Object { $_.Id -ne $officeDefinitions[0].Id })) {
            Require (@($after | Where-Object { $_.Id -eq $role.Id }).Count -eq 1) 'An unrelated Dataverse role was not preserved.'
        }
        Write-RoleSummary "Direct roles after $Mode" $after
        Write-Output "Verified: $PilotUpn switched from Office Admin to Job Book Admin; unrelated direct roles remain."
    } elseif ($Mode -eq 'SwitchToOfficeAdmin') {
        Require ($book.Count -eq 1) 'Refusing change because Job Book Admin is not assigned exactly once.'
        if ($office.Count -eq 0) {
            $references = [Microsoft.Xrm.Sdk.EntityReferenceCollection]::new()
            $references.Add($officeDefinitions[0].ToEntityReference())
            $service.Associate('systemuser', $user.Id, [Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'), $references)
        }

        $withReplacement = @(Get-DirectRoles $service $user.Id)
        Require (@($withReplacement | Where-Object { $_.Id -eq $officeDefinitions[0].Id }).Count -eq 1) 'Office Admin could not be verified before removing Job Book Admin.'
        Require (@($withReplacement | Where-Object { $_.Id -eq $bookDefinitions[0].Id }).Count -eq 1) 'Job Book Admin disappeared before the verified replacement was ready.'

        $references = [Microsoft.Xrm.Sdk.EntityReferenceCollection]::new()
        $references.Add($bookDefinitions[0].ToEntityReference())
        $service.Disassociate('systemuser', $user.Id, [Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'), $references)

        $after = @(Get-DirectRoles $service $user.Id)
        Require (@($after | Where-Object { $_.Id -eq $officeDefinitions[0].Id }).Count -eq 1) 'Office Admin is missing after the switch.'
        Require (@($after | Where-Object { $_.Id -eq $bookDefinitions[0].Id }).Count -eq 0) 'Job Book Admin is still assigned after the switch.'
        Require (@($after | Where-Object { [string]$_['name'] -ceq 'Service Operations' }).Count -eq 0) 'The broader legacy Service Operations role appeared during the switch.'
        Require ($after.Count -eq $before.Count) 'Unexpected direct-role count after the switch; stop and inspect the account.'
        foreach ($role in @($before | Where-Object { $_.Id -ne $bookDefinitions[0].Id })) {
            Require (@($after | Where-Object { $_.Id -eq $role.Id }).Count -eq 1) 'An unrelated Dataverse role was not preserved.'
        }
        Write-RoleSummary "Direct roles after $Mode" $after
        Write-Output "Verified: $PilotUpn switched from Job Book Admin to Office Admin; unrelated direct roles remain."
    } else {
        $profile = if ($book.Count -eq 1) { 'Job Book Admin' } else { 'Office Admin' }
        Write-Output "Verified current state: exactly one restricted Admin profile is assigned ($profile)."
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
