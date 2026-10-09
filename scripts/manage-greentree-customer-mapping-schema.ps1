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

$columns = @(
    @{ Schema = 'gr_GreenTreeCustomerCode'; Display = 'Default GreenTree Customer Code'; Length = 50; Description = 'Optional Site-level default for GreenTree entry. Does not alter the operational Customer or historical GreenTree Jobs.' }
    @{ Schema = 'gr_GreenTreeCustomerName'; Display = 'Default GreenTree Customer Name'; Length = 200; Description = 'Readable name for the optional Site-level GreenTree customer default.' }
)
$created = $false
foreach ($column in $columns) {
    $logicalName = $column.Schema.ToLowerInvariant()
    $retrieve = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $retrieve.EntityLogicalName = 'gr_site'
    $retrieve.LogicalName = $logicalName
    $retrieve.RetrieveAsIfPublished = $true
    try {
        $service.Execute($retrieve) | Out-Null
        Write-Output "gr_site.$logicalName already exists"
        continue
    } catch {
        # Expected when the column has not been provisioned.
    }

    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = $column.Schema
    $attribute.DisplayName = [Microsoft.Xrm.Sdk.Label]::new($column.Display, 1033)
    $attribute.Description = [Microsoft.Xrm.Sdk.Label]::new($column.Description, 1033)
    $attribute.MaxLength = $column.Length
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )

    $create = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $create.EntityName = 'gr_site'
    $create.Attribute = $attribute
    $create.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($create) | Out-Null
    $created = $true
    Write-Output "Created gr_site.$logicalName"
}

if ($created) {
    $publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $publish.ParameterXml = '<importexportxml><entities><entity>gr_site</entity></entities></importexportxml>'
    $service.Execute($publish) | Out-Null
    Write-Output 'Published GreenTree customer mapping columns on gr_site'
}
