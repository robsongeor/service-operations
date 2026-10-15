param(
    [ValidateSet('Verify', 'Provision')]
    [string]$Mode = 'Verify',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$provision = $Mode -eq 'Provision'

function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }
function New-Required { [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new([Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None) }
function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    $path
}
function Import-Sdk {
    $path = Get-ToolsPath
    'Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll' |
        ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $path $_)) | Out-Null }
}
function Connect-Dataverse {
    $connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
    if (-not [string]::IsNullOrWhiteSpace($UserName)) { $connection += ";UserName=$($UserName.Trim())" }
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}
function Get-Attribute($Service, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = 'gr_job'
    $request.LogicalName = $Name
    $request.RetrieveAsIfPublished = $true
    try { $Service.Execute($request).AttributeMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}
function Ensure-StringColumn($Service, [string]$SchemaName, [string]$LogicalName, [string]$DisplayName, [int]$Length) {
    $existing = Get-Attribute $Service $LogicalName
    if ($existing) {
        Require ([string]$existing.AttributeType -eq 'String') "Conflict: gr_job.$LogicalName is not text."
        Require ($existing.MaxLength -ge $Length) "Conflict: gr_job.$LogicalName is shorter than $Length characters."
        Require (-not [bool]$existing.IsSecured) "Conflict: gr_job.$LogicalName has field security enabled."
        Write-Output "Verified gr_job.$LogicalName."
        return
    }
    if (-not $provision) { throw "Missing column: gr_job.$LogicalName" }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.Description = New-Label 'Identity returned by the confirmed TimeCloud Job Item integration.'
    $attribute.MaxLength = $Length
    $attribute.RequiredLevel = New-Required
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_job'
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created gr_job.$LogicalName."
}
function Publish-Job($Service) {
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = '<importexportxml><entities><entity>gr_job</entity></entities></importexportxml>'
    $Service.Execute($request) | Out-Null
}

Import-Sdk
$service = Connect-Dataverse
try {
    $marker = Get-Attribute $service 'gr_timecloudentered'
    Require ($null -ne $marker -and [string]$marker.AttributeType -eq 'Boolean') 'Missing or invalid gr_job.gr_timecloudentered marker.'
    Require (-not [bool]$marker.IsSecured) 'Conflict: gr_job.gr_timecloudentered has field security enabled.'
    Ensure-StringColumn $service 'gr_TimecloudJobItemId' 'gr_timecloudjobitemid' 'TimeCloud Job Item ID' 100
    Ensure-StringColumn $service 'gr_TimecloudCode' 'gr_timecloudcode' 'TimeCloud Code' 100
    if ($provision) { Publish-Job $service }
    Ensure-StringColumn $service 'gr_TimecloudJobItemId' 'gr_timecloudjobitemid' 'TimeCloud Job Item ID' 100
    Ensure-StringColumn $service 'gr_TimecloudCode' 'gr_timecloudcode' 'TimeCloud Code' 100
    Write-Output "TimeCloud Job schema $($Mode.ToLowerInvariant()) completed successfully."
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
