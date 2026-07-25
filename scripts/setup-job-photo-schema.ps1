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
function Get-Entity([string]$Logical) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName = $Logical
        $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity
        $request.RetrieveAsIfPublished = $true
        return ($service.Execute($request)).EntityMetadata
    } catch { return $null }
}
function Get-Attribute([string]$Logical) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = 'gr_jobphoto'
        $request.LogicalName = $Logical
        $request.RetrieveAsIfPublished = $true
        return ($service.Execute($request)).AttributeMetadata
    } catch { return $null }
}
function Set-Common($Attribute, [string]$Schema, [string]$Display) {
    $Attribute.SchemaName = $Schema
    $Attribute.DisplayName = New-Label $Display
    $Attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    )
}
function Add-Attribute($Attribute) {
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_jobphoto'
    $request.Attribute = $Attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created gr_jobphoto.$($Attribute.SchemaName)"
}

$entity = Get-Entity 'gr_jobphoto'
if ($entity) {
    if ($entity.IsActivity -or $entity.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned) {
        throw 'Conflict: gr_jobphoto exists with incompatible table metadata.'
    }
    Write-Output 'Compatible table exists: gr_jobphoto'
} else {
    $metadata = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $metadata.SchemaName = 'gr_JobPhoto'
    $metadata.DisplayName = New-Label 'Job Photo'
    $metadata.DisplayCollectionName = New-Label 'Job Photos'
    $metadata.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned
    $metadata.IsActivity = $false
    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    Set-Common $primary 'gr_Name' 'Name'
    $primary.MaxLength = 200
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $metadata
    $request.PrimaryAttribute = $primary
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output 'Created table gr_JobPhoto'
}

try {
    $relationshipRequest = [Microsoft.Xrm.Sdk.Messages.RetrieveRelationshipRequest]::new()
    $relationshipRequest.Name = 'gr_Job_gr_JobPhoto'
    $service.Execute($relationshipRequest) | Out-Null
    Write-Output 'Compatible relationship exists: gr_Job_gr_JobPhoto'
} catch {
    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = 'gr_Job_gr_JobPhoto'
    $relationship.ReferencedEntity = 'gr_job'
    $relationship.ReferencingEntity = 'gr_jobphoto'
    $relationship.CascadeConfiguration = [Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new()
    $relationship.CascadeConfiguration.Assign = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $relationship.CascadeConfiguration.Delete = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::Restrict
    $relationship.CascadeConfiguration.Merge = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $relationship.CascadeConfiguration.Reparent = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $relationship.CascadeConfiguration.Share = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $relationship.CascadeConfiguration.Unshare = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    Set-Common $lookup 'gr_Job' 'Job'
    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.OneToManyRelationship = $relationship
    $request.Lookup = $lookup
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output 'Created relationship gr_Job_gr_JobPhoto'
}

$columns = @(
    @{ Logical = 'gr_filename'; Type = 'String'; Schema = 'gr_FileName'; Display = 'File Name'; Length = 255 },
    @{ Logical = 'gr_uploadedon'; Type = 'DateTime'; Schema = 'gr_UploadedOn'; Display = 'Uploaded On' },
    @{ Logical = 'gr_displayorder'; Type = 'Integer'; Schema = 'gr_DisplayOrder'; Display = 'Display Order' },
    @{ Logical = 'gr_uploadkey'; Type = 'String'; Schema = 'gr_UploadKey'; Display = 'Upload Key'; Length = 64 }
)
foreach ($column in $columns) {
    $actual = Get-Attribute $column.Logical
    if ($actual) {
        if ([string]$actual.AttributeType -ne $column.Type) { throw "Conflict: gr_jobphoto.$($column.Logical) has incompatible type." }
        if ($column.ContainsKey('Length') -and $actual.MaxLength -ne $column.Length) { throw "Conflict: gr_jobphoto.$($column.Logical) has incompatible length." }
        Write-Output "Compatible column exists: gr_jobphoto.$($column.Logical)"
        continue
    }
    if ($column.Type -eq 'String') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
        Set-Common $attribute $column.Schema $column.Display
        $attribute.MaxLength = $column.Length
    } elseif ($column.Type -eq 'DateTime') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
        Set-Common $attribute $column.Schema $column.Display
        $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
        $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
    } else {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
        Set-Common $attribute $column.Schema $column.Display
        $attribute.MinValue = 0
        $attribute.MaxValue = 2147483647
    }
    Add-Attribute $attribute
}

$photo = Get-Attribute 'gr_photo'
if ($photo) {
    if ($photo.GetType().FullName -ne 'Microsoft.Xrm.Sdk.Metadata.FileAttributeMetadata' -or [string]$photo.AttributeTypeName.Value -ne 'FileType' -or $photo.MaxSizeInKB -ne 10240) {
        throw 'Conflict: gr_jobphoto.gr_photo has incompatible File metadata.'
    }
    Write-Output 'Compatible column exists: gr_jobphoto.gr_photo'
} else {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.FileAttributeMetadata]::new()
    Set-Common $attribute 'gr_Photo' 'Photo'
    $attribute.MaxSizeInKB = 10240
    Add-Attribute $attribute
}

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_jobphoto</entity><entity>gr_job</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null
Write-Output 'Published generic Job Photo schema successfully.'
