param(
    [ValidateSet('Provision', 'Verify', 'AssignPilot')]
    [string]$Mode = 'Verify',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [string]$PackageDirectory = '',
    [string]$PilotUpn = 'pubudu@liftrucks.co.nz',
    [string]$UserName = '',
    [ValidateSet('AccessOnly', 'All')]
    [string]$GuardScope = 'AccessOnly',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Approved unified-workflow operator. Provision creates only the reviewed flag-off schema, roles,
# signed runtime, Custom APIs and synchronous guards. AssignPilot is additive and never removes the
# pilot's existing role. No migration, seed, application deployment or feature enablement exists here.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$readiness = Get-Content -LiteralPath (Join-Path $repository 'dataverse\job-registration\readiness-manifest.json') -Raw | ConvertFrom-Json
$plan = Get-Content -LiteralPath (Join-Path $repository 'dataverse\job-registration\deployment-plan.json') -Raw | ConvertFrom-Json
$roleGrants = Get-Content -LiteralPath (Join-Path $repository 'dataverse\access\unified-workflow-role-grants.json') -Raw | ConvertFrom-Json
$contract = Get-Content -LiteralPath (Join-Path $repository 'dataverse\job-registration\contract.json') -Raw | ConvertFrom-Json
$packageManifestPath = if ($PackageDirectory) { Join-Path $PackageDirectory 'ServiceOperations.UnifiedJobWorkflow.manifest.json' } else { '' }
$assemblyPath = if ($PackageDirectory) { Join-Path $PackageDirectory 'ServiceOperations.UnifiedJobWorkflow.dll' } else { '' }
$provision = $Mode -eq 'Provision'

function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }
function New-Required { [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new([Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None) }
function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    $path
}
function Import-Sdk {
    $path = Get-ToolsPath
    'Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll' |
        ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $path $_)) | Out-Null }
}
function Connect-Dataverse {
    $connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
    if (-not [string]::IsNullOrWhiteSpace($UserName)) { $connection += ";UserName=$($UserName.Trim())" }
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}
function Find-Exactly($Service, [string]$Table, [string]$Column, $Value, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.Criteria.AddCondition($Column, [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Value)
    @($Service.RetrieveMultiple($query).Entities)
}
function Get-Attribute($Service, [string]$Table, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $Table; $request.LogicalName = $Name; $request.RetrieveAsIfPublished = $true
    try { $Service.Execute($request).AttributeMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}
function Get-EntityMetadata($Service, [string]$Table) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $Table
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity
    $request.RetrieveAsIfPublished = $true
    $Service.Execute($request).EntityMetadata
}
function Ensure-OptimisticConcurrency($Service, [string]$Table) {
    $metadata = Get-EntityMetadata $Service $Table
    if ([bool]$metadata.IsOptimisticConcurrencyEnabled) { return }
    if (-not $provision) { throw "Optimistic concurrency is not enabled on $Table." }
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.LogicalName = $Table
    $entity.IsOptimisticConcurrencyEnabled = $true
    $request = [Microsoft.Xrm.Sdk.Messages.UpdateEntityRequest]::new()
    $request.Entity = $entity
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Host "Enabled optimistic concurrency on $Table"
}
function Add-Attribute($Service, [string]$Table, $Attribute) {
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $Table; $request.Attribute = $Attribute; $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
}
function Ensure-Column($Service, $Definition) {
    $name = ([string]$Definition.name).ToLowerInvariant()
    $existing = Get-Attribute $Service ([string]$Definition.table) $name
    if ($existing) {
        $expected = @{ Boolean='Boolean'; Memo='Memo'; String='String' }[[string]$Definition.type]
        Require ([string]$existing.AttributeType -eq $expected) "Conflict: $($Definition.table).$name type."
        if ($Definition.type -in @('Memo','String')) { Require ($existing.MaxLength -ge [int]$Definition.minimumLength) "Conflict: $($Definition.table).$name length." }
        return
    }
    if (-not $provision) { throw "Missing column: $($Definition.table).$name" }
    if ($Definition.type -eq 'Boolean') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
        $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0))
        $attribute.DefaultValue = $false
    } elseif ($Definition.type -eq 'Memo') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new(); $attribute.MaxLength = [int]$Definition.minimumLength
    } elseif ($Definition.type -eq 'String') {
        $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new(); $attribute.MaxLength = [int]$Definition.minimumLength
    } else { throw "Unsupported column type: $($Definition.type)" }
    $attribute.SchemaName = [string]$Definition.name
    $attribute.DisplayName = New-Label ([string]$Definition.name)
    $attribute.RequiredLevel = New-Required
    Add-Attribute $Service ([string]$Definition.table) $attribute
    Write-Host "Created column $($Definition.table).$name"
}
function New-Cascade {
    $cascade = [Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new()
    $cascade.Assign='NoCascade'; $cascade.Share='NoCascade'; $cascade.Unshare='NoCascade'; $cascade.Reparent='NoCascade'; $cascade.Merge='NoCascade'; $cascade.Delete='Restrict'
    $cascade
}
function Ensure-Lookup($Service, $Definition) {
    $name = ([string]$Definition.name).ToLowerInvariant()
    $existing = Get-Attribute $Service ([string]$Definition.table) $name
    if ($existing) { Require ([string]$existing.AttributeType -eq 'Lookup' -and @($existing.Targets) -contains [string]$Definition.target) "Conflict: $($Definition.table).$name lookup."; return }
    if (-not $provision) { throw "Missing lookup: $($Definition.table).$name" }
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new(); $lookup.SchemaName=[string]$Definition.name; $lookup.DisplayName=New-Label ([string]$Definition.name); $lookup.RequiredLevel=New-Required
    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = "$($Definition.table)_$name`_$($Definition.target)"
    $relationship.ReferencedEntity = [string]$Definition.target; $relationship.ReferencingEntity = [string]$Definition.table
    $relationship.ReferencingEntityNavigationPropertyName = [string]$Definition.name
    $relationship.ReferencedEntityNavigationPropertyName = "$($Definition.target)_$($Definition.table)_$name"
    $relationship.CascadeConfiguration = New-Cascade
    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new(); $request.Lookup=$lookup; $request.OneToManyRelationship=$relationship; $request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Host "Created lookup $($Definition.table).$name"
}
function Ensure-Choice($Service, [string]$Table, [string]$Name, [string]$Label, [int]$Value) {
    $metadata = Get-Attribute $Service $Table $Name
    Require ($null -ne $metadata -and [string]$metadata.AttributeType -eq 'Picklist' -and -not $metadata.OptionSet.IsGlobal) "Conflict: $Table.$Name must be a local Choice."
    $byValue = @($metadata.OptionSet.Options | Where-Object { $_.Value -eq $Value })
    if ($byValue.Count) { Require ($byValue.Count -eq 1 -and [string]$byValue[0].Label.UserLocalizedLabel.Label -eq $Label) "Conflict: $Table.$Name option $Value."; Write-Host "Verified Choice option $Table.$Name $Label=$Value"; return }
    if (-not $provision) { throw "Missing Choice option: $Table.$Name $Label=$Value" }
    $request = [Microsoft.Xrm.Sdk.Messages.InsertOptionValueRequest]::new(); $request.EntityLogicalName=$Table; $request.AttributeLogicalName=$Name; $request.Label=New-Label $Label; $request.Value=$Value; $request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request) | Out-Null
    $verified = Get-Attribute $Service $Table $Name
    $created = @($verified.OptionSet.Options | Where-Object { $_.Value -eq $Value })
    Require ($created.Count -eq 1 -and [string]$created[0].Label.UserLocalizedLabel.Label -eq $Label) "Choice creation verification failed: $Table.$Name $Label=$Value"
    Write-Host "Created and verified Choice option $Table.$Name $Label=$Value"
}
function Publish-Metadata($Service) {
    $tables = @($readiness.columns.table + $readiness.regionalTables | Sort-Object -Unique)
    $xml = ($tables | ForEach-Object { "<entity>$_</entity>" }) -join ''
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new(); $request.ParameterXml="<importexportxml><entities>$xml</entities></importexportxml>"
    $Service.Execute($request) | Out-Null
}
function Get-AllPrivileges($Service) {
    $query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege'); $query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('privilegeid','name'); $query.PageInfo=[Microsoft.Xrm.Sdk.Query.PagingInfo]::new(); $query.PageInfo.Count=5000; $query.PageInfo.PageNumber=1
    $rows=[Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
    do { $page=$Service.RetrieveMultiple($query); foreach($row in $page.Entities){$rows.Add($row)}; if($page.MoreRecords){$query.PageInfo.PageNumber++;$query.PageInfo.PagingCookie=$page.PagingCookie} } while($page.MoreRecords)
    @($rows)
}
function Read-RolePrivileges($Service, [guid]$RoleId) { $request=[Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new(); $request.RoleId=$RoleId; @($Service.Execute($request).RolePrivileges) }
function Ensure-Role($Service, $Definition, $AllPrivileges) {
    $roles = @(Find-Exactly $Service 'role' 'name' ([string]$Definition.name) @('roleid','name','businessunitid','ismanaged'))
    Require ($roles.Count -le 1) "Multiple roles named $($Definition.name)."
    if (-not $roles.Count) {
        if (-not $provision) { throw "Missing role: $($Definition.name)" }
        $query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('businessunit');$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('businessunitid');$query.Criteria.AddCondition('parentbusinessunitid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Null);$businessUnits=@($Service.RetrieveMultiple($query).Entities)
        Require ($businessUnits.Count -eq 1) 'Expected exactly one root business unit.'
        $role=[Microsoft.Xrm.Sdk.Entity]::new('role');$role['name']=[string]$Definition.name;$role['businessunitid']=[Microsoft.Xrm.Sdk.EntityReference]::new('businessunit',$businessUnits[0].Id)
        $id=$Service.Create($role);$roles=@($Service.Retrieve('role',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name','businessunitid','ismanaged')))
        Write-Host "Created unassigned role $($Definition.name)"
    }
    $role=$roles[0]; Require (-not [bool]$role['ismanaged']) "$($Definition.name) must be unmanaged."
    $baselineRoles=@(Find-Exactly $Service 'role' 'name' ([string]$roleGrants.baselineRole) @('roleid','name')); Require ($baselineRoles.Count -eq 1) 'Expected exactly one Basic User baseline role.'
    $baseline=@(Read-RolePrivileges $Service $baselineRoles[0].Id)
    $desiredNames=[Collections.Generic.List[string]]::new()
    foreach($property in $Definition.tables.PSObject.Properties){foreach($operation in @($property.Value)){$desiredNames.Add("prv$operation$($property.Name)")}}
    $desiredMetadata=@($AllPrivileges|Where-Object{$desiredNames -icontains [string]$_['name']})
    Require ($desiredMetadata.Count -eq $desiredNames.Count) "Missing generated privileges for $($Definition.name)."
    $current=@(Read-RolePrivileges $Service $role.Id)
    $add=[Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach($grant in $baseline){if(-not($current|Where-Object PrivilegeId -eq $grant.PrivilegeId|Select-Object -First 1)){if($provision){$copy=[Microsoft.Crm.Sdk.Messages.RolePrivilege]::new();$copy.PrivilegeId=$grant.PrivilegeId;$copy.Depth=$grant.Depth;$add.Add($copy)}else{throw "$($Definition.name) is missing Basic User baseline privileges."}}}
    foreach($name in $desiredNames){$metadata=$desiredMetadata|Where-Object{[string]$_['name']-ieq$name}|Select-Object -First 1;$held=$current|Where-Object PrivilegeId -eq $metadata.Id|Select-Object -First 1;if($held){Require ([string]$held.Depth -eq 'Global') "$($Definition.name) $name depth conflict."}elseif($provision){$grant=[Microsoft.Crm.Sdk.Messages.RolePrivilege]::new();$grant.PrivilegeId=$metadata.Id;$grant.Depth='Global';$add.Add($grant)}else{throw "$($Definition.name) missing $name"}}
    if($add.Count){
        for($offset=0;$offset-lt$add.Count;$offset+=100){$last=[Math]::Min($offset+99,$add.Count-1);$request=[Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new();$request.RoleId=$role.Id;$request.Privileges=@($add[$offset..$last]);$Service.Execute($request)|Out-Null}
        Write-Host "Granted $($add.Count) baseline/business privileges to $($Definition.name)";$current=@(Read-RolePrivileges $Service $role.Id)
    }
    $customHeld=@($current|ForEach-Object{$id=$_.PrivilegeId;$AllPrivileges|Where-Object Id -eq $id|Select-Object -First 1}|Where-Object{[string]$_['name']-match '^prv[A-Za-z]+gr_'})
    $extras=@($customHeld|Where-Object{$desiredNames -inotcontains [string]$_['name']})
    Require ($extras.Count -eq 0) "$($Definition.name) has unapproved custom privileges: $(@($extras|ForEach-Object{$_['name']}) -join ', ')."
    foreach($junction in 'systemuserroles','teamroles'){$query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new($junction);$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false);$query.Criteria.AddCondition('roleid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$role.Id);$count=$Service.RetrieveMultiple($query).Entities.Count;Write-Host "$($Definition.name): $count existing $junction assignment(s) preserved."}
    $role
}
function Get-PackageManifest {
    Require ($PackageDirectory -and (Test-Path -LiteralPath $assemblyPath -PathType Leaf) -and (Test-Path -LiteralPath $packageManifestPath -PathType Leaf)) 'A reviewed signed package directory is required.'
    $manifest=Get-Content -LiteralPath $packageManifestPath -Raw|ConvertFrom-Json
    Require ($manifest.publicKeyToken -eq '0edea2881bb8578c' -and $manifest.version -eq '1.0.1.0' -and @($manifest.pluginTypes).Count -eq 4) 'Signed package identity mismatch.'
    Require ((Get-FileHash -LiteralPath $assemblyPath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $manifest.sha256) 'Signed package hash mismatch.'
    $manifest
}
function Ensure-Assembly($Service, $Manifest) {
    $rows=@(Find-Exactly $Service 'pluginassembly' 'name' ([string]$Manifest.assembly) @('pluginassemblyid','name','version','publickeytoken','isolationmode','sourcetype','content'))
    Require ($rows.Count -le 1) 'Multiple unified plugin assemblies exist.'
    if(-not $rows.Count){if(-not $provision){throw 'Signed plugin assembly is missing.'};$entity=[Microsoft.Xrm.Sdk.Entity]::new('pluginassembly');$entity['name']=[string]$Manifest.assembly;$entity['content']=[Convert]::ToBase64String([IO.File]::ReadAllBytes($assemblyPath));$entity['isolationmode']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(2);$entity['sourcetype']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$entity['version']=[string]$Manifest.version;$entity['culture']='neutral';$entity['publickeytoken']=[string]$Manifest.publicKeyToken;$id=$Service.Create($entity);$rows=@($Service.Retrieve('pluginassembly',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('pluginassemblyid','name','version','publickeytoken','isolationmode','sourcetype')));Write-Host 'Registered signed unified plugin assembly.'}
    $row=$rows[0]
    Require ([string]$row['publickeytoken'] -eq [string]$Manifest.publicKeyToken -and [int]$row['isolationmode'].Value -eq 2) 'Existing plugin assembly identity/configuration conflict.'
    $currentHash=''
    if($row.Attributes.ContainsKey('content') -and [string]$row['content']){$bytes=[Convert]::FromBase64String([string]$row['content']);$sha=[Security.Cryptography.SHA256]::Create();try{$currentHash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
    if($currentHash -ne [string]$Manifest.sha256){
        if(-not $provision){throw "Plugin assembly content differs from the reviewed package (live $currentHash; package $($Manifest.sha256))."}
        $update=[Microsoft.Xrm.Sdk.Entity]::new('pluginassembly',$row.Id);$update['content']=[Convert]::ToBase64String([IO.File]::ReadAllBytes($assemblyPath));$Service.Update($update);Write-Host "Updated signed unified plugin assembly to $($Manifest.version)."
        $row=$Service.Retrieve('pluginassembly',$row.Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('pluginassemblyid','name','version','publickeytoken','isolationmode','sourcetype','content'))
        $bytes=[Convert]::FromBase64String([string]$row['content']);$sha=[Security.Cryptography.SHA256]::Create();try{$currentHash=([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    }
    Require ([string]$row['version'] -eq [string]$Manifest.version -and $currentHash -eq [string]$Manifest.sha256) 'Deployed plugin assembly version/hash does not match the reviewed package.'
    $row
}
function Ensure-PluginTypes($Service, $Assembly, $Manifest) {
    $map=@{}
    foreach($typeName in $Manifest.pluginTypes){$rows=@(Find-Exactly $Service 'plugintype' 'typename' ([string]$typeName) @('plugintypeid','typename','pluginassemblyid'));Require($rows.Count -le 1) "Multiple plugin types: $typeName";if(-not $rows.Count){if(-not $provision){throw "Missing plugin type: $typeName"};$entity=[Microsoft.Xrm.Sdk.Entity]::new('plugintype');$entity['typename']=[string]$typeName;$entity['name']=[string]$typeName;$entity['friendlyname']=[string]$typeName;$entity['pluginassemblyid']=$Assembly.ToEntityReference();$id=$Service.Create($entity);$rows=@($Service.Retrieve('plugintype',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('plugintypeid','typename','pluginassemblyid')));Write-Host "Registered plugin type $typeName"};$assemblyReference=[Microsoft.Xrm.Sdk.EntityReference]$rows[0]['pluginassemblyid'];Require($assemblyReference.Id -eq $Assembly.Id) "Plugin type assembly conflict: $typeName";$map[[string]$typeName]=$rows[0]}
    $map
}
function ParameterType([string]$Description) { if($Description -match '^Guid'){12}elseif($Description -match '^Boolean'){0}else{10} }
function Ensure-ApiChildren($Service, [guid]$ApiId, $Api, [bool]$Response) {
    $table=if($Response){'customapiresponseproperty'}else{'customapirequestparameter'};$expected=if($Response){@($Api.responses)}else{@($Api.requests)}
    $columns=if($Response){@('name','uniquename','type')}else{@('name','uniquename','type','isoptional')}
    $query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new($table);$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($columns);$query.Criteria.AddCondition('customapiid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$ApiId);$existing=@($Service.RetrieveMultiple($query).Entities)
    foreach($name in $expected){$rows=@($existing|Where-Object{[string]$_['uniquename']-eq[string]$name});Require($rows.Count -le 1) "Duplicate API property $($Api.name).$name";$contractApi=@($contract.apis|Where-Object name -eq $Api.name)[0];$description=if($Response){if($name -match 'Id$'){'Guid'}elseif($name -in @('WasReplay','CoordinatorManaged','RegistrationVoid')){'Boolean'}else{'String'}}else{[string]$contractApi.parameters.$name};$expectedType=ParameterType $description;if(-not $rows.Count){if(-not $provision){throw "Missing API property $($Api.name).$name"};$entity=[Microsoft.Xrm.Sdk.Entity]::new($table);$entity['name']=[string]$name;$entity['uniquename']=[string]$name;$entity['displayname']=[string]$name;$entity['description']=$description;$entity['type']=[Microsoft.Xrm.Sdk.OptionSetValue]::new($expectedType);if(-not $Response){$entity['isoptional']=$description -match 'optional'};$entity['customapiid']=[Microsoft.Xrm.Sdk.EntityReference]::new('customapi',$ApiId);$Service.Create($entity)|Out-Null;Write-Host "Created API property $($Api.name).$name"}else{Require([int]$rows[0]['type'].Value-eq$expectedType) "API property type conflict $($Api.name).$name"}}
    $existing=@($Service.RetrieveMultiple($query).Entities);Require (@($existing|Where-Object{$expected -notcontains [string]$_['uniquename']}).Count -eq 0) "Unexpected API properties on $($Api.name)."
}
function Ensure-CustomApis($Service, $PluginTypes) {
    foreach($api in $readiness.customApis){$rows=@(Find-Exactly $Service 'customapi' 'uniquename' ([string]$api.name) @('customapiid','uniquename','isfunction','bindingtype','allowedcustomprocessingsteptype','executeprivilegename','plugintypeid'));Require($rows.Count -le 1) "Duplicate API $($api.name)";if(-not $rows.Count){if(-not $provision){throw "Missing API $($api.name)"};$entity=[Microsoft.Xrm.Sdk.Entity]::new('customapi');$entity['name']=[string]$api.name;$entity['uniquename']=[string]$api.name;$entity['displayname']=[string]$api.name;$entity['description']='Service Operations unified Job workflow';$entity['isfunction']=$false;$entity['bindingtype']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$entity['allowedcustomprocessingsteptype']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$entity['executeprivilegename']=[string]$api.executePrivilege;$entity['plugintypeid']=$PluginTypes[[string]$api.pluginType].ToEntityReference();$id=$Service.Create($entity);$rows=@($Service.Retrieve('customapi',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('customapiid','uniquename','isfunction','bindingtype','allowedcustomprocessingsteptype','executeprivilegename','plugintypeid')));Write-Host "Created Custom API $($api.name)"};$row=$rows[0];Require(-not[bool]$row['isfunction'] -and [int]$row['bindingtype'].Value -eq 0 -and [int]$row['allowedcustomprocessingsteptype'].Value -eq 0 -and [string]$row['executeprivilegename'] -eq [string]$api.executePrivilege) "Custom API conflict: $($api.name)";Ensure-ApiChildren $Service $row.Id $api $false;Ensure-ApiChildren $Service $row.Id $api $true}
}
function Get-Message($Service,[string]$Name){$rows=@(Find-Exactly $Service 'sdkmessage' 'name' $Name @('sdkmessageid','name'));Require($rows.Count -eq 1) "Expected one SDK message $Name";$rows[0]}
function Get-Filter($Service,[guid]$MessageId,[string]$Table){$query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessagefilter');$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessagefilterid','primaryobjecttypecode','sdkmessageid');$query.Criteria.AddCondition('primaryobjecttypecode',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$Table);$query.Criteria.AddCondition('sdkmessageid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$MessageId);$rows=@($Service.RetrieveMultiple($query).Entities);Require($rows.Count -eq 1) "Expected one $Table message filter.";$rows[0]}
function Expand-Steps {
    $steps=[Collections.Generic.List[object]]::new();if($GuardScope -eq 'All'){$invariant=$plan.guardSteps[0];foreach($table in $invariant.tables){foreach($message in $invariant.messages){$image=$invariant.images.$message;$columns=@();if($image){$columns=if($table -eq 'gr_job'){@($image.jobColumns)}else{@($image.ledgerColumns)}};$steps.Add([pscustomobject]@{pluginType=$invariant.pluginType;message=$message;table=$table;order=10;image=$image;columns=$columns})}}}
    $access=$plan.guardSteps[1];foreach($registration in $access.registrations){foreach($table in $registration.tables){$steps.Add([pscustomobject]@{pluginType=$access.pluginType;message=$registration.message;table=$table;order=20;image=$registration.image;columns=if($registration.image){@($registration.image.columns)}else{@()}})}}
    @($steps)
}
function Ensure-SecureConfig($Service,[string]$Value){$rows=@(Find-Exactly $Service 'sdkmessageprocessingstepsecureconfig' 'secureconfig' $Value @('sdkmessageprocessingstepsecureconfigid','secureconfig'));Require($rows.Count -le 1) 'Duplicate unified secure configuration.';if(-not$rows.Count){if(-not$provision){throw 'Missing unified secure configuration.'};$entity=[Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstepsecureconfig');$entity['secureconfig']=$Value;$id=$Service.Create($entity);$rows=@($Service.Retrieve('sdkmessageprocessingstepsecureconfig',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessageprocessingstepsecureconfigid','secureconfig')));Write-Host 'Created encrypted restricted-role configuration.'};$rows[0]}
function Ensure-Steps($Service,$PluginTypes,$Roles){
    $full=@(Find-Exactly $Service 'role' 'name' 'System Administrator' @('roleid','name'))
    $coordinator=@(Find-Exactly $Service 'role' 'name' 'Service Operations' @('roleid','name'))
    Require($full.Count-eq1 -and $coordinator.Count-eq1) 'Full/coordinator role resolution failed.'
    $secureValue="full=$($full[0].Id);coordinator=$($coordinator[0].Id);office=$($Roles['office'].Id);book=$($Roles['book'].Id)"
    $secure=Ensure-SecureConfig $Service $secureValue
    $verified=0
    $stepsToEnable=[Collections.Generic.List[Microsoft.Xrm.Sdk.EntityReference]]::new()
    foreach($definition in @(Expand-Steps)){
        $name="Service Operations Unified | $($definition.pluginType.Split('.')[-1]) | $($definition.message) | $($definition.table)"
        $columns=@('sdkmessageprocessingstepid','name','stage','mode','rank','supporteddeployment','statecode','filteringattributes','plugintypeid','sdkmessageid','sdkmessagefilterid','sdkmessageprocessingstepsecureconfigid')
        $rows=@(Find-Exactly $Service 'sdkmessageprocessingstep' 'name' $name $columns)
        Require($rows.Count-le1) "Duplicate step $name"
        $message=Get-Message $Service $definition.message
        $filter=Get-Filter $Service $message.Id $definition.table
        if(-not$rows.Count){
            if(-not$provision){throw "Missing step $name"}
            $entity=[Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstep')
            $entity['name']=$name;$entity['description']='Service Operations unified Job workflow guard'
            $entity['stage']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(20);$entity['mode']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$entity['rank']=[int]$definition.order
            $entity['supporteddeployment']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$entity['sdkmessageid']=$message.ToEntityReference();$entity['sdkmessagefilterid']=$filter.ToEntityReference();$entity['plugintypeid']=$PluginTypes[[string]$definition.pluginType].ToEntityReference()
            if($definition.order-eq20){$entity['sdkmessageprocessingstepsecureconfigid']=$secure.ToEntityReference()}
            $id=$Service.Create($entity);$rows=@($Service.Retrieve('sdkmessageprocessingstep',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($columns)));Write-Host "Created guard step $name"
        }
        $step=$rows[0]
        $pluginReference=[Microsoft.Xrm.Sdk.EntityReference]$step['plugintypeid'];$messageReference=[Microsoft.Xrm.Sdk.EntityReference]$step['sdkmessageid'];$filterReference=[Microsoft.Xrm.Sdk.EntityReference]$step['sdkmessagefilterid']
        $secureReference=if($step.Attributes.ContainsKey('sdkmessageprocessingstepsecureconfigid')){[Microsoft.Xrm.Sdk.EntityReference]$step['sdkmessageprocessingstepsecureconfigid']}else{$null}
        $filtering=if($step.Attributes.ContainsKey('filteringattributes')){[string]$step['filteringattributes']}else{''}
        $actualStage=[int]$step['stage'].Value;$actualMode=[int]$step['mode'].Value;$actualRank=[int]$step['rank'];$actualDeployment=[int]$step['supporteddeployment'].Value;$actualState=[int]$step['statecode'].Value
        Require($actualStage-eq20 -and $actualMode-eq0 -and $actualRank-eq[int]$definition.order -and $actualDeployment-eq0 -and $actualState-in@(0,1) -and -not$filtering) "Step execution conflict: $name (stage=$actualStage mode=$actualMode rank=$actualRank deployment=$actualDeployment state=$actualState filtering='$filtering')"
        if($actualState-eq1){if(-not$provision){throw "Guard step is disabled: $name"};$stepsToEnable.Add($step.ToEntityReference())}
        Require($pluginReference.Id-eq$PluginTypes[[string]$definition.pluginType].Id -and $messageReference.Id-eq$message.Id -and $filterReference.Id-eq$filter.Id) "Step binding conflict: $name"
        if($definition.order-eq20){Require($secureReference -and $secureReference.Id-eq$secure.Id) "Secure configuration conflict: $name"}
        if($definition.image){
            $images=@(Find-Exactly $Service 'sdkmessageprocessingstepimage' 'sdkmessageprocessingstepid' $step.Id @('sdkmessageprocessingstepimageid','name','entityalias','imagetype','attributes'))
            Require($images.Count-le1) "Duplicate image for $name";$attributes=@($definition.columns)-join ','
            if(-not$images.Count){if(-not$provision){throw "Missing image for $name"};$image=[Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstepimage');$image['name']='Before';$image['entityalias']='Before';$image['imagetype']=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$image['messagepropertyname']='Target';$image['attributes']=$attributes;$image['sdkmessageprocessingstepid']=$step.ToEntityReference();$Service.Create($image)|Out-Null;Write-Host "Created pre-image for $name"}
            else{$actualAttributes=if($images[0].Attributes.Contains('attributes')){[string]$images[0]['attributes']}else{''};Require([string]$images[0]['entityalias']-eq'Before' -and [int]$images[0]['imagetype'].Value-eq0 -and $actualAttributes-eq$attributes) "Image conflict: $name"}
        }
        $verified++
    }
    foreach($stepReference in $stepsToEnable){$request=[Microsoft.Crm.Sdk.Messages.SetStateRequest]::new();$request.EntityMoniker=$stepReference;$request.State=[Microsoft.Xrm.Sdk.OptionSetValue]::new(0);$request.Status=[Microsoft.Xrm.Sdk.OptionSetValue]::new(1);$Service.Execute($request)|Out-Null}
    if($stepsToEnable.Count){Write-Host "Enabled $($stepsToEnable.Count) fully verified restricted-access step(s)."}
    if($GuardScope-eq'AccessOnly'){
        $enabledInvariant=0;$registeredInvariant=0;$invariant=$plan.guardSteps[0]
        foreach($table in $invariant.tables){foreach($messageName in $invariant.messages){$name="Service Operations Unified | $($invariant.pluginType.Split('.')[-1]) | $messageName | $table";$rows=@(Find-Exactly $Service 'sdkmessageprocessingstep' 'name' $name @('sdkmessageprocessingstepid','statecode'));$registeredInvariant+=$rows.Count;foreach($row in $rows){if([int]$row['statecode'].Value-eq0){$enabledInvariant++}}}}
        Require($enabledInvariant-eq0) "$enabledInvariant legacy number-invariant step(s) are enabled."
        Write-Host "Verified $verified enabled restricted-access steps; $registeredInvariant legacy number-invariant steps registered, 0 enabled."
    }else{Write-Host "Verified $verified enabled unified workflow steps."}
}
function Find-User($Service,[string]$Upn){$query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuser');$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid','domainname','internalemailaddress','isdisabled');$query.Criteria.FilterOperator=[Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or;$query.Criteria.AddCondition('domainname',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$Upn);$query.Criteria.AddCondition('internalemailaddress',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$Upn);@($Service.RetrieveMultiple($query).Entities|Group-Object Id|ForEach-Object{$_.Group[0]})}

Import-Sdk
$service=Connect-Dataverse
try {
    $who=$service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new());Write-Output "Connected read/write operator $($who.UserId). Feature flag remains OFF."
    $solution=@(Find-Exactly $service 'solution' 'uniquename' $SolutionUniqueName @('solutionid','uniquename','ismanaged'));Require($solution.Count-eq1 -and -not[bool]$solution[0]['ismanaged']) 'Expected one unmanaged target solution.'
    $manifest=Get-PackageManifest
    foreach($column in $readiness.columns){if($column.type-eq'Lookup'){Ensure-Lookup $service $column}else{Ensure-Column $service $column}}
    Ensure-OptimisticConcurrency $service 'gr_job'
    foreach($table in $readiness.regionalTables){Ensure-OptimisticConcurrency $service ([string]$table)}
    foreach($table in $readiness.regionalTables){Ensure-Choice $service ([string]$table) 'gr_stage' 'Registered' ([int]$readiness.registeredStage)}
    if($provision){Publish-Metadata $service;Write-Output 'Published unified workflow metadata.'}
    $allPrivileges=@(Get-AllPrivileges $service);$roles=@{};foreach($definition in $roleGrants.profiles){$roles[[string]$definition.profile]=Ensure-Role $service $definition $allPrivileges}
    $assembly=Ensure-Assembly $service $manifest;$pluginTypes=Ensure-PluginTypes $service $assembly $manifest;Ensure-CustomApis $service $pluginTypes;Ensure-Steps $service $pluginTypes $roles
    if($Mode -eq 'AssignPilot'){
        $users=@(Find-User $service $PilotUpn);Require($users.Count-eq1 -and -not[bool]$users[0]['isdisabled']) "Pilot $PilotUpn is not one enabled user.";$office=$roles['office'];$query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuserroles');$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false);$query.Criteria.AddCondition('systemuserid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$users[0].Id);$query.Criteria.AddCondition('roleid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$office.Id);if(-not$service.RetrieveMultiple($query).Entities.Count){$references=[Microsoft.Xrm.Sdk.EntityReferenceCollection]::new();$references.Add($office.ToEntityReference());$service.Associate('systemuser',$users[0].Id,[Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'),$references);Write-Output "Assigned Office Admin additively to $PilotUpn; existing roles were retained."}else{Write-Output "$PilotUpn already has Office Admin."}
    }
    Write-Output "Unified workflow $Mode completed with guard scope $GuardScope. Migration/seeds/application deployment/feature enablement: NONE."
} finally { if($service -is[IDisposable]){$service.Dispose()} }
