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

function Get-EntityMetadata([string]$logicalName, [Microsoft.Xrm.Sdk.Metadata.EntityFilters]$filters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $logicalName
    $request.EntityFilters = $filters
    $request.RetrieveAsIfPublished = $true
    return $service.Execute($request).EntityMetadata
}

function Test-EntityExists([string]$logicalName) {
    try { Get-EntityMetadata $logicalName | Out-Null; return $true } catch { return $false }
}

function Test-AttributeExists([string]$entityName, [string]$logicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = $entityName
        $request.LogicalName = $logicalName
        $request.RetrieveAsIfPublished = $true
        $service.Execute($request) | Out-Null
        return $true
    } catch { return $false }
}

function New-RequiredLevel([bool]$required) {
    $level = if ($required) { [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired } else { [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None }
    return [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new($level)
}

function Add-Table([string]$schemaName, [string]$displayName, [string]$collectionName, [string]$description, [string]$primaryName = 'Name') {
    $logicalName = $schemaName.ToLowerInvariant()
    if (Test-EntityExists $logicalName) { Write-Output "$displayName table already exists"; return }
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = $schemaName
    $entity.DisplayName = New-Label $displayName
    $entity.DisplayCollectionName = New-Label $collectionName
    $entity.Description = New-Label $description
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned
    $entity.IsActivity = $false
    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $primary.SchemaName = 'gr_Name'
    $primary.DisplayName = New-Label $primaryName
    $primary.MaxLength = 200
    $primary.RequiredLevel = New-RequiredLevel $true
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $entity
    $request.PrimaryAttribute = $primary
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $displayName table"
}

function Add-Attribute([string]$entityName, [Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$attribute) {
    $logicalName = $attribute.SchemaName.ToLowerInvariant()
    if (Test-AttributeExists $entityName $logicalName) { Write-Output "$entityName.$logicalName already exists"; return }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $entityName
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $entityName.$logicalName"
}

function Add-Text([string]$entityName, [string]$schemaName, [string]$displayName, [int]$maxLength = 200, [bool]$required = $false) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.MaxLength = $maxLength
    $attribute.RequiredLevel = New-RequiredLevel $required
    Add-Attribute $entityName $attribute
}

function Add-Memo([string]$entityName, [string]$schemaName, [string]$displayName) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.MaxLength = 10000
    Add-Attribute $entityName $attribute
}

function Add-DateOnly([string]$entityName, [string]$schemaName, [string]$displayName) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateOnly
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::DateOnly
    Add-Attribute $entityName $attribute
}

function Add-Boolean([string]$entityName, [string]$schemaName, [string]$displayName, [bool]$defaultValue = $false) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
    $attribute.SchemaName = $schemaName
    $attribute.DisplayName = New-Label $displayName
    $attribute.DefaultValue = $defaultValue
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
    )
    Add-Attribute $entityName $attribute
}

function Add-Lookup([string]$entityName, [string]$schemaName, [string]$displayName, [string]$targetEntity, [string]$relationshipName, [bool]$required = $false) {
    $logicalName = $schemaName.ToLowerInvariant()
    if (Test-AttributeExists $entityName $logicalName) { Write-Output "$entityName.$logicalName already exists"; return }
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    $lookup.SchemaName = $schemaName
    $lookup.DisplayName = New-Label $displayName
    $lookup.RequiredLevel = New-RequiredLevel $required
    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = $relationshipName
    $relationship.ReferencedEntity = $targetEntity
    $relationship.ReferencingEntity = $entityName
    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.Lookup = $lookup
    $request.OneToManyRelationship = $relationship
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $entityName.$logicalName lookup"
}

