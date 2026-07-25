param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [switch]$ApplyBackfill,
    [string]$ReviewCsvPath = (Join-Path $env:TEMP 'equipment-compliance-backfill-review.csv')
)

$ErrorActionPreference = 'Stop'

$pacTools = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\PowerAppsCLI" -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $pacTools) { throw 'Microsoft PowerApps CLI SDK files were not found. Install Microsoft.PowerAppsCLI first.' }
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

function New-Label([string]$text) {
    return [Microsoft.Xrm.Sdk.Label]::new($text, 1033)
}

function Test-AttributeExists([string]$entityName, [string]$logicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = $entityName
        $request.LogicalName = $logicalName
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-RecordValue([Microsoft.Xrm.Sdk.Entity]$record, [string]$attributeName) {
    if ($record.Attributes.ContainsKey($attributeName)) {
        return $record.Attributes[$attributeName]
    }
    return $null
}

function Get-DateOnlyText([Microsoft.Xrm.Sdk.Entity]$record, [string]$attributeName) {
    $value = Get-RecordValue $record $attributeName
    if ($null -eq $value) { return '' }
    return ([datetime]$value).ToString('yyyy-MM-dd')
}

if (-not (Test-AttributeExists 'gr_equipment' 'gr_compliancestatus')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
    $attribute.SchemaName = 'gr_ComplianceStatus'
    $attribute.DisplayName = New-Label 'Compliance Status'
    $attribute.Description = New-Label 'Authoritative road-registration and WOF participation state.'
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $attribute.OptionSet.IsGlobal = $false
    foreach ($option in @(
        @{ Label = 'Road Registered'; Value = 122830000 },
        @{ Label = 'Deregistered'; Value = 122830001 },
        @{ Label = 'Off Road'; Value = 122830002 }
    )) {
        $attribute.OptionSet.Options.Add(
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $option.Label), $option.Value)
        )
    }
    $attribute.DefaultFormValue = 122830002

    $create = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $create.EntityName = 'gr_equipment'
    $create.Attribute = $attribute
    $create.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($create) | Out-Null

    $publish = [Microsoft.Crm.Sdk.Messages.PublishAllXmlRequest]::new()
    $service.Execute($publish) | Out-Null
    Write-Output 'Created and published gr_equipment.gr_compliancestatus.'
} else {
    Write-Output 'gr_equipment.gr_compliancestatus already exists.'
}

$query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_equipment')
$query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
    'gr_equipmentid',
    'gr_fleet',
    'gr_serial',
    'gr_registrationnumber',
    'gr_wofrequired',
    'gr_currentwofexpiry',
    'gr_regoexpiry',
    'gr_compliancestatus'
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

$roadRegistered = [System.Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
$offRoad = [System.Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
$ambiguous = [System.Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
$alreadySet = 0

foreach ($record in $records) {
    if ($record.Attributes.ContainsKey('gr_compliancestatus')) {
        $alreadySet++
        continue
    }
    $wofRequired = [bool](Get-RecordValue $record 'gr_wofrequired')
    $hasRoadData = $record.Attributes.ContainsKey('gr_registrationnumber') -or
        $record.Attributes.ContainsKey('gr_currentwofexpiry') -or
        $record.Attributes.ContainsKey('gr_regoexpiry')
    if ($wofRequired) {
        $roadRegistered.Add($record)
    } elseif ($hasRoadData) {
        $ambiguous.Add($record)
    } else {
        $offRoad.Add($record)
    }
}

$reviewRows = foreach ($record in $ambiguous) {
    [pscustomobject]@{
        EquipmentId = $record.Id
        Fleet = [string](Get-RecordValue $record 'gr_fleet')
        Serial = [string](Get-RecordValue $record 'gr_serial')
        RegistrationNumber = [string](Get-RecordValue $record 'gr_registrationnumber')
        WofRequired = [bool](Get-RecordValue $record 'gr_wofrequired')
        CurrentWofExpiry = Get-DateOnlyText $record 'gr_currentwofexpiry'
        RegoExpiry = Get-DateOnlyText $record 'gr_regoexpiry'
        RequiredDecision = 'Deregistered or Off Road'
    }
}
if ($reviewRows.Count -gt 0) {
    $reviewRows | Export-Csv -LiteralPath $ReviewCsvPath -NoTypeInformation
}

if ($ApplyBackfill) {
    foreach ($item in @(
        @{ Records = $roadRegistered; Value = 122830000 },
        @{ Records = $offRoad; Value = 122830002 }
    )) {
        foreach ($record in $item.Records) {
            $update = [Microsoft.Xrm.Sdk.Entity]::new('gr_equipment', $record.Id)
            $update['gr_compliancestatus'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new($item.Value)
            $service.Update($update)
        }
    }
}

Write-Output "Equipment total: $($records.Count)"
Write-Output "Already classified: $alreadySet"
Write-Output "Safe Road Registered backfill: $($roadRegistered.Count)"
Write-Output "Safe Off Road backfill: $($offRoad.Count)"
Write-Output "Needs review: $($ambiguous.Count)"
if ($ambiguous.Count -gt 0) { Write-Output "Review CSV: $ReviewCsvPath" }
Write-Output $(if ($ApplyBackfill) { 'Safe backfill applied.' } else { 'Audit only; no Equipment records updated.' })
