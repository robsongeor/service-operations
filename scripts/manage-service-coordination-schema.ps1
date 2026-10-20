param(
    [ValidateSet('Inspect', 'Provision', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [switch]$ValidateDefinition
)

# Inspect and Verify are read-only. Provision is the only mode that can change metadata or add the
# reviewed user-depth Job Watch privileges. No mode assigns roles, maps users, sets branch values,
# migrates Jobs, deletes Choice options, deploys application code, or enables feature flags.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repository 'dataverse\service-coordination\schema-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$provision = $Mode -eq 'Provision'

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Get-OptionalProperty($Object, [string]$Name) {
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Assert-Definition {
    Require ([int]$manifest.schemaVersion -eq 1) 'Unsupported service-coordination schema manifest version.'
    Require ([string]$manifest.defaultMode -eq 'Inspect') 'Schema manager must remain read-only by default.'
    Require ([string]$manifest.solutionUniqueName -eq $SolutionUniqueName) 'Solution name differs from the reviewed manifest.'
    Require ([string]$manifest.publisherPrefix -eq 'gr') 'Only the reviewed gr publisher prefix is supported.'
    Require ([string]$manifest.jobStatusChoice.name -eq 'gr_status') 'Job Status global Choice name changed.'
    Require (@($manifest.jobStatusChoice.options).Count -eq 6) 'Job Status contract must contain six historical values.'
    Require (@($manifest.jobStatusChoice.options | Where-Object updateLabel).Count -eq 5) 'Exactly five active Job Status labels must be managed.'
    $statusValues = @($manifest.jobStatusChoice.options | ForEach-Object { [int]$_.value })
    Require (($statusValues | Sort-Object -Unique).Count -eq 6) 'Job Status values must be unique.'
    Require ($statusValues -contains 122830005) 'The legacy Unconfirmed value must remain inspectable.'
    Require (-not [bool]($manifest.jobStatusChoice.options | Where-Object { [int]$_.value -eq 122830005 }).updateLabel) 'Phase 3 must not relabel or delete the legacy value.'
    $branchValues = @($manifest.branchChoice.options | ForEach-Object { [int]$_.value })
    Require (($branchValues | Sort-Object -Unique).Count -eq 4) 'Operating Branch values must be unique.'
    Require (($manifest.branchColumns.logicalName | Sort-Object -Unique).Count -eq 2) 'Operating Branch columns must be unique.'
    Require (($manifest.watchTable.lookups.logicalName | Sort-Object -Unique).Count -eq 2) 'Job Watch lookups must be unique.'
    foreach ($lookup in @($manifest.watchTable.lookups)) {
        Require ([string]$lookup.relationship -like 'gr_*') "Unexpected relationship publisher prefix: $($lookup.relationship)"
        Require ([string]$lookup.referencedNavigationProperty -like 'gr_*') "Unexpected navigation-property publisher prefix: $($lookup.referencedNavigationProperty)"
    }
    Require ([string]$manifest.watchTable.logicalName -eq 'gr_jobwatch') 'Job Watch logical name changed.'
    Require ([string]$manifest.watchTable.primaryName -eq 'gr_name') 'Job Watch primary name changed.'
    Require ((@($manifest.watchTable.alternateKey.attributes | Sort-Object) -join ',') -eq 'gr_job,gr_watcher') 'Job Watch alternate key must be Job + Watcher.'
    Require ([string]$manifest.rolePolicy.roleName -eq 'Service Operations') 'Unexpected coordinator Dataverse role.'
    Require ([string]$manifest.rolePolicy.requiredDepth -eq 'Basic') 'Ordinary Job Watch privileges must remain user-depth.'
    Require (-not [bool]$manifest.rolePolicy.ordinaryUsersMayMutateOtherUsersWatches) 'Cross-user Job Watch mutation cannot be enabled.'
    Require ([bool]$manifest.provisioningRequiresExplicitApproval) 'Provisioning approval gate cannot be removed.'
    $prefixedNames = @([string]$manifest.branchChoice.name) +
        @($manifest.branchColumns | ForEach-Object { [string]$_.logicalName }) +
        @([string]$manifest.watchTable.logicalName) +
        @($manifest.watchTable.lookups | ForEach-Object { [string]$_.logicalName })
    foreach ($name in $prefixedNames) {
        Require ($name.StartsWith('gr_')) "Unexpected publisher prefix: $name"
    }
}

Assert-Definition
if ($ValidateDefinition) {
    [pscustomobject]@{
        valid = $true
        defaultMode = [string]$manifest.defaultMode
        provisioningRequiresExplicitApproval = [bool]$manifest.provisioningRequiresExplicitApproval
        assignmentsIncluded = [bool]$manifest.assignmentsIncluded
        migrationIncluded = [bool]$manifest.migrationIncluded
    } | ConvertTo-Json
    return
}

function New-Label([string]$Text) {
    return [Microsoft.Xrm.Sdk.Label]::new($Text, [int]$manifest.languageCode)
}

function New-Required([bool]$Required) {
    $level = if ($Required) {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    } else {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    }
    return [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new($level)
}

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $path
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
    return $client
}

function Get-Entity($Service, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $Name
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).EntityMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}

function Get-Attribute($Service, [string]$Table, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $Table
    $request.LogicalName = $Name
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).AttributeMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}

function Get-OptionSet($Service, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveOptionSetRequest]::new()
    $request.Name = $Name
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).OptionSetMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}

