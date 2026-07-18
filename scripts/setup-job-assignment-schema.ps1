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

function Test-EntityExists([string]$entityName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName = $entityName
        $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity
        $request.RetrieveAsIfPublished = $true
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

function Add-Attribute([Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$attribute) {
    $logicalName = $attribute.SchemaName.ToLowerInvariant()
    if (Test-AttributeExists 'gr_jobassignment' $logicalName) {
        Write-Output "Column $logicalName already exists"
        return
    }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_jobassignment'
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $($attribute.SchemaName)"
}

function Add-Lookup(
    [string]$schemaName,
    [string]$displayName,
    [string]$referencedEntity,
    [string]$relationshipName
) {
    $logicalName = $schemaName.ToLowerInvariant()
    if (Test-AttributeExists 'gr_jobassignment' $logicalName) {
        Write-Output "Lookup $logicalName already exists"
        return
    }

    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    $lookup.SchemaName = $schemaName
    $lookup.DisplayName = New-Label $displayName
    $lookup.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    )

    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = $relationshipName
    $relationship.ReferencedEntity = $referencedEntity
    $relationship.ReferencingEntity = 'gr_jobassignment'

    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.Lookup = $lookup
    $request.OneToManyRelationship = $relationship
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $schemaName lookup"
}

if (-not (Test-EntityExists 'gr_jobassignment')) {
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = 'gr_JobAssignment'
    $entity.DisplayName = New-Label 'Job Assignment'
    $entity.DisplayCollectionName = New-Label 'Job Assignments'
    $entity.Description = New-Label 'Tracks each technician assigned to a job and their individual paperwork progress.'
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned
    $entity.IsActivity = $false

    $primaryName = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $primaryName.SchemaName = 'gr_Name'
    $primaryName.DisplayName = New-Label 'Name'
    $primaryName.MaxLength = 200
    $primaryName.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    )

    $createEntity = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $createEntity.Entity = $entity
    $createEntity.PrimaryAttribute = $primaryName
    $createEntity.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($createEntity) | Out-Null
    Write-Output 'Created Job Assignment table'
}
else {
    Write-Output 'Job Assignment table already exists'
}

Add-Lookup 'gr_Job' 'Job' 'gr_job' 'gr_job_jobassignments'
Add-Lookup 'gr_Mechanic' 'Technician' 'gr_mechanic' 'gr_mechanic_jobassignments'

$instructions = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
$instructions.SchemaName = 'gr_WorkInstructions'
$instructions.DisplayName = New-Label 'Work Instructions'
$instructions.MaxLength = 10000
Add-Attribute $instructions

$status = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
$status.SchemaName = 'gr_JobCardStatus'
$status.DisplayName = New-Label 'Job Card Status'
$status.DefaultFormValue = 122830000
$status.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
    [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
)
$status.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
$status.OptionSet.IsGlobal = $true
$status.OptionSet.Name = 'gr_jobcardstatus'
Add-Attribute $status

$dateColumns = @(
    @{ SchemaName = 'gr_AssignedOn'; DisplayName = 'Assigned On' },
    @{ SchemaName = 'gr_EmailSentOn'; DisplayName = 'Email Sent On' },
    @{ SchemaName = 'gr_SubmittedOn'; DisplayName = 'Submitted On' },
    @{ SchemaName = 'gr_ClosedOn'; DisplayName = 'Closed On' }
)

foreach ($column in $dateColumns) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = $column.SchemaName
    $attribute.DisplayName = New-Label $column.DisplayName
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
    Add-Attribute $attribute
}

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_jobassignment</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null

Write-Output 'Published Job Assignment schema successfully.'
