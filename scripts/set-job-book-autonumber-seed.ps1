param(
    [ValidateSet('Inspect', 'Apply')]
    [string]$Mode = 'Inspect',
    [ValidateSet('auckland')]
    [string]$Book = 'auckland',
    [int]$ExpectedCurrentMaximum = 147366,
    [int]$NextSeed = 147367,
    [int]$RequiredAbsentNumber = 0,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Controlled AutoNumber cutover for a single regional Job Book. Apply is fail-closed:
# the current Job maximum, empty regional ledger, format, and exact next seed must agree.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
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
function Read-All($Service, [string]$Table, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $query.PageInfo.Count = 5000
    $query.PageInfo.PageNumber = 1
    $rows = [Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
    do {
        $page = $Service.RetrieveMultiple($query)
        foreach ($row in $page.Entities) { $rows.Add($row) }
        if ($page.MoreRecords) {
            $query.PageInfo.PageNumber++
            $query.PageInfo.PagingCookie = $page.PagingCookie
        }
    } while ($page.MoreRecords)
    @($rows)
}

Require ($ExpectedCurrentMaximum -gt 0) 'ExpectedCurrentMaximum must be positive.'
Require ($NextSeed -gt $ExpectedCurrentMaximum) 'NextSeed must be above ExpectedCurrentMaximum.'
Import-Sdk
$service = Connect-Dataverse
try {
    $jobs = @(Read-All $service 'gr_job' @('gr_jobnumber'))
    $numeric = @($jobs | ForEach-Object {
        $value = if ($_.Attributes.Contains('gr_jobnumber')) { [string]$_['gr_jobnumber'] } else { '' }
        if ($value -match '^[0-9]+$') { [int64]$value }
    })
    Require ($numeric.Count -gt 0) 'No numeric Auckland Job numbers were found.'
    $actualMaximum = [int64]($numeric | Measure-Object -Maximum).Maximum

    $ledgers = @(Read-All $service 'gr_jobbookentry' @('gr_jobnumber'))
    $absentText = if ($RequiredAbsentNumber -gt 0) { $RequiredAbsentNumber.ToString([Globalization.CultureInfo]::InvariantCulture) } else { '' }
    $matchingJobs = if ($absentText) { @($jobs | Where-Object { $_.Attributes.Contains('gr_jobnumber') -and [string]$_.Attributes['gr_jobnumber'] -eq $absentText }).Count } else { 0 }
    $matchingLedgers = if ($absentText) { @($ledgers | Where-Object { $_.Attributes.Contains('gr_jobnumber') -and [string]$_.Attributes['gr_jobnumber'] -eq $absentText }).Count } else { 0 }
    $metadataRequest = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $metadataRequest.EntityLogicalName = 'gr_jobbookentry'
    $metadataRequest.LogicalName = 'gr_jobnumber'
    $metadataRequest.RetrieveAsIfPublished = $true
    $attribute = $service.Execute($metadataRequest).AttributeMetadata
    $format = [string]$attribute.AutoNumberFormat

    $report = [ordered]@{
        mode = $Mode
        book = $Book
        currentMaximum = $actualMaximum
        expectedCurrentMaximum = $ExpectedCurrentMaximum
        ledgerRows = $ledgers.Count
        requiredAbsentNumber = $RequiredAbsentNumber
        matchingJobs = $matchingJobs
        matchingLedgers = $matchingLedgers
        autoNumberFormat = $format
        nextSeed = $NextSeed
        mutationPerformed = $false
    }
    $report | ConvertTo-Json

    Require ($actualMaximum -eq $ExpectedCurrentMaximum) "Current Auckland maximum changed to $actualMaximum; recalculate before setting a seed."
    Require ($matchingJobs -eq 0 -and $matchingLedgers -eq 0) "Required-absent number $RequiredAbsentNumber exists; no seed was changed."
    Require ($ledgers.Count -eq 0) 'The Auckland registration ledger is no longer empty; reconcile it before setting a seed.'
    Require ($format -eq '{SEQNUM:6}') "Unexpected Auckland AutoNumber format: $format"

    if ($Mode -eq 'Apply') {
        $request = [Microsoft.Crm.Sdk.Messages.SetAutoNumberSeedRequest]::new()
        $request.EntityName = 'gr_jobbookentry'
        $request.AttributeName = 'gr_jobnumber'
        $request.Value = [int64]$NextSeed
        $service.Execute($request) | Out-Null
        Write-Output "AUTONUMBER_SEED_SET book=$Book table=gr_jobbookentry column=gr_jobnumber next=$NextSeed"
        Write-Output 'No Job or ledger row was created. The retained registration request must be retried separately.'
    } else {
        Write-Output 'Inspection only; no seed or business data was changed.'
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
