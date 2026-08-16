param(
    [ValidateSet('Inspect', 'Apply', 'Preview', 'Migrate')][string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'
$writeSchema = $Mode -in @('Apply', 'Migrate')
$pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$pacTools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
if (-not $pacTools) { throw "Power Apps CLI SDK assemblies were not found under $pacRoot." }
@('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll') |
    ForEach-Object { [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $_)) | Out-Null }

$connectionString = @('AuthType=OAuth', "Url=$EnvironmentUrl", 'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d', 'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97', 'LoginPrompt=Auto') -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }
function Get-Entity([string]$LogicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName = $LogicalName; $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity; $request.RetrieveAsIfPublished = $true
        return ($service.Execute($request)).EntityMetadata
    } catch { return $null }
}
function Get-Attribute([string]$Entity, [string]$LogicalName) {
    try {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName = $Entity; $request.LogicalName = $LogicalName; $request.RetrieveAsIfPublished = $true
        return ($service.Execute($request)).AttributeMetadata
    } catch { return $null }
}
function Set-Common($Attribute, [string]$Schema, [string]$Display) {
    $Attribute.SchemaName = $Schema; $Attribute.DisplayName = New-Label $Display
    $Attribute.RequiredLevel = [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new([Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None)
}
function Add-Attribute([string]$Entity, $Attribute) {
    if (-not $writeSchema) { Write-Output "MISSING column $Entity.$($Attribute.SchemaName)"; return }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $Entity; $request.Attribute = $Attribute; $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null; Write-Output "CREATED column $Entity.$($Attribute.SchemaName)"
}
function Ensure-String([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display, [int]$Length) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) { if ([string]$actual.AttributeType -ne 'String' -or $actual.MaxLength -lt $Length) { throw "Conflict: $Entity.$Logical has incompatible metadata." }; Write-Output "OK column $Entity.$Logical"; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new(); Set-Common $attribute $Schema $Display; $attribute.MaxLength = $Length; Add-Attribute $Entity $attribute
}
function Ensure-Memo([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) { if ([string]$actual.AttributeType -ne 'Memo' -or $actual.MaxLength -lt 10000) { throw "Conflict: $Entity.$Logical has incompatible metadata." }; Write-Output "OK column $Entity.$Logical"; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new(); Set-Common $attribute $Schema $Display; $attribute.MaxLength = 10000; Add-Attribute $Entity $attribute
}
function Ensure-DateTime([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) { if ([string]$actual.AttributeType -ne 'DateTime') { throw "Conflict: $Entity.$Logical is not DateTime." }; Write-Output "OK column $Entity.$Logical"; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new(); Set-Common $attribute $Schema $Display
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime; $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
    Add-Attribute $Entity $attribute
}
function Ensure-Integer([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) { if ([string]$actual.AttributeType -ne 'Integer') { throw "Conflict: $Entity.$Logical is not Integer." }; Write-Output "OK column $Entity.$Logical"; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new(); Set-Common $attribute $Schema $Display; $attribute.MinValue = 0; $attribute.MaxValue = 2147483647; Add-Attribute $Entity $attribute
}
function Ensure-Boolean([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display, [bool]$Default = $false) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) { if ([string]$actual.AttributeType -ne 'Boolean') { throw "Conflict: $Entity.$Logical is not Boolean." }; Write-Output "OK column $Entity.$Logical"; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new(); Set-Common $attribute $Schema $Display; $attribute.DefaultValue = $Default
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1), [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0))
    Add-Attribute $Entity $attribute
}
function Ensure-Choice([string]$Entity, [string]$Logical, [string]$Schema, [string]$Display, [hashtable]$Options) {
    $actual = Get-Attribute $Entity $Logical
    if ($actual) { if ([string]$actual.AttributeType -ne 'Picklist') { throw "Conflict: $Entity.$Logical is not Choice." }; Write-Output "OK column $Entity.$Logical"; return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new(); Set-Common $attribute $Schema $Display
    $optionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new(); $optionSet.IsGlobal = $false
    foreach ($entry in $Options.GetEnumerator()) { $optionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $entry.Value), [int]$entry.Key)) }
    $attribute.OptionSet = $optionSet; Add-Attribute $Entity $attribute
}
function Ensure-Table {
    $actual = Get-Entity 'gr_jobcardsubmission'
    if ($actual) { if ($actual.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned) { throw 'Conflict: gr_jobcardsubmission is not user-owned.' }; Write-Output 'OK table gr_jobcardsubmission'; return }
    if (-not $writeSchema) { Write-Output 'MISSING table gr_jobcardsubmission'; return }
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new(); $entity.SchemaName = 'gr_JobCardSubmission'; $entity.DisplayName = New-Label 'Job Card Submission'; $entity.DisplayCollectionName = New-Label 'Job Card Submissions'; $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned; $entity.IsActivity = $false
    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new(); Set-Common $primary 'gr_Name' 'Name'; $primary.MaxLength = 200
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new(); $request.Entity = $entity; $request.PrimaryAttribute = $primary; $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null; Write-Output 'CREATED table gr_jobcardsubmission'
}
function Ensure-Relationship([string]$Parent, [string]$Child, [string]$Schema, [string]$LookupSchema, [string]$Display, [string]$DeleteBehavior = 'Restrict') {
    try { $retrieve = [Microsoft.Xrm.Sdk.Messages.RetrieveRelationshipRequest]::new(); $retrieve.Name = $Schema; $service.Execute($retrieve) | Out-Null; Write-Output "OK relationship $Schema"; return } catch {}
    if (-not $writeSchema) { Write-Output "MISSING relationship $Schema"; return }
    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new(); $relationship.SchemaName = $Schema; $relationship.ReferencedEntity = $Parent; $relationship.ReferencingEntity = $Child
    $relationship.AssociatedMenuConfiguration = [Microsoft.Xrm.Sdk.Metadata.AssociatedMenuConfiguration]::new(); $relationship.CascadeConfiguration = [Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new()
    $relationship.CascadeConfiguration.Assign = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade; $relationship.CascadeConfiguration.Delete = [Microsoft.Xrm.Sdk.Metadata.CascadeType]([System.Enum]::Parse([Microsoft.Xrm.Sdk.Metadata.CascadeType], $DeleteBehavior))
    $relationship.CascadeConfiguration.Merge = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade; $relationship.CascadeConfiguration.Reparent = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade; $relationship.CascadeConfiguration.Share = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade; $relationship.CascadeConfiguration.Unshare = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new(); Set-Common $lookup $LookupSchema $Display
    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new(); $request.OneToManyRelationship = $relationship; $request.Lookup = $lookup; $request.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($request) | Out-Null; Write-Output "CREATED relationship $Schema"
}
function Ensure-IdentityKey {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new(); $request.LogicalName = 'gr_jobcardsubmission'; $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All; $request.RetrieveAsIfPublished = $true
    $metadata = ($service.Execute($request)).EntityMetadata
    if ($metadata.Keys | Where-Object { $_.SchemaName -eq 'gr_JobCardSubmission_IdentityKey' }) { Write-Output 'OK alternate key gr_JobCardSubmission_IdentityKey'; return }
    if (-not $writeSchema) { Write-Output 'MISSING alternate key gr_JobCardSubmission_IdentityKey'; return }
    $key = [Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new(); $key.SchemaName = 'gr_JobCardSubmission_IdentityKey'; $key.DisplayName = New-Label 'Job Card Submission Identity'; $key.KeyAttributes = @('gr_identitykey')
    $create = [Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new(); $create.EntityName = 'gr_jobcardsubmission'; $create.EntityKey = $key; $create.SolutionUniqueName = $SolutionUniqueName
    $service.Execute($create) | Out-Null; Write-Output 'CREATED alternate key gr_JobCardSubmission_IdentityKey'
}

Ensure-Table
if (-not (Get-Entity 'gr_jobcardsubmission')) {
    if ($Mode -eq 'Inspect') { Write-Output 'Inspection complete: apply mode is required before column inspection.'; exit 0 }
    throw 'Job Card Submission table creation was not visible after creation.'
}
Ensure-String 'gr_jobcardsubmission' 'gr_recipientname' 'gr_RecipientName' 'Recipient Name' 200
Ensure-String 'gr_jobcardsubmission' 'gr_recipientemail' 'gr_RecipientEmail' 'Recipient Email' 320
Ensure-String 'gr_jobcardsubmission' 'gr_identitykey' 'gr_IdentityKey' 'Identity Key' 100
Ensure-Choice 'gr_jobcardsubmission' 'gr_role' 'gr_Role' 'Role' @{ 122830000='Primary'; 122830001='Additional'; 122830002='Legacy' }
Ensure-Choice 'gr_jobcardsubmission' 'gr_status' 'gr_Status' 'Status' @{ 122830000='Not Sent'; 122830001='Sent'; 122830002='Submitted'; 122830003='Closed'; 122830004='Cancelled' }
Ensure-Boolean 'gr_jobcardsubmission' 'gr_required' 'gr_Required' 'Required' $true
Ensure-String 'gr_jobcardsubmission' 'gr_tokenhash' 'gr_TokenHash' 'Token Hash' 64
Ensure-DateTime 'gr_jobcardsubmission' 'gr_tokencreatedon' 'gr_TokenCreatedOn' 'Token Created On'
Ensure-DateTime 'gr_jobcardsubmission' 'gr_tokenexpireson' 'gr_TokenExpiresOn' 'Token Expires On'
Ensure-Boolean 'gr_jobcardsubmission' 'gr_tokenused' 'gr_TokenUsed' 'Token Used'
Ensure-DateTime 'gr_jobcardsubmission' 'gr_emailsenton' 'gr_EmailSentOn' 'Email Sent On'
Ensure-DateTime 'gr_jobcardsubmission' 'gr_submittedon' 'gr_SubmittedOn' 'Submitted On'
Ensure-DateTime 'gr_jobcardsubmission' 'gr_closedon' 'gr_ClosedOn' 'Closed On'
Ensure-Integer 'gr_jobcardsubmission' 'gr_hourmeter' 'gr_HourMeter' 'Hour Meter'
Ensure-Memo 'gr_jobcardsubmission' 'gr_story' 'gr_Story' 'Job Story'
Ensure-Boolean 'gr_jobcardsubmission' 'gr_furtherworkrequired' 'gr_FurtherWorkRequired' 'Further Work Required'
Ensure-Memo 'gr_jobcardsubmission' 'gr_furtherworkdetails' 'gr_FurtherWorkDetails' 'Further Work Details'
Ensure-Boolean 'gr_jobcardsubmission' 'gr_safetyissueidentified' 'gr_SafetyIssueIdentified' 'Safety Issue Identified'
Ensure-Memo 'gr_jobcardsubmission' 'gr_safetyissuedetails' 'gr_SafetyIssueDetails' 'Safety Issue Details'
Ensure-Boolean 'gr_jobcardsubmission' 'gr_islegacy' 'gr_IsLegacy' 'Is Legacy'
Ensure-String 'gr_jobcardsubmission' 'gr_legacyjobid' 'gr_LegacyJobId' 'Legacy Job Id' 36

Ensure-Relationship 'gr_job' 'gr_jobcardsubmission' 'gr_Job_gr_JobCardSubmission' 'gr_Job' 'Job' 'Cascade'
Ensure-Relationship 'gr_mechanic' 'gr_jobcardsubmission' 'gr_Mechanic_gr_JobCardSubmission' 'gr_Mechanic' 'Mechanic'
Ensure-Relationship 'gr_jobassignment' 'gr_jobcardsubmission' 'gr_JobAssignment_gr_JobCardSubmission' 'gr_JobAssignment' 'Job Assignment'
Ensure-Relationship 'gr_jobcardsubmission' 'gr_jobcardsubmissiontimeentry' 'gr_JobCardSubmission_gr_TimeEntry' 'gr_JobCardSubmission' 'Job Card Submission'
Ensure-Relationship 'gr_jobcardsubmission' 'gr_jobmaterial' 'gr_JobCardSubmission_gr_JobMaterial' 'gr_JobCardSubmission' 'Job Card Submission'
Ensure-Relationship 'gr_jobcardsubmission' 'gr_jobphoto' 'gr_JobCardSubmission_gr_JobPhoto' 'gr_JobCardSubmission' 'Job Card Submission'
Ensure-IdentityKey

if ($writeSchema) {
    $publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new(); $publish.ParameterXml = '<importexportxml><entities><entity>gr_jobcardsubmission</entity><entity>gr_jobcardsubmissiontimeentry</entity><entity>gr_jobmaterial</entity><entity>gr_jobphoto</entity></entities></importexportxml>'; $service.Execute($publish) | Out-Null
}
if ($Mode -notin @('Preview', 'Migrate')) { Write-Output "Job Card Submission schema $Mode complete."; exit 0 }

$jobQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
$jobQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobid','gr_jobnumber','gr_mechanic','gr_techniciansubmissionsubmittedon','gr_techniciansubmissionhourmeter','gr_techniciansubmissionstory','gr_techniciansubmissionfurtherworkrequired','gr_techniciansubmissionfurtherworkdetails','gr_techniciansubmissionsafetyissueidentified','gr_techniciansubmissionsafetyissuedetails')
$jobQuery.Criteria.AddCondition('gr_techniciansubmissionsubmittedon', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::NotNull)
$jobs = $service.RetrieveMultiple($jobQuery).Entities
if ($Mode -eq 'Preview') {
    $newSubmissions = 0; $existingSubmissions = 0; $timeRows = 0; $materialRows = 0; $photoRows = 0
    foreach ($job in $jobs) {
        $legacyId = $job.Id.ToString()
        $existingQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_jobcardsubmission'); $existingQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobcardsubmissionid'); $existingQuery.TopCount = 1; $existingQuery.Criteria.AddCondition('gr_legacyjobid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $legacyId)
        if (($service.RetrieveMultiple($existingQuery).Entities | Select-Object -First 1)) { $existingSubmissions++ } else { $newSubmissions++ }
        foreach ($child in @(
            @{ Name='gr_jobcardsubmissiontimeentry'; Counter='timeRows' },
            @{ Name='gr_jobmaterial'; Counter='materialRows' },
            @{ Name='gr_jobphoto'; Counter='photoRows' }
        )) {
            $childQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($child.Name); $childQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false); $childQuery.Criteria.AddCondition('gr_job', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $job.Id); $childQuery.Criteria.AddCondition('gr_jobcardsubmission', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Null)
            $count = $service.RetrieveMultiple($childQuery).Entities.Count
            Set-Variable -Name $child.Counter -Value ((Get-Variable -Name $child.Counter -ValueOnly) + $count)
        }
    }
    Write-Output "PREVIEW ONLY: jobs=$($jobs.Count) newLegacySubmissions=$newSubmissions alreadyMigrated=$existingSubmissions timeRowsToLink=$timeRows materialRowsToLink=$materialRows photoRowsToLink=$photoRows. No records were changed."
    exit 0
}
$created = 0; $linked = 0; $skipped = 0
foreach ($job in $jobs) {
    $legacyId = $job.Id.ToString()
    $existingQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_jobcardsubmission'); $existingQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobcardsubmissionid'); $existingQuery.TopCount = 1; $existingQuery.Criteria.AddCondition('gr_legacyjobid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $legacyId)
    $existing = $service.RetrieveMultiple($existingQuery).Entities | Select-Object -First 1
    if ($existing) { $submissionId = $existing.Id; $skipped++ } else {
        $submission = [Microsoft.Xrm.Sdk.Entity]::new('gr_jobcardsubmission')
        $jobNumber = if ($job.Attributes.ContainsKey('gr_jobnumber')) { [string]$job['gr_jobnumber'] } else { $legacyId }
        $submission['gr_name'] = "Legacy Job Card $jobNumber"
        $submission['gr_job'] = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_job', $job.Id); $submission['gr_role'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(122830002); $submission['gr_status'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(122830002); $submission['gr_required'] = $true; $submission['gr_islegacy'] = $true; $submission['gr_legacyjobid'] = $legacyId
        foreach ($field in @('gr_techniciansubmissionsubmittedon','gr_techniciansubmissionhourmeter','gr_techniciansubmissionstory','gr_techniciansubmissionfurtherworkrequired','gr_techniciansubmissionfurtherworkdetails','gr_techniciansubmissionsafetyissueidentified','gr_techniciansubmissionsafetyissuedetails')) {
            if ($job.Attributes.ContainsKey($field)) { $submission[$field.Replace('gr_techniciansubmission','gr_')] = $job[$field] }
        }
        if ($job.Attributes.ContainsKey('gr_mechanic')) { $submission['gr_mechanic'] = $job['gr_mechanic'] }
        $submissionId = $service.Create($submission); $created++
    }
    foreach ($childName in @('gr_jobcardsubmissiontimeentry','gr_jobmaterial','gr_jobphoto')) {
        $childQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($childName); $childQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new("${childName}id", 'gr_job', 'gr_jobcardsubmission'); $childQuery.Criteria.AddCondition('gr_job', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $job.Id); $childQuery.Criteria.AddCondition('gr_jobcardsubmission', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Null)
        foreach ($child in $service.RetrieveMultiple($childQuery).Entities) { $update = [Microsoft.Xrm.Sdk.Entity]::new($childName, $child.Id); $update['gr_jobcardsubmission'] = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_jobcardsubmission', $submissionId); $service.Update($update); $linked++ }
    }
}
Write-Output "Migration complete: created=$created existing=$skipped childRowsLinked=$linked jobsInspected=$($jobs.Count). Existing Job evidence was retained."
