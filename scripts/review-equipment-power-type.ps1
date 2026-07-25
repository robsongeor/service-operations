param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$ReportDirectory = 'reports'
)

$ErrorActionPreference = 'Stop'

$pacTools = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\PowerAppsCLI" -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $pacTools) { throw 'Microsoft PowerApps CLI SDK files were not found.' }
foreach ($assemblyName in @('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll')) {
    [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $assemblyName)) | Out-Null
}

$connectionString = @(
    'AuthType=OAuth'
    "Url=$EnvironmentUrl"
    'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d'
    'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97'
    'LoginPrompt=Auto'
) -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

$query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_equipment')
$query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
    'gr_equipmentid',
    'gr_fleet',
    'gr_make',
    'gr_model',
    'gr_powertype'
)
$query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
$query.PageInfo.Count = 5000
$query.PageInfo.PageNumber = 1

$records = [System.Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
do {
    $page = $service.RetrieveMultiple($query)
    foreach ($record in $page.Entities) { $records.Add($record) }
    $query.PageInfo.PageNumber++
    $query.PageInfo.PagingCookie = $page.PagingCookie
} while ($page.MoreRecords)

function Get-Proposal([string]$make, [string]$model) {
    $normalizedMake = $make.Trim().ToUpperInvariant()
    $normalizedModel = $model.Trim().ToUpperInvariant().Replace(' ', '')
    if ($normalizedMake -eq 'STILL') {
        if ($normalizedModel.StartsWith('RX70')) {
            return @{ Value = 122830000; Label = 'ICE'; Confidence = 'Manual review'; Reason = 'Still RX70 hybrid family cannot be represented by the current ICE/Electric Choice.' }
        }
        if ($normalizedModel.StartsWith('RX') -or $normalizedModel.StartsWith('RC') -or $normalizedModel.StartsWith('RCE')) {
            return @{ Value = 122830001; Label = 'Electric'; Confidence = 'High'; Reason = 'Approved Still RX/RC/RCE manufacturer model convention.' }
        }
    }
    if ($normalizedMake -eq 'KOMATSU') {
        if ($normalizedModel.StartsWith('FB')) {
            return @{ Value = 122830001; Label = 'Electric'; Confidence = 'High'; Reason = 'Approved Komatsu FB manufacturer model convention.' }
        }
        if ($normalizedModel.StartsWith('FG')) {
            return @{ Value = 122830000; Label = 'ICE'; Confidence = 'High'; Reason = 'Approved Komatsu FG LPG model convention; stored as ICE.' }
        }
        if ($normalizedModel.StartsWith('FD')) {
            return @{ Value = 122830000; Label = 'ICE'; Confidence = 'High'; Reason = 'Approved Komatsu FD diesel model convention; stored as ICE.' }
        }
    }
    return @{ Value = 122830000; Label = 'ICE'; Confidence = 'Manual review'; Reason = 'No approved high-confidence rule; retained as ICE and listed for review.' }
}

$items = foreach ($record in $records) {
    $powerType = if ($record.Attributes.ContainsKey('gr_powertype')) {
        $record['gr_powertype'].Value
    } else {
        $null
    }
    $make = if ($record.Attributes.ContainsKey('gr_make')) { [string]$record['gr_make'] } else { '' }
    $model = if ($record.Attributes.ContainsKey('gr_model')) { [string]$record['gr_model'] } else { '' }
    $proposal = if ($null -ne $powerType) {
        @{
            Value = $powerType
            Label = if ($powerType -eq 122830001) { 'Electric' } else { 'ICE' }
            Confidence = 'Existing'
            Reason = 'Existing Power Type preserved; migration only populates unset records.'
        }
    } else {
        Get-Proposal $make $model
    }
    [pscustomobject]@{
        EquipmentId = $record.Id.ToString()
        Fleet = if ($record.Attributes.ContainsKey('gr_fleet')) { [string]$record['gr_fleet'] } else { '' }
        Make = $make
        Model = $model
        CurrentPowerType = if ($powerType -eq 122830001) { 'Electric' } elseif ($powerType -eq 122830000) { 'ICE' } else { 'Unset' }
        ProposedPowerType = $proposal.Label
        Confidence = $proposal.Confidence
        Reason = $proposal.Reason
        WouldChange = $null -eq $powerType -or $powerType -ne $proposal.Value
    }
}

$resolvedReportDirectory = if ([System.IO.Path]::IsPathRooted($ReportDirectory)) {
    $ReportDirectory
} else {
    Join-Path (Get-Location) $ReportDirectory
}
New-Item -ItemType Directory -Force -Path $resolvedReportDirectory | Out-Null
$reviewPath = Join-Path $resolvedReportDirectory 'equipment-power-type-review.csv'
$outstandingPath = Join-Path $resolvedReportDirectory 'equipment-power-type-outstanding.csv'
$items | Sort-Object Make, Model, Fleet | Export-Csv -NoTypeInformation -Encoding utf8 -Path $reviewPath
$items |
    Where-Object { $_.Confidence -eq 'Manual review' } |
    Select-Object Fleet, Make, Model, CurrentPowerType, ProposedPowerType, Reason |
    Sort-Object Make, Model, Fleet |
    Export-Csv -NoTypeInformation -Encoding utf8 -Path $outstandingPath

[pscustomobject]@{
    Total = $items.Count
    CurrentlyElectric = @($items | Where-Object CurrentPowerType -eq 'Electric').Count
    CurrentlyIce = @($items | Where-Object CurrentPowerType -eq 'ICE').Count
    CurrentlyUnset = @($items | Where-Object CurrentPowerType -eq 'Unset').Count
    HighConfidence = @($items | Where-Object Confidence -eq 'High').Count
    ExistingPreserved = @($items | Where-Object Confidence -eq 'Existing').Count
    ManualReview = @($items | Where-Object Confidence -eq 'Manual review').Count
    ProposedElectric = @($items | Where-Object ProposedPowerType -eq 'Electric').Count
    ProposedIce = @($items | Where-Object ProposedPowerType -eq 'ICE').Count
    WouldChange = @($items | Where-Object WouldChange).Count
    ReviewReport = $reviewPath
    OutstandingReport = $outstandingPath
} | ConvertTo-Json
