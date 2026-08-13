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

$entityName = 'gr_mechanic'
$definitions = @(
    @{ Schema = 'gr_Department'; Logical = 'gr_department'; Display = 'Department'; Kind = 'Choice'; Options = @('Service', 'Accounts', 'Sales', 'Management', 'Other') },
    @{ Schema = 'gr_JobAssignmentEnabled'; Logical = 'gr_jobassignmentenabled'; Display = 'Can be assigned Jobs'; Kind = 'Boolean'; Default = $true },
    @{ Schema = 'gr_CustomerEmailCcEnabled'; Logical = 'gr_customeremailccenabled'; Display = 'CC on customer emails'; Kind = 'Boolean'; Default = $false }
)

if (($definitions.Logical | Sort-Object -Unique).Count -ne $definitions.Count) { throw 'Staff Directory schema definition contains duplicate columns.' }
if ($ValidateDefinition) { Write-Output 'Staff Directory schema definition is valid. No Dataverse connection was created.'; return }

function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }
function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' | Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } | Where-Object { Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $path
}
function Import-Sdk {
    $path = Get-ToolsPath
    'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll' |
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
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}
function Assert-Attribute($Attribute, $Definition) {
    $expected = if ($Definition.Kind -eq 'Choice') { 'Picklist' } else { 'Boolean' }
    if ([string]$Attribute.AttributeType -ne $expected) { throw "Conflict: $entityName.$($Definition.Logical) must be $expected." }
    if ($Definition.Kind -eq 'Choice') {
        $actual = @($Attribute.OptionSet.Options | Sort-Object Value)
        if ($actual.Count -ne $Definition.Options.Count) { throw "Conflict: $entityName.$($Definition.Logical) choice count." }
        for ($index = 0; $index -lt $Definition.Options.Count; $index++) {
            if ($actual[$index].Value -ne 122830000 + $index -or $actual[$index].Label.UserLocalizedLabel.Label -ne $Definition.Options[$index]) {
                throw "Conflict: $entityName.$($Definition.Logical) choice option $index."
            }
        }
    } elseif ($Attribute.DefaultValue -ne $Definition.Default) {
        throw "Conflict: $entityName.$($Definition.Logical) Boolean default."
    }
}
function Ensure-Attribute($Service, $Definition, [bool]$Provision) {
    $existing = Get-Attribute $Service $Definition.Logical
    if ($existing) { Assert-Attribute $existing $Definition; return }
    if (-not $Provision) { throw "Missing column: $entityName.$($Definition.Logical)" }
    if ($Definition.Kind -eq 'Choice') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
        $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
        $attribute.OptionSet.IsGlobal = $false
        for ($index = 0; $index -lt $Definition.Options.Count; $index++) {
            $attribute.OptionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $Definition.Options[$index]), 122830000 + $index))
        }
    } else {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
        $attribute.DefaultValue = $Definition.Default
        $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
        )
    }
    $attribute.SchemaName = $Definition.Schema
    $attribute.DisplayName = New-Label $Definition.Display
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $entityName
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column $entityName.$($Definition.Logical)"
}
function Publish-Staff($Service) {
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = '<importexportxml><entities><entity>gr_mechanic</entity></entities></importexportxml>'
    $Service.Execute($request) | Out-Null
}

Import-Sdk
$service = Connect-Dataverse
try {
    if ($Mode -eq 'Inspect') {
        foreach ($definition in $definitions) {
            $attribute = Get-Attribute $service $definition.Logical
            [pscustomobject]@{ Table = $entityName; Column = $definition.Logical; Exists = ($null -ne $attribute); Type = if ($attribute) { [string]$attribute.AttributeType } else { $null } }
        }
    } else {
        foreach ($definition in $definitions) { Ensure-Attribute $service $definition ($Mode -eq 'Provision') }
        if ($Mode -eq 'Provision') { Publish-Staff $service }
        foreach ($definition in $definitions) { Ensure-Attribute $service $definition $false }
        Write-Output $(if ($Mode -eq 'Provision') { 'Staff Directory schema provisioned and verified successfully.' } else { 'Staff Directory schema verified successfully.' })
    }
} finally { if ($service -is [IDisposable]) { $service.Dispose() } }
