param([string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com')

$ErrorActionPreference = 'Stop'
$pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$pacTools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
if (-not $pacTools) { throw 'Power Apps CLI SDK assemblies were not found.' }
@('Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll') |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $pacTools $_)) | Out-Null }
$connectionString = @('AuthType=OAuth',"Url=$EnvironmentUrl",'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d','RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97','LoginPrompt=Auto') -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

function Get-Attribute([string]$Entity,[string]$Logical) {
    try {
        $request=[Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName=$Entity; $request.LogicalName=$Logical; $request.RetrieveAsIfPublished=$true
        return ($service.Execute($request)).AttributeMetadata
    } catch { return $null }
}
function Get-Entity([string]$Logical) {
    try {
        $request=[Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName=$Logical; $request.EntityFilters=[Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity; $request.RetrieveAsIfPublished=$true
        return ($service.Execute($request)).EntityMetadata
    } catch { return $null }
}

$existing = @(
    @{ Name='gr_techniciansubmissiontokenhash'; Type='String' },
    @{ Name='gr_techniciansubmissiontokencreatedon'; Type='DateTime' },
    @{ Name='gr_techniciansubmissiontokenexpireson'; Type='DateTime' },
    @{ Name='gr_techniciansubmissiontokenused'; Type='Boolean' },
    @{ Name='gr_techniciansubmissionsubmittedon'; Type='DateTime' },
    @{ Name='gr_techniciansubmissionhourmeter'; Type='Integer' },
    @{ Name='gr_techniciansubmissionstory'; Type='Memo' },
    @{ Name='gr_jobcardstatus'; Type='Picklist' },
    @{ Name='gr_jobcardsubmittedon'; Type='DateTime' }
)
foreach($expected in $existing) {
    $actual=Get-Attribute 'gr_job' $expected.Name
    if(-not $actual){throw "Required existing column is missing: gr_job.$($expected.Name)"}
    if([string]$actual.AttributeType -ne $expected.Type){throw "Conflict: gr_job.$($expected.Name) is $($actual.AttributeType), expected $($expected.Type)."}
    if(-not $actual.IsValidForUpdate){throw "Conflict: gr_job.$($expected.Name) cannot be updated."}
    Write-Output "Verified existing gr_job.$($expected.Name) ($($expected.Type))"
}

if(Get-Entity 'gr_jobcardsubmissionpart'){throw 'Conflict: obsolete unprovisioned design table gr_jobcardsubmissionpart already exists.'}
foreach($logical in @('gr_jobcardsubmissiontimeentry','gr_jobmaterial','gr_jobphoto')){
    $entity=Get-Entity $logical
    if($entity -and ($entity.IsActivity -or $entity.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned)){
        throw "Conflict: $logical exists with incompatible ownership or activity metadata."
    }
    Write-Output ($(if($entity){"Compatible table already exists: $logical"}else{"Safe to create: $logical"}))
}

$role=$service.Retrieve('role',[Guid]'3b0845b7-ceb7-48c6-8cf2-a8dd90a20850',[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name','businessunitid'))
if([string]$role.Attributes['name'] -ne 'Public Portal Service'){throw 'Configured role ID is incompatible.'}
$user=$service.Retrieve('systemuser',[Guid]'4322873e-ce87-f111-ab10-0022489917ff',[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('applicationid','accessmode','isdisabled'))
if([Guid]$user.Attributes['applicationid'] -ne [Guid]'dfad95a1-0541-47f0-b599-cb09b7181c72' -or [bool]$user.Attributes['isdisabled']){throw 'Configured Application User is incompatible or disabled.'}
$query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name')
$link=$query.AddLink('systemuserroles','roleid','roleid')
$link.LinkCriteria.AddCondition('systemuserid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,[Guid]'4322873e-ce87-f111-ab10-0022489917ff')
$roles=$service.RetrieveMultiple($query).Entities
if($roles.Count -ne 1 -or $roles[0].Id -ne [Guid]'3b0845b7-ceb7-48c6-8cf2-a8dd90a20850'){throw 'Application User role assignment is incompatible.'}

$privilegeQuery=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
$privilegeQuery.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
$allPrivileges=$service.RetrieveMultiple($privilegeQuery).Entities
$roleRequest=[Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
$roleRequest.RoleId=[Guid]'3b0845b7-ceb7-48c6-8cf2-a8dd90a20850'
$assigned=($service.Execute($roleRequest)).RolePrivileges
$requiredPrivileges=@(
    'prvReadgr_Job','prvWritegr_Job','prvAppendTogr_Job',
    'prvReadgr_Equipment',
    'prvCreategr_JobCardSubmissionTimeEntry','prvReadgr_JobCardSubmissionTimeEntry','prvWritegr_JobCardSubmissionTimeEntry','prvAppendgr_JobCardSubmissionTimeEntry',
    'prvCreategr_JobMaterial','prvReadgr_JobMaterial','prvWritegr_JobMaterial','prvAppendgr_JobMaterial',
    'prvCreategr_JobPhoto','prvReadgr_JobPhoto','prvWritegr_JobPhoto','prvAppendgr_JobPhoto'
)
foreach($name in $requiredPrivileges){
    $metadata=$allPrivileges | Where-Object { [string]$_.Attributes['name'] -ieq $name } | Select-Object -First 1
    if(-not $metadata){throw "Required Dataverse privilege was not found: $name"}
    $actual=$assigned | Where-Object { $_.PrivilegeId -eq $metadata.Id } | Select-Object -First 1
    if(-not $actual -or $actual.Depth -ne [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global){
        throw "Application User privilege is missing or not Organization depth: $name"
    }
    Write-Output "Verified Organization privilege $name"
}
Write-Output 'Verified Public Portal Service role and Application User assignment.'
Write-Output 'Expanded Technician Job Submission preflight passed with no writes.'