function Add-WofJobType {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = 'gr_job'
    $request.LogicalName = 'gr_jobtype'
    $request.RetrieveAsIfPublished = $true
    $metadata = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]$service.Execute($request).AttributeMetadata
    $existing = $metadata.OptionSet.Options | Where-Object { $_.Label.UserLocalizedLabel.Label -eq 'WOF' } | Select-Object -First 1
    if ($existing) { Write-Output "WOF Job Type already exists with value $($existing.Value)"; return }
    $insert = [Microsoft.Xrm.Sdk.Messages.InsertOptionValueRequest]::new()
    if ($metadata.OptionSet.IsGlobal) {
        $insert.OptionSetName = $metadata.OptionSet.Name
    } else {
        $insert.EntityLogicalName = 'gr_job'
        $insert.AttributeLogicalName = 'gr_jobtype'
    }
    $insert.Label = New-Label 'WOF'
    $insert.SolutionUniqueName = $SolutionUniqueName
    $response = $service.Execute($insert)
    Write-Output "Created WOF Job Type with value $($response.NewOptionValue)"
}

function Add-WofResultChoice {
    if (Test-AttributeExists 'gr_wofinspection' 'gr_wofresult') { Write-Output 'gr_wofinspection.gr_wofresult already exists'; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
    $attribute.SchemaName = 'gr_WOFResult'
    $attribute.DisplayName = New-Label 'WOF Result'
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $attribute.OptionSet.IsGlobal = $false
    foreach ($item in @(
        @{ Label = 'Planned'; Value = 122830000 },
        @{ Label = 'Passed'; Value = 122830001 },
        @{ Label = 'Failed'; Value = 122830002 },
        @{ Label = 'Cancelled'; Value = 122830003 }
    )) { $attribute.OptionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $item.Label), $item.Value)) }
    $attribute.DefaultFormValue = 122830000
    Add-Attribute 'gr_wofinspection' $attribute
}

function Add-SeedRecord([string]$entityName, [string]$code, [string]$name) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($entityName)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_code')
    $query.Criteria.AddCondition('gr_code', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $code)
    if ($service.RetrieveMultiple($query).Entities.Count -gt 0) { Write-Output "$entityName seed $code already exists"; return }
    $record = [Microsoft.Xrm.Sdk.Entity]::new($entityName)
    $record['gr_name'] = $name
    $record['gr_code'] = $code
    $record['gr_active'] = $true
    $service.Create($record) | Out-Null
    Write-Output "Created $entityName seed $code"
}

# Preserve and verify the Equipment columns already created manually; create only if absent.
Add-Text 'gr_equipment' 'gr_RegistrationNumber' 'Registration Number' 100
Add-Boolean 'gr_equipment' 'gr_WOFRequired' 'WOF Required' $false
Add-DateOnly 'gr_equipment' 'gr_CurrentWOFExpiry' 'Current WOF Expiry'
Add-DateOnly 'gr_equipment' 'gr_LastWOFCompleted' 'Last WOF Completed'
Add-DateOnly 'gr_equipment' 'gr_REGOExpiry' 'REGO Expiry'
Add-WofJobType

Add-Table 'gr_QualificationType' 'Qualification Type' 'Qualification Types' 'Reusable technician qualification definition.'
Add-Text 'gr_qualificationtype' 'gr_Code' 'Code' 100 $true
Add-Boolean 'gr_qualificationtype' 'gr_Active' 'Active' $true

Add-Table 'gr_TechnicianQualification' 'Technician Qualification' 'Technician Qualifications' 'Qualification held by a technician.'
Add-Lookup 'gr_technicianqualification' 'gr_Technician' 'Technician' 'gr_mechanic' 'gr_mechanic_technicianqualifications' $true
Add-Lookup 'gr_technicianqualification' 'gr_QualificationType' 'Qualification Type' 'gr_qualificationtype' 'gr_qualificationtype_technicianqualifications' $true
Add-Text 'gr_technicianqualification' 'gr_CertificateNumber' 'Certificate Number' 200
Add-DateOnly 'gr_technicianqualification' 'gr_ValidFrom' 'Valid From'
Add-DateOnly 'gr_technicianqualification' 'gr_ExpiryDate' 'Expiry Date'
Add-Boolean 'gr_technicianqualification' 'gr_Active' 'Active' $true
Add-Memo 'gr_technicianqualification' 'gr_Notes' 'Notes'

