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
$definitions = @(
    @{
        Schema = 'gr_HourMeterReadingType'
        Logical = 'gr_hourmeterreadingtype'
        Display = 'Hour Meter Reading Type'
        Kind = 'Choice'
        Options = @(
            @{ Label = 'Actual'; Value = 122830000 },
            @{ Label = 'Estimated'; Value = 122830001 }
        )
    },
    @{
        Schema = 'gr_HourMeterRecordedDate'
        Logical = 'gr_hourmeterrecordeddate'
        Display = 'Hour Meter Recorded Date'
        Kind = 'DateOnly'
    }
)

if (($definitions.Logical | Sort-Object -Unique).Count -ne $definitions.Count) {
    throw 'Hour-meter reading schema definition contains duplicate columns.'
}
if ($ValidateDefinition) {
    Write-Output 'Hour-meter reading schema definition is valid. No Dataverse connection was created.'
    return
}

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
    $expectedType = if ($Definition.Kind -eq 'Choice') { 'Picklist' } else { 'DateTime' }
    if ([string]$Attribute.AttributeType -ne $expectedType) {
        throw "Conflict: $entityName.$($Definition.Logical) must be $expectedType."
    }
    if ([string]$Attribute.RequiredLevel.Value -ne 'None') {
        throw "Conflict: $entityName.$($Definition.Logical) must be optional."
    }
    if ($Definition.Kind -eq 'Choice') {
        if ($Attribute.OptionSet.IsGlobal) { throw "Conflict: $entityName.$($Definition.Logical) must use a local Choice." }
        $actual = @($Attribute.OptionSet.Options | Sort-Object Value)
        if ($actual.Count -ne $Definition.Options.Count) {
            throw "Conflict: $entityName.$($Definition.Logical) choice count."
        }
        for ($index = 0; $index -lt $Definition.Options.Count; $index++) {
            $expected = $Definition.Options[$index]
            if ($actual[$index].Value -ne $expected.Value -or $actual[$index].Label.UserLocalizedLabel.Label -ne $expected.Label) {
                throw "Conflict: $entityName.$($Definition.Logical) choice option $index."
            }
        }
    } else {
        if ([string]$Attribute.Format -ne 'DateOnly' -or [string]$Attribute.DateTimeBehavior.Value -ne 'DateOnly') {
            throw "Conflict: $entityName.$($Definition.Logical) must use Date Only behaviour and format."
        }
    }
}

function Ensure-Attribute($Service, $Definition, [bool]$Provision) {
    $existing = Get-Attribute $Service $Definition.Logical
    if ($existing) {
        Assert-Attribute $existing $Definition
        Write-Output "Verified column $entityName.$($Definition.Logical)"
        return
    }
    if (-not $Provision) { throw "Missing column: $entityName.$($Definition.Logical)" }

    if ($Definition.Kind -eq 'Choice') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
        $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
        $attribute.OptionSet.IsGlobal = $false
        foreach ($option in $Definition.Options) {
            $attribute.OptionSet.Options.Add(
                [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $option.Label), $option.Value)
            )
        }
    } else {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
        $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateOnly
        $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::DateOnly
    }
    $attribute.SchemaName = $Definition.Schema
    $attribute.DisplayName = New-Label $Definition.Display
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )

    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $entityName
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column $entityName.$($Definition.Logical)"
}

function Publish-Job($Service) {
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = '<importexportxml><entities><entity>gr_job</entity></entities></importexportxml>'
    $Service.Execute($request) | Out-Null
    Write-Output 'Published Job metadata.'
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
        foreach ($definition in $definitions) {
            Ensure-Attribute $service $definition ($Mode -eq 'Provision')
        }
        if ($Mode -eq 'Provision') { Publish-Job $service }
        foreach ($definition in $definitions) { Ensure-Attribute $service $definition $false }
        Write-Output $(if ($Mode -eq 'Provision') {
            'Hour-meter reading schema provisioned, published, and verified successfully.'
        } else {
            'Hour-meter reading schema verified successfully.'
        })
    }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
