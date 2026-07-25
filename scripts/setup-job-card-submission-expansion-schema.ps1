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
function Get-Entity([string]$LogicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName = $LogicalName
        $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity
        $request.RetrieveAsIfPublished = $true
        return ($service.Execute($request)).EntityMetadata
    } catch { return $null }
}
function Get-Attribute([string]$Entity, [string]$LogicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = $Entity
        $request.LogicalName = $LogicalName
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
function Add-Attribute([string]$Entity, $Attribute) {
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $Entity
    $request.Attribute = $Attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created $Entity.$($Attribute.SchemaName)"
}
function Ensure-Boolean([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) {
        if ([string]$actual.AttributeType -ne 'Boolean') { throw "Conflict: $Entity.$Logical is not Boolean." }
        Write-Output "Compatible column exists: $Entity.$Logical"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
    Set-Common $attribute $Schema $Display
    $attribute.DefaultValue = $false
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
    )
    Add-Attribute $Entity $attribute
}
function Ensure-Memo([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display, [int]$Length) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) {
        if ([string]$actual.AttributeType -ne 'Memo' -or $actual.MaxLength -ne $Length) { throw "Conflict: $Entity.$Logical has incompatible metadata." }
        Write-Output "Compatible column exists: $Entity.$Logical"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    Set-Common $attribute $Schema $Display
    $attribute.MaxLength = $Length
    Add-Attribute $Entity $attribute
}
function Ensure-ChildEntity([string]$Logical, [string]$Schema, [string]$Display, [string]$Plural) {
    $actual = Get-Entity $Logical
    if ($actual) {
        if ($actual.IsActivity -or $actual.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned) {
            throw "Conflict: $Logical exists with incompatible entity metadata."
        }
        Write-Output "Compatible table exists: $Logical"
        return
    }
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = $Schema
    $entity.DisplayName = New-Label $Display
    $entity.DisplayCollectionName = New-Label $Plural
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned
    $entity.IsActivity = $false
    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    Set-Common $primary 'gr_Name' 'Name'
    $primary.MaxLength = 200
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $entity
    $request.PrimaryAttribute = $primary
    $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null
    Write-Output "Created table $Schema"
}
function Ensure-JobRelationship([string]$Child, [string]$Schema) {
    try {
        $retrieve = [Microsoft.Xrm.Sdk.Messages.RetrieveRelationshipRequest]::new()
        $retrieve.Name = $Schema
        $service.Execute($retrieve) | Out-Null
        Write-Output "Compatible relationship exists: $Schema"
        return
    } catch {}
    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = $Schema
    $relationship.ReferencedEntity = 'gr_job'
    $relationship.ReferencingEntity = $Child
    $relationship.AssociatedMenuConfiguration = [Microsoft.Xrm.Sdk.Metadata.AssociatedMenuConfiguration]::new()
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
    Write-Output "Created relationship $Schema"
}

Ensure-Boolean 'gr_job' 'gr_techniciansubmissionfurtherworkrequired' 'gr_TechnicianSubmissionFurtherWorkRequired' 'Technician Submission Further Work Required'
Ensure-Memo 'gr_job' 'gr_techniciansubmissionfurtherworkdetails' 'gr_TechnicianSubmissionFurtherWorkDetails' 'Technician Submission Further Work Details' 10000
Ensure-Boolean 'gr_job' 'gr_techniciansubmissionsafetyissueidentified' 'gr_TechnicianSubmissionSafetyIssueIdentified' 'Technician Submission Safety Issue Identified'
Ensure-Memo 'gr_job' 'gr_techniciansubmissionsafetyissuedetails' 'gr_TechnicianSubmissionSafetyIssueDetails' 'Technician Submission Safety Issue Details' 10000

Ensure-ChildEntity 'gr_jobcardsubmissiontimeentry' 'gr_JobCardSubmissionTimeEntry' 'Job Card Submission Time Entry' 'Job Card Submission Time Entries'
Ensure-ChildEntity 'gr_jobmaterial' 'gr_JobMaterial' 'Job Material' 'Job Materials'
Ensure-JobRelationship 'gr_jobcardsubmissiontimeentry' 'gr_Job_gr_JobCardSubmissionTimeEntry'
Ensure-JobRelationship 'gr_jobmaterial' 'gr_Job_gr_JobMaterial'

if (-not (Get-Attribute 'gr_jobcardsubmissiontimeentry' 'gr_entrydate')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    Set-Common $attribute 'gr_EntryDate' 'Date'
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateOnly
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::DateOnly
    Add-Attribute 'gr_jobcardsubmissiontimeentry' $attribute
}
if (-not (Get-Attribute 'gr_jobcardsubmissiontimeentry' 'gr_totalhours')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DecimalAttributeMetadata]::new()
    Set-Common $attribute 'gr_TotalHours' 'Total Hours'
    $attribute.MinValue = 0
    $attribute.MaxValue = 24
    $attribute.Precision = 2
    Add-Attribute 'gr_jobcardsubmissiontimeentry' $attribute
}
if (-not (Get-Attribute 'gr_jobcardsubmissiontimeentry' 'gr_kilometres')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
    Set-Common $attribute 'gr_Kilometres' 'Kilometres'
    $attribute.MinValue = 0
    $attribute.MaxValue = 2147483647
    Add-Attribute 'gr_jobcardsubmissiontimeentry' $attribute
}
if (-not (Get-Attribute 'gr_jobcardsubmissiontimeentry' 'gr_displayorder')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
    Set-Common $attribute 'gr_DisplayOrder' 'Display Order'
    $attribute.MinValue = 0
    $attribute.MaxValue = 2147483647
    Add-Attribute 'gr_jobcardsubmissiontimeentry' $attribute
}
if (-not (Get-Attribute 'gr_jobmaterial' 'gr_material')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    Set-Common $attribute 'gr_Material' 'Material'
    $attribute.MaxLength = 500
    Add-Attribute 'gr_jobmaterial' $attribute
}
if (-not (Get-Attribute 'gr_jobmaterial' 'gr_displayorder')) {
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
    Set-Common $attribute 'gr_DisplayOrder' 'Display Order'
    $attribute.MinValue = 0
    $attribute.MaxValue = 2147483647
    Add-Attribute 'gr_jobmaterial' $attribute
}

$publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
$publish.ParameterXml = '<importexportxml><entities><entity>gr_job</entity><entity>gr_jobcardsubmissiontimeentry</entity><entity>gr_jobmaterial</entity></entities></importexportxml>'
$service.Execute($publish) | Out-Null
Write-Output 'Published Job Card submission expansion schema successfully.'
