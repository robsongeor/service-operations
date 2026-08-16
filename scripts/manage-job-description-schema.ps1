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

$entityName = 'gr_job'
$logicalName = 'gr_description'
$maxLength = 4000

if ($ValidateDefinition) {
    Write-Output 'Job description schema definition is valid. No Dataverse connection was created.'
    return
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

function Get-Attribute($Service) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $entityName
    $request.LogicalName = $logicalName
    $request.RetrieveAsIfPublished = $true
    return $Service.Execute($request).AttributeMetadata
}

function Assert-CompatibleType($Attribute) {
    $type = [string]$Attribute.AttributeType
    if ($type -notin @('String', 'Memo')) {
        throw "Conflict: $entityName.$logicalName is $type, expected text or multiline text."
    }
}

function Assert-TargetLength($Attribute) {
    Assert-CompatibleType $Attribute
    if ([int]$Attribute.MaxLength -ne $maxLength) {
        throw "Conflict: $entityName.$logicalName maximum length is $($Attribute.MaxLength), expected $maxLength."
    }
}

function Set-TargetLength($Service) {
    $attribute = Get-Attribute $Service
    Assert-CompatibleType $attribute
    if ([int]$attribute.MaxLength -eq $maxLength) {
        Write-Output "Verified column $entityName.$logicalName already allows $maxLength characters."
        return $false
    }
    if ([int]$attribute.MaxLength -gt $maxLength) {
        throw "Refusing to reduce $entityName.$logicalName from $($attribute.MaxLength) to $maxLength characters."
    }

    $attribute.MaxLength = $maxLength
    $request = [Microsoft.Xrm.Sdk.Messages.UpdateAttributeRequest]::new()
    $request.EntityName = $entityName
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $request.MergeLabels = $true
    $Service.Execute($request) | Out-Null
    Write-Output "Increased $entityName.$logicalName maximum length to $maxLength characters."
    return $true
}

function Publish-Jobs($Service) {
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = '<importexportxml><entities><entity>gr_job</entity></entities></importexportxml>'
    $Service.Execute($request) | Out-Null
    Write-Output 'Published Job metadata.'
}

Import-Sdk
$service = Connect-Dataverse
try {
    if ($Mode -eq 'Inspect') {
        $attribute = Get-Attribute $service
        [pscustomobject]@{
            Table = $entityName
            Column = $logicalName
            Type = [string]$attribute.AttributeType
            MaxLength = [int]$attribute.MaxLength
            RequiredLevel = [string]$attribute.RequiredLevel.Value
        }
    } elseif ($Mode -eq 'Provision') {
        $changed = Set-TargetLength $service
        if ($changed) { Publish-Jobs $service }
        Assert-TargetLength (Get-Attribute $service)
        Write-Output 'Job description schema provisioned and verified successfully.'
    } else {
        Assert-TargetLength (Get-Attribute $service)
        Write-Output 'Job description schema verified successfully.'
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
