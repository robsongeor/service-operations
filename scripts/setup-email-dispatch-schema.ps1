param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'
$pacTools = 'C:\Users\George\AppData\Local\Microsoft\PowerAppsCLI\Microsoft.PowerApps.CLI.2.9.3\tools'

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

function New-Label([string]$text) { return [Microsoft.Xrm.Sdk.Label]::new($text, 1033) }

function Test-EntityExists([string]$entityName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName = $entityName
        $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    } catch { return $false }
}

function Test-AttributeExists([string]$attributeName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = 'gr_emaildispatch'
        $request.LogicalName = $attributeName
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    } catch { return $false }
}

function Add-Attribute([Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$attribute) {
    $logicalName = $attribute.SchemaName.ToLowerInvariant()
    if (Test-AttributeExists $logicalName) {
        Write-Output "Column $logicalName already exists"
        return
    }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_emaildispatch'
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $($attribute.SchemaName)"
}

function Add-Lookup(
    [string]$schemaName,
    [string]$displayName,
    [string]$referencedEntity,
    [string]$relationshipName,
    [bool]$required
) {
    $logicalName = $schemaName.ToLowerInvariant()
    if (Test-AttributeExists $logicalName) {
        Write-Output "Lookup $logicalName already exists"
        return
    }
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    $lookup.SchemaName = $schemaName
    $lookup.DisplayName = New-Label $displayName
    $requiredLevel = if ($required) {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    } else {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    }
    $lookup.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new($requiredLevel)

    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = $relationshipName
    $relationship.ReferencedEntity = $referencedEntity
    $relationship.ReferencingEntity = 'gr_emaildispatch'

    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.Lookup = $lookup
    $request.OneToManyRelationship = $relationship
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $schemaName lookup"
}

if (-not (Test-EntityExists 'gr_emaildispatch')) {
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = 'gr_EmailDispatch'
    $entity.DisplayName = New-Label 'Email Dispatch'
    $entity.DisplayCollectionName = New-Label 'Email Dispatches'
    $entity.Description = New-Label 'Secure bridge between Service Operations email buttons and Power Automate.'
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned
    $entity.IsActivity = $false

    $primaryName = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $primaryName.SchemaName = 'gr_Name'
    $primaryName.DisplayName = New-Label 'Name'
    $primaryName.MaxLength = 200
    $primaryName.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    )

    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $entity
    $request.PrimaryAttribute = $primaryName
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output 'Created Email Dispatch table'
} else {
    Write-Output 'Email Dispatch table already exists'
}

Add-Lookup 'gr_Job' 'Job' 'gr_job' 'gr_job_emaildispatches' $true
Add-Lookup 'gr_JobAssignment' 'Job Assignment' 'gr_jobassignment' 'gr_jobassignment_emaildispatches' $false

foreach ($column in @(
    @{ Schema = 'gr_RecipientEmail'; Display = 'Recipient Email'; Length = 320 },
    @{ Schema = 'gr_RecipientName'; Display = 'Recipient Name'; Length = 200 },
    @{ Schema = 'gr_Subject'; Display = 'Subject'; Length = 500 }
)) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = $column.Schema
    $attribute.DisplayName = New-Label $column.Display
    $attribute.MaxLength = $column.Length
    Add-Attribute $attribute
}

foreach ($column in @(
    @{ Schema = 'gr_Body'; Display = 'Body'; Length = 100000 },
    @{ Schema = 'gr_ErrorMessage'; Display = 'Error Message'; Length = 10000 }
)) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    $attribute.SchemaName = $column.Schema
    $attribute.DisplayName = New-Label $column.Display
    $attribute.MaxLength = $column.Length
    Add-Attribute $attribute
}

$emailSent = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
$emailSent.SchemaName = 'gr_EmailSent'
$emailSent.DisplayName = New-Label 'Email Sent'
$emailSent.DefaultValue = $false
$emailSent.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
    [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
    [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
)
Add-Attribute $emailSent

foreach ($column in @(
    @{ Schema = 'gr_RequestedOn'; Display = 'Requested On' },
    @{ Schema = 'gr_CompletedOn'; Display = 'Completed On' }
)) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = $column.Schema
    $attribute.DisplayName = New-Label $column.Display
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
    Add-Attribute $attribute
}

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_emaildispatch</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null
$verifyRequest = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
$verifyRequest.LogicalName = 'gr_emaildispatch'
$verifyRequest.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity
$verifyRequest.RetrieveAsIfPublished = $true
$verifiedEntity = $service.Execute($verifyRequest).EntityMetadata
Write-Output "Published Email Dispatch schema successfully: logical=$($verifiedEntity.LogicalName), entitySet=$($verifiedEntity.EntitySetName)"
