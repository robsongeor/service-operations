param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
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

function New-RequiredLevel {
    return [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
}

function Get-Attribute([string]$logicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = 'gr_equipment'
        $request.LogicalName = $logicalName
        $request.RetrieveAsIfPublished = $true
        return $service.Execute($request).AttributeMetadata
    } catch {
        return $null
    }
}

function Add-Attribute([Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$attribute) {
    $logicalName = $attribute.SchemaName.ToLowerInvariant()
    if ($null -ne (Get-Attribute $logicalName)) {
        Write-Output "gr_equipment.$logicalName already exists"
        return $false
    }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_equipment'
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created gr_equipment.$logicalName"
    return $true
}

function Add-Choice(
    [string]$schemaName,
    [string]$displayName,
    [array]$options,
    [Nullable[int]]$defaultValue = $null
) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.RequiredLevel = New-RequiredLevel
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $attribute.OptionSet.IsGlobal = $false
    foreach ($option in $options) {
        $attribute.OptionSet.Options.Add(
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $option.Label), $option.Value)
        )
    }
    if ($null -ne $defaultValue) { $attribute.DefaultFormValue = $defaultValue }
    return Add-Attribute $attribute
}

function Add-Boolean([string]$schemaName, [string]$displayName, [bool]$defaultValue) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.RequiredLevel = New-RequiredLevel
    $attribute.DefaultValue = $defaultValue
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
    )
    return Add-Attribute $attribute
}

function Add-WholeNumber([string]$schemaName, [string]$displayName) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.RequiredLevel = New-RequiredLevel
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.IntegerFormat]::None
    $attribute.MinValue = 1
    $attribute.MaxValue = 3650
    return Add-Attribute $attribute
}

$createdAny = $false
$createdAny = (Add-Choice 'gr_PowerType' 'Power Type' @(
    @{ Label = 'ICE'; Value = 122830000 },
    @{ Label = 'Electric'; Value = 122830001 },
    @{ Label = 'Other/Unknown'; Value = 122830002 }
)) -or $createdAny
$createdAny = (Add-Choice 'gr_ServiceProgramme' 'Service Programme' @(
    @{ Label = 'ICE Standard'; Value = 122830000 },
    @{ Label = 'Electric Standard'; Value = 122830001 },
    @{ Label = 'Custom'; Value = 122830002 }
) 122830000) -or $createdAny
$createdAny = (Add-Choice 'gr_MaintenanceProfile' 'Maintenance Profile' @(
    @{ Label = 'High Usage'; Value = 122830000 },
    @{ Label = 'Standard'; Value = 122830001 },
    @{ Label = 'Low Usage'; Value = 122830002 },
    @{ Label = 'Custom'; Value = 122830003 }
) 122830001) -or $createdAny
$createdAny = (Add-Boolean 'gr_CustomAEnabled' 'Custom A Enabled' $true) -or $createdAny
$createdAny = (Add-Boolean 'gr_CustomBEnabled' 'Custom B Enabled' $false) -or $createdAny
$createdAny = (Add-Boolean 'gr_CustomCEnabled' 'Custom C Enabled' $true) -or $createdAny
$createdAny = (Add-WholeNumber 'gr_CustomAIntervalDays' 'Custom A Interval Days') -or $createdAny
$createdAny = (Add-WholeNumber 'gr_CustomBIntervalDays' 'Custom B Interval Days') -or $createdAny
$createdAny = (Add-WholeNumber 'gr_CustomCIntervalDays' 'Custom C Interval Days') -or $createdAny

if ($createdAny) {
    $publish = [Microsoft.Crm.Sdk.Messages.PublishAllXmlRequest]::new()
    $service.Execute($publish) | Out-Null
    Write-Output 'Published maintenance programme columns.'
}

$query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_equipment')
$query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
    'gr_equipmentid',
    'gr_serviceprogramme',
    'gr_maintenanceprofile'
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

$programmeBackfilled = 0
$profileBackfilled = 0
foreach ($record in $records) {
    $update = [Microsoft.Xrm.Sdk.Entity]::new('gr_equipment', $record.Id)
    if (-not $record.Attributes.ContainsKey('gr_serviceprogramme')) {
        $update['gr_serviceprogramme'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(122830000)
        $programmeBackfilled++
    }
    if (-not $record.Attributes.ContainsKey('gr_maintenanceprofile')) {
        $update['gr_maintenanceprofile'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(122830001)
        $profileBackfilled++
    }
    if ($update.Attributes.Count -gt 0) { $service.Update($update) }
}

$expected = @{
    gr_powertype = @('ICE=122830000', 'Electric=122830001', 'Other/Unknown=122830002')
    gr_serviceprogramme = @('ICE Standard=122830000', 'Electric Standard=122830001', 'Custom=122830002')
    gr_maintenanceprofile = @('High Usage=122830000', 'Standard=122830001', 'Low Usage=122830002', 'Custom=122830003')
}
foreach ($logicalName in @(
    'gr_powertype',
    'gr_serviceprogramme',
    'gr_maintenanceprofile',
    'gr_customaenabled',
    'gr_custombenabled',
    'gr_customcenabled',
    'gr_customaintervaldays',
    'gr_custombintervaldays',
    'gr_customcintervaldays'
)) {
    $metadata = Get-Attribute $logicalName
    if ($null -eq $metadata) { throw "Verification failed: gr_equipment.$logicalName is missing." }
    Write-Output "Verified gr_equipment.$logicalName ($($metadata.AttributeType))"
    if ($expected.ContainsKey($logicalName)) {
        $actual = @($metadata.OptionSet.Options | ForEach-Object {
            "$($_.Label.UserLocalizedLabel.Label)=$($_.Value)"
        })
        foreach ($option in $expected[$logicalName]) {
            if ($actual -notcontains $option) { throw "Verification failed: $logicalName option $option is missing." }
        }
    }
}

Write-Output ''
Write-Output 'Maintenance programme Dataverse setup complete.'
Write-Output "Equipment records inspected: $($records.Count)"
Write-Output "Service Programme values backfilled to ICE Standard: $programmeBackfilled"
Write-Output "Maintenance Profile values backfilled to Standard: $profileBackfilled"
Write-Output 'Power Type values were intentionally not inferred or backfilled.'
