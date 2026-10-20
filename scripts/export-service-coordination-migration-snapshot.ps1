param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [int]$MaximumRecords = 100000
)

# Read-only, privacy-minimal input exporter for the reviewed Service Coordination migration
# classifier. It opens one Dataverse connection and never creates, updates or deletes a row.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($MaximumRecords -lt 1) { throw 'MaximumRecords must be positive.' }

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

function Read-All($Service, [string]$Table, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $query.PageInfo.Count = 5000
    $query.PageInfo.PageNumber = 1
    $rows = [Collections.Generic.List[object]]::new()
    do {
        $page = $Service.RetrieveMultiple($query)
        foreach ($row in $page.Entities) {
            if ($rows.Count -ge $MaximumRecords) { throw "$Table exceeds the reviewed $MaximumRecords-record bound." }
            $rows.Add($row)
        }
        $query.PageInfo.PageNumber++
        $query.PageInfo.PagingCookie = $page.PagingCookie
    } while ($page.MoreRecords)
    return @($rows)
}

function Add-MapValue([hashtable]$Map, [string]$Key, [int]$Value) {
    if ([string]::IsNullOrWhiteSpace($Key)) { return }
    $canonical = $Key.Trim().ToLowerInvariant()
    if (-not $Map.ContainsKey($canonical)) { $Map[$canonical] = [Collections.Generic.HashSet[int]]::new() }
    [void]$Map[$canonical].Add($Value)
}

function Choice($Row, [string]$Name) {
    if (-not $Row.Attributes.ContainsKey($Name)) { return $null }
    return [int]([Microsoft.Xrm.Sdk.OptionSetValue]$Row[$Name]).Value
}

function Attribute($Row, [string]$Name) {
    if (-not $Row.Attributes.ContainsKey($Name)) { return $null }
    return $Row[$Name]
}

function Etag($Row) {
    $version = [string]$Row.RowVersion
    if ([string]::IsNullOrWhiteSpace($version)) { return '' }
    if ($version -match '^(?:W/)?"\d+"$') { return $version }
    return 'W/"' + $version.Trim() + '"'
}

Import-Sdk
$service = Connect-Dataverse
try {
    $jobs = @(Read-All $service 'gr_job' @('gr_jobnumber', 'gr_status', 'gr_operatingbranch', 'gr_registrationvoid', 'statecode'))
    $linked = @{}
    $numbers = @{}
    $ledgerCounts = [ordered]@{}
    $ledgers = @(
        @{ table = 'gr_jobbookentry'; branch = 122830000 },
        @{ table = 'gr_waikatojobbookentry'; branch = 122830001 },
        @{ table = 'gr_hastingsjobbookentry'; branch = 122830002 },
        @{ table = 'gr_christchurchjobbookentry'; branch = 122830003 }
    )
    foreach ($definition in $ledgers) {
        $rows = @(Read-All $service $definition.table @('gr_jobnumber', 'gr_registeredjob'))
        $ledgerCounts[$definition.table] = $rows.Count
        foreach ($row in $rows) {
            Add-MapValue $numbers ([string](Attribute $row 'gr_jobnumber')) ([int]$definition.branch)
            $job = [Microsoft.Xrm.Sdk.EntityReference](Attribute $row 'gr_registeredjob')
            if ($null -ne $job -and $job.LogicalName -eq 'gr_job') { Add-MapValue $linked $job.Id.ToString('D') ([int]$definition.branch) }
        }
    }

    $snapshotJobs = @($jobs | ForEach-Object {
        $id = $_.Id.ToString('D').ToLowerInvariant()
        $number = [string](Attribute $_ 'gr_jobnumber')
        [ordered]@{
            id = $id
            etag = Etag $_
            status = Choice $_ 'gr_status'
            operatingBranch = Choice $_ 'gr_operatingbranch'
            jobNumber = $number
            registrationVoid = [bool](Attribute $_ 'gr_registrationvoid')
            inactive = (Choice $_ 'statecode') -ne 0
            registeredLedgerBranches = if ($linked.ContainsKey($id)) { @($linked[$id] | Sort-Object) } else { @() }
            approvedLegacySourceBranches = if (-not [string]::IsNullOrWhiteSpace($number) -and $numbers.ContainsKey($number.Trim().ToLowerInvariant())) { @($numbers[$number.Trim().ToLowerInvariant()] | Sort-Object) } else { @() }
        }
    } | Sort-Object id)

    $artifact = [ordered]@{
        schemaVersion = 1
        exportedAtUtc = [DateTime]::UtcNow.ToString('o')
        source = 'Dataverse regional-ledger evidence only'
        mutationsPerformed = $false
        ledgerCounts = $ledgerCounts
        jobs = $snapshotJobs
    }
    $resolved = [IO.Path]::GetFullPath($OutputPath)
    $directory = [IO.Path]::GetDirectoryName($resolved)
    if (-not [IO.Directory]::Exists($directory)) { throw "Output directory does not exist: $directory" }
    [IO.File]::WriteAllText($resolved, ($artifact | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
    [pscustomobject]@{ mode = 'Export'; mutationsPerformed = $false; jobs = $snapshotJobs.Count; ledgerCounts = $ledgerCounts; outputPath = $resolved } | ConvertTo-Json -Depth 5
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
