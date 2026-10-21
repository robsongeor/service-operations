param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [int]$MaximumRecords = 100000
)

# Read-only, privacy-minimal exporter for the V3 managed/Auckland historical migration.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($MaximumRecords -lt 1) { throw 'MaximumRecords must be positive.' }

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
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
function Choice($Row, [string]$Name) {
    if (-not $Row.Attributes.ContainsKey($Name)) { return $null }
    return [int]([Microsoft.Xrm.Sdk.OptionSetValue]$Row[$Name]).Value
}
function Value($Row, [string]$Name) {
    if (-not $Row.Attributes.ContainsKey($Name)) { return $null }
    return $Row[$Name]
}
function Etag($Row) {
    $version = [string]$Row.RowVersion
    if ([string]::IsNullOrWhiteSpace($version)) { return '' }
    if ($version -notmatch '(\d+)') { return '' }
    return 'W/"' + $Matches[1] + '"'
}

Import-Sdk
$service = Connect-Dataverse
try {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(@('statecode', 'gr_registrationvoid', 'gr_greentreestatus', 'gr_coordinatormanaged', 'gr_operatingbranch'))
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $query.PageInfo.Count = 5000
    $query.PageInfo.PageNumber = 1
    $jobs = [Collections.Generic.List[object]]::new()
    do {
        $page = $service.RetrieveMultiple($query)
        foreach ($row in $page.Entities) {
            if ($jobs.Count -ge $MaximumRecords) { throw "Jobs exceed the reviewed $MaximumRecords-record bound." }
            $jobs.Add([ordered]@{
                id = $row.Id.ToString('D').ToLowerInvariant()
                etag = Etag $row
                inactive = (Choice $row 'statecode') -ne 0
                registrationVoid = [bool](Value $row 'gr_registrationvoid')
                greenTreeStatus = [string](Value $row 'gr_greentreestatus')
                coordinatorManaged = [bool](Value $row 'gr_coordinatormanaged')
                operatingBranch = Choice $row 'gr_operatingbranch'
            })
        }
        $query.PageInfo.PageNumber++
        $query.PageInfo.PagingCookie = $page.PagingCookie
    } while ($page.MoreRecords)
    $artifact = [ordered]@{
        schemaVersion = 1
        exportedAtUtc = [DateTime]::UtcNow.ToString('o')
        source = 'Dataverse Job lifecycle and V3 membership fields only'
        mutationsPerformed = $false
        jobs = @($jobs | Sort-Object id)
    }
    $resolved = [IO.Path]::GetFullPath($OutputPath)
    $directory = [IO.Path]::GetDirectoryName($resolved)
    if (-not [IO.Directory]::Exists($directory)) { throw "Output directory does not exist: $directory" }
    [IO.File]::WriteAllText($resolved, ($artifact | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    [pscustomobject]@{ mode = 'Export'; mutationsPerformed = $false; jobs = $jobs.Count; outputPath = $resolved } | ConvertTo-Json
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
