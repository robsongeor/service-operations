param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'

$pacTools = 'C:\Users\George\AppData\Local\Microsoft\PowerAppsCLI\Microsoft.PowerApps.CLI.2.9.3\tools'
$requiredAssemblies = @(
    'Microsoft.Xrm.Sdk.dll',
    'Microsoft.Crm.Sdk.Proxy.dll',
    'Microsoft.Xrm.Tooling.Connector.dll'
)

foreach ($assemblyName in $requiredAssemblies) {
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
if (-not $service.IsReady) {
    throw "Dataverse sign-in failed: $($service.LastCrmError)"
}

function New-Label([string]$text) {
    return [Microsoft.Xrm.Sdk.Label]::new($text, 1033)
}

function Test-OptionSetExists([string]$name) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveOptionSetRequest]::new()
        $request.Name = $name
        $service.Execute($request) | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Test-AttributeExists([string]$entityName, [string]$attributeName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = $entityName
        $request.LogicalName = $attributeName
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Add-AttributeToJob([Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$attribute) {
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_job'
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $($attribute.SchemaName)"
}

if (-not (Test-OptionSetExists 'gr_jobcardstatus')) {
    $optionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $optionSet.Name = 'gr_jobcardstatus'
    $optionSet.DisplayName = New-Label 'Job Card Status'
    $optionSet.Description = New-Label 'Tracks technician job-card dispatch, submission, and office closure.'
    $optionSet.IsGlobal = $true
    $optionSet.OptionSetType = [Microsoft.Xrm.Sdk.Metadata.OptionSetType]::Picklist
    $optionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Not sent'), 122830000))
    $optionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Sent'), 122830001))
    $optionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Submitted'), 122830002))
    $optionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Closed'), 122830003))

    $createOptionSet = [Microsoft.Xrm.Sdk.Messages.CreateOptionSetRequest]::new()
    $createOptionSet.OptionSet = $optionSet
    $createOptionSet.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($createOptionSet) | Out-Null
    Write-Output 'Created gr_jobcardstatus choice'
}
else {
    Write-Output 'Choice gr_jobcardstatus already exists'
}

if (-not (Test-AttributeExists 'gr_job' 'gr_jobcardstatus')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
    $attribute.SchemaName = 'gr_JobCardStatus'
    $attribute.DisplayName = New-Label 'Job Card Status'
    $attribute.Description = New-Label 'Tracks the job card from dispatch through closure.'
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    )
    $attribute.DefaultFormValue = 122830000
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $attribute.OptionSet.IsGlobal = $true
    $attribute.OptionSet.Name = 'gr_jobcardstatus'
    Add-AttributeToJob $attribute
}
else {
    Write-Output 'Column gr_jobcardstatus already exists'
}

$dateColumns = @(
    @{ SchemaName = 'gr_JobCardSentOn'; LogicalName = 'gr_jobcardsenton'; DisplayName = 'Job Card Sent On' },
    @{ SchemaName = 'gr_JobCardSubmittedOn'; LogicalName = 'gr_jobcardsubmittedon'; DisplayName = 'Job Card Submitted On' },
    @{ SchemaName = 'gr_JobCardClosedOn'; LogicalName = 'gr_jobcardclosedon'; DisplayName = 'Job Card Closed On' }
)

foreach ($column in $dateColumns) {
    if (Test-AttributeExists 'gr_job' $column.LogicalName) {
        Write-Output "Column $($column.LogicalName) already exists"
        continue
    }

    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = $column.SchemaName
    $attribute.DisplayName = New-Label $column.DisplayName
    $attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
    Add-AttributeToJob $attribute
}

$publish = [Microsoft.Xrm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_job</entity></entities><optionsets><optionset>gr_jobcardstatus</optionset></optionsets></importexportxml>'
$service.Execute($publish) | Out-Null

Write-Output 'Published Job Card Status schema successfully.'
