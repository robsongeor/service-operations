param(
    [ValidateSet('Inspect', 'Provision', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$table = 'gr_jobbookentry'
$tableSet = 'gr_jobbookentries'
$jobNumberKey = 'gr_jobbookentry_jobnumber_key'
$jobTableKey = 'gr_job_jobnumber_key'
$autoNumberFormat = '{SEQNUM:6}'
$choiceBase = 122830000

function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text, 1033) }
function New-Required([bool]$Required) {
    $level = if ($Required) { [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired } else { [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None }
    [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new($level)
}
function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' | Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } | Where-Object { Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
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
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}
function Get-Entity($Service, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $Name
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    $request.RetrieveAsIfPublished = $true
    try { $Service.Execute($request).EntityMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}
function Get-Attribute($Service, [string]$Entity, [string]$Name) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $Entity
    $request.LogicalName = $Name
    $request.RetrieveAsIfPublished = $true
    try { $Service.Execute($request).AttributeMetadata }
    catch { if ($_.Exception.Message -match 'not found|does not exist|Could not find') { return $null }; throw }
}
function Get-AllNumericJobNumbers($Service) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobnumber')
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $query.PageInfo.Count = 5000
    $query.PageInfo.PageNumber = 1
    $numbers = [Collections.Generic.List[long]]::new()
    $seen = @{}
    $duplicates = [Collections.Generic.List[string]]::new()
    do {
        $page = $Service.RetrieveMultiple($query)
        foreach ($record in $page.Entities) {
            $raw = if ($record.Attributes.ContainsKey('gr_jobnumber')) { [string]$record['gr_jobnumber'] } else { '' }
            if ([string]::IsNullOrWhiteSpace($raw)) { continue }
            $normalized = $raw.Trim().ToUpperInvariant()
            if ($seen.ContainsKey($normalized)) { $duplicates.Add($raw.Trim()) } else { $seen[$normalized] = $true }
            $parsed = 0L
            if ([long]::TryParse($raw.Trim(), [ref]$parsed) -and $parsed -gt 0) { $numbers.Add($parsed) }
        }
        if ($page.MoreRecords) { $query.PageInfo.PageNumber++; $query.PageInfo.PagingCookie = $page.PagingCookie }
    } while ($page.MoreRecords)
    $maximum = if ($numbers.Count) { ($numbers | Measure-Object -Maximum).Maximum } else { 130499L }
    @{ Maximum = [long]$maximum; Next = [long]$maximum + 1L; Count = $seen.Count; Duplicates = @($duplicates | Sort-Object -Unique) }
}
function Ensure-Table($Service, [bool]$Provision) {
    $existing = Get-Entity $Service $table
    if ($existing) {
        if ($existing.EntitySetName -ne $tableSet -or $existing.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned -or $existing.PrimaryNameAttribute -ne 'gr_jobnumber') { throw "Conflict: $table table contract." }
        $primary = Get-Attribute $Service $table 'gr_jobnumber'
        if ([string]$primary.AttributeType -ne 'String' -or $primary.AutoNumberFormat -ne $autoNumberFormat) { throw 'Conflict: Job Book Job Number is not the expected AutoNumber primary column.' }
        Write-Output "Verified table $table with AutoNumber primary column."
        return $false
    }
    if (-not $Provision) { Write-Output "Missing table: $table (ready to provision)."; return $false }
    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = 'gr_JobBookEntry'
    $entity.DisplayName = New-Label 'Job Book Entry'
    $entity.DisplayCollectionName = New-Label 'Job Book Entries'
    $entity.Description = New-Label 'Job number allocation ledger and reviewed intake boundary before managed Job creation.'
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned
    $entity.IsActivity = $false
    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $primary.SchemaName = 'gr_JobNumber'
    $primary.DisplayName = New-Label 'Job Number'
    $primary.MaxLength = 30
    $primary.AutoNumberFormat = $autoNumberFormat
    $primary.RequiredLevel = New-Required $true
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $entity
    $request.PrimaryAttribute = $primary
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created $table with AutoNumber format $autoNumberFormat."
    $true
}

$columns = @(
    @{ Schema='gr_Stage'; Logical='gr_stage'; Display='Stage'; Kind='Choice'; Required=$true; Extra=@('Intake','Promoted','Legacy','Void') },
    @{ Schema='gr_MechanicText'; Logical='gr_mechanictext'; Display='Mechanic Text'; Kind='Text'; Required=$false; Extra=200 },
    @{ Schema='gr_FleetSnapshot'; Logical='gr_fleetsnapshot'; Display='Fleet Snapshot'; Kind='Text'; Required=$false; Extra=100 },
    @{ Schema='gr_SerialSnapshot'; Logical='gr_serialsnapshot'; Display='Serial Snapshot'; Kind='Text'; Required=$false; Extra=150 },
    @{ Schema='gr_MakeSnapshot'; Logical='gr_makesnapshot'; Display='Make Snapshot'; Kind='Text'; Required=$false; Extra=100 },
    @{ Schema='gr_ModelSnapshot'; Logical='gr_modelsnapshot'; Display='Model Snapshot'; Kind='Text'; Required=$false; Extra=100 },
    @{ Schema='gr_CustomerSnapshot'; Logical='gr_customersnapshot'; Display='Customer Snapshot'; Kind='Text'; Required=$false; Extra=200 },
    @{ Schema='gr_SiteSnapshot'; Logical='gr_sitesnapshot'; Display='Site Snapshot'; Kind='Text'; Required=$false; Extra=200 },
    @{ Schema='gr_AddressSnapshot'; Logical='gr_addresssnapshot'; Display='Address Snapshot'; Kind='Text'; Required=$false; Extra=500 },
    @{ Schema='gr_AddressVerified'; Logical='gr_addressverified'; Display='Address Verified'; Kind='Boolean'; Required=$true },
    @{ Schema='gr_AddressNotFoundConfirmed'; Logical='gr_addressnotfoundconfirmed'; Display='Address Not Found Confirmed'; Kind='Boolean'; Required=$true },
    @{ Schema='gr_Description'; Logical='gr_description'; Display='Description'; Kind='Memo'; Required=$true; Extra=4000 },
    @{ Schema='gr_CustomerPO'; Logical='gr_customerpo'; Display='Customer PO'; Kind='Text'; Required=$false; Extra=100 },
    @{ Schema='gr_Entered'; Logical='gr_entered'; Display='GT Entry'; Kind='Boolean'; Required=$true },
    @{ Schema='gr_TimecloudEntered'; Logical='gr_timecloudentered'; Display='Timecloud Entry'; Kind='Boolean'; Required=$true },
    @{ Schema='gr_EquipmentReviewRequired'; Logical='gr_equipmentreviewrequired'; Display='Equipment Review Required'; Kind='Boolean'; Required=$true },
    @{ Schema='gr_PromotedOn'; Logical='gr_promotedon'; Display='Promoted On'; Kind='DateTime'; Required=$false },
    @{ Schema='gr_VoidReason'; Logical='gr_voidreason'; Display='Void Reason'; Kind='Memo'; Required=$false; Extra=1000 }
)
function Get-AttributeDisplayName($Attribute) {
    if ($Attribute.DisplayName.UserLocalizedLabel) { return [string]$Attribute.DisplayName.UserLocalizedLabel.Label }
    $label = @($Attribute.DisplayName.LocalizedLabels | Where-Object LanguageCode -eq 1033 | Select-Object -First 1)
    if ($label.Count) { return [string]$label[0].Label }
    ''
}
function Set-AttributeDisplayName($Service, [string]$Entity, $Attribute, [string]$Display) {
    $Attribute.DisplayName = New-Label $Display
    $request = [Microsoft.Xrm.Sdk.Messages.UpdateAttributeRequest]::new()
    $request.EntityName = $Entity
    $request.Attribute = $Attribute
    $request.MergeLabels = $false
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Updated display name for $Entity.$($Attribute.LogicalName) to '$Display'."
}
function Ensure-Column($Service, $Def, [bool]$Provision) {
    $existing = Get-Attribute $Service $table $Def.Logical
    $expected = @{ Text='String'; Memo='Memo'; Boolean='Boolean'; Choice='Picklist'; DateTime='DateTime' }[$Def.Kind]
    if ($existing) {
        if ([string]$existing.AttributeType -ne $expected) { throw "Conflict: $table.$($Def.Logical) type." }
        if ($Def.Kind -in @('Text','Memo') -and $existing.MaxLength -lt [int]$Def.Extra) { throw "Conflict: $table.$($Def.Logical) length." }
        $displayName = Get-AttributeDisplayName $existing
        if ($displayName -ne $Def.Display) {
            if (-not $Provision) { throw "Display name mismatch: $table.$($Def.Logical) is '$displayName'; expected '$($Def.Display)'." }
            Set-AttributeDisplayName $Service $table $existing $Def.Display
        }
        Write-Output "Verified column $table.$($Def.Logical)."
        return
    }
    if (-not $Provision) { throw "Missing column: $table.$($Def.Logical)" }
    switch ($Def.Kind) {
        'Text' { $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new(); $attribute.MaxLength = [int]$Def.Extra }
        'Memo' { $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new(); $attribute.MaxLength = [int]$Def.Extra }
        'Boolean' {
            $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
            $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'),1), [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'),0))
            $attribute.DefaultValue = $false
        }
        'Choice' {
            $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
            $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
            $attribute.OptionSet.IsGlobal = $false
            for ($index = 0; $index -lt $Def.Extra.Count; $index++) { $attribute.OptionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $Def.Extra[$index]), $choiceBase + $index)) }
            $attribute.DefaultFormValue = $choiceBase
        }
        'DateTime' { $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new(); $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime; $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal }
    }
    $attribute.SchemaName = $Def.Schema
    $attribute.DisplayName = New-Label $Def.Display
    $attribute.RequiredLevel = New-Required $Def.Required
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $table
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column $table.$($Def.Logical)."
}
$jobMarkerColumns = @(
    @{ Schema='gr_GTEntered'; Logical='gr_gtentered'; Display='GT Entry' },
    @{ Schema='gr_TimecloudEntered'; Logical='gr_timecloudentered'; Display='Timecloud Entry' }
)
function Ensure-JobMarkerColumn($Service, $Def, [bool]$Provision) {
    $existing = Get-Attribute $Service 'gr_job' $Def.Logical
    if ($existing) {
        if ([string]$existing.AttributeType -ne 'Boolean') { throw "Conflict: gr_job.$($Def.Logical) type." }
        $displayName = Get-AttributeDisplayName $existing
        if ($displayName -ne $Def.Display) {
            if (-not $Provision) { throw "Display name mismatch: gr_job.$($Def.Logical) is '$displayName'; expected '$($Def.Display)'." }
            Set-AttributeDisplayName $Service 'gr_job' $existing $Def.Display
        }
        Write-Output "Verified column gr_job.$($Def.Logical)."
        return
    }
    if (-not $Provision) { throw "Missing column: gr_job.$($Def.Logical)" }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
    $attribute.SchemaName = $Def.Schema
    $attribute.DisplayName = New-Label $Def.Display
    $attribute.RequiredLevel = New-Required $false
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'),1), [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'),0))
    $attribute.DefaultValue = $false
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = 'gr_job'
    $request.Attribute = $attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column gr_job.$($Def.Logical)."
}
function New-Cascade {
    $cascade = [Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new()
    $cascade.Assign='NoCascade'; $cascade.Share='NoCascade'; $cascade.Unshare='NoCascade'; $cascade.Reparent='NoCascade'; $cascade.Merge='NoCascade'; $cascade.Delete='Restrict'
    $cascade
}
$lookups = @(
    @{ Schema='gr_Mechanic'; Logical='gr_mechanic'; Display='Mechanic'; Target='gr_mechanic'; Relationship='gr_jobbookentry_Mechanic_gr_mechanic' },
    @{ Schema='gr_Equipment'; Logical='gr_equipment'; Display='Equipment'; Target='gr_equipment'; Relationship='gr_jobbookentry_Equipment_gr_equipment' },
    @{ Schema='gr_Customer'; Logical='gr_customer'; Display='Customer'; Target='gr_customer'; Relationship='gr_jobbookentry_Customer_gr_customer' },
    @{ Schema='gr_Site'; Logical='gr_site'; Display='Site'; Target='gr_site'; Relationship='gr_jobbookentry_Site_gr_site' },
    @{ Schema='gr_PromotedJob'; Logical='gr_promotedjob'; Display='Promoted Job'; Target='gr_job'; Relationship='gr_jobbookentry_PromotedJob_gr_job' }
)
function Ensure-Lookup($Service, $Def, [bool]$Provision) {
    $existing = Get-Attribute $Service $table $Def.Logical
    if ($existing) { if ([string]$existing.AttributeType -ne 'Lookup' -or @($existing.Targets) -notcontains $Def.Target) { throw "Conflict: $table.$($Def.Logical) lookup." }; Write-Output "Verified lookup $table.$($Def.Logical)."; return }
    if (-not $Provision) { throw "Missing lookup: $table.$($Def.Logical)" }
    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new(); $lookup.SchemaName=$Def.Schema; $lookup.DisplayName=New-Label $Def.Display; $lookup.RequiredLevel=New-Required $false
    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new(); $relationship.SchemaName=$Def.Relationship; $relationship.ReferencedEntity=$Def.Target; $relationship.ReferencingEntity=$table; $relationship.ReferencingEntityNavigationPropertyName=$Def.Schema; $relationship.ReferencedEntityNavigationPropertyName="$($Def.Target)_${table}_$($Def.Logical)"; $relationship.CascadeConfiguration=New-Cascade
    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new(); $request.Lookup=$lookup; $request.OneToManyRelationship=$relationship; $request.SolutionUniqueName=$SolutionUniqueName; $Service.Execute($request)|Out-Null
    Write-Output "Created lookup $table.$($Def.Logical)."
}
function Ensure-Key($Service, [string]$Entity, [string]$Schema, [string[]]$Attributes, [bool]$Provision) {
    $logical = $Schema.ToLowerInvariant(); $metadata = Get-Entity $Service $Entity; $found = @($metadata.Keys | Where-Object LogicalName -eq $logical)
    if ($found.Count) { if ((@($found[0].KeyAttributes|Sort-Object)-join ',') -ne (@($Attributes|Sort-Object)-join ',')) { throw "Conflict: key $logical." }; Write-Output "Verified key $logical ($($found[0].EntityKeyIndexStatus))."; return }
    if (-not $Provision) { throw "Missing key: $logical" }
    $key=[Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new(); $key.SchemaName=$Schema; $key.DisplayName=New-Label $Schema; $key.KeyAttributes=$Attributes
    $request=[Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new(); $request.EntityName=$Entity; $request.EntityKey=$key; $request.SolutionUniqueName=$SolutionUniqueName; $Service.Execute($request)|Out-Null
    Write-Output "Created key $logical."
}
function Set-InitialSeed($Service, [long]$Seed) {
    $request=[Microsoft.Crm.Sdk.Messages.SetAutoNumberSeedRequest]::new(); $request.EntityName=$table; $request.AttributeName='gr_jobnumber'; $request.Value=$Seed; $Service.Execute($request)|Out-Null
    Write-Output "Set the first Intake Job Number seed to $Seed."
}
function Test-TableEmpty($Service) {
    $query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new($table);$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false);$query.TopCount=1
    $Service.RetrieveMultiple($query).Entities.Count -eq 0
}
function Publish-Metadata($Service) {
    $request=[Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new(); $request.ParameterXml="<importexportxml><entities><entity>$table</entity><entity>gr_job</entity></entities></importexportxml>"; $Service.Execute($request)|Out-Null
    Write-Output 'Published Job Book Intake metadata.'
}
function Ensure-ServiceOperationsPrivileges($Service, [bool]$Provision) {
    $query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role'); $query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name','ismanaged'); $query.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'Service Operations'); $roles=@($Service.RetrieveMultiple($query).Entities)
    if ($roles.Count -ne 1 -or [bool]$roles[0]['ismanaged']) { throw 'Expected exactly one unmanaged Service Operations role.' }
    $names=@('Create','Read','Write','Append','AppendTo') | ForEach-Object { "prv$($_)gr_JobBookEntry" }
    $privilegeQuery=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege'); $privilegeQuery.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'); $privilegeQuery.PageInfo=[Microsoft.Xrm.Sdk.Query.PagingInfo]::new(); $privilegeQuery.PageInfo.Count=5000; $privilegeQuery.PageInfo.PageNumber=1
    $all=[Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new(); do { $page=$Service.RetrieveMultiple($privilegeQuery); foreach($item in $page.Entities){$all.Add($item)}; if($page.MoreRecords){$privilegeQuery.PageInfo.PageNumber++;$privilegeQuery.PageInfo.PagingCookie=$page.PagingCookie} } while($page.MoreRecords)
    $roleRequest=[Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new(); $roleRequest.RoleId=$roles[0].Id; $current=@($Service.Execute($roleRequest).RolePrivileges); $add=[Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach($name in $names){$privilege=$all|Where-Object{[string]$_['name']-ieq$name}|Select-Object -First 1;if(-not $privilege){throw "Generated privilege missing: $name"};$have=$current|Where-Object PrivilegeId -eq $privilege.Id|Select-Object -First 1;if($have){if([string]$have.Depth-ne 'Global'){throw "Privilege $name has incompatible depth."}}elseif($Provision){$grant=[Microsoft.Crm.Sdk.Messages.RolePrivilege]::new();$grant.PrivilegeId=$privilege.Id;$grant.Depth='Global';$add.Add($grant)}else{throw "Missing Service Operations privilege: $name"}}
    if($add.Count){$request=[Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new();$request.RoleId=$roles[0].Id;$request.Privileges=$add.ToArray();$Service.Execute($request)|Out-Null;Write-Output "Granted $($add.Count) Job Book Intake privileges to Service Operations."}
}

Import-Sdk
$service=Connect-Dataverse
try {
    $who=$service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    Write-Output "Connected to $EnvironmentUrl as $($who.UserId)."
    $numbers=Get-AllNumericJobNumbers $service
    Write-Output "Existing Jobs: $($numbers.Count) numbered; maximum numeric Job Number: $($numbers.Maximum); proposed first Intake number: $($numbers.Next)."
    if($numbers.Duplicates.Count){Write-Warning "Existing duplicate Job Numbers defer the gr_job uniqueness key: $($numbers.Duplicates -join ', '). No existing Job will be changed."}
    $provision=$Mode -eq 'Provision'
    $created=Ensure-Table $service $provision
    if ($Mode -eq 'Inspect' -and -not (Get-Entity $service $table)) { Write-Output 'Inspect completed: schema names are available and preflight passed.'; return }
    foreach($column in $columns){Ensure-Column $service $column $provision}
    foreach($column in $jobMarkerColumns){Ensure-JobMarkerColumn $service $column $provision}
    foreach($lookup in $lookups){Ensure-Lookup $service $lookup $provision}
    Ensure-Key $service $table 'gr_JobBookEntry_JobNumber_Key' @('gr_jobnumber') $provision
    if(-not $numbers.Duplicates.Count){Ensure-Key $service 'gr_job' 'gr_Job_JobNumber_Key' @('gr_jobnumber') $provision}
    if($provision -and ($created -or (Test-TableEmpty $service))){Set-InitialSeed $service $numbers.Next}
    if($provision){Publish-Metadata $service; Ensure-ServiceOperationsPrivileges $service $true}
    Ensure-ServiceOperationsPrivileges $service $false
    if($Mode -eq 'Verify'){
        $keysToVerify=@(@{Entity=$table;Name=$jobNumberKey});if(-not $numbers.Duplicates.Count){$keysToVerify+=@{Entity='gr_job';Name=$jobTableKey}}
        foreach($key in $keysToVerify){$metadata=Get-Entity $service $key.Entity;$found=@($metadata.Keys|Where-Object LogicalName -eq $key.Name);if($found.Count-ne 1-or[string]$found[0].EntityKeyIndexStatus-ne'Active'){throw "Key $($key.Name) is not Active."}}
    }
    Write-Output "Job Book Intake $($Mode.ToLowerInvariant()) completed successfully."
} finally { if($service -is [IDisposable]){$service.Dispose()} }
