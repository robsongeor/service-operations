param(
    [ValidateSet('Inspect', 'Provision', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [switch]$ValidateDefinition
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$entityName = 'gr_equipment'
$schemaName = 'gr_AlternateFleetNumbers'
$logicalName = 'gr_alternatefleetnumbers'
$displayName = 'Alternate Fleet Numbers'
$maxLength = 2000

if ($ValidateDefinition) {
    Write-Output 'Equipment alternate Fleet Number schema definition is valid. No Dataverse connection was created.'
    return
}

function New-Label([string]$Text) { return [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }

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

function Get-Attribute($Service) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $entityName
    $request.LogicalName = $logicalName
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).AttributeMetadata }
    catch {
        if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }
        throw
    }
}

function Assert-Attribute($Attribute) {
    if ([string]$Attribute.AttributeType -ne 'Memo' -or [int]$Attribute.MaxLength -ne $maxLength) {
        throw "Conflict: $entityName.$logicalName must be multiline text with maximum length $maxLength."
    }
    if ([string]$Attribute.RequiredLevel.Value -ne 'None') {
        throw "Conflict: $entityName.$logicalName must be optional."
    }
}

function Ensure-Attribute($Service, [bool]$Provision) {
    $existing = Get-Attribute $Service
    if ($existing) {
        Assert-Attribute $existing
        Write-Output "Verified column $entityName.$logicalName"
        return
    }
    if (-not $Provision) { throw "Missing column: $entityName.$logicalName" }

    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.Description = New-Label 'Former, customer, and Site-specific Fleet Numbers; one identifier per line.'
    $attribute.MaxLength = $maxLength
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.StringFormat]::TextArea
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $entityName
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column $entityName.$logicalName"
}

function Publish-Equipment($Service) {
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = '<importexportxml><entities><entity>gr_equipment</entity></entities></importexportxml>'
    $Service.Execute($request) | Out-Null
    Write-Output 'Published Equipment metadata.'
}

Import-Sdk
$service = Connect-Dataverse
try {
    if ($Mode -eq 'Inspect') {
        $attribute = Get-Attribute $service
        [pscustomobject]@{
            Table = $entityName
            Column = $logicalName
            Exists = ($null -ne $attribute)
            Type = if ($attribute) { [string]$attribute.AttributeType } else { $null }
            MaxLength = if ($attribute) { [int]$attribute.MaxLength } else { $null }
        }
    } else {
        Ensure-Attribute $service ($Mode -eq 'Provision')
        if ($Mode -eq 'Provision') { Publish-Equipment $service }
        Ensure-Attribute $service $false
        Write-Output $(if ($Mode -eq 'Provision') {
            'Equipment alternate Fleet Number schema provisioned, published, and verified successfully.'
        } else {
            'Equipment alternate Fleet Number schema verified successfully.'
        })
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
