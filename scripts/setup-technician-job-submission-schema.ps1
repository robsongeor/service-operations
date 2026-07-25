param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'
$pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$pacTools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1
if (-not $pacTools) { throw "Power Apps CLI SDK assemblies were not found under $pacRoot." }
@('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll') |
    ForEach-Object { [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $_)) | Out-Null }

$connectionString = @(
    'AuthType=OAuth'
    "Url=$EnvironmentUrl"
    'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d'
    'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97'
    'LoginPrompt=Auto'
) -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }
function Test-Attribute([string]$Name) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = 'gr_job'
        $request.LogicalName = $Name
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    } catch { return $false }
}
function Add-Attribute([Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$Attribute) {
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_job'
    $request.Attribute = $Attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $($Attribute.SchemaName)"
}
function Set-CommonMetadata($Attribute, [string]$SchemaName, [string]$DisplayName) {
    $Attribute.SchemaName = $SchemaName
    $Attribute.DisplayName = New-Label $DisplayName
    $Attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
}

$expectedColumns = @(
    @{ Logical = 'gr_techniciansubmissiontokenhash'; Type = 'String'; MaxLength = 64 },
    @{ Logical = 'gr_techniciansubmissiontokencreatedon'; Type = 'DateTime'; Behavior = 'UserLocal' },
    @{ Logical = 'gr_techniciansubmissiontokenexpireson'; Type = 'DateTime'; Behavior = 'UserLocal' },
    @{ Logical = 'gr_techniciansubmissiontokenused'; Type = 'Boolean'; DefaultValue = $false },
    @{ Logical = 'gr_techniciansubmissionsubmittedon'; Type = 'DateTime'; Behavior = 'UserLocal' },
    @{ Logical = 'gr_techniciansubmissionhourmeter'; Type = 'Integer'; MinValue = 0; MaxValue = 2147483647 },
    @{ Logical = 'gr_techniciansubmissionstory'; Type = 'Memo'; MaxLength = 10000 }
)

foreach ($expected in $expectedColumns) {
    if (-not (Test-Attribute $expected.Logical)) {
        Write-Output "Preflight: $($expected.Logical) does not exist and is safe to create"
        continue
    }

    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = 'gr_job'
    $request.LogicalName = $expected.Logical
    $request.RetrieveAsIfPublished = $true
    $actual = ($service.Execute($request)).AttributeMetadata
    if ([string]$actual.AttributeType -ne $expected.Type) {
        throw "Conflict: $($expected.Logical) is $($actual.AttributeType), expected $($expected.Type)."
    }
    if ([string]$actual.RequiredLevel.Value -ne 'None') {
        throw "Conflict: $($expected.Logical) is required, expected optional."
    }
    if ($expected.ContainsKey('MaxLength') -and $actual.MaxLength -ne $expected.MaxLength) {
        throw "Conflict: $($expected.Logical) maximum length is $($actual.MaxLength), expected $($expected.MaxLength)."
    }
    if ($expected.ContainsKey('Behavior') -and [string]$actual.DateTimeBehavior.Value -ne $expected.Behavior) {
        throw "Conflict: $($expected.Logical) behaviour is $($actual.DateTimeBehavior.Value), expected $($expected.Behavior)."
    }
    if ($expected.ContainsKey('DefaultValue') -and $actual.DefaultValue -ne $expected.DefaultValue) {
        throw "Conflict: $($expected.Logical) default is $($actual.DefaultValue), expected $($expected.DefaultValue)."
    }
    if ($expected.ContainsKey('MinValue') -and $actual.MinValue -ne $expected.MinValue) {
        throw "Conflict: $($expected.Logical) minimum is $($actual.MinValue), expected $($expected.MinValue)."
    }
    if ($expected.ContainsKey('MaxValue') -and $actual.MaxValue -ne $expected.MaxValue) {
        throw "Conflict: $($expected.Logical) maximum is $($actual.MaxValue), expected $($expected.MaxValue)."
    }
    Write-Output "Preflight: $($expected.Logical) exists with compatible metadata"
}

if (-not (Test-Attribute 'gr_techniciansubmissiontokenhash')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    Set-CommonMetadata $attribute 'gr_TechnicianSubmissionTokenHash' 'Technician Submission Token Hash'
    $attribute.MaxLength = 64
    $attribute.FormatName = [Microsoft.Xrm.Sdk.Metadata.StringFormatName]::Text
    Add-Attribute $attribute
} else { Write-Output 'Column gr_techniciansubmissiontokenhash already exists' }

@(
    @{ Schema = 'gr_TechnicianSubmissionTokenCreatedOn'; Logical = 'gr_techniciansubmissiontokencreatedon'; Display = 'Technician Submission Token Created On' },
    @{ Schema = 'gr_TechnicianSubmissionTokenExpiresOn'; Logical = 'gr_techniciansubmissiontokenexpireson'; Display = 'Technician Submission Token Expires On' },
    @{ Schema = 'gr_TechnicianSubmissionSubmittedOn'; Logical = 'gr_techniciansubmissionsubmittedon'; Display = 'Technician Submission Submitted On' }
) | ForEach-Object {
    if (Test-Attribute $_.Logical) {
        Write-Output "Column $($_.Logical) already exists"
    } else {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
        Set-CommonMetadata $attribute $_.Schema $_.Display
        $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
        $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
        Add-Attribute $attribute
    }
}

if (-not (Test-Attribute 'gr_techniciansubmissiontokenused')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
    Set-CommonMetadata $attribute 'gr_TechnicianSubmissionTokenUsed' 'Technician Submission Token Used'
    $attribute.DefaultValue = $false
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
    )
    Add-Attribute $attribute
} else { Write-Output 'Column gr_techniciansubmissiontokenused already exists' }

if (-not (Test-Attribute 'gr_techniciansubmissionhourmeter')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
    Set-CommonMetadata $attribute 'gr_TechnicianSubmissionHourMeter' 'Technician Submission Hour Meter'
    $attribute.MinValue = 0
    $attribute.MaxValue = 2147483647
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.IntegerFormat]::None
    Add-Attribute $attribute
} else { Write-Output 'Column gr_techniciansubmissionhourmeter already exists' }

if (-not (Test-Attribute 'gr_techniciansubmissionstory')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    Set-CommonMetadata $attribute 'gr_TechnicianSubmissionStory' 'Technician Submission Story'
    $attribute.MaxLength = 10000
    Add-Attribute $attribute
} else { Write-Output 'Column gr_techniciansubmissionstory already exists' }

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_job</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null
Write-Output 'Published technician Job Card submission schema successfully.'
