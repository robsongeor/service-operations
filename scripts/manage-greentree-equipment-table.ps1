param(
    [ValidateSet('Inspect', 'Provision', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$tableLogicalName = 'gr_greentreeequipment'
$tableSetName = 'gr_greentreeequipments'
$keyLogicalName = 'gr_greentreeequipment_sourcekey_key'

function New-Label([string]$Text) {
    return [Microsoft.Xrm.Sdk.Label]::new($Text, 1033)
}

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
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
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    return $client
}

function Get-Entity($Service) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $tableLogicalName
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).EntityMetadata }
    catch {
        if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }
        throw
    }
}

function Get-Attribute($Service, [string]$LogicalName) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $tableLogicalName
    $request.LogicalName = $LogicalName
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).AttributeMetadata }
    catch {
        if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }
        throw
    }
}

function New-TextAttribute([string]$SchemaName, [string]$DisplayName, [int]$MaxLength, [bool]$Required = $false) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.Description = New-Label "Greentree equipment export field: $DisplayName."
    $attribute.MaxLength = $MaxLength
    $attribute.FormatName = [Microsoft.Xrm.Sdk.Metadata.StringFormatName]::Text
    $level = if ($Required) {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    } else {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    }
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new($level)
    return $attribute
}

function Ensure-Table($Service, [bool]$Provision) {
    $existing = Get-Entity $Service
    if ($existing) {
        if ($existing.EntitySetName -ne $tableSetName) {
            throw "Conflict: $tableLogicalName has unexpected entity set $($existing.EntitySetName)."
        }
        Write-Output "Verified table $tableLogicalName."
        return
    }
    if (-not $Provision) { throw "Missing table: $tableLogicalName" }

    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = 'gr_GreentreeEquipment'
    $entity.DisplayName = New-Label 'Greentree Equipment Table'
    $entity.DisplayCollectionName = New-Label 'Greentree Equipment Table'
    $entity.Description = New-Label 'Read-only staging mirror of the Greentree EquipmentMaster export in SharePoint.'
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned
    $entity.IsActivity = $false

    $primary = New-TextAttribute 'gr_Name' 'Name' 200 $true
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $entity
    $request.PrimaryAttribute = $primary
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created table $tableLogicalName in $SolutionUniqueName."
}

$columns = @(
    @{ Schema = 'gr_SourceKey'; Logical = 'gr_sourcekey'; Display = 'Source Key'; Length = 450; Required = $true },
    @{ Schema = 'gr_GreentreeCode'; Logical = 'gr_greentreecode'; Display = 'Greentree Code'; Length = 100; Required = $true },
    @{ Schema = 'gr_Make'; Logical = 'gr_make'; Display = 'Make'; Length = 100; Required = $false },
    @{ Schema = 'gr_Model'; Logical = 'gr_model'; Display = 'Model'; Length = 100; Required = $false },
    @{ Schema = 'gr_Serial'; Logical = 'gr_serial'; Display = 'Serial'; Length = 150; Required = $false },
    @{ Schema = 'gr_Site'; Logical = 'gr_site'; Display = 'Site'; Length = 200; Required = $false },
    @{ Schema = 'gr_SiteAddress1'; Logical = 'gr_siteaddress1'; Display = 'Site Address 1'; Length = 250; Required = $false },
    @{ Schema = 'gr_SiteAddress2'; Logical = 'gr_siteaddress2'; Display = 'Site Address 2'; Length = 250; Required = $false }
)

function Ensure-Columns($Service, [bool]$Provision) {
    foreach ($column in $columns) {
        $existing = Get-Attribute $Service $column.Logical
        if ($existing) {
            if ([string]$existing.AttributeType -ne 'String' -or $existing.MaxLength -lt $column.Length) {
                throw "Conflict: $tableLogicalName.$($column.Logical) has an incompatible definition."
            }
            Write-Output "Verified column $tableLogicalName.$($column.Logical)."
            continue
        }
        if (-not $Provision) { throw "Missing column: $tableLogicalName.$($column.Logical)" }
        $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
        $request.EntityName = $tableLogicalName
        $request.Attribute = New-TextAttribute $column.Schema $column.Display $column.Length $column.Required
        $request.SolutionUniqueName = $SolutionUniqueName
        $Service.Execute($request) | Out-Null
        Write-Output "Created column $tableLogicalName.$($column.Logical)."
    }
}

function Ensure-Key($Service, [bool]$Provision) {
    $entity = Get-Entity $Service
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $tableLogicalName
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    $request.RetrieveAsIfPublished = $true
    $metadata = $Service.Execute($request).EntityMetadata
    $existing = @($metadata.Keys | Where-Object { $null -ne $_ -and $_.LogicalName -eq $keyLogicalName })
    if ($existing.Count -eq 1) {
        Write-Output "Verified alternate key $keyLogicalName ($($existing[0].EntityKeyIndexStatus))."
        return
    }
    if ($existing.Count -gt 1) { throw "Multiple alternate keys named $keyLogicalName were found." }
    if (-not $Provision) { throw "Missing alternate key: $keyLogicalName" }

    $key = [Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new()
    $key.SchemaName = 'gr_GreentreeEquipment_SourceKey_Key'
    $key.DisplayName = New-Label 'Greentree Equipment Source Key'
    $key.KeyAttributes = @('gr_sourcekey')
    $create = [Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new()
    $create.EntityName = $tableLogicalName
    $create.EntityKey = $key
    $create.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($create) | Out-Null
    Write-Output "Created alternate key $keyLogicalName."
}

function Publish-Table($Service) {
    $publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $publish.ParameterXml = "<importexportxml><entities><entity>$tableLogicalName</entity></entities></importexportxml>"
    $Service.Execute($publish) | Out-Null
    Write-Output "Published $tableLogicalName."
}

Import-Sdk
$service = Connect-Dataverse
try {
    $provision = $Mode -eq 'Provision'
    Ensure-Table $service $provision
    Ensure-Columns $service $provision
    Ensure-Key $service $provision
    if ($provision) { Publish-Table $service }
    if ($Mode -ne 'Inspect') {
        Ensure-Table $service $false
        Ensure-Columns $service $false
        Ensure-Key $service $false
    }
    Write-Output "Greentree Equipment Table $($Mode.ToLowerInvariant()) completed successfully."
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
