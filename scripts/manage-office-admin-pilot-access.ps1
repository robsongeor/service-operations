param(
    [ValidateSet('Verify', 'RemoveLegacyServiceOperations')]
    [string]$Mode = 'Verify',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$PilotUpn = 'pubudu@liftrucks.co.nz',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
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
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid', 'fullname', 'domainname', 'internalemailaddress', 'isdisabled')
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
    @($Service.RetrieveMultiple($query).Entities | Sort-Object { [string]$_['name'] }, Id)
}

function Write-RoleSummary([string]$Heading, $Roles) {
    Write-Output $Heading
    foreach ($role in $Roles) {
        Write-Output "- $([string]$role['name']) [$($role.Id)]"
    }
}

Import-Sdk
$service = Connect-Dataverse
try {
    $who = $service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    Write-Output "Connected Dataverse operator $($who.UserId)."

    $users = @(Find-User $service $PilotUpn)
    Require ($users.Count -eq 1) "Expected exactly one Dataverse user for $PilotUpn; found $($users.Count)."
    $user = $users[0]
    Require (-not [bool]$user['isdisabled']) "The Dataverse user for $PilotUpn is disabled."
    Require (([string]$user['domainname'] -ieq $PilotUpn) -or ([string]$user['internalemailaddress'] -ieq $PilotUpn)) 'Resolved user does not match the requested pilot UPN.'

    $before = @(Get-DirectRoles $service $user.Id)
    Write-RoleSummary "Direct roles before $Mode for $PilotUpn`:" $before

    $legacy = @($before | Where-Object { [string]$_['name'] -ceq 'Service Operations' })
    $office = @($before | Where-Object { [string]$_['name'] -ceq 'Service Operations - Office Admin' })
    Require ($office.Count -eq 1) 'Refusing change because the replacement Office Admin role is not assigned exactly once.'

    if ($Mode -eq 'RemoveLegacyServiceOperations') {
        Require ($legacy.Count -eq 1) 'Refusing change because the legacy Service Operations role is not assigned exactly once.'
        $references = [Microsoft.Xrm.Sdk.EntityReferenceCollection]::new()
        $references.Add($legacy[0].ToEntityReference())
        $service.Disassociate(
            'systemuser',
            $user.Id,
            [Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'),
            $references
        )

        $after = @(Get-DirectRoles $service $user.Id)
        Require (@($after | Where-Object { [string]$_['name'] -ceq 'Service Operations' }).Count -eq 0) 'Legacy Service Operations role is still assigned after removal.'
        Require (@($after | Where-Object { [string]$_['name'] -ceq 'Service Operations - Office Admin' }).Count -eq 1) 'Office Admin role was not preserved.'
        Require ($after.Count -eq ($before.Count - 1)) 'Unexpected direct-role count after removal; stop and inspect the account.'
        Write-RoleSummary "Direct roles after $Mode for $PilotUpn`:" $after
        Write-Output 'Verified: removed only Service Operations; Office Admin and unrelated direct roles remain assigned.'
    } else {
        Write-Output "Verified: Office Admin is assigned; legacy Service Operations assignments found: $($legacy.Count)."
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