Add-Table 'gr_ServiceProviderType' 'Service Provider Type' 'Service Provider Types' 'Reusable external service provider category.'
Add-Text 'gr_serviceprovidertype' 'gr_Code' 'Code' 100 $true
Add-Boolean 'gr_serviceprovidertype' 'gr_Active' 'Active' $true

Add-Table 'gr_ServiceProvider' 'Service Provider' 'Service Providers' 'External company that performs specialist services.'
Add-Lookup 'gr_serviceprovider' 'gr_ProviderType' 'Provider Type' 'gr_serviceprovidertype' 'gr_serviceprovidertype_serviceproviders' $true
Add-Text 'gr_serviceprovider' 'gr_ContactName' 'Contact Name' 200
Add-Text 'gr_serviceprovider' 'gr_Phone' 'Phone' 100
Add-Text 'gr_serviceprovider' 'gr_Email' 'Email' 320
Add-Memo 'gr_serviceprovider' 'gr_Address' 'Address'
Add-Boolean 'gr_serviceprovider' 'gr_Active' 'Active' $true
Add-Memo 'gr_serviceprovider' 'gr_Notes' 'Notes'

Add-Table 'gr_WOFInspection' 'WOF Inspection' 'WOF Inspections' 'Specialised WOF record linked to its operational Job.' 'WOF Inspection Number'
Add-Lookup 'gr_wofinspection' 'gr_Job' 'Job' 'gr_job' 'gr_job_wofinspections' $true
Add-Lookup 'gr_wofinspection' 'gr_Equipment' 'Equipment' 'gr_equipment' 'gr_equipment_wofinspections' $true
Add-Text 'gr_wofinspection' 'gr_RegistrationNumberSnapshot' 'Registration Number Snapshot' 100
Add-DateOnly 'gr_wofinspection' 'gr_PreviousWOFExpiry' 'Previous WOF Expiry'
Add-DateOnly 'gr_wofinspection' 'gr_InspectionDate' 'Inspection Date'
Add-DateOnly 'gr_wofinspection' 'gr_NewWOFExpiry' 'New WOF Expiry'
Add-WofResultChoice
Add-Lookup 'gr_wofinspection' 'gr_InternalInspector' 'Internal Inspector' 'gr_mechanic' 'gr_mechanic_wofinspections'
Add-Lookup 'gr_wofinspection' 'gr_ExternalProvider' 'External Provider' 'gr_serviceprovider' 'gr_serviceprovider_wofinspections'
Add-Text 'gr_wofinspection' 'gr_CertificateNumber' 'Certificate Number' 200
Add-Memo 'gr_wofinspection' 'gr_Notes' 'Notes'

$publish = [Microsoft.Crm.Sdk.Messages.PublishAllXmlRequest]::new()
$service.Execute($publish) | Out-Null

Add-SeedRecord 'gr_qualificationtype' 'WOF_CERTIFIED' 'WOF Certified'
Add-SeedRecord 'gr_serviceprovidertype' 'WOF_INSPECTOR' 'WOF Inspector'

Write-Output ''
Write-Output 'WOF schema published successfully:'
foreach ($entityName in @('gr_job', 'gr_equipment', 'gr_qualificationtype', 'gr_technicianqualification', 'gr_serviceprovidertype', 'gr_serviceprovider', 'gr_wofinspection')) {
    $metadata = Get-EntityMetadata $entityName ([Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity -bor [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Attributes -bor [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Relationships)
    Write-Output "  logical=$($metadata.LogicalName); entitySet=$($metadata.EntitySetName); primaryId=$($metadata.PrimaryIdAttribute); primaryName=$($metadata.PrimaryNameAttribute)"
}
