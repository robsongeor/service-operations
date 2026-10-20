param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [Parameter(Mandatory = $true)]
    [string[]]$UserPrincipalNames,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

# Read-only, privacy-minimal System User identity/branch exporter for the reviewed mapping workflow.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $path
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
    return $client
}

function Read-Choice($Row, [string]$Name) {
    if (-not $Row.Attributes.ContainsKey($Name)) { return $null }
    return [int]([Microsoft.Xrm.Sdk.OptionSetValue]$Row[$Name]).Value
}

Import-Sdk
$service = Connect-Dataverse
try {
    $expandedUpns = @($UserPrincipalNames | ForEach-Object { $_ -split ',' })
    $users = foreach ($upnValue in $expandedUpns) {
        $upn = $upnValue.Trim().ToLowerInvariant()
        if ([string]::IsNullOrWhiteSpace($upn)) { throw 'User principal names cannot be blank.' }
        $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuser')
        $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid', 'domainname', 'internalemailaddress', 'isdisabled', 'gr_serviceoperationsbranch')
        $query.Criteria.FilterOperator = [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
        $query.Criteria.AddCondition('domainname', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $upn)
        $query.Criteria.AddCondition('internalemailaddress', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $upn)
        $matches = @($service.RetrieveMultiple($query).Entities | Group-Object Id | ForEach-Object { $_.Group[0] })
        $enabled = @($matches | Where-Object { -not [bool]$_['isdisabled'] })
        if ($enabled.Count -ne 1) { throw "$upn resolved to $($enabled.Count) enabled System Users; expected exactly one." }
        [ordered]@{
            userPrincipalName = $upn
            systemUserId = $enabled[0].Id.ToString('D').ToLowerInvariant()
            etag = [string]$enabled[0].RowVersion
            currentBranch = Read-Choice $enabled[0] 'gr_serviceoperationsbranch'
            isDisabled = $false
        }
    }
    $artifact = [ordered]@{
        schemaVersion = 1
        exportedAtUtc = [DateTime]::UtcNow.ToString('o')
        source = 'Dataverse enabled System User identity and current Service Operations branch only'
        mutationsPerformed = $false
        users = @($users | Sort-Object userPrincipalName)
    }
    $resolved = [IO.Path]::GetFullPath($OutputPath)
    $directory = [IO.Path]::GetDirectoryName($resolved)
    if (-not [IO.Directory]::Exists($directory)) { throw "Output directory does not exist: $directory" }
    [IO.File]::WriteAllText($resolved, ($artifact | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
    [pscustomobject]@{ mode = 'Export'; mutationsPerformed = $false; users = $artifact.users.Count; outputPath = $resolved } | ConvertTo-Json
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
