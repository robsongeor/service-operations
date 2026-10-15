param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [int]$LastMinutes = 15
)

# Read-only, narrow trace inspection. Identifiers and email-like values are redacted from output.
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
    if ($UserName) { $connection += ";UserName=$($UserName.Trim())" }
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}
function Redact([string]$Value) {
    if (-not $Value) { return '' }
    $result = $Value -replace '(?i)\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b', '<guid>'
    $result = $result -replace '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', '<email>'
    if ($result.Length -gt 6000) { $result = $result.Substring(0, 6000) }
    $result
}

if ($LastMinutes -lt 1 -or $LastMinutes -gt 120) { throw 'LastMinutes must be between 1 and 120.' }
Import-Sdk
$service = Connect-Dataverse
try {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('plugintracelog')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('createdon', 'typename', 'messagename', 'primaryentity', 'exceptiondetails', 'messageblock', 'performanceconstructorduration', 'performanceexecutionduration')
    $query.Criteria.AddCondition('createdon', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::GreaterEqual, [DateTime]::UtcNow.AddMinutes(-$LastMinutes))
    $scope = $query.Criteria.AddFilter([Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or)
    $scope.AddCondition('messagename', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, 'gr_RegisterJobBookJob')
    $scope.AddCondition('typename', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Like, '%JobRegistration%')
    $scope.AddCondition('typename', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Like, '%RestrictedAccessPlugin%')
    $query.AddOrder('createdon', [Microsoft.Xrm.Sdk.Query.OrderType]::Descending)
    $query.TopCount = 50
    $rows = @($service.RetrieveMultiple($query).Entities)
    Write-Output "JOB_REGISTRATION_TRACE_COUNT=$($rows.Count) windowMinutes=$LastMinutes"
    foreach ($row in $rows) {
        Write-Output "TRACE created=$($row.Attributes['createdon']) message=$($row.Attributes['messagename']) type=$($row.Attributes['typename']) entity=$($row.Attributes['primaryentity'])"
        $exception = Redact ([string]$row.Attributes['exceptiondetails'])
        $message = Redact ([string]$row.Attributes['messageblock'])
        if ($exception) { Write-Output "EXCEPTION`n$exception" }
        if ($message) { Write-Output "MESSAGE`n$message" }
    }
    Write-Output 'Read-only trace inspection completed; no settings or business data were changed.'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