function Get-Relationship($Service, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveRelationshipRequest]::new()
    $request.Name = $Name
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).RelationshipMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}

function Find-Rows($Service, [string]$Table, [string]$Column, $Value, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.Criteria.AddCondition($Column, [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Value)
    return @($Service.RetrieveMultiple($query).Entities)
}

function Get-Solution($Service) {
    $rows = @(Find-Rows $Service 'solution' 'uniquename' $SolutionUniqueName @('solutionid','uniquename','friendlyname','ismanaged','publisherid'))
    Require ($rows.Count -eq 1) "Expected exactly one solution named $SolutionUniqueName; found $($rows.Count)."
    $solution = $rows[0]
    Require (-not [bool]$solution['ismanaged']) "$SolutionUniqueName must be unmanaged."
    Require ($solution['publisherid'] -is [Microsoft.Xrm.Sdk.EntityReference]) 'Solution publisher is missing.'
    $publisher = $Service.Retrieve('publisher', $solution['publisherid'].Id, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('customizationprefix','friendlyname'))
    Require ([string]$publisher['customizationprefix'] -eq [string]$manifest.publisherPrefix) "Solution publisher prefix must be $($manifest.publisherPrefix)."
    return [pscustomobject]@{ Row=$solution; Publisher=$publisher }
}

function Get-EnglishLabel($Option) {
    $label = @($Option.Label.LocalizedLabels | Where-Object { [int]$_.LanguageCode -eq [int]$manifest.languageCode } | Select-Object -First 1)
    if ($label.Count) { return [string]$label[0].Label }
    return ''
}

function Get-OptionSummary($OptionSet) {
    if ($null -eq $OptionSet) { return $null }
    return [pscustomobject]@{
        name = [string]$OptionSet.Name
        metadataId = [string]$OptionSet.MetadataId
        isGlobal = [bool]$OptionSet.IsGlobal
        type = [string]$OptionSet.OptionSetType
        options = @($OptionSet.Options | Sort-Object Value | ForEach-Object {
            [pscustomobject]@{
                value = [int]$_.Value
                labels = @($_.Label.LocalizedLabels | Sort-Object LanguageCode | ForEach-Object {
                    [pscustomobject]@{ languageCode=[int]$_.LanguageCode; label=[string]$_.Label }
                })
            }
        })
    }
}

function Assert-ChoiceContract($OptionSet, $Definition, [bool]$Required, [bool]$CheckLabels) {
    if ($null -eq $OptionSet) {
        if ($Required) { throw "Missing global Choice: $($Definition.name)" }
        return
    }
    Require ([bool]$OptionSet.IsGlobal) "$($Definition.name) must be global."
    if ($null -ne $OptionSet.IsManaged) { Require (-not [bool]$OptionSet.IsManaged) "$($Definition.name) must be unmanaged." }
    Require ([string]$OptionSet.Name -eq [string]$Definition.name) "Global Choice name conflict: $($Definition.name)."
    Require ([string]$OptionSet.OptionSetType -eq 'Picklist') "$($Definition.name) must be a Picklist Choice."
    $actual = @($OptionSet.Options | Sort-Object Value)
    $expected = @($Definition.options | Sort-Object value)
    Require ($actual.Count -eq $expected.Count) "$($Definition.name) option count conflict."
    for ($index=0; $index -lt $expected.Count; $index++) {
        Require ([int]$actual[$index].Value -eq [int]$expected[$index].value) "$($Definition.name) option value conflict at index $index."
        if ($CheckLabels -and ($expected[$index].PSObject.Properties.Name -notcontains 'updateLabel' -or [bool]$expected[$index].updateLabel)) {
            Require ((Get-EnglishLabel $actual[$index]) -eq [string]$expected[$index].label) "$($Definition.name) label conflict for $($expected[$index].value)."
        }
    }
}

function Assert-JobStatusContract($Service, [bool]$CheckTargetLabels) {
    $choice = Get-OptionSet $Service ([string]$manifest.jobStatusChoice.name)
    Assert-ChoiceContract $choice $manifest.jobStatusChoice $true $CheckTargetLabels
    $attribute = Get-Attribute $Service 'gr_job' 'gr_status'
    Require ($null -ne $attribute -and [string]$attribute.AttributeType -eq 'Picklist') 'gr_job.gr_status must be a Choice column.'
    Require ([bool]$attribute.OptionSet.IsGlobal -and [string]$attribute.OptionSet.Name -eq [string]$manifest.jobStatusChoice.name) 'gr_job.gr_status must reference global Choice gr_status.'
}

function Assert-BranchColumn($Service, $Definition, [bool]$Required) {
    $attribute = Get-Attribute $Service ([string]$Definition.table) ([string]$Definition.logicalName)
    if ($null -eq $attribute) {
        if ($Required) { throw "Missing column: $($Definition.table).$($Definition.logicalName)" }
        return
    }
    Require ([string]$attribute.AttributeType -eq 'Picklist') "$($Definition.table).$($Definition.logicalName) must be a Choice."
    Require ([string]$attribute.RequiredLevel.Value -eq 'None') "$($Definition.table).$($Definition.logicalName) must be optional."
    Require (-not [bool]$attribute.IsSecured) "$($Definition.table).$($Definition.logicalName) must not use field security."
    Require ([bool]$attribute.OptionSet.IsGlobal -and [string]$attribute.OptionSet.Name -eq [string]$manifest.branchChoice.name) "$($Definition.table).$($Definition.logicalName) must reference global Choice $($manifest.branchChoice.name)."
}

function Assert-WatchTable($Service, [bool]$Required) {
    $entity = Get-Entity $Service ([string]$manifest.watchTable.logicalName)
    if ($null -eq $entity) {
        if ($Required) { throw "Missing table: $($manifest.watchTable.logicalName)" }
        return
    }
    Require ([string]$entity.OwnershipType -eq 'UserOwned') 'Job Watch must be user-owned.'
    Require (-not [bool]$entity.IsActivity) 'Job Watch must not be an activity table.'
    Require ([string]$entity.PrimaryIdAttribute -eq [string]$manifest.watchTable.primaryId) 'Job Watch primary ID conflict.'
    Require ([string]$entity.PrimaryNameAttribute -eq [string]$manifest.watchTable.primaryName) 'Job Watch primary name conflict.'
    Require ([string]$entity.EntitySetName -eq [string]$manifest.watchTable.entitySetName) 'Job Watch entity-set name conflict.'
    $primary = Get-Attribute $Service ([string]$manifest.watchTable.logicalName) ([string]$manifest.watchTable.primaryName)
    Require ($null -ne $primary -and [string]$primary.AttributeType -eq 'String') 'Job Watch primary name must be text.'
    Require ([int]$primary.MaxLength -eq [int]$manifest.watchTable.primaryNameLength) 'Job Watch primary-name length conflict.'
    Require ([string]$primary.RequiredLevel.Value -eq 'ApplicationRequired') 'Job Watch primary name must be required.'
}

function Assert-WatchLookup($Service, $Definition, [bool]$Required) {
    $attribute = Get-Attribute $Service ([string]$manifest.watchTable.logicalName) ([string]$Definition.logicalName)
    $relationship = Get-Relationship $Service ([string]$Definition.relationship)
    if ($null -eq $attribute -and $null -eq $relationship) {
        if ($Required) { throw "Missing Job Watch lookup: $($Definition.logicalName)" }
        return
    }
    Require ($null -ne $attribute -and $null -ne $relationship) "Partial Job Watch lookup metadata: $($Definition.logicalName)."
    Require ([string]$attribute.AttributeType -eq 'Lookup' -and @($attribute.Targets) -contains [string]$Definition.target) "Job Watch lookup target conflict: $($Definition.logicalName)."
    Require ([string]$attribute.RequiredLevel.Value -eq 'ApplicationRequired') "Job Watch lookup must be required: $($Definition.logicalName)."
    Require ([string]$relationship.ReferencedEntity -eq [string]$Definition.target -and [string]$relationship.ReferencingEntity -eq [string]$manifest.watchTable.logicalName) "Job Watch relationship endpoint conflict: $($Definition.relationship)."
    Require ([string]$relationship.CascadeConfiguration.Delete -eq [string]$Definition.deleteBehavior) "Job Watch delete behavior conflict: $($Definition.relationship)."
    foreach ($behavior in @('Assign','Share','Unshare','Reparent','Merge')) {
        Require ([string]$relationship.CascadeConfiguration.$behavior -eq 'NoCascade') "Job Watch $behavior cascade conflict: $($Definition.relationship)."
    }
}

function Get-WatchKey($Service) {
    $entity = Get-Entity $Service ([string]$manifest.watchTable.logicalName)
    if ($null -eq $entity) { return }
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityKeyRequest]::new()
    $request.EntityLogicalName = [string]$manifest.watchTable.logicalName
    $request.LogicalName = [string]$manifest.watchTable.alternateKey.logicalName
    $request.RetrieveAsIfPublished = $true
    try { return $Service.Execute($request).EntityKeyMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return }; throw }
}

