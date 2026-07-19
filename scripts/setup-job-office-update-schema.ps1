param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'

$pacTools = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\PowerAppsCLI" -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $pacTools) { throw 'Microsoft PowerApps CLI SDK files were not found. Install Microsoft.PowerAppsCLI first.' }
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
        $request.EntityLogicalName = 'gr_jobofficeupdate'
        $request.LogicalName = $attributeName
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    } catch { return $false }
}

if (-not (Test-EntityExists 'gr_jobofficeupdate')) {
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = 'gr_JobOfficeUpdate'
    $entity.DisplayName = New-Label 'Job Office Update'
    $entity.DisplayCollectionName = New-Label 'Job Office Updates'
    $entity.Description = New-Label 'Append-only office update history for a job.'
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
    Write-Output 'Created Job Office Update table'
} else {
    Write-Output 'Job Office Update table already exists'
}

if (-not (Test-AttributeExists 'gr_job')) {
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    $lookup.SchemaName = 'gr_Job'
    $lookup.DisplayName = New-Label 'Job'
    $lookup.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    )

    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = 'gr_job_jobofficeupdates'
    $relationship.ReferencedEntity = 'gr_job'
    $relationship.ReferencingEntity = 'gr_jobofficeupdate'

    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.Lookup = $lookup
    $request.OneToManyRelationship = $relationship
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output 'Created gr_Job lookup'
} else {
    Write-Output 'gr_Job lookup already exists'
}

if (-not (Test-AttributeExists 'gr_update')) {
    $update = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    $update.SchemaName = 'gr_Update'
    $update.DisplayName = New-Label 'Update'
    $update.MaxLength = 10000
    $update.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    )

    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_jobofficeupdate'
    $request.Attribute = $update
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output 'Created gr_Update column'
} else {
    Write-Output 'gr_Update column already exists'
}

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_jobofficeupdate</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null

$verify = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
$verify.LogicalName = 'gr_jobofficeupdate'
$verify.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity -bor [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Attributes -bor [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Relationships
$verify.RetrieveAsIfPublished = $true
$metadata = $service.Execute($verify).EntityMetadata
$attributes = $metadata.Attributes.LogicalName

if ('gr_name' -notin $attributes -or 'gr_job' -notin $attributes -or 'gr_update' -notin $attributes) {
    throw 'Verification failed: the expected Job Office Update fields were not created.'
}

Write-Output "Published Job Office Update schema: logical=$($metadata.LogicalName), entitySet=$($metadata.EntitySetName), primary=$($metadata.PrimaryNameAttribute)"
