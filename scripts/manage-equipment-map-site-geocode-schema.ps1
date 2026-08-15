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

$entityName = 'gr_site'
$definitions = @(
    @{ Schema='gr_GeocodeLatitude'; Logical='gr_geocodelatitude'; Display='Geocode Latitude'; Kind='Decimal'; Min=[decimal]-90; Max=[decimal]90; Precision=6 },
    @{ Schema='gr_GeocodeLongitude'; Logical='gr_geocodelongitude'; Display='Geocode Longitude'; Kind='Decimal'; Min=[decimal]-180; Max=[decimal]180; Precision=6 },
    @{ Schema='gr_GeocodeSourceAddress'; Logical='gr_geocodesourceaddress'; Display='Geocode Source Address'; Kind='Text'; Length=500 },
    @{ Schema='gr_GeocodeFormattedAddress'; Logical='gr_geocodeformattedaddress'; Display='Geocode Formatted Address'; Kind='Text'; Length=500 },
    @{ Schema='gr_GeocodeResolvedOn'; Logical='gr_geocoderesolvedon'; Display='Geocode Resolved On'; Kind='DateTime' }
)

if (($definitions.Logical | Sort-Object -Unique).Count -ne $definitions.Count) {
    throw 'Equipment Map Site geocode schema definition contains duplicate columns.'
}
if ($ValidateDefinition) {
    Write-Output 'Equipment Map Site geocode schema definition is valid. No Dataverse connection was created.'
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

function Get-Attribute($Service, [string]$LogicalName) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $entityName
    $request.LogicalName = $LogicalName
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).AttributeMetadata }
    catch {
        if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }
        throw
    }
}

function Assert-Attribute($Attribute, $Definition) {
    if ([string]$Attribute.RequiredLevel.Value -ne 'None') {
        throw "Conflict: $entityName.$($Definition.Logical) must be optional."
    }
    switch ($Definition.Kind) {
        'Decimal' {
            if ([string]$Attribute.AttributeType -ne 'Decimal' -or
                [decimal]$Attribute.MinValue -ne $Definition.Min -or
                [decimal]$Attribute.MaxValue -ne $Definition.Max -or
                [int]$Attribute.Precision -ne $Definition.Precision) {
                throw "Conflict: $entityName.$($Definition.Logical) decimal definition does not match."
            }
        }
        'Text' {
            if ([string]$Attribute.AttributeType -ne 'String' -or [int]$Attribute.MaxLength -ne $Definition.Length) {
                throw "Conflict: $entityName.$($Definition.Logical) text definition does not match."
            }
        }
        'DateTime' {
            if ([string]$Attribute.AttributeType -ne 'DateTime' -or
                [string]$Attribute.Format -ne 'DateAndTime' -or
                [string]$Attribute.DateTimeBehavior.Value -ne 'UserLocal') {
                throw "Conflict: $entityName.$($Definition.Logical) date/time definition does not match."
            }
        }
    }
}

function New-Attribute($Definition) {
    switch ($Definition.Kind) {
        'Decimal' {
            $attribute = [Microsoft.Xrm.Sdk.Metadata.DecimalAttributeMetadata]::new()
            $attribute.MinValue = $Definition.Min
            $attribute.MaxValue = $Definition.Max
            $attribute.Precision = $Definition.Precision
        }
        'Text' {
            $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
            $attribute.MaxLength = $Definition.Length
        }
        'DateTime' {
            $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
            $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
            $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
        }
        default { throw "Unsupported column kind: $($Definition.Kind)" }
    }
    $attribute.SchemaName = $Definition.Schema
    $attribute.DisplayName = New-Label $Definition.Display
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
    return $attribute
}

function Ensure-Attribute($Service, $Definition, [bool]$Provision) {
    $existing = Get-Attribute $Service $Definition.Logical
    if ($existing) {
        Assert-Attribute $existing $Definition
        Write-Output "Verified column $entityName.$($Definition.Logical)"
        return
    }
    if (-not $Provision) { throw "Missing column: $entityName.$($Definition.Logical)" }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $entityName
    $request.Attribute = New-Attribute $Definition
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column $entityName.$($Definition.Logical)"
}

function Publish-Site($Service) {
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = '<importexportxml><entities><entity>gr_site</entity></entities></importexportxml>'
    $Service.Execute($request) | Out-Null
    Write-Output 'Published Site metadata.'
}

Import-Sdk
$service = Connect-Dataverse
try {
    if ($Mode -eq 'Inspect') {
        foreach ($definition in $definitions) {
            $attribute = Get-Attribute $service $definition.Logical
            [pscustomobject]@{
                Table = $entityName
                Column = $definition.Logical
                Exists = ($null -ne $attribute)
                Type = if ($attribute) { [string]$attribute.AttributeType } else { $null }
            }
        }
    } else {
        foreach ($definition in $definitions) { Ensure-Attribute $service $definition ($Mode -eq 'Provision') }
        if ($Mode -eq 'Provision') { Publish-Site $service }
        foreach ($definition in $definitions) { Ensure-Attribute $service $definition $false }
        Write-Output $(if ($Mode -eq 'Provision') {
            'Equipment Map Site geocode schema provisioned, published, and verified successfully.'
        } else {
            'Equipment Map Site geocode schema verified successfully.'
        })
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
