param(
    [ValidateSet('Inspect', 'EnableExceptions', 'Disable')]
    [string]$Mode = 'Inspect',
    [int]$ExpectedCurrent = -1,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Narrow, reversible organization setting used only while diagnosing a retained request.
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

Import-Sdk
$service = Connect-Dataverse
try {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('organization')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('organizationid', 'plugintracelogsetting')
    $query.TopCount = 2
    $rows = @($service.RetrieveMultiple($query).Entities)
    if ($rows.Count -ne 1) { throw "Expected one Organization row; found $($rows.Count)." }
    $row = $rows[0]
    $current = if ($row.Attributes.Contains('plugintracelogsetting')) {
        ([Microsoft.Xrm.Sdk.OptionSetValue]$row['plugintracelogsetting']).Value
    } else { 0 }
    $labels = @{ 0 = 'Off'; 1 = 'Exceptions'; 2 = 'All' }
    Write-Output "PLUGIN_TRACE_CURRENT value=$current label=$($labels[$current])"
    if ($Mode -eq 'Inspect') { Write-Output 'Inspection only; no setting was changed.'; return }
    if ($ExpectedCurrent -lt 0 -or $current -ne $ExpectedCurrent) {
        throw "Plug-in trace setting changed from the expected value $ExpectedCurrent to $current; review before changing it."
    }
    $target = if ($Mode -eq 'EnableExceptions') { 1 } else { 0 }
    if ($current -ne $target) {
        $update = [Microsoft.Xrm.Sdk.Entity]::new('organization', $row.Id)
        $update['plugintracelogsetting'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new($target)
        $service.Update($update)
    }
    $verified = $service.Retrieve('organization', $row.Id, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('plugintracelogsetting'))
    $actual = ([Microsoft.Xrm.Sdk.OptionSetValue]$verified['plugintracelogsetting']).Value
    if ($actual -ne $target) { throw "Plug-in trace setting verification failed; expected $target, found $actual." }
    Write-Output "PLUGIN_TRACE_SET value=$actual label=$($labels[$actual])"
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
