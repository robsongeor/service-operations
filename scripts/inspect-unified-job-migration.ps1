param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [int]$MaximumRecordsPerTable = 0,
    [switch]$ShowExceptionNumbers,
    [switch]$ShowCutoverCandidates
)

# Read-only business-data audit. It emits aggregate classifications only. It contains no create,
# update, delete, link, import, assignment, publish or provisioning operation.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $repository 'dataverse\job-registration\migration-manifest.json') -Raw | ConvertFrom-Json
$limit = if ($MaximumRecordsPerTable -gt 0) { $MaximumRecordsPerTable } else { [int]$manifest.maximumRecordsPerTable }
if ($limit -lt 1) { throw 'MaximumRecordsPerTable must be positive.' }

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
function Get-EntityMetadata($Service, [string]$Table) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $Table
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity -bor [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Attributes
    $request.RetrieveAsIfPublished = $true
    $Service.Execute($request).EntityMetadata
}
function Select-ExistingColumns($Metadata, [string[]]$Requested) {
    $available = @{}
    foreach ($attribute in $Metadata.Attributes) { $available[[string]$attribute.LogicalName] = $true }
    @($Requested | Where-Object { $available.ContainsKey($_) })
}
function Read-AllRows($Service, [string]$Table, [string[]]$Columns, [int]$Maximum) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $query.PageInfo.Count = [Math]::Min(5000, $Maximum)
    $query.PageInfo.PageNumber = 1
    $rows = [Collections.Generic.List[object]]::new()
    do {
        $page = $Service.RetrieveMultiple($query)
        foreach ($row in $page.Entities) {
            if ($rows.Count -ge $Maximum) { throw "$Table exceeds the reviewed $Maximum-row audit bound; no complete classification was produced." }
            $rows.Add($row)
        }
        $query.PageInfo.PageNumber++
        $query.PageInfo.PagingCookie = $page.PagingCookie
    } while ($page.MoreRecords)
    @($rows)
}
function Normalize-Number([object]$Value) {
    if ($null -eq $Value) { return '' }
    ([string]$Value).Trim().ToUpperInvariant()
}
function Get-ValueFingerprint([string[]]$Values) {
    $canonical = [string]::Join("`n", @($Values | Sort-Object -Unique))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Get-CutoverCandidate($Book, [string[]]$Numbers) {
    $maximum = $null
    $maximumNumber = ''
    foreach ($number in @($Numbers | Sort-Object -Unique)) {
        if ($number -notmatch [string]$Book.numberPattern) { continue }
        $digits = if ([string]::IsNullOrEmpty([string]$Book.prefix)) { $number } else { $number.Substring(([string]$Book.prefix).Length) }
        $value = [Numerics.BigInteger]::Parse($digits, [Globalization.CultureInfo]::InvariantCulture)
        if ($null -eq $maximum -or $value -gt $maximum) { $maximum = $value; $maximumNumber = $number }
    }
    if ($null -eq $maximum) { return [pscustomobject]@{ book=$Book.book; currentMaximum='none'; provisionalNext='unresolved-no-source-values' } }
    $nextDigits = ($maximum + [Numerics.BigInteger]::One).ToString([Globalization.CultureInfo]::InvariantCulture).PadLeft([int]$Book.minimumDigits, '0')
    [pscustomobject]@{ book=$Book.book; currentMaximum=$maximumNumber; provisionalNext=([string]$Book.prefix + $nextDigits) }
}
function Read-ReferenceId($Row, [string]$Column) {
    if (-not $Row.Attributes.ContainsKey($Column) -or -not ($Row[$Column] -is [Microsoft.Xrm.Sdk.EntityReference])) { return '' }
    ([Microsoft.Xrm.Sdk.EntityReference]$Row[$Column]).Id.ToString('D')
}
function Add-MapValue([hashtable]$Map, [string]$Key, [object]$Value) {
    if (-not $Map.ContainsKey($Key)) { $Map[$Key] = [Collections.Generic.List[object]]::new() }
    $Map[$Key].Add($Value)
}
function Increment([hashtable]$Counts, [string]$Name, [int]$By = 1) {
    if (-not $Counts.ContainsKey($Name)) { $Counts[$Name] = 0 }
    $Counts[$Name] = [int]$Counts[$Name] + $By
}

Import-Sdk
$service = Connect-Dataverse
try {
    $jobMetadata = Get-EntityMetadata $service ([string]$manifest.jobTable.name)
    $jobColumns = Select-ExistingColumns $jobMetadata @(
        [string]$manifest.jobTable.number,
        [string]$manifest.jobTable.type,
        [string]$manifest.jobTable.coordinatorManaged
    )
    $membershipColumn = [string]$manifest.jobTable.coordinatorManaged
    $hasMembershipColumn = $jobColumns -contains $membershipColumn
    $jobs = @(Read-AllRows $service ([string]$manifest.jobTable.name) $jobColumns $limit)
    $jobsById = @{}
    $jobsByNumber = @{}
    $counts = @{}
    if (-not $hasMembershipColumn) { Increment $counts 'coordinator-membership-column-missing' }
    foreach ($job in $jobs) {
        $id = $job.Id.ToString('D')
        $number = Normalize-Number $(if ($job.Attributes.ContainsKey([string]$manifest.jobTable.number)) { $job[[string]$manifest.jobTable.number] } else { $null })
        $typeValue = if ($job.Attributes.ContainsKey([string]$manifest.jobTable.type)) { $job[[string]$manifest.jobTable.type] } else { $null }
        $type = if ($typeValue -is [Microsoft.Xrm.Sdk.OptionSetValue]) { [int]([Microsoft.Xrm.Sdk.OptionSetValue]$typeValue).Value } else { $null }
        $item = [pscustomobject]@{ Id=$id; Number=$number; Type=$type }
        $jobsById[$id] = $item
        if ($number) { Add-MapValue $jobsByNumber $number $item } else { Increment $counts 'unnumbered-job' }
        if ($hasMembershipColumn) {
            if (-not $job.Attributes.ContainsKey($membershipColumn) -or $null -eq $job[$membershipColumn]) { Increment $counts 'coordinator-membership-unset' }
            elseif ([bool]$job[$membershipColumn]) { Increment $counts 'coordinator-membership-true' }
            else { Increment $counts 'coordinator-membership-false' }
        }
    }

    $ledgers = [Collections.Generic.List[object]]::new()
    $ledgersByNumber = @{}
    $unknownNumbers = [Collections.Generic.List[string]]::new()
    foreach ($book in $manifest.regionalBooks) {
        $metadata = Get-EntityMetadata $service ([string]$book.table)
        $columns = Select-ExistingColumns $metadata @(
            [string]$manifest.ledgerColumns.number,
            [string]$manifest.ledgerColumns.registeredJob,
            [string]$manifest.ledgerColumns.historicalPromotedJob,
            [string]$manifest.ledgerColumns.stage
        )
        $rows = @(Read-AllRows $service ([string]$book.table) $columns $limit)
        Increment $counts "ledger-total-$($book.book)" $rows.Count
        foreach ($row in $rows) {
            $number = Normalize-Number $(if ($row.Attributes.ContainsKey([string]$manifest.ledgerColumns.number)) { $row[[string]$manifest.ledgerColumns.number] } else { $null })
            $item = [pscustomobject]@{
                Book = [string]$book.book
                Number = $number
                Pattern = [string]$book.numberPattern
                RegisteredJobId = Read-ReferenceId $row ([string]$manifest.ledgerColumns.registeredJob)
                PromotedJobId = Read-ReferenceId $row ([string]$manifest.ledgerColumns.historicalPromotedJob)
            }
            $ledgers.Add($item)
            if ($number) { Add-MapValue $ledgersByNumber $number $item }
        }
    }

    foreach ($ledger in $ledgers) {
        if (-not $ledger.Number) { Increment $counts 'numberless-ledger'; continue }
        if ($ledger.Number -notmatch $ledger.Pattern) { Increment $counts 'invalid-regional-number-format' }
        if ($ledgersByNumber[$ledger.Number].Count -gt 1) { Increment $counts 'duplicate-ledger-number-across-regions' }
        if ($ledger.RegisteredJobId) {
            if (-not $jobsById.ContainsKey($ledger.RegisteredJobId)) { Increment $counts 'linked-job-missing' }
            elseif ($jobsById[$ledger.RegisteredJobId].Number -ne $ledger.Number) { Increment $counts 'linked-number-mismatch' }
            else { Increment $counts 'already-linked-consistent' }
            continue
        }
        if ($ledger.PromotedJobId) { Increment $counts 'historical-promoted-preserve'; continue }
        $matches = if ($jobsByNumber.ContainsKey($ledger.Number)) { $jobsByNumber[$ledger.Number].Count } else { 0 }
        if ($matches -eq 0) { Increment $counts 'no-job-number-match' }
        elseif ($matches -eq 1) {
            Increment $counts 'one-job-number-candidate-manual-review'
            $candidate = $jobsByNumber[$ledger.Number][0]
            if ($candidate.Type -eq [int]$manifest.specialistJobTypes.wof) { Increment $counts 'candidate-wof' }
            if ($candidate.Type -eq [int]$manifest.specialistJobTypes.siteCheck) { Increment $counts 'candidate-site-check' }
        }
        else { Increment $counts 'multiple-job-number-matches' }
    }
    foreach ($number in $jobsByNumber.Keys) {
        if (-not $ledgersByNumber.ContainsKey($number)) {
            Increment $counts 'legacy-numbered-job-without-ledger' $jobsByNumber[$number].Count
            $matchedBooks = @($manifest.regionalBooks | Where-Object { $number -match [string]$_.numberPattern })
            $region = if ($matchedBooks.Count -eq 1) { [string]$matchedBooks[0].book } else { 'unknown-region' }
            Increment $counts "legacy-numbered-job-$region" $jobsByNumber[$number].Count
            if ($region -eq 'unknown-region') { $unknownNumbers.Add($number) }
        }
        if ($jobsByNumber[$number].Count -gt 1) { Increment $counts 'duplicate-job-number' $jobsByNumber[$number].Count }
    }

    Write-Output "Read-only migration audit for $EnvironmentUrl"
    Write-Output "Bound: $limit records per table. Job rows read: $($jobs.Count). Ledger rows read: $($ledgers.Count)."
    foreach ($name in @($counts.Keys | Sort-Object)) { Write-Output ("{0}: {1}" -f $name, $counts[$name]) }
    $unknownFingerprint = Get-ValueFingerprint @($unknownNumbers)
    $reviewedExceptionSetMatches = $unknownNumbers.Count -eq [int]$manifest.reviewedUnknownFormatExceptionSet.count -and
        $unknownFingerprint -eq [string]$manifest.reviewedUnknownFormatExceptionSet.sha256
    Write-Output ("reviewed-unknown-format-exception-set: {0}" -f $(if ($reviewedExceptionSetMatches) { 'unchanged' } else { 'DRIFT - review required' }))
    if ($ShowExceptionNumbers) {
        Write-Output 'Explicitly requested unknown-format Job-number values (not written to disk):'
        foreach ($number in @($unknownNumbers | Sort-Object -Unique)) { Write-Output ("  {0}" -f $number) }
    } else {
        Write-Output 'No identifiers, number values or record changes were emitted. Matching number text remains manual-review evidence only.'
    }
    if ($ShowCutoverCandidates) {
        Write-Output 'Explicitly requested provisional sequence evidence (read-only; recalculate immediately before cutover):'
        $allNumbers = @($jobsByNumber.Keys) + @($ledgersByNumber.Keys)
        foreach ($book in $manifest.regionalBooks) {
            $candidate = Get-CutoverCandidate $book $allNumbers
            Write-Output ("  {0}: current maximum {1}; provisional next {2}" -f $candidate.book, $candidate.currentMaximum, $candidate.provisionalNext)
        }
    }
    $stopNames = @(
        'linked-job-missing','linked-number-mismatch','multiple-job-number-matches',
        'duplicate-ledger-number-across-regions','duplicate-job-number','invalid-regional-number-format',
        'one-job-number-candidate-manual-review','no-job-number-match',
        'coordinator-membership-column-missing'
    )
    $stops = @($stopNames | Where-Object { $counts.ContainsKey($_) -and [int]$counts[$_] -gt 0 })
    if (-not $reviewedExceptionSetMatches) { $stops += 'legacy-numbered-job-unknown-region-set-drift' }
    if ($stops.Count) { Write-Output "Migration stop conditions: $($stops -join ', ')."; exit 2 }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