function Assert-WatchKey($Service, [bool]$Required, [bool]$RequireActive) {
    $found = @(Get-WatchKey $Service)
    if (-not $found.Count) {
        if ($Required) { throw "Missing alternate key: $($manifest.watchTable.alternateKey.logicalName)" }
        return
    }
    Require ($found.Count -eq 1) 'Duplicate Job Watch alternate-key metadata.'
    Require ((@($found[0].KeyAttributes | Sort-Object) -join ',') -eq (@($manifest.watchTable.alternateKey.attributes | Sort-Object) -join ',')) 'Job Watch alternate-key attributes conflict.'
    if ($RequireActive) {
        $status = Get-OptionalProperty $found[0] 'EntityKeyIndexStatus'
        Require ([string]$status -eq 'Active') "Job Watch alternate key is $(if ($null -eq $status) { 'unavailable' } else { $status }), expected Active."
    }
}

function Get-RoleAndPrivileges($Service) {
    $roleName = [string]$manifest.rolePolicy.roleName
    $roles = @(Find-Rows $Service 'role' 'name' $roleName @('roleid','name','ismanaged','businessunitid'))
    Require ($roles.Count -eq 1) "Expected exactly one role named $roleName; found $($roles.Count)."
    Require (-not [bool]$roles[0]['ismanaged']) "$roleName must be unmanaged."
    $names = @(@($manifest.rolePolicy.operations) + @($manifest.rolePolicy.forbiddenOperations) | ForEach-Object { "prv$($_)$($manifest.rolePolicy.tableSchemaName)" })
    $all = [Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('privilegeid','name')
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new(); $query.PageInfo.Count=5000; $query.PageInfo.PageNumber=1
    do {
        $page = $Service.RetrieveMultiple($query)
        foreach ($row in $page.Entities) { $all.Add($row) }
        if ($page.MoreRecords) { $query.PageInfo.PageNumber++; $query.PageInfo.PagingCookie=$page.PagingCookie }
    } while ($page.MoreRecords)
    $metadata = @($all | Where-Object { $names -icontains [string]$_['name'] })
    $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new(); $request.RoleId=$roles[0].Id
    return [pscustomobject]@{ Role=$roles[0]; Metadata=$metadata; Current=@($Service.Execute($request).RolePrivileges); ExpectedNames=$names }
}

function Assert-RolePolicy($Service, [bool]$RequireComplete) {
    $state = Get-RoleAndPrivileges $Service
    foreach ($operation in @($manifest.rolePolicy.operations)) {
        $name = "prv$operation$($manifest.rolePolicy.tableSchemaName)"
        $metadata = @($state.Metadata | Where-Object { [string]$_['name'] -ieq $name })
        if (-not $metadata.Count) {
            if ($RequireComplete) { throw "Generated Job Watch privilege is missing: $name" }
            continue
        }
        Require ($metadata.Count -eq 1) "Duplicate privilege metadata: $name"
        $held = @($state.Current | Where-Object { $_.PrivilegeId -eq $metadata[0].Id })
        if (-not $held.Count) {
            if ($RequireComplete) { throw "Service Operations role is missing $name." }
            continue
        }
        Require ($held.Count -eq 1 -and [string]$held[0].Depth -eq [string]$manifest.rolePolicy.requiredDepth) "$name must have only $($manifest.rolePolicy.requiredDepth) depth."
    }
    foreach ($operation in @($manifest.rolePolicy.forbiddenOperations)) {
        $name = "prv$operation$($manifest.rolePolicy.tableSchemaName)"
        $metadata = @($state.Metadata | Where-Object { [string]$_['name'] -ieq $name })
        if ($metadata.Count) {
            Require (-not @($state.Current | Where-Object { $_.PrivilegeId -eq $metadata[0].Id }).Count) "Service Operations role has forbidden Job Watch privilege: $name"
        }
    }
}

function Test-SolutionComponent($Service, $Solution, [Guid]$ObjectId, [int]$ComponentType) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('solutioncomponent')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('solutioncomponentid')
    $query.Criteria.AddCondition('solutionid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$Solution.Row.Id)
    $query.Criteria.AddCondition('objectid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$ObjectId)
    $query.Criteria.AddCondition('componenttype',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$ComponentType)
    return $Service.RetrieveMultiple($query).Entities.Count -gt 0
}

function Test-SolutionComponentCoverage($Service, $Solution, $Component) {
    if (Test-SolutionComponent $Service $Solution $Component.Id $Component.Type) { return $true }
    if ([string]::IsNullOrWhiteSpace([string]$Component.ParentEntity)) { return $false }
    $parent = Get-Entity $Service ([string]$Component.ParentEntity)
    if ($null -eq $parent -or $null -eq $parent.MetadataId) { return $false }
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('solutioncomponent')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('rootcomponentbehavior')
    $query.Criteria.AddCondition('solutionid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$Solution.Row.Id)
    $query.Criteria.AddCondition('objectid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,[Guid]$parent.MetadataId)
    $query.Criteria.AddCondition('componenttype',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,1)
    $rows = @($Service.RetrieveMultiple($query).Entities)
    return @($rows | Where-Object {
        $behavior = $_['rootcomponentbehavior']
        $value = if ($behavior -is [Microsoft.Xrm.Sdk.OptionSetValue]) { [int]$behavior.Value } else { [int]$behavior }
        $value -eq 0
    }).Count -gt 0
}

function Get-RequiredComponents($Service) {
    $components = [Collections.Generic.List[object]]::new()
    $statusChoice = Get-OptionSet $Service ([string]$manifest.jobStatusChoice.name)
    $branchChoice = Get-OptionSet $Service ([string]$manifest.branchChoice.name)
    foreach ($item in @(@{Metadata=$statusChoice;Type=9;Name=[string]$manifest.jobStatusChoice.name},@{Metadata=$branchChoice;Type=9;Name=[string]$manifest.branchChoice.name})) {
        if ($null -ne $item.Metadata -and $null -ne $item.Metadata.MetadataId) { $components.Add([pscustomobject]@{Id=[Guid]$item.Metadata.MetadataId;Type=$item.Type;Name=$item.Name;ParentEntity=$null}) }
    }
    $table = Get-Entity $Service ([string]$manifest.watchTable.logicalName)
    if ($null -ne $table -and $null -ne $table.MetadataId) { $components.Add([pscustomobject]@{Id=[Guid]$table.MetadataId;Type=1;Name=[string]$manifest.watchTable.logicalName;ParentEntity=$null}) }
    foreach ($definition in @($manifest.branchColumns)) {
        $attribute = Get-Attribute $Service ([string]$definition.table) ([string]$definition.logicalName)
        if ($null -ne $attribute -and $null -ne $attribute.MetadataId) { $components.Add([pscustomobject]@{Id=[Guid]$attribute.MetadataId;Type=2;Name="$($definition.table).$($definition.logicalName)";ParentEntity=[string]$definition.table}) }
    }
    foreach ($definition in @($manifest.watchTable.lookups)) {
        $attribute = Get-Attribute $Service ([string]$manifest.watchTable.logicalName) ([string]$definition.logicalName)
        if ($null -ne $attribute -and $null -ne $attribute.MetadataId) { $components.Add([pscustomobject]@{Id=[Guid]$attribute.MetadataId;Type=2;Name="$($manifest.watchTable.logicalName).$($definition.logicalName)";ParentEntity=[string]$manifest.watchTable.logicalName}) }
        $relationship = Get-Relationship $Service ([string]$definition.relationship)
        if ($null -ne $relationship -and $null -ne $relationship.MetadataId) { $components.Add([pscustomobject]@{Id=[Guid]$relationship.MetadataId;Type=10;Name=[string]$definition.relationship;ParentEntity=[string]$manifest.watchTable.logicalName}) }
    }
    $key = @(Get-WatchKey $Service)
    if ($key.Count -and $null -ne $key[0].MetadataId) { $components.Add([pscustomobject]@{Id=[Guid]$key[0].MetadataId;Type=14;Name=[string]$manifest.watchTable.alternateKey.logicalName;ParentEntity=[string]$manifest.watchTable.logicalName}) }
    return @($components)
}

function Assert-SolutionComponents($Service, $Solution, [bool]$Required) {
    foreach ($component in @(Get-RequiredComponents $Service)) {
        if ($Required) { Require (Test-SolutionComponentCoverage $Service $Solution $component) "Missing solution component: $($component.Name)" }
    }
}

function Add-Check([Collections.Generic.List[object]]$Issues, [string]$Area, [scriptblock]$Check) {
    try { & $Check }
    catch { $Issues.Add([pscustomobject]@{ area=$Area; message=$_.Exception.Message }) }
}

function Get-ContractIssues($Service, [bool]$RequireComplete) {
    $issues = [Collections.Generic.List[object]]::new()
    Add-Check $issues 'solution' { $script:solutionState = Get-Solution $Service }
    Add-Check $issues 'job-status-choice' { Assert-JobStatusContract $Service $RequireComplete }
    Add-Check $issues 'branch-choice' { Assert-ChoiceContract (Get-OptionSet $Service ([string]$manifest.branchChoice.name)) $manifest.branchChoice $RequireComplete $true }
    foreach ($definition in @($manifest.branchColumns)) {
        Add-Check $issues "column:$($definition.table).$($definition.logicalName)" { Assert-BranchColumn $Service $definition $RequireComplete }
    }
    Add-Check $issues 'job-watch-table' { Assert-WatchTable $Service $RequireComplete }
    foreach ($definition in @($manifest.watchTable.lookups)) {
        Add-Check $issues "lookup:$($definition.logicalName)" { Assert-WatchLookup $Service $definition $RequireComplete }
    }
    Add-Check $issues 'job-watch-key' { Assert-WatchKey $Service $RequireComplete $RequireComplete }
    Add-Check $issues 'role-policy' { Assert-RolePolicy $Service $RequireComplete }
    if ($null -ne $script:solutionState) { Add-Check $issues 'solution-components' { Assert-SolutionComponents $Service $script:solutionState $RequireComplete } }
    return @($issues)
}

function Update-JobStatusLabels($Service) {
    $choice = Get-OptionSet $Service ([string]$manifest.jobStatusChoice.name)
    foreach ($definition in @($manifest.jobStatusChoice.options | Where-Object updateLabel)) {
        $option = @($choice.Options | Where-Object { [int]$_.Value -eq [int]$definition.value })[0]
        if ((Get-EnglishLabel $option) -eq [string]$definition.label) { continue }
        $request = [Microsoft.Xrm.Sdk.Messages.UpdateOptionValueRequest]::new()
        $request.OptionSetName = [string]$manifest.jobStatusChoice.name
        $request.Value = [int]$definition.value
        $request.Label = New-Label ([string]$definition.label)
        $request.MergeLabels = $true
        $request.SolutionUniqueName = $SolutionUniqueName
        $Service.Execute($request) | Out-Null
        Write-Output "Updated Job Status label $($definition.value) to $($definition.label)."
    }
}

function Ensure-BranchChoice($Service) {
    if ($null -ne (Get-OptionSet $Service ([string]$manifest.branchChoice.name))) { return }
    $choice = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $choice.Name = [string]$manifest.branchChoice.name
    $choice.DisplayName = New-Label ([string]$manifest.branchChoice.displayName)
    $choice.Description = New-Label ([string]$manifest.branchChoice.description)
    $choice.IsGlobal = $true
    $choice.OptionSetType = [Microsoft.Xrm.Sdk.Metadata.OptionSetType]::Picklist
    foreach ($definition in @($manifest.branchChoice.options)) {
        $choice.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label ([string]$definition.label)), [int]$definition.value))
    }
    $request = [Microsoft.Xrm.Sdk.Messages.CreateOptionSetRequest]::new()
    $request.OptionSet = $choice; $request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created global Choice $($manifest.branchChoice.name)."
}

function Ensure-BranchColumn($Service, $Definition) {
    if ($null -ne (Get-Attribute $Service ([string]$Definition.table) ([string]$Definition.logicalName))) { return }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
    $attribute.SchemaName = [string]$Definition.schemaName
    $attribute.DisplayName = New-Label ([string]$Definition.displayName)
    $attribute.Description = New-Label ([string]$Definition.description)
    $attribute.RequiredLevel = New-Required $false
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $attribute.OptionSet.IsGlobal = $true
    $attribute.OptionSet.Name = [string]$manifest.branchChoice.name
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName=[string]$Definition.table; $request.Attribute=$attribute; $request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column $($Definition.table).$($Definition.logicalName)."
}

function Ensure-WatchTable($Service) {
    if ($null -ne (Get-Entity $Service ([string]$manifest.watchTable.logicalName))) { return }
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName=[string]$manifest.watchTable.schemaName
    $entity.DisplayName=New-Label ([string]$manifest.watchTable.displayName)
    $entity.DisplayCollectionName=New-Label ([string]$manifest.watchTable.collectionName)
    $entity.OwnershipType=[Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned
    $entity.IsActivity=$false
    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $primary.SchemaName=[string]$manifest.watchTable.primaryNameSchema
    $primary.DisplayName=New-Label 'Name'
    $primary.MaxLength=[int]$manifest.watchTable.primaryNameLength
    $primary.RequiredLevel=New-Required $true
    $request=[Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity=$entity; $request.PrimaryAttribute=$primary; $request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created user-owned table $($manifest.watchTable.logicalName)."
}

function New-WatchCascade([string]$DeleteBehavior) {
    $cascade=[Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new()
    $cascade.Assign='NoCascade';$cascade.Share='NoCascade';$cascade.Unshare='NoCascade';$cascade.Reparent='NoCascade';$cascade.Merge='NoCascade';$cascade.Delete=$DeleteBehavior
    return $cascade
}

function Ensure-WatchLookup($Service, $Definition) {
    if ($null -ne (Get-Attribute $Service ([string]$manifest.watchTable.logicalName) ([string]$Definition.logicalName))) { return }
    $lookup=[Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    $lookup.SchemaName=[string]$Definition.schemaName
    $lookup.DisplayName=New-Label ([string]$Definition.displayName)
    $lookup.RequiredLevel=New-Required $true
    $relationship=[Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName=[string]$Definition.relationship
    $relationship.ReferencedEntity=[string]$Definition.target
    $relationship.ReferencingEntity=[string]$manifest.watchTable.logicalName
    $relationship.ReferencingEntityNavigationPropertyName=[string]$Definition.schemaName
    $relationship.ReferencedEntityNavigationPropertyName=[string]$Definition.referencedNavigationProperty
    $relationship.CascadeConfiguration=New-WatchCascade ([string]$Definition.deleteBehavior)
    $request=[Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.Lookup=$lookup;$request.OneToManyRelationship=$relationship;$request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request)|Out-Null
    Write-Output "Created Job Watch lookup $($Definition.logicalName)."
}

function Ensure-WatchKey($Service) {
    if (@(Get-WatchKey $Service).Count) { return }
    $key=[Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new()
    $key.SchemaName=[string]$manifest.watchTable.alternateKey.schemaName
    $key.DisplayName=New-Label 'Job Watch Job and Watcher'
    $key.KeyAttributes=[string[]]@($manifest.watchTable.alternateKey.attributes)
    $request=[Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new()
    $request.EntityName=[string]$manifest.watchTable.logicalName;$request.EntityKey=$key;$request.SolutionUniqueName=$SolutionUniqueName
    $Service.Execute($request)|Out-Null
    Write-Output "Created alternate key $($manifest.watchTable.alternateKey.logicalName)."
}

function Publish-ServiceCoordinationMetadata($Service) {
    $tables=@('gr_job','systemuser',[string]$manifest.watchTable.logicalName)
    $xml=($tables|ForEach-Object{"<entity>$_</entity>"}) -join ''
    $request=[Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml="<importexportxml><entities>$xml</entities></importexportxml>"
    $Service.Execute($request)|Out-Null
    Write-Output 'Published Service Coordination metadata.'
}

function Ensure-SolutionComponents($Service, $Solution) {
    foreach ($component in @(Get-RequiredComponents $Service)) {
        if (Test-SolutionComponentCoverage $Service $Solution $component) { continue }
        $request=[Microsoft.Crm.Sdk.Messages.AddSolutionComponentRequest]::new()
        $request.ComponentId=$component.Id;$request.ComponentType=$component.Type;$request.SolutionUniqueName=$SolutionUniqueName
        $request.AddRequiredComponents=$false;$request.DoNotIncludeSubcomponents=$true
        $Service.Execute($request)|Out-Null
        Write-Output "Added solution component $($component.Name)."
    }
}

function Ensure-RolePrivileges($Service) {
    $state=Get-RoleAndPrivileges $Service
    $add=[Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach ($operation in @($manifest.rolePolicy.operations)) {
        $name="prv$operation$($manifest.rolePolicy.tableSchemaName)"
        $metadata=@($state.Metadata|Where-Object{[string]$_['name'] -ieq $name})
        Require ($metadata.Count -eq 1) "Expected one generated privilege: $name"
        $held=@($state.Current|Where-Object{$_.PrivilegeId -eq $metadata[0].Id})
        if ($held.Count) { Require ([string]$held[0].Depth -eq [string]$manifest.rolePolicy.requiredDepth) "$name has incompatible depth."; continue }
        $grant=[Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
        $grant.PrivilegeId=$metadata[0].Id
        $grant.Depth=[Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Basic
        $add.Add($grant)
    }
    if ($add.Count) {
        $request=[Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
        $request.RoleId=$state.Role.Id;$request.Privileges=$add.ToArray()
        $Service.Execute($request)|Out-Null
        Write-Output "Granted $($add.Count) user-depth Job Watch privileges to $($manifest.rolePolicy.roleName)."
    }
}

function Wait-WatchKey($Service) {
    for ($attempt=1; $attempt -le 15; $attempt++) {
        $key=@(Get-WatchKey $Service)
        $status = if ($key.Count) { Get-OptionalProperty $key[0] 'EntityKeyIndexStatus' } else { $null }
        if ([string]$status -eq 'Active') { return }
        if ([string]$status -eq 'Failed') { throw 'Job Watch alternate-key activation failed.' }
        Start-Sleep -Seconds 2
    }
    throw 'Job Watch alternate key did not become Active within the bounded verification window.'
}

function Get-Inspection($Service) {
    $script:solutionState=$null
    $issues=@(Get-ContractIssues $Service $false)
    $statusChoice=Get-OptionSet $Service ([string]$manifest.jobStatusChoice.name)
    $branchChoice=Get-OptionSet $Service ([string]$manifest.branchChoice.name)
    $table=Get-Entity $Service ([string]$manifest.watchTable.logicalName)
    $watchKeys=@(Get-WatchKey $Service)
    $branchColumnSummary=@($manifest.branchColumns|ForEach-Object{
        $attribute=Get-Attribute $Service ([string]$_.table) ([string]$_.logicalName)
        [pscustomobject]@{
            table=[string]$_.table
            logicalName=[string]$_.logicalName
            exists=($null-ne$attribute)
            type=if($attribute){[string]$attribute.AttributeType}else{$null}
            globalChoice=if($null-ne$attribute -and $null-ne$attribute.OptionSet){[string]$attribute.OptionSet.Name}else{$null}
        }
    })
    $roleSummary=$null
    try {
        $role=Get-RoleAndPrivileges $Service
        $roleSummary=[pscustomobject]@{
            name=[string]$manifest.rolePolicy.roleName
            managed=[bool]$role.Role['ismanaged']
            jobWatchPrivileges=@($role.Metadata|ForEach-Object{$metadata=$_;$held=@($role.Current|Where-Object PrivilegeId -eq $metadata.Id);[pscustomobject]@{name=[string]$metadata['name'];depth=if($held.Count){[string]$held[0].Depth}else{$null}}}|Sort-Object name)
        }
    } catch { $roleSummary=[pscustomobject]@{name=[string]$manifest.rolePolicy.roleName;error=$_.Exception.Message} }
    return [pscustomobject]@{
        schemaVersion=[int]$manifest.schemaVersion
        mode='Inspect'
        mutationsPerformed=$false
        environmentUrl=$EnvironmentUrl
        solution=if($null-ne$script:solutionState){[pscustomobject]@{uniqueName=$SolutionUniqueName;managed=[bool]$script:solutionState.Row['ismanaged'];publisherPrefix=[string]$script:solutionState.Publisher['customizationprefix']}}else{$null}
        jobStatusChoice=Get-OptionSummary $statusChoice
        branchChoice=Get-OptionSummary $branchChoice
        branchColumns=$branchColumnSummary
        jobWatch=[pscustomobject]@{exists=($null-ne$table);logicalName=[string]$manifest.watchTable.logicalName;entitySetName=if($table){[string]$table.EntitySetName}else{$null};ownership=if($table){[string]$table.OwnershipType}else{$null};keyStatus=if($watchKeys.Count){[string](Get-OptionalProperty $watchKeys[0] 'EntityKeyIndexStatus')}else{$null}}
        rolePolicy=$roleSummary
        issues=$issues
        readyForProvision=($issues.Count-eq 0)
        notes=@('No business rows or user identities were retrieved.','Inspect performs no metadata, privilege, assignment, configuration or data write.','Provision still requires separate explicit approval.')
    }
}

Import-Sdk
$service=Connect-Dataverse
try {
    if ($Mode -eq 'Inspect') {
        Get-Inspection $service | ConvertTo-Json -Depth 14
        return
    }

    $script:solutionState=$null
    if ($Mode -eq 'Verify') {
        $issues=@(Get-ContractIssues $service $true)
        if ($issues.Count) { throw "Service Coordination schema verification failed: $(@($issues|ForEach-Object{"$($_.area): $($_.message)"}) -join ' | ')" }
        [pscustomobject]@{mode='Verify';mutationsPerformed=$false;verified=$true;solution=$SolutionUniqueName;role=[string]$manifest.rolePolicy.roleName;watchPrivilegeDepth=[string]$manifest.rolePolicy.requiredDepth} | ConvertTo-Json
        return
    }

    $issues=@(Get-ContractIssues $service $false)
    if ($issues.Count) { throw "Provision preflight failed before any write: $(@($issues|ForEach-Object{"$($_.area): $($_.message)"}) -join ' | ')" }
    $solution=Get-Solution $service
    Update-JobStatusLabels $service
    Ensure-BranchChoice $service
    foreach($definition in @($manifest.branchColumns)){Ensure-BranchColumn $service $definition}
    Ensure-WatchTable $service
    foreach($definition in @($manifest.watchTable.lookups)){Ensure-WatchLookup $service $definition}
    Publish-ServiceCoordinationMetadata $service
    Ensure-WatchKey $service
    Publish-ServiceCoordinationMetadata $service
    Wait-WatchKey $service
    Ensure-SolutionComponents $service $solution
    Ensure-RolePrivileges $service
    $script:solutionState=$null
    $post=@(Get-ContractIssues $service $true)
    if($post.Count){throw "Post-provision verification failed: $(@($post|ForEach-Object{"$($_.area): $($_.message)"}) -join ' | ')"}
    [pscustomobject]@{mode='Provision';mutationsPerformed=$true;provisionedAndVerified=$true;assignmentsChanged=$false;branchValuesChanged=$false;migrationRun=$false;choiceDeleted=$false} | ConvertTo-Json
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
