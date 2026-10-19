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
$tables = @(
    @{ Logical = 'gr_job'; Marker = 'gr_gtentered' },
    @{ Logical = 'gr_jobbookentry'; Marker = 'gr_entered' },
    @{ Logical = 'gr_waikatojobbookentry'; Marker = 'gr_entered' },
    @{ Logical = 'gr_hastingsjobbookentry'; Marker = 'gr_entered' },
    @{ Logical = 'gr_christchurchjobbookentry'; Marker = 'gr_entered' }
)

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
function Get-Attribute($Service, [string]$Table, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $Table
    $request.LogicalName = $Name
    $request.RetrieveAsIfPublished = $true
    try { $Service.Execute($request).AttributeMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}
function Ensure-StatusColumn($Service, [string]$Table) {
    $existing = Get-Attribute $Service $Table 'gr_greentreestatus'
    if ($existing) {
        Require ([string]$existing.AttributeType -eq 'String') "Conflict: $Table.gr_greentreestatus is not text."
        Require ($existing.MaxLength -ge 20) "Conflict: $Table.gr_greentreestatus is shorter than 20 characters."
        Require (-not [bool]$existing.IsSecured) "Conflict: $Table.gr_greentreestatus has field security enabled."
        Write-Output "Verified $Table.gr_greentreestatus."
        return
    }
    if (-not $provision) { throw "Missing column: $Table.gr_greentreestatus" }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = 'gr_GreenTreeStatus'
    $attribute.DisplayName = New-Label 'GreenTree Status'
    $attribute.Description = New-Label 'Factual GreenTree state: open, closed or finalised. Does not drive operational Job status.'
    $attribute.MaxLength = 20
    $attribute.RequiredLevel = New-Required
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $Table
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created $Table.gr_greentreestatus."
}
function Ensure-CheckedOnColumn($Service, [string]$Table) {
    $existing = Get-Attribute $Service $Table 'gr_greentreestatuscheckedon'
    if ($existing) {
        Require ([string]$existing.AttributeType -eq 'DateTime') "Conflict: $Table.gr_greentreestatuscheckedon is not date/time."
        Require (-not [bool]$existing.IsSecured) "Conflict: $Table.gr_greentreestatuscheckedon has field security enabled."
        Write-Output "Verified $Table.gr_greentreestatuscheckedon."
        return
    }
    if (-not $provision) { throw "Missing column: $Table.gr_greentreestatuscheckedon" }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = 'gr_GreenTreeStatusCheckedOn'
    $attribute.DisplayName = New-Label 'GreenTree Status Checked On'
    $attribute.Description = New-Label 'UTC time of the last exact GreenTree Job status check. Used only to enforce polling cadence.'
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
    $behavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::new()
    $behavior.Value = 'TimeZoneIndependent'
    $attribute.DateTimeBehavior = $behavior
    $attribute.RequiredLevel = New-Required
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $Table
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created $Table.gr_greentreestatuscheckedon."
}
function Publish-Tables($Service) {
    $entities = ($tables | ForEach-Object { "<entity>$($_.Logical)</entity>" }) -join ''
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = "<importexportxml><entities>$entities</entities></importexportxml>"
    $Service.Execute($request) | Out-Null
}

Import-Sdk
$service = Connect-Dataverse
try {
    foreach ($table in $tables) {
        $marker = Get-Attribute $service $table.Logical $table.Marker
        Require ($null -ne $marker -and [string]$marker.AttributeType -eq 'Boolean') "Missing or invalid $($table.Logical).$($table.Marker) marker."
        Require (-not [bool]$marker.IsSecured) "Conflict: $($table.Logical).$($table.Marker) has field security enabled."
        Ensure-StatusColumn $service $table.Logical
        Ensure-CheckedOnColumn $service $table.Logical
    }
    if ($provision) { Publish-Tables $service }
    foreach ($table in $tables) { Ensure-StatusColumn $service $table.Logical; Ensure-CheckedOnColumn $service $table.Logical }
    Write-Output "GreenTree Job status schema $($Mode.ToLowerInvariant()) completed successfully."
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
