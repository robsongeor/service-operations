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

$retrieve = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
$retrieve.EntityLogicalName = 'gr_site'
$retrieve.LogicalName = 'gr_defaultmaintenanceprofile'
$retrieve.RetrieveAsIfPublished = $true
try {
    $service.Execute($retrieve) | Out-Null
    Write-Output 'gr_site.gr_defaultmaintenanceprofile already exists'
    exit 0
} catch {
    # Expected when the column has not been provisioned.
}

$attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
$attribute.SchemaName = 'gr_DefaultMaintenanceProfile'
$attribute.DisplayName = [Microsoft.Xrm.Sdk.Label]::new('Default Maintenance Profile', 1033)
$attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
    [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
)
$attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
$attribute.OptionSet.IsGlobal = $false
foreach ($option in @(
    @{ Label = 'High Usage'; Value = 122830000 }
    @{ Label = 'Standard'; Value = 122830001 }
    @{ Label = 'Low Usage'; Value = 122830002 }
    @{ Label = 'Custom'; Value = 122830003 }
)) {
    $attribute.OptionSet.Options.Add(
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new(
            [Microsoft.Xrm.Sdk.Label]::new($option.Label, 1033),
            $option.Value
        )
    )
}

$create = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
$create.EntityName = 'gr_site'
$create.Attribute = $attribute
$create.SolutionUniqueName = $SolutionUniqueName
$service.Execute($create) | Out-Null

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_site</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null
Write-Output 'Created and published gr_site.gr_defaultmaintenanceprofile'
