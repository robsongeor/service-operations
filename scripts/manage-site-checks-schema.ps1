param(
    [ValidateSet('Inspect', 'InspectTechnicianAccess', 'ProvisionTechnicianAccess', 'InspectChecklist', 'ProvisionChecklist', 'InspectChecklistCorrection', 'ProvisionChecklistCorrection', 'InspectChecklistContent', 'ProvisionChecklistContent', 'VerifyChecklist', 'InspectChecklistAdminSecurity', 'ProvisionChecklistAdminSecurity', 'VerifyChecklistAdminSecurity', 'Provision', 'ProvisionAvailability', 'Verify', 'AuditSecurity', 'ProvisionSecurity', 'PurgeOccurrences', 'PurgeData')]
    [string]$Mode = 'Inspect',

    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',

    [string]$SolutionUniqueName = 'ServiceOperationsNew',

    [string]$ChecklistContentPath = (Join-Path $PSScriptRoot 'site-check-checklist-v1.json'),

    [string]$ChecklistAdminEmail = 'georger@liftrucks.co.nz',

    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',

    [switch]$IncludeDataProfile,

    [switch]$ValidateDefinition,

    [switch]$ValidateSdk
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expectedEntities = @(
    @{
        LogicalName = 'gr_site'
        RequiredAttributes = @('gr_siteid', 'gr_name', 'gr_address', 'gr_defaultmaintenanceprofile')
    },
    @{
        LogicalName = 'gr_equipment'
        RequiredAttributes = @(
            'gr_equipmentid',
            'gr_fleet',
            'statecode',
            'statuscode',
            'gr_ownershiptype'
        )
    },
    @{
        LogicalName = 'gr_job'
        RequiredAttributes = @(
            'gr_jobid',
            'gr_jobnumber',
            'gr_jobtype',
            'gr_status',
            'gr_jobcardstatus',
            'gr_completeddate'
        )
    },
    @{
        LogicalName = 'gr_mechanic'
        RequiredAttributes = @('gr_mechanicid', 'gr_name', 'statecode', 'statuscode')
    },
    @{
        LogicalName = 'gr_sitecheckscheduleequipment'
        RequiredAttributes = @(
            'gr_sitecheckscheduleequipmentid',
            'gr_name',
            'gr_sitecheckschedule',
            'gr_equipment'
        )
    }
    @{
        LogicalName = 'gr_sitecheckequipmentexclusion'
        RequiredAttributes = @(
            'gr_sitecheckequipmentexclusionid',
            'gr_name',
            'gr_sitecheck',
            'gr_equipment',
            'gr_availabilitysnapshot'
        )
    }
)

$choiceAttributes = @(
    @{ Entity = 'gr_equipment'; Attribute = 'gr_ownershiptype' },
    @{ Entity = 'gr_equipment'; Attribute = 'gr_sitecheckavailability' },
    @{ Entity = 'gr_job'; Attribute = 'gr_jobtype' },
    @{ Entity = 'gr_job'; Attribute = 'gr_status' },
    @{ Entity = 'gr_job'; Attribute = 'gr_jobcardstatus' }
    @{ Entity = 'gr_sitecheckequipmentexclusion'; Attribute = 'gr_availabilitysnapshot' }
)

function Assert-InspectionDefinition {
    $entityNames = @($expectedEntities | ForEach-Object { [string]$_.LogicalName })
    if (($entityNames | Sort-Object -Unique).Count -ne $expectedEntities.Count) {
        throw 'The Site Checks inspection definition contains duplicate entity names.'
    }

    foreach ($entity in $expectedEntities) {
        if (-not $entity.LogicalName.StartsWith('gr_')) {
            throw "Unexpected publisher prefix in entity definition: $($entity.LogicalName)"
        }
        if (@($entity.RequiredAttributes).Count -eq 0) {
            throw "No required attributes were defined for $($entity.LogicalName)."
        }
    }

    foreach ($choice in $choiceAttributes) {
        if ($entityNames -notcontains $choice.Entity) {
            throw "Choice inspection references an undefined entity: $($choice.Entity)."
        }
    }
}

Assert-InspectionDefinition

if ($ValidateDefinition) {
    Write-Output 'Site Checks schema inspection definition is valid. No Dataverse connection was created.'
    if (-not $ValidateSdk) { return }
}

function Get-PacToolsPath {
    $pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    if (-not (Test-Path -LiteralPath $pacRoot)) {
        throw 'Power Apps CLI SDK assemblies were not found.'
    }

    $tools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $tools) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $tools
}

function Import-DataverseAssemblies {
    param([Parameter(Mandatory)][string]$ToolsPath)

    foreach ($assemblyName in @(
        'Microsoft.Xrm.Sdk.dll',
        'Microsoft.Crm.Sdk.Proxy.dll',
        'Microsoft.Xrm.Tooling.Connector.dll'
    )) {
        [System.Reflection.Assembly]::LoadFrom((Join-Path $ToolsPath $assemblyName)) | Out-Null
    }
}

function New-DataverseService {
    $connectionString = @(
        'AuthType=OAuth'
        "Url=$($EnvironmentUrl.TrimEnd('/'))"
        'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d'
        'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97'
        "LoginPrompt=$LoginPrompt"
    ) -join ';'

    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
    if (-not $client.IsReady) {
        $promptAdvice = if ($LoginPrompt -eq 'Never') {
            ' No cached session was used; rerun with -LoginPrompt Auto only after explicit approval.'
        } else {
            ''
        }
        throw "Dataverse sign-in failed: $($client.LastCrmError).$promptAdvice"
    }
    return $client
}

function New-AllPropertiesExpression {
    return [Microsoft.Xrm.Sdk.Metadata.Query.MetadataPropertiesExpression]@{
        AllProperties = $true
    }
}

function Get-SiteChecksMetadata {
    param([Parameter(Mandatory)]$Service)

    $entityFilter = [Microsoft.Xrm.Sdk.Metadata.Query.MetadataFilterExpression]::new(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    foreach ($entity in $expectedEntities) {
        $condition = [Microsoft.Xrm.Sdk.Metadata.Query.MetadataConditionExpression]::new(
            'LogicalName',
            [Microsoft.Xrm.Sdk.Metadata.Query.MetadataConditionOperator]::Equals,
            [string]$entity.LogicalName
        )
        $entityFilter.Conditions.Add($condition)
    }

    $query = [Microsoft.Xrm.Sdk.Metadata.Query.EntityQueryExpression]::new()
    $query.Criteria = $entityFilter
    $query.Properties = New-AllPropertiesExpression

    $query.AttributeQuery = [Microsoft.Xrm.Sdk.Metadata.Query.AttributeQueryExpression]::new()
    $query.AttributeQuery.Properties = New-AllPropertiesExpression

    $query.RelationshipQuery = [Microsoft.Xrm.Sdk.Metadata.Query.RelationshipQueryExpression]::new()
    $query.RelationshipQuery.Properties = New-AllPropertiesExpression

    $query.KeyQuery = [Microsoft.Xrm.Sdk.Metadata.Query.EntityKeyQueryExpression]::new()
    $query.KeyQuery.Properties = New-AllPropertiesExpression

    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveMetadataChangesRequest]::new()
    $request.Query = $query
    $request.ClientVersionStamp = $null
    return $Service.Execute($request).EntityMetadata
}

function Get-Label {
    param($Label)
    if ($null -eq $Label) { return $null }
    if ($null -ne $Label.UserLocalizedLabel) { return $Label.UserLocalizedLabel.Label }
    $localized = @($Label.LocalizedLabels | Select-Object -First 1)
    return if ($localized.Count) { $localized[0].Label } else { $null }
}

function Get-ChoiceSummary {
    param(
        [Parameter(Mandatory)]$Entity,
        [Parameter(Mandatory)][string]$AttributeName
    )

    $attribute = @($Entity.Attributes | Where-Object LogicalName -EQ $AttributeName)
    if ($attribute.Count -ne 1) {
        return [pscustomobject]@{
            Entity = $Entity.LogicalName
            Attribute = $AttributeName
            Found = $false
            IsGlobal = $null
            OptionSetName = $null
            Options = @()
        }
    }

    $optionSet = $attribute[0].OptionSet
    return [pscustomobject]@{
        Entity = $Entity.LogicalName
        Attribute = $AttributeName
        Found = $true
        IsGlobal = $optionSet.IsGlobal
        OptionSetName = $optionSet.Name
        Options = @($optionSet.Options | ForEach-Object {
            [pscustomobject]@{
                Label = Get-Label $_.Label
                Value = $_.Value
            }
        })
    }
}

function Get-SolutionComponentIds {
    param([Parameter(Mandatory)]$Service)

    $solutionQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('solution')
    $solutionQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('solutionid', 'uniquename')
    $solutionQuery.Criteria.AddCondition(
        'uniquename',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $SolutionUniqueName
    )
    $solutions = $Service.RetrieveMultiple($solutionQuery).Entities
    if ($solutions.Count -ne 1) {
        throw "Expected one solution named $SolutionUniqueName; found $($solutions.Count)."
    }

    $componentQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('solutioncomponent')
    $componentQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'objectid',
        'componenttype',
        'rootsolutioncomponentid'
    )
    $componentQuery.Criteria.AddCondition(
        'solutionid',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $solutions[0].Id
    )
    return @($Service.RetrieveMultiple($componentQuery).Entities | ForEach-Object {
        if ($_.Attributes.ContainsKey('objectid')) { [Guid]$_.Attributes['objectid'] }
    })
}

function Get-MaximumEquipmentPerSite {
    param([Parameter(Mandatory)]$Service)

    $fetch = @'
<fetch aggregate="true">
  <entity name="gr_equipment">
    <attribute name="gr_equipmentid" alias="equipment_count" aggregate="count" />
    <attribute name="gr_site" alias="site" groupby="true" />
    <filter>
      <condition attribute="gr_site" operator="not-null" />
    </filter>
  </entity>
</fetch>
'@
    $rows = $Service.RetrieveMultiple(
        [Microsoft.Xrm.Sdk.Query.FetchExpression]::new($fetch)
    ).Entities
    if ($rows.Count -eq 0) { return 0 }
    return ($rows | ForEach-Object {
        [int]$_.Attributes['equipment_count'].Value
    } | Measure-Object -Maximum).Maximum
}

function New-Label {
    param([Parameter(Mandatory)][string]$Text)
    return [Microsoft.Xrm.Sdk.Label]::new($Text, 1033)
}

function New-RequiredLevel {
    param([Parameter(Mandatory)][bool]$Required)
    $level = if ($Required) {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired
    } else {
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    }
    return [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new($level)
}

function Get-EntityMetadata {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$LogicalName,
        [Microsoft.Xrm.Sdk.Metadata.EntityFilters]$Filters =
            [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    )

    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $LogicalName
    $request.EntityFilters = $Filters
    $request.RetrieveAsIfPublished = $true
    try {
        return $Service.Execute($request).EntityMetadata
    } catch [System.ServiceModel.FaultException[Microsoft.Xrm.Sdk.OrganizationServiceFault]] {
        if ($_.Exception.Detail.ErrorCode -eq -2147220969) { return $null }
        throw
    }
}

function Get-AttributeMetadata {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$LogicalName
    )

    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $EntityName
    $request.LogicalName = $LogicalName
    $request.RetrieveAsIfPublished = $true
    try {
        return $Service.Execute($request).AttributeMetadata
    } catch [System.ServiceModel.FaultException[Microsoft.Xrm.Sdk.OrganizationServiceFault]] {
        if ($_.Exception.Detail.ErrorCode -eq -2147220969) { return $null }
        throw
    }
}

function Get-RolePrivilegeSummary {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$RoleName,
        [Parameter(Mandatory)][string[]]$PrivilegeNames
    )

    $roleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $roleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid', 'name', 'ismanaged')
    $roleQuery.Criteria.AddCondition(
        'name',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $RoleName
    )
    $roles = @($Service.RetrieveMultiple($roleQuery).Entities)

    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $privilegeFilter = $privilegeQuery.Criteria.AddFilter(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    foreach ($name in $PrivilegeNames) {
        $privilegeFilter.AddCondition(
            'name',
            [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
            $name
        )
    }
    $privileges = @($Service.RetrieveMultiple($privilegeQuery).Entities)
    $roleResults = foreach ($role in $roles) {
        $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
        $request.RoleId = $role.Id
        $grants = @($Service.Execute($request).RolePrivileges)
        [pscustomobject]@{
            RoleId = $role.Id
            IsManaged = [bool]$role.Attributes['ismanaged']
            Privileges = @($PrivilegeNames | ForEach-Object {
                $expectedName = $_
                $metadata = $privileges | Where-Object {
                    [string]$_.Attributes['name'] -ieq $expectedName
                } | Select-Object -First 1
                $grant = if ($metadata) {
                    $grants | Where-Object PrivilegeId -EQ $metadata.Id | Select-Object -First 1
                } else {
                    $null
                }
                [pscustomobject]@{
                    Name = $expectedName
                    MetadataFound = $null -ne $metadata
                    Granted = $null -ne $grant
                    Depth = if ($grant) { [string]$grant.Depth } else { $null }
                }
            })
        }
    }

    return [pscustomobject]@{
        RoleName = $RoleName
        RoleCount = $roles.Count
        Roles = @($roleResults)
    }
}

function Get-TechnicianAccessPreflight {
    param([Parameter(Mandatory)]$Service)

    $siteCheck = Get-EntityMetadata -Service $Service -LogicalName 'gr_sitecheck'
    $emailDispatch = Get-EntityMetadata -Service $Service -LogicalName 'gr_emaildispatch'
    $proposedColumns = @(
        'gr_sitechecktechnicianaccesstokenhash',
        'gr_sitechecktechnicianaccesstokencreatedon',
        'gr_sitechecktechnicianaccesstokenexpireson',
        'gr_sitechecktechnicianaccesstokenrevokedon'
    )

    $serviceOperationsPrivileges = @(
        'prvCreategr_EmailDispatch',
        'prvReadgr_EmailDispatch',
        'prvWritegr_EmailDispatch',
        'prvAppendgr_EmailDispatch',
        'prvAppendTogr_EmailDispatch',
        'prvReadgr_SiteCheck',
        'prvAppendgr_SiteCheck',
        'prvAppendTogr_SiteCheck'
    )
    $portalPrivileges = @(
        'prvCreategr_SiteCheck',
        'prvReadgr_SiteCheck',
        'prvWritegr_SiteCheck',
        'prvDeletegr_SiteCheck',
        'prvAppendgr_SiteCheck',
        'prvAppendTogr_SiteCheck',
        'prvCreategr_EmailDispatch',
        'prvReadgr_EmailDispatch',
        'prvWritegr_EmailDispatch'
    )

    return [ordered]@{
        Mode = 'InspectTechnicianAccess'
        EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
        ReadOnly = $true
        SiteCheck = [ordered]@{
            Found = $null -ne $siteCheck
            EntitySetName = if ($siteCheck) { $siteCheck.EntitySetName } else { $null }
            ProposedColumns = @($proposedColumns | ForEach-Object {
                $attribute = if ($siteCheck) {
                    $siteCheck.Attributes | Where-Object LogicalName -EQ $_ | Select-Object -First 1
                } else {
                    $null
                }
                [pscustomobject]@{
                    LogicalName = $_
                    Found = $null -ne $attribute
                    AttributeType = if ($attribute) { [string]$attribute.AttributeType } else { $null }
                    MaxLength = if ($attribute -and $attribute.PSObject.Properties['MaxLength']) {
                        $attribute.MaxLength
                    } else {
                        $null
                    }
                }
            })
            Keys = if ($siteCheck) {
                @($siteCheck.Keys | ForEach-Object {
                    [pscustomobject]@{
                        LogicalName = $_.LogicalName
                        KeyAttributes = @($_.KeyAttributes)
                        Status = [string]$_.EntityKeyIndexStatus
                    }
                })
            } else {
                @()
            }
        }
        EmailDispatch = [ordered]@{
            Found = $null -ne $emailDispatch
            EntitySetName = if ($emailDispatch) { $emailDispatch.EntitySetName } else { $null }
            JobLookup = if ($emailDispatch) {
                $attribute = $emailDispatch.Attributes |
                    Where-Object LogicalName -EQ 'gr_job' |
                    Select-Object -First 1
                [pscustomobject]@{
                    Found = $null -ne $attribute
                    AttributeType = if ($attribute) { [string]$attribute.AttributeType } else { $null }
                    RequiredLevel = if ($attribute) {
                        [string]$attribute.RequiredLevel.Value
                    } else {
                        $null
                    }
                    RequiredLevelCanBeChanged = if ($attribute) {
                        [bool]$attribute.RequiredLevel.CanBeChanged
                    } else {
                        $null
                    }
                    IsManaged = if ($attribute) { [bool]$attribute.IsManaged } else { $null }
                    IsValidForUpdate = if ($attribute) { [bool]$attribute.IsValidForUpdate } else { $null }
                }
            } else {
                $null
            }
            SiteCheckLookup = if ($emailDispatch) {
                $attribute = $emailDispatch.Attributes |
                    Where-Object LogicalName -EQ 'gr_sitecheck' |
                    Select-Object -First 1
                [pscustomobject]@{
                    Found = $null -ne $attribute
                    AttributeType = if ($attribute) { [string]$attribute.AttributeType } else { $null }
                    RequiredLevel = if ($attribute) {
                        [string]$attribute.RequiredLevel.Value
                    } else {
                        $null
                    }
                }
            } else {
                $null
            }
            SiteCheckRelationships = if ($emailDispatch) {
                @($emailDispatch.ManyToOneRelationships | Where-Object {
                    $_.ReferencingAttribute -eq 'gr_sitecheck' -or
                    $_.SchemaName -eq 'gr_sitecheck_emaildispatches'
                } | ForEach-Object {
                    [pscustomobject]@{
                        SchemaName = $_.SchemaName
                        ReferencingAttribute = $_.ReferencingAttribute
                        ReferencedEntity = $_.ReferencedEntity
                        DeleteBehavior = [string]$_.CascadeConfiguration.Delete
                    }
                })
            } else {
                @()
            }
        }
        Security = [ordered]@{
            ServiceOperations = Get-RolePrivilegeSummary -Service $Service `
                -RoleName 'Service Operations' `
                -PrivilegeNames $serviceOperationsPrivileges
            PublicPortalService = Get-RolePrivilegeSummary -Service $Service `
                -RoleName 'Public Portal Service' `
                -PrivilegeNames $portalPrivileges
        }
        Notes = @(
            'No business rows, user identities, or email addresses were retrieved.',
            'No metadata, role privileges, solution components, or data were changed.',
            'One Dataverse connection was used with the requested login-prompt policy.'
        )
    }
}

function Ensure-OptionalAttribute {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$LogicalName
    )

    $attribute = Get-AttributeMetadata $Service $EntityName $LogicalName
    if ($null -eq $attribute) {
        throw "Required existing column was not found: $EntityName.$LogicalName"
    }
    if ([string]$attribute.RequiredLevel.Value -eq 'None') {
        Write-Output "Compatible optional column already exists: $EntityName.$LogicalName"
        return
    }
    if ([string]$attribute.RequiredLevel.Value -ne 'ApplicationRequired') {
        throw "Conflict: $EntityName.$LogicalName has unsupported required level $($attribute.RequiredLevel.Value)."
    }

    if ([string]$attribute.AttributeType -ne 'Lookup') {
        throw "Conflict: $EntityName.$LogicalName is not a Lookup."
    }
    $attribute.RequiredLevel.Value =
        [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None
    $request = [Microsoft.Xrm.Sdk.Messages.UpdateAttributeRequest]::new()
    $request.EntityName = $EntityName
    $request.Attribute = $attribute
    $request.MergeLabels = $false
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Submitted optional required-level update: $EntityName.$LogicalName"
}

function Ensure-PublicPortalSiteCheckRead {
    param([Parameter(Mandatory)]$Service)

    $roleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $roleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid', 'name', 'ismanaged')
    $roleQuery.Criteria.AddCondition(
        'name',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        'Public Portal Service'
    )
    $roles = @($Service.RetrieveMultiple($roleQuery).Entities)
    if ($roles.Count -ne 1 -or [bool]$roles[0].Attributes['ismanaged']) {
        throw 'Expected exactly one unmanaged Public Portal Service role.'
    }

    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $privilegeQuery.Criteria.AddCondition(
        'name',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        'prvReadgr_SiteCheck'
    )
    $privileges = @($Service.RetrieveMultiple($privilegeQuery).Entities)
    if ($privileges.Count -ne 1) {
        throw 'Expected exactly one prvReadgr_SiteCheck privilege.'
    }

    $currentRequest = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
    $currentRequest.RoleId = $roles[0].Id
    $current = $Service.Execute($currentRequest).RolePrivileges |
        Where-Object PrivilegeId -EQ $privileges[0].Id |
        Select-Object -First 1
    if ($current -and $current.Depth -eq [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
        Write-Output 'Public Portal Service already has Site Check Read at Organization depth.'
        return
    }
    if ($current) {
        throw "Conflict: Public Portal Service Site Check Read exists at $($current.Depth), not Organization depth."
    }

    $grant = [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
    $grant.PrivilegeId = $privileges[0].Id
    $grant.Depth = [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global
    $request = [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
    $request.RoleId = $roles[0].Id
    $request.Privileges = @($grant)
    $Service.Execute($request) | Out-Null
    Write-Output 'Granted Site Check Read to Public Portal Service at Organization depth.'
}

function Assert-TechnicianAccessSchema {
    param([Parameter(Mandatory)]$Service)

    $hash = Get-AttributeMetadata $Service 'gr_sitecheck' 'gr_sitechecktechnicianaccesstokenhash'
    Assert-AttributeType $hash 'String' 'gr_sitecheck.gr_sitechecktechnicianaccesstokenhash'
    if ($hash.MaxLength -ne 64 -or [string]$hash.RequiredLevel.Value -ne 'None') {
        throw 'Verification failed: Site Check token hash contract is incompatible.'
    }
    foreach ($logicalName in @(
        'gr_sitechecktechnicianaccesstokencreatedon',
        'gr_sitechecktechnicianaccesstokenexpireson',
        'gr_sitechecktechnicianaccesstokenrevokedon'
    )) {
        $attribute = Get-AttributeMetadata $Service 'gr_sitecheck' $logicalName
        Assert-AttributeType $attribute 'DateTime' "gr_sitecheck.$logicalName"
        if ([string]$attribute.DateTimeBehavior.Value -ne 'UserLocal' -or
            [string]$attribute.RequiredLevel.Value -ne 'None') {
            throw "Verification failed: gr_sitecheck.$logicalName is incompatible."
        }
    }

    $emailJob = Get-AttributeMetadata $Service 'gr_emaildispatch' 'gr_job'
    if ([string]$emailJob.AttributeType -ne 'Lookup' -or
        [string]$emailJob.RequiredLevel.Value -ne 'None') {
        throw 'Verification failed: gr_emaildispatch.gr_job is not an optional Lookup.'
    }
    $siteCheckLookup = Get-AttributeMetadata $Service 'gr_emaildispatch' 'gr_sitecheck'
    if ([string]$siteCheckLookup.AttributeType -ne 'Lookup' -or
        [string]$siteCheckLookup.RequiredLevel.Value -ne 'None' -or
        @($siteCheckLookup.Targets) -notcontains 'gr_sitecheck') {
        throw 'Verification failed: gr_emaildispatch.gr_sitecheck is incompatible.'
    }

    $siteCheck = Get-EntityMetadata $Service 'gr_sitecheck'
    $key = @($siteCheck.Keys | Where-Object {
        $_.LogicalName -eq 'gr_sitecheck_technicianaccesstokenhash_key'
    })
    if ($key.Count -ne 1 -or
        (@($key[0].KeyAttributes) -join ',') -ne 'gr_sitechecktechnicianaccesstokenhash') {
        throw 'Verification failed: Site Check technician access token key is missing or incompatible.'
    }

    $role = Get-RolePrivilegeSummary -Service $Service `
        -RoleName 'Public Portal Service' `
        -PrivilegeNames @('prvReadgr_SiteCheck')
    $grant = $role.Roles[0].Privileges[0]
    if ($role.RoleCount -ne 1 -or -not $grant.Granted -or $grant.Depth -ne 'Global') {
        throw 'Verification failed: Public Portal Service Site Check Read is not Organization depth.'
    }

    Write-Output "Phase 15 technician-access schema and security verification passed; token key status: $($key[0].EntityKeyIndexStatus)."
}

function Invoke-TechnicianAccessProvisioning {
    param([Parameter(Mandatory)]$Service)

    Ensure-Text $Service 'gr_sitecheck' 'gr_SiteCheckTechnicianAccessTokenHash' `
        'Site Check Technician Access Token Hash' 64
    Ensure-DateTime $Service 'gr_sitecheck' 'gr_SiteCheckTechnicianAccessTokenCreatedOn' `
        'Site Check Technician Access Token Created On'
    Ensure-DateTime $Service 'gr_sitecheck' 'gr_SiteCheckTechnicianAccessTokenExpiresOn' `
        'Site Check Technician Access Token Expires On'
    Ensure-DateTime $Service 'gr_sitecheck' 'gr_SiteCheckTechnicianAccessTokenRevokedOn' `
        'Site Check Technician Access Token Revoked On'
    Ensure-OptionalAttribute $Service 'gr_emaildispatch' 'gr_job'
    Ensure-Lookup $Service 'gr_emaildispatch' 'gr_SiteCheck' 'Site Check' 'gr_sitecheck' `
        'gr_sitecheck_emaildispatches' 'gr_sitecheck_emaildispatches'

    $publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $publish.ParameterXml = @'
<importexportxml>
  <entities>
    <entity>gr_sitecheck</entity>
    <entity>gr_emaildispatch</entity>
  </entities>
</importexportxml>
'@
    $Service.Execute($publish) | Out-Null
    Write-Output 'Published Site Check and Email Dispatch Phase 15 metadata.'

    Ensure-Key $Service 'gr_sitecheck' 'gr_SiteCheck_TechnicianAccessTokenHash_Key' `
        'Site Check Technician Access Token Hash Key' `
        @('gr_sitechecktechnicianaccesstokenhash')
    Ensure-PublicPortalSiteCheckRead $Service
    Assert-TechnicianAccessSchema $Service
}

function Assert-AttributeType {
    param(
        [Parameter(Mandatory)]$Attribute,
        [Parameter(Mandatory)][string]$ExpectedType,
        [Parameter(Mandatory)][string]$Contract
    )
    if ([string]$Attribute.AttributeType -ne $ExpectedType) {
        throw "Conflict: $Contract is $($Attribute.AttributeType), expected $ExpectedType."
    }
}

function Ensure-Table {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][string]$CollectionName,
        [Parameter(Mandatory)][string]$Description
    )

    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-EntityMetadata -Service $Service -LogicalName $logicalName `
        -Filters ([Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Entity)
    if ($null -ne $existing) {
        if ($existing.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned `
            -or $existing.IsActivity `
            -or $existing.PrimaryNameAttribute -ne 'gr_name') {
            throw "Conflict: $logicalName exists with incompatible ownership, activity, or primary-name metadata."
        }
        Write-Output "Compatible table already exists: $logicalName"
        return
    }

    $entity = [Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new()
    $entity.SchemaName = $SchemaName
    $entity.DisplayName = New-Label $DisplayName
    $entity.DisplayCollectionName = New-Label $CollectionName
    $entity.Description = New-Label $Description
    $entity.OwnershipType = [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned
    $entity.IsActivity = $false

    $primary = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $primary.SchemaName = 'gr_Name'
    $primary.DisplayName = New-Label 'Name'
    $primary.MaxLength = 200
    $primary.RequiredLevel = New-RequiredLevel $true

    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new()
    $request.Entity = $entity
    $request.PrimaryAttribute = $primary
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created table: $logicalName"
}

function Add-Attribute {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][Microsoft.Xrm.Sdk.Metadata.AttributeMetadata]$Attribute
    )
    $request = [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new()
    $request.EntityName = $EntityName
    $request.Attribute = $Attribute
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created column: $EntityName.$($Attribute.SchemaName.ToLowerInvariant())"
}

function Ensure-Text {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][int]$MaxLength,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'String' "$EntityName.$logicalName"
        if ($existing.MaxLength -ne $MaxLength) {
            throw "Conflict: $EntityName.$logicalName has max length $($existing.MaxLength), expected $MaxLength."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.MaxLength = $MaxLength
    $attribute.RequiredLevel = New-RequiredLevel $Required
    Add-Attribute $Service $EntityName $attribute
}

function Ensure-Memo {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][int]$MaxLength,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'Memo' "$EntityName.$logicalName"
        if ($existing.MaxLength -ne $MaxLength -or
            [string]$existing.RequiredLevel.Value -ne
                [string](New-RequiredLevel $Required).Value) {
            throw "Conflict: $EntityName.$logicalName has incompatible length or required level."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.MaxLength = $MaxLength
    $attribute.RequiredLevel = New-RequiredLevel $Required
    Add-Attribute $Service $EntityName $attribute
}

function Ensure-Boolean {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][bool]$DefaultValue,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'Boolean' "$EntityName.$logicalName"
        if ([bool]$existing.DefaultValue -ne $DefaultValue) {
            throw "Conflict: $EntityName.$logicalName has an incompatible default."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.RequiredLevel = New-RequiredLevel $Required
    $attribute.DefaultValue = $DefaultValue
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new(
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'), 1),
        [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'), 0)
    )
    Add-Attribute $Service $EntityName $attribute
}

function Assert-ChoiceOptions {
    param(
        [Parameter(Mandatory)]$Attribute,
        [Parameter(Mandatory)][array]$Options,
        [Parameter(Mandatory)][string]$Contract
    )
    foreach ($expected in $Options) {
        $byValue = @($Attribute.OptionSet.Options | Where-Object Value -EQ $expected.Value)
        $byLabel = @($Attribute.OptionSet.Options | Where-Object {
            (Get-Label $_.Label) -eq $expected.Label
        })
        if ($byValue.Count -ne 1 -or (Get-Label $byValue[0].Label) -ne $expected.Label `
            -or $byLabel.Count -ne 1 -or $byLabel[0].Value -ne $expected.Value) {
            throw "Conflict: $Contract does not contain the approved $($expected.Label)=$($expected.Value) option."
        }
    }
    if ($Attribute.OptionSet.Options.Count -ne $Options.Count) {
        throw "Conflict: $Contract contains unapproved additional options."
    }
}

function Ensure-Choice {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][array]$Options,
        [Nullable[int]]$DefaultValue = $null,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'Picklist' "$EntityName.$logicalName"
        Assert-ChoiceOptions $existing $Options "$EntityName.$logicalName"
        if ($null -ne $DefaultValue -and $existing.DefaultFormValue -ne $DefaultValue) {
            throw "Conflict: $EntityName.$logicalName has an incompatible default."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.RequiredLevel = New-RequiredLevel $Required
    $attribute.OptionSet = [Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new()
    $attribute.OptionSet.IsGlobal = $false
    foreach ($option in $Options) {
        $attribute.OptionSet.Options.Add(
            [Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new(
                (New-Label $option.Label),
                [int]$option.Value
            )
        )
    }
    if ($null -ne $DefaultValue) { $attribute.DefaultFormValue = $DefaultValue }
    Add-Attribute $Service $EntityName $attribute
}

function Ensure-LocalChoiceOption {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$AttributeName,
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][int]$Value
    )
    $metadata = Get-AttributeMetadata $Service $EntityName $AttributeName
    if ($null -eq $metadata) { return }
    Assert-AttributeType $metadata 'Picklist' "$EntityName.$AttributeName"
    $byValue = @($metadata.OptionSet.Options | Where-Object Value -EQ $Value)
    $byLabel = @($metadata.OptionSet.Options | Where-Object {
        (Get-Label $_.Label) -eq $Label
    })
    if ($byValue.Count -eq 1 -and (Get-Label $byValue[0].Label) -eq $Label `
        -and $byLabel.Count -eq 1 -and $byLabel[0].Value -eq $Value) {
        Write-Output "Compatible local Choice option already exists: $EntityName.$AttributeName $Label=$Value"
        return
    }
    if ($byValue.Count -gt 0 -or $byLabel.Count -gt 0) {
        throw "Conflict: $EntityName.$AttributeName option $Label=$Value is used incompatibly."
    }
    if ($metadata.OptionSet.IsGlobal) {
        throw "Conflict: $EntityName.$AttributeName is global, expected a local Choice."
    }
    $request = [Microsoft.Xrm.Sdk.Messages.InsertOptionValueRequest]::new()
    $request.EntityLogicalName = $EntityName
    $request.AttributeLogicalName = $AttributeName
    $request.Label = New-Label $Label
    $request.Value = $Value
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created local Choice option: $EntityName.$AttributeName $Label=$Value"
}

function Ensure-DateOnly {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'DateTime' "$EntityName.$logicalName"
        if ([string]$existing.DateTimeBehavior.Value -ne 'DateOnly') {
            throw "Conflict: $EntityName.$logicalName is not Date Only."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.RequiredLevel = New-RequiredLevel $Required
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateOnly
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::DateOnly
    Add-Attribute $Service $EntityName $attribute
}

function Ensure-DateTime {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'DateTime' "$EntityName.$logicalName"
        if ([string]$existing.DateTimeBehavior.Value -ne 'UserLocal') {
            throw "Conflict: $EntityName.$logicalName is not User Local."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.RequiredLevel = New-RequiredLevel $Required
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime
    $attribute.DateTimeBehavior = [Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal
    Add-Attribute $Service $EntityName $attribute
}

function Ensure-Integer {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][int]$Minimum,
        [Parameter(Mandatory)][int]$Maximum,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'Integer' "$EntityName.$logicalName"
        if ($existing.MinValue -ne $Minimum -or $existing.MaxValue -ne $Maximum) {
            throw "Conflict: $EntityName.$logicalName has an incompatible range."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.RequiredLevel = New-RequiredLevel $Required
    $attribute.MinValue = $Minimum
    $attribute.MaxValue = $Maximum
    $attribute.Format = [Microsoft.Xrm.Sdk.Metadata.IntegerFormat]::None
    Add-Attribute $Service $EntityName $attribute
}

function Ensure-Decimal {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][decimal]$Minimum,
        [Parameter(Mandatory)][decimal]$Maximum,
        [Parameter(Mandatory)][int]$Precision,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $EntityName $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'Decimal' "$EntityName.$logicalName"
        if ($existing.MinValue -ne $Minimum -or $existing.MaxValue -ne $Maximum -or
            $existing.Precision -ne $Precision) {
            throw "Conflict: $EntityName.$logicalName has an incompatible range or precision."
        }
        Write-Output "Compatible column already exists: $EntityName.$logicalName"
        return
    }
    $attribute = [Microsoft.Xrm.Sdk.Metadata.DecimalAttributeMetadata]::new()
    $attribute.SchemaName = $SchemaName
    $attribute.DisplayName = New-Label $DisplayName
    $attribute.RequiredLevel = New-RequiredLevel $Required
    $attribute.MinValue = $Minimum
    $attribute.MaxValue = $Maximum
    $attribute.Precision = $Precision
    Add-Attribute $Service $EntityName $attribute
}

function New-RestrictCascadeConfiguration {
    $cascade = [Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new()
    $cascade.Assign = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $cascade.Share = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $cascade.Unshare = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $cascade.Reparent = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $cascade.Merge = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::NoCascade
    $cascade.Delete = [Microsoft.Xrm.Sdk.Metadata.CascadeType]::Restrict
    return $cascade
}

function Ensure-Lookup {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$ReferencingEntity,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][string]$ReferencedEntity,
        [Parameter(Mandatory)][string]$RelationshipName,
        [Parameter(Mandatory)][string]$ReferencedNavigation,
        [bool]$Required = $false
    )
    $logicalName = $SchemaName.ToLowerInvariant()
    $existing = Get-AttributeMetadata $Service $ReferencingEntity $logicalName
    if ($null -ne $existing) {
        Assert-AttributeType $existing 'Lookup' "$ReferencingEntity.$logicalName"
        if (@($existing.Targets).Count -ne 1 -or $existing.Targets[0] -ne $ReferencedEntity) {
            throw "Conflict: $ReferencingEntity.$logicalName targets an incompatible table."
        }
        $entity = Get-EntityMetadata $Service $ReferencingEntity
        $relationship = @($entity.ManyToOneRelationships | Where-Object SchemaName -EQ $RelationshipName)
        if ($relationship.Count -ne 1 `
            -or $relationship[0].ReferencedEntity -ne $ReferencedEntity `
            -or [string]$relationship[0].CascadeConfiguration.Delete -ne 'Restrict') {
            throw "Conflict: $RelationshipName has incompatible relationship metadata."
        }
        Write-Output "Compatible lookup already exists: $ReferencingEntity.$logicalName"
        return
    }

    $lookup = [Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new()
    $lookup.SchemaName = $SchemaName
    $lookup.DisplayName = New-Label $DisplayName
    $lookup.RequiredLevel = New-RequiredLevel $Required

    $relationship = [Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new()
    $relationship.SchemaName = $RelationshipName
    $relationship.ReferencedEntity = $ReferencedEntity
    $relationship.ReferencingEntity = $ReferencingEntity
    $relationship.ReferencingEntityNavigationPropertyName = $SchemaName
    $relationship.ReferencedEntityNavigationPropertyName = $ReferencedNavigation
    $relationship.CascadeConfiguration = New-RestrictCascadeConfiguration

    $request = [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new()
    $request.Lookup = $lookup
    $request.OneToManyRelationship = $relationship
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created lookup: $ReferencingEntity.$logicalName"
}

function Ensure-JobType {
    param([Parameter(Mandatory)]$Service)
    $metadata = Get-AttributeMetadata $Service 'gr_job' 'gr_jobtype'
    Assert-AttributeType $metadata 'Picklist' 'gr_job.gr_jobtype'
    $byValue = @($metadata.OptionSet.Options | Where-Object Value -EQ 122830004)
    $byLabel = @($metadata.OptionSet.Options | Where-Object {
        (Get-Label $_.Label) -eq 'Site Check'
    })
    if ($byValue.Count -eq 1 -and (Get-Label $byValue[0].Label) -eq 'Site Check' `
        -and $byLabel.Count -eq 1 -and $byLabel[0].Value -eq 122830004) {
        Write-Output 'Compatible Site Check Job Type already exists: 122830004'
        return
    }
    if ($byValue.Count -gt 0 -or $byLabel.Count -gt 0) {
        throw 'Conflict: Site Check Job Type label or approved value 122830004 is already used incompatibly.'
    }
    if (-not $metadata.OptionSet.IsGlobal -or $metadata.OptionSet.Name -ne 'gr_jobtypechoices') {
        throw 'Conflict: gr_job.gr_jobtype is not the confirmed global gr_jobtypechoices contract.'
    }
    $request = [Microsoft.Xrm.Sdk.Messages.InsertOptionValueRequest]::new()
    $request.OptionSetName = 'gr_jobtypechoices'
    $request.Label = New-Label 'Site Check'
    $request.Value = 122830004
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output 'Created Site Check Job Type: 122830004'
}

function Ensure-Key {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$EntityName,
        [Parameter(Mandatory)][string]$SchemaName,
        [Parameter(Mandatory)][string]$DisplayName,
        [Parameter(Mandatory)][string[]]$Attributes
    )
    $entity = Get-EntityMetadata $Service $EntityName
    $existing = @($entity.Keys | Where-Object LogicalName -EQ $SchemaName.ToLowerInvariant())
    if ($existing.Count -eq 1) {
        $actual = @($existing[0].KeyAttributes | Sort-Object)
        $expected = @($Attributes | Sort-Object)
        if (($actual -join ',') -ne ($expected -join ',')) {
            throw "Conflict: $EntityName.$SchemaName has incompatible key attributes."
        }
        Write-Output "Compatible key already exists: $EntityName.$SchemaName ($($existing[0].EntityKeyIndexStatus))"
        return
    }
    if ($existing.Count -gt 1) { throw "Conflict: duplicate key metadata for $EntityName.$SchemaName." }

    $key = [Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new()
    $key.SchemaName = $SchemaName
    $key.DisplayName = New-Label $DisplayName
    $key.KeyAttributes = $Attributes
    $request = [Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new()
    $request.EntityName = $EntityName
    $request.EntityKey = $key
    $request.SolutionUniqueName = $SolutionUniqueName
    $Service.Execute($request) | Out-Null
    Write-Output "Created key: $EntityName.$SchemaName"
}

function Publish-SiteChecksSchema {
    param([Parameter(Mandatory)]$Service)
    $request = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $request.ParameterXml = @'
<importexportxml>
  <entities>
    <entity>gr_equipment</entity>
    <entity>gr_sitecheckschedule</entity>
    <entity>gr_sitecheckscheduleequipment</entity>
    <entity>gr_sitecheckequipmentexclusion</entity>
    <entity>gr_sitecheck</entity>
    <entity>gr_job</entity>
  </entities>
  <optionsets>
    <optionset>gr_jobtypechoices</optionset>
  </optionsets>
</importexportxml>
'@
    $Service.Execute($request) | Out-Null
    Write-Output 'Published Equipment, Site Checks tables, Job lookup, and Job Type.'
}

function Invoke-SiteChecksProvisioning {
    param([Parameter(Mandatory)]$Service)

    $frequencyOptions = @(
        @{ Label = 'Weekly'; Value = 122830000 },
        @{ Label = 'Fortnightly'; Value = 122830001 },
        @{ Label = 'Monthly'; Value = 122830002 }
    )
    $statusOptions = @(
        @{ Label = 'In Progress'; Value = 122830000 },
        @{ Label = 'Complete'; Value = 122830001 }
    )
    $equipmentOwnershipOptions = @(
        @{ Label = 'Customer Owned'; Value = 122830000 },
        @{ Label = 'Liftrucks Rental'; Value = 122830001 }
    )
    $equipmentScopeOptions = @(
        @{ Label = 'All Equipment'; Value = 122830000 },
        @{ Label = 'Liftrucks Rentals Only'; Value = 122830001 },
        @{ Label = 'Manual Selection'; Value = 122830002 }
    )
    $availabilityOptions = @(
        @{ Label = 'Available at Site'; Value = 122830000 },
        @{ Label = 'Temporarily Off-site'; Value = 122830001 },
        @{ Label = 'In Workshop'; Value = 122830002 }
    )
    Ensure-Table $Service 'gr_SiteCheckSchedule' 'Site Check Schedule' 'Site Check Schedules' `
        'Recurring Site Check configuration for one Site.'
    Ensure-Table $Service 'gr_SiteCheck' 'Site Check' 'Site Checks' `
        'One occurrence of a recurring Site Check.'
    Ensure-Table $Service 'gr_SiteCheckScheduleEquipment' 'Site Check Schedule Equipment' `
        'Site Check Schedule Equipment' `
        'One manually selected Equipment record for a Site Check Schedule.'
    Ensure-Table $Service 'gr_SiteCheckEquipmentExclusion' 'Site Check Equipment Exclusion' `
        'Site Check Equipment Exclusions' `
        'Immutable reason an Equipment record was excluded from one Site Check occurrence.'

    Ensure-Boolean $Service 'gr_sitecheckschedule' 'gr_Enabled' 'Enabled' $false $true
    Ensure-Choice $Service 'gr_sitecheckschedule' 'gr_Frequency' 'Frequency' $frequencyOptions
    Ensure-LocalChoiceOption $Service 'gr_sitecheckschedule' 'gr_equipmentscope' `
        'Manual Selection' 122830002
    Ensure-Choice $Service 'gr_sitecheckschedule' 'gr_EquipmentScope' 'Equipment Scope' `
        $equipmentScopeOptions 122830000
    Ensure-DateOnly $Service 'gr_sitecheckschedule' 'gr_NextDueDate' 'Next Due Date'
    Ensure-DateOnly $Service 'gr_sitecheckschedule' 'gr_LastCompletedDate' 'Last Completed Date'

    Ensure-Choice $Service 'gr_equipment' 'gr_OwnershipType' 'Equipment Ownership' `
        $equipmentOwnershipOptions
    Ensure-Choice $Service 'gr_equipment' 'gr_SiteCheckAvailability' `
        'Site Check Availability' $availabilityOptions
    Ensure-Choice $Service 'gr_sitecheckequipmentexclusion' 'gr_AvailabilitySnapshot' `
        'Availability Snapshot' $availabilityOptions $null $true

    Ensure-Choice $Service 'gr_sitecheck' 'gr_Status' 'Status' $statusOptions 122830000 $true
    Ensure-DateTime $Service 'gr_sitecheck' 'gr_StartedOn' 'Started On' $true
    Ensure-DateTime $Service 'gr_sitecheck' 'gr_CompletedOn' 'Completed On'
    Ensure-Choice $Service 'gr_sitecheck' 'gr_FrequencySnapshot' 'Frequency Snapshot' $frequencyOptions $null $true
    Ensure-DateOnly $Service 'gr_sitecheck' 'gr_DueDateSnapshot' 'Due Date Snapshot' $true
    Ensure-Integer $Service 'gr_sitecheck' 'gr_ExpectedJobCount' 'Expected Job Count' 1 100000 $true
    Ensure-Text $Service 'gr_sitecheck' 'gr_CreationRequestKey' 'Creation Request Key' 100 $true

    Ensure-Lookup $Service 'gr_sitecheckschedule' 'gr_Site' 'Site' 'gr_site' `
        'gr_sitecheckschedule_Site_gr_site' 'gr_site_sitecheckschedules' $true
    Ensure-Lookup $Service 'gr_sitecheck' 'gr_SiteCheckSchedule' 'Site Check Schedule' `
        'gr_sitecheckschedule' 'gr_sitecheck_SiteCheckSchedule_gr_sitecheckschedule' `
        'gr_sitecheckschedule_sitechecks' $true
    Ensure-Lookup $Service 'gr_sitecheck' 'gr_Site' 'Site' 'gr_site' `
        'gr_sitecheck_Site_gr_site' 'gr_site_sitechecks' $true
    Ensure-Lookup $Service 'gr_sitecheck' 'gr_AssignedTechnician' 'Assigned Technician' `
        'gr_mechanic' 'gr_sitecheck_AssignedTechnician_gr_mechanic' `
        'gr_mechanic_sitechecks' $true
    Ensure-Lookup $Service 'gr_sitecheckschedule' 'gr_ActiveSiteCheck' 'Active Site Check' `
        'gr_sitecheck' 'gr_sitecheckschedule_ActiveSiteCheck_gr_sitecheck' `
        'gr_sitecheck_activeschedules'
    Ensure-Lookup $Service 'gr_job' 'gr_SiteCheck' 'Site Check' 'gr_sitecheck' `
        'gr_job_SiteCheck_gr_sitecheck' 'gr_sitecheck_jobs'
    Ensure-Lookup $Service 'gr_sitecheckscheduleequipment' 'gr_SiteCheckSchedule' `
        'Site Check Schedule' 'gr_sitecheckschedule' `
        'gr_sitecheckscheduleequipment_SiteCheckSchedule_gr_sitecheckschedule' `
        'gr_sitecheckschedule_scheduleequipment' $true
    Ensure-Lookup $Service 'gr_sitecheckscheduleequipment' 'gr_Equipment' 'Equipment' `
        'gr_equipment' 'gr_sitecheckscheduleequipment_Equipment_gr_equipment' `
        'gr_equipment_sitecheckschedules' $true
    Ensure-Lookup $Service 'gr_sitecheckequipmentexclusion' 'gr_SiteCheck' 'Site Check' `
        'gr_sitecheck' 'gr_sitecheckequipmentexclusion_SiteCheck_gr_sitecheck' `
        'gr_sitecheck_equipmentexclusions' $true
    Ensure-Lookup $Service 'gr_sitecheckequipmentexclusion' 'gr_Equipment' 'Equipment' `
        'gr_equipment' 'gr_sitecheckequipmentexclusion_Equipment_gr_equipment' `
        'gr_equipment_sitecheckexclusions' $true

    Ensure-JobType $Service
    Publish-SiteChecksSchema $Service

    Ensure-Key $Service 'gr_sitecheckschedule' 'gr_SiteCheckSchedule_Site_Key' `
        'Site Check Schedule Site Key' @('gr_site')
    Ensure-Key $Service 'gr_sitecheck' 'gr_SiteCheck_CreationRequestKey_Key' `
        'Site Check Creation Request Key' @('gr_creationrequestkey')
    Ensure-Key $Service 'gr_sitecheckscheduleequipment' `
        'gr_SiteCheckScheduleEquipment_ScheduleEquipment_Key' `
        'Site Check Schedule Equipment Key' @('gr_sitecheckschedule', 'gr_equipment')
    Ensure-Key $Service 'gr_sitecheckequipmentexclusion' `
        'gr_SiteCheckEquipmentExclusion_SiteCheckEquipment_Key' `
        'Site Check Equipment Exclusion Key' @('gr_sitecheck', 'gr_equipment')
}

function Assert-SiteChecksSchema {
    param(
        [Parameter(Mandatory)]$Service,
        [switch]$RequireActiveKeys
    )
    $frequencyOptions = @(
        @{ Label = 'Weekly'; Value = 122830000 },
        @{ Label = 'Fortnightly'; Value = 122830001 },
        @{ Label = 'Monthly'; Value = 122830002 }
    )
    $statusOptions = @(
        @{ Label = 'In Progress'; Value = 122830000 },
        @{ Label = 'Complete'; Value = 122830001 }
    )
    $equipmentOwnershipOptions = @(
        @{ Label = 'Customer Owned'; Value = 122830000 },
        @{ Label = 'Liftrucks Rental'; Value = 122830001 }
    )
    $equipmentScopeOptions = @(
        @{ Label = 'All Equipment'; Value = 122830000 },
        @{ Label = 'Liftrucks Rentals Only'; Value = 122830001 },
        @{ Label = 'Manual Selection'; Value = 122830002 }
    )
    $availabilityOptions = @(
        @{ Label = 'Available at Site'; Value = 122830000 },
        @{ Label = 'Temporarily Off-site'; Value = 122830001 },
        @{ Label = 'In Workshop'; Value = 122830002 }
    )

    $schedule = Get-EntityMetadata $Service 'gr_sitecheckschedule'
    $siteCheck = Get-EntityMetadata $Service 'gr_sitecheck'
    $scheduleEquipment = Get-EntityMetadata $Service 'gr_sitecheckscheduleequipment'
    $equipmentExclusion = Get-EntityMetadata $Service 'gr_sitecheckequipmentexclusion'
    if ($null -eq $schedule -or $null -eq $siteCheck -or $null -eq $scheduleEquipment `
        -or $null -eq $equipmentExclusion) {
        throw 'Site Check Schedule, Site Check, selection, and exclusion tables must exist.'
    }
    foreach ($entity in @($schedule, $siteCheck, $scheduleEquipment, $equipmentExclusion)) {
        if ($entity.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned `
            -or $entity.IsActivity -or $entity.PrimaryNameAttribute -ne 'gr_name') {
            throw "Verification failed: $($entity.LogicalName) has incompatible table metadata."
        }
    }

    $expectedAttributes = @(
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_enabled'; Type = 'Boolean' },
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_frequency'; Type = 'Picklist'; Options = $frequencyOptions },
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_equipmentscope'; Type = 'Picklist'; Options = $equipmentScopeOptions },
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_nextduedate'; Type = 'DateTime' },
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_lastcompleteddate'; Type = 'DateTime' },
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_site'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheckschedule'; Name = 'gr_activesitecheck'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_status'; Type = 'Picklist'; Options = $statusOptions },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_startedon'; Type = 'DateTime' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_completedon'; Type = 'DateTime' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_frequencysnapshot'; Type = 'Picklist'; Options = $frequencyOptions },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_duedatesnapshot'; Type = 'DateTime' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_expectedjobcount'; Type = 'Integer' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_creationrequestkey'; Type = 'String' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_sitecheckschedule'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_site'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheck'; Name = 'gr_assignedtechnician'; Type = 'Lookup' },
        @{ Entity = 'gr_equipment'; Name = 'gr_ownershiptype'; Type = 'Picklist'; Options = $equipmentOwnershipOptions },
        @{ Entity = 'gr_equipment'; Name = 'gr_sitecheckavailability'; Type = 'Picklist'; Options = $availabilityOptions },
        @{ Entity = 'gr_sitecheckscheduleequipment'; Name = 'gr_sitecheckschedule'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheckscheduleequipment'; Name = 'gr_equipment'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheckequipmentexclusion'; Name = 'gr_sitecheck'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheckequipmentexclusion'; Name = 'gr_equipment'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheckequipmentexclusion'; Name = 'gr_availabilitysnapshot'; Type = 'Picklist'; Options = $availabilityOptions },
        @{ Entity = 'gr_job'; Name = 'gr_sitecheck'; Type = 'Lookup' }
    )
    foreach ($expected in $expectedAttributes) {
        $actual = Get-AttributeMetadata $Service $expected.Entity $expected.Name
        if ($null -eq $actual) {
            throw "Verification failed: $($expected.Entity).$($expected.Name) is missing."
        }
        Assert-AttributeType $actual $expected.Type "$($expected.Entity).$($expected.Name)"
        if ($expected.ContainsKey('Options')) {
            Assert-ChoiceOptions $actual $expected.Options "$($expected.Entity).$($expected.Name)"
        }
    }

    foreach ($relationship in @(
        @{ Entity = $schedule; Name = 'gr_sitecheckschedule_Site_gr_site' },
        @{ Entity = $schedule; Name = 'gr_sitecheckschedule_ActiveSiteCheck_gr_sitecheck' },
        @{ Entity = $siteCheck; Name = 'gr_sitecheck_SiteCheckSchedule_gr_sitecheckschedule' },
        @{ Entity = $siteCheck; Name = 'gr_sitecheck_Site_gr_site' },
        @{ Entity = $siteCheck; Name = 'gr_sitecheck_AssignedTechnician_gr_mechanic' },
        @{ Entity = $scheduleEquipment; Name = 'gr_sitecheckscheduleequipment_SiteCheckSchedule_gr_sitecheckschedule' },
        @{ Entity = $scheduleEquipment; Name = 'gr_sitecheckscheduleequipment_Equipment_gr_equipment' },
        @{ Entity = $equipmentExclusion; Name = 'gr_sitecheckequipmentexclusion_SiteCheck_gr_sitecheck' },
        @{ Entity = $equipmentExclusion; Name = 'gr_sitecheckequipmentexclusion_Equipment_gr_equipment' },
        @{ Entity = (Get-EntityMetadata $Service 'gr_job'); Name = 'gr_job_SiteCheck_gr_sitecheck' }
    )) {
        $actual = @($relationship.Entity.ManyToOneRelationships | Where-Object SchemaName -EQ $relationship.Name)
        if ($actual.Count -ne 1 -or [string]$actual[0].CascadeConfiguration.Delete -ne 'Restrict') {
            throw "Verification failed: $($relationship.Name) is missing or is not Restrict."
        }
    }

    foreach ($keyContract in @(
        @{ Entity = $schedule; Name = 'gr_sitecheckschedule_site_key'; Attribute = 'gr_site' },
        @{ Entity = $siteCheck; Name = 'gr_sitecheck_creationrequestkey_key'; Attribute = 'gr_creationrequestkey' }
    )) {
        $key = @($keyContract.Entity.Keys | Where-Object LogicalName -EQ $keyContract.Name)
        if ($key.Count -ne 1 -or @($key[0].KeyAttributes).Count -ne 1 `
            -or $key[0].KeyAttributes[0] -ne $keyContract.Attribute) {
            throw "Verification failed: $($keyContract.Entity.LogicalName).$($keyContract.Name) is missing or incompatible."
        }
        if ($RequireActiveKeys -and [string]$key[0].EntityKeyIndexStatus -ne 'Active') {
            throw "Verification pending: $($keyContract.Name) is $($key[0].EntityKeyIndexStatus), not Active."
        }
    }
    $selectionKey = @($scheduleEquipment.Keys | Where-Object LogicalName -EQ `
        'gr_sitecheckscheduleequipment_scheduleequipment_key')
    $selectionKeyAttributes = if ($selectionKey.Count -eq 1) {
        @($selectionKey[0].KeyAttributes | Sort-Object)
    } else { @() }
    if ($selectionKey.Count -ne 1 -or
        ($selectionKeyAttributes -join ',') -ne 'gr_equipment,gr_sitecheckschedule') {
        throw 'Verification failed: Site Check Schedule Equipment composite key is missing or incompatible.'
    }
    if ($RequireActiveKeys -and [string]$selectionKey[0].EntityKeyIndexStatus -ne 'Active') {
        throw "Verification pending: $($selectionKey[0].LogicalName) is $($selectionKey[0].EntityKeyIndexStatus), not Active."
    }
    $exclusionKey = @($equipmentExclusion.Keys | Where-Object LogicalName -EQ `
        'gr_sitecheckequipmentexclusion_sitecheckequipment_key')
    $exclusionKeyAttributes = if ($exclusionKey.Count -eq 1) {
        @($exclusionKey[0].KeyAttributes | Sort-Object)
    } else { @() }
    if ($exclusionKey.Count -ne 1 -or
        ($exclusionKeyAttributes -join ',') -ne 'gr_equipment,gr_sitecheck') {
        throw 'Verification failed: Site Check Equipment Exclusion composite key is missing or incompatible.'
    }
    if ($RequireActiveKeys -and [string]$exclusionKey[0].EntityKeyIndexStatus -ne 'Active') {
        throw "Verification pending: $($exclusionKey[0].LogicalName) is $($exclusionKey[0].EntityKeyIndexStatus), not Active."
    }

    $jobType = Get-AttributeMetadata $Service 'gr_job' 'gr_jobtype'
    $siteCheckOption = @($jobType.OptionSet.Options | Where-Object Value -EQ 122830004)
    if ($siteCheckOption.Count -ne 1 -or (Get-Label $siteCheckOption[0].Label) -ne 'Site Check') {
        throw 'Verification failed: Site Check Job Type 122830004 is missing or incompatible.'
    }
    Write-Output 'Site Checks schema verification passed.'
}

function Get-SiteChecksSecurityAudit {
    param([Parameter(Mandatory)]$Service)

    $roleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $roleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'roleid',
        'name',
        'ismanaged'
    )
    $roleQuery.Distinct = $true
    $roleQuery.Criteria.AddCondition(
        'ismanaged',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $false
    )
    $assignment = $roleQuery.AddLink('systemuserroles', 'roleid', 'roleid')
    $user = $assignment.AddLink('systemuser', 'systemuserid', 'systemuserid')
    $user.LinkCriteria.AddCondition(
        'isdisabled',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $false
    )
    $user.LinkCriteria.AddCondition(
        'applicationid',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Null
    )
    $assignedRoles = @($Service.RetrieveMultiple($roleQuery).Entities |
        Sort-Object { [string]$_.Attributes['name'] } -Unique)

    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $privilegeFilter = $privilegeQuery.Criteria.AddFilter(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    foreach ($pattern in @(
        '%gr_SiteCheck%',
        '%gr_Job',
        '%gr_Site',
        '%gr_Equipment',
        '%gr_Mechanic'
    )) {
        $privilegeFilter.AddCondition(
            'name',
            [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Like,
            $pattern
        )
    }
    $privileges = @($Service.RetrieveMultiple($privilegeQuery).Entities)
    $privilegeNames = @{}
    foreach ($privilege in $privileges) {
        $privilegeNames[$privilege.Id] = [string]$privilege.Attributes['name']
    }

    $roleSummaries = foreach ($role in $assignedRoles) {
        $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
        $request.RoleId = $role.Id
        $grants = @($Service.Execute($request).RolePrivileges | Where-Object {
            $privilegeNames.ContainsKey($_.PrivilegeId)
        } | ForEach-Object {
            [pscustomobject]@{
                Name = $privilegeNames[$_.PrivilegeId]
                Depth = [string]$_.Depth
            }
        } | Sort-Object Name)
        [pscustomobject]@{
            RoleName = [string]$role.Attributes['name']
            RoleId = $role.Id
            RelevantPrivileges = $grants
        }
    }

    $whoAmI = $Service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    $currentRoleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $currentRoleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $currentAssignment = $currentRoleQuery.AddLink('systemuserroles', 'roleid', 'roleid')
    $currentAssignment.LinkCriteria.AddCondition(
        'systemuserid',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $whoAmI.UserId
    )
    $currentRoleNames = @($Service.RetrieveMultiple($currentRoleQuery).Entities |
        ForEach-Object { [string]$_.Attributes['name'] } |
        Sort-Object -Unique)

    return [pscustomobject]@{
        CurrentConnectionRoleNames = $currentRoleNames
        ActivelyAssignedUnmanagedHumanRoleCount = @($roleSummaries).Count
        Roles = @($roleSummaries)
        Notes = @(
            'No user names, email addresses, or business data were retrieved.',
            'Only unmanaged roles assigned to enabled non-application users are included.',
            'This is a read-only audit; no privileges or assignments were changed.'
        )
    }
}

function Ensure-SiteChecksSecurityRole {
    param([Parameter(Mandatory)]$Service)

    $roleId = [Guid]'3da914a0-cc84-f111-ab0e-7ced8d3278bf'
    $role = $Service.Retrieve(
        'role',
        $roleId,
        [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    )
    if ([string]$role.Attributes['name'] -ne 'Service Operations') {
        throw 'Configured Site Checks role ID is not Service Operations.'
    }

    $requiredNames = @(
        'prvCreategr_SiteCheckSchedule',
        'prvReadgr_SiteCheckSchedule',
        'prvWritegr_SiteCheckSchedule',
        'prvAppendgr_SiteCheckSchedule',
        'prvAppendTogr_SiteCheckSchedule',
        'prvCreategr_SiteCheck',
        'prvReadgr_SiteCheck',
        'prvWritegr_SiteCheck',
        'prvAppendgr_SiteCheck',
        'prvAppendTogr_SiteCheck',
        'prvCreategr_SiteCheckScheduleEquipment',
        'prvReadgr_SiteCheckScheduleEquipment',
        'prvDeletegr_SiteCheckScheduleEquipment',
        'prvAppendgr_SiteCheckScheduleEquipment',
        'prvAppendTogr_SiteCheckScheduleEquipment'
        'prvCreategr_SiteCheckEquipmentExclusion',
        'prvReadgr_SiteCheckEquipmentExclusion',
        'prvDeletegr_SiteCheckEquipmentExclusion',
        'prvAppendgr_SiteCheckEquipmentExclusion',
        'prvAppendTogr_SiteCheckEquipmentExclusion'
    )
    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $privilegeFilter = $privilegeQuery.Criteria.AddFilter(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    foreach ($name in $requiredNames) {
        $privilegeFilter.AddCondition(
            'name',
            [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
            $name
        )
    }
    $metadata = @($Service.RetrieveMultiple($privilegeQuery).Entities)
    foreach ($name in $requiredNames) {
        if (-not ($metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1)) {
            throw "Required Site Checks privilege metadata was not found: $name"
        }
    }

    $currentRequest = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
    $currentRequest.RoleId = $roleId
    $current = @($Service.Execute($currentRequest).RolePrivileges)
    $currentIds = [System.Collections.Generic.HashSet[Guid]]::new()
    $current | ForEach-Object { $currentIds.Add($_.PrivilegeId) | Out-Null }

    $toAdd = [System.Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach ($name in $requiredNames) {
        $privilege = $metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1
        if ($currentIds.Contains($privilege.Id)) { continue }
        $grant = [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
        $grant.PrivilegeId = $privilege.Id
        $grant.Depth = [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global
        $toAdd.Add($grant)
    }
    if ($toAdd.Count) {
        $request = [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
        $request.RoleId = $roleId
        $request.Privileges = $toAdd.ToArray()
        $Service.Execute($request) | Out-Null
        Write-Output "Added $($toAdd.Count) Site Checks privileges to Service Operations."
    } else {
        Write-Output 'Service Operations already has all approved Site Checks privileges.'
    }

    $verified = @($Service.Execute($currentRequest).RolePrivileges)
    foreach ($name in $requiredNames) {
        $privilege = $metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1
        $actual = $verified | Where-Object {
            $_.PrivilegeId -eq $privilege.Id
        } | Select-Object -First 1
        if (-not $actual -or $actual.Depth -ne [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
            throw "Security-role verification failed for $name."
        }
    }
    Write-Output 'Verified approved Site Checks privileges at Organization depth.'
}

function Get-ChecklistPreflight {
    param([Parameter(Mandatory)]$Service)

    $proposedTables = @(
        'gr_sitecheckchecklisttemplate',
        'gr_sitecheckchecklisttemplateitem',
        'gr_sitecheckchecklistsnapshotitem',
        'gr_sitecheckchecklistresponse'
    )
    $existingPrivileges = @(
        'prvAppendgr_JobPhoto',
        'prvWritegr_JobPhoto',
        'prvAppendTogr_Job',
        'prvAppendTogr_Mechanic',
        'prvAppendTogr_SiteCheck',
        'prvAppendgr_SiteCheckSchedule'
    )

    return [ordered]@{
        Mode = 'InspectChecklist'
        EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
        ReadOnly = $true
        BusinessDataRead = $false
        ProposedTables = @($proposedTables | ForEach-Object {
            $metadata = Get-EntityMetadata -Service $Service -LogicalName $_
            [pscustomobject]@{
                LogicalName = $_
                Found = $null -ne $metadata
                EntitySetName = if ($metadata) { $metadata.EntitySetName } else { $null }
                OwnershipType = if ($metadata) { [string]$metadata.OwnershipType } else { $null }
                PrimaryName = if ($metadata) { $metadata.PrimaryNameAttribute } else { $null }
            }
        })
        ProposedExtensions = @(
            [pscustomobject]@{
                Entity = 'gr_sitecheckschedule'
                Attribute = 'gr_checklisttemplate'
                Found = $null -ne (
                    Get-AttributeMetadata $Service 'gr_sitecheckschedule' 'gr_checklisttemplate'
                )
            },
            [pscustomobject]@{
                Entity = 'gr_jobphoto'
                Attribute = 'gr_checklistresponse'
                Found = $null -ne (
                    Get-AttributeMetadata $Service 'gr_jobphoto' 'gr_checklistresponse'
                )
            }
        )
        ExistingRelationshipPrivileges = @(
            Get-RolePrivilegeSummary -Service $Service `
                -RoleName 'Service Operations' -PrivilegeNames $existingPrivileges
            Get-RolePrivilegeSummary -Service $Service `
                -RoleName 'Public Portal Service' -PrivilegeNames $existingPrivileges
        )
        ApprovedChoices = [ordered]@{
            ResponseType = @(
                'Pass / Fail / Not applicable=122830000',
                'Yes / No=122830001',
                'Number=122830002',
                'Text=122830003'
            )
            ChoiceAnswer = @(
                'Pass=122830000',
                'Fail=122830001',
                'Not applicable=122830002',
                'Yes=122830003',
                'No=122830004'
            )
        }
        Notes = @(
            'No customer, Site, Equipment, Job, checklist, or other business rows were read.',
            'Found proposed names require compatibility verification before any provisioning.',
            'ProvisionChecklist is idempotent and stops on incompatible existing metadata.'
        )
    }
}

function Ensure-RolePrivilegesGlobal {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$RoleName,
        [Parameter(Mandatory)][string[]]$PrivilegeNames
    )

    $roleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $roleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'roleid', 'name', 'ismanaged'
    )
    $roleQuery.Criteria.AddCondition(
        'name',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $RoleName
    )
    $roles = @($Service.RetrieveMultiple($roleQuery).Entities)
    if ($roles.Count -ne 1 -or [bool]$roles[0].Attributes['ismanaged']) {
        throw "Expected exactly one unmanaged $RoleName role."
    }

    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $filter = $privilegeQuery.Criteria.AddFilter(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    foreach ($name in $PrivilegeNames) {
        $filter.AddCondition(
            'name',
            [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
            $name
        )
    }
    $metadata = @($Service.RetrieveMultiple($privilegeQuery).Entities)
    foreach ($name in $PrivilegeNames) {
        if (-not ($metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1)) {
            throw "Required checklist privilege metadata was not found: $name"
        }
    }

    $currentRequest = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
    $currentRequest.RoleId = $roles[0].Id
    $current = @($Service.Execute($currentRequest).RolePrivileges)
    $toAdd = [System.Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach ($name in $PrivilegeNames) {
        $privilege = $metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1
        $grant = $current | Where-Object PrivilegeId -EQ $privilege.Id | Select-Object -First 1
        if ($grant) {
            if ($grant.Depth -ne [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
                throw "Conflict: $RoleName has $name at $($grant.Depth), not Organization depth."
            }
            continue
        }
        $newGrant = [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
        $newGrant.PrivilegeId = $privilege.Id
        $newGrant.Depth = [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global
        $toAdd.Add($newGrant)
    }
    if ($toAdd.Count) {
        $request = [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
        $request.RoleId = $roles[0].Id
        $request.Privileges = $toAdd.ToArray()
        $Service.Execute($request) | Out-Null
        Write-Output "Added $($toAdd.Count) approved checklist privileges to $RoleName."
    } else {
        Write-Output "$RoleName already has all approved checklist privileges."
    }

    $verified = Get-RolePrivilegeSummary -Service $Service `
        -RoleName $RoleName -PrivilegeNames $PrivilegeNames
    foreach ($grant in $verified.Roles[0].Privileges) {
        if (-not $grant.Granted -or $grant.Depth -ne 'Global') {
            throw "Checklist security verification failed for $RoleName / $($grant.Name)."
        }
    }
    Write-Output "Verified approved checklist privileges for $RoleName at Organization depth."
}

function Get-ChecklistPrivilegeContracts {
    return [ordered]@{
        ServiceOperations = @(
            'prvCreategr_SiteCheckChecklistTemplate',
            'prvReadgr_SiteCheckChecklistTemplate',
            'prvWritegr_SiteCheckChecklistTemplate',
            'prvDeletegr_SiteCheckChecklistTemplate',
            'prvAppendgr_SiteCheckChecklistTemplate',
            'prvAppendTogr_SiteCheckChecklistTemplate',
            'prvCreategr_SiteCheckChecklistTemplateItem',
            'prvReadgr_SiteCheckChecklistTemplateItem',
            'prvWritegr_SiteCheckChecklistTemplateItem',
            'prvDeletegr_SiteCheckChecklistTemplateItem',
            'prvAppendgr_SiteCheckChecklistTemplateItem',
            'prvAppendTogr_SiteCheckChecklistTemplateItem',
            'prvCreategr_SiteCheckChecklistSnapshotItem',
            'prvReadgr_SiteCheckChecklistSnapshotItem',
            'prvDeletegr_SiteCheckChecklistSnapshotItem',
            'prvAppendgr_SiteCheckChecklistSnapshotItem',
            'prvAppendTogr_SiteCheckChecklistSnapshotItem',
            'prvReadgr_SiteCheckChecklistResponse',
            'prvDeletegr_SiteCheckChecklistResponse'
        )
        PublicPortal = @(
            'prvReadgr_SiteCheckChecklistSnapshotItem',
            'prvAppendTogr_SiteCheckChecklistSnapshotItem',
            'prvCreategr_SiteCheckChecklistResponse',
            'prvReadgr_SiteCheckChecklistResponse',
            'prvAppendgr_SiteCheckChecklistResponse',
            'prvAppendTogr_SiteCheckChecklistResponse',
            'prvAppendTogr_Job',
            'prvAppendTogr_Mechanic',
            'prvWritegr_JobPhoto',
            'prvAppendgr_JobPhoto'
        )
    }
}

function Get-ChecklistSnapshotRowCount {
    param([Parameter(Mandatory)]$Service)
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new(
        'gr_sitecheckchecklistsnapshotitem'
    )
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckchecklistsnapshotitemid'
    )
    $query.TopCount = 1
    return @($Service.RetrieveMultiple($query).Entities).Count
}

function Get-ChecklistCorrectionPreflight {
    param([Parameter(Mandatory)]$Service)
    $snapshot = Get-EntityMetadata $Service 'gr_sitecheckchecklistsnapshotitem'
    if (-not $snapshot) { throw 'The provisioned Checklist Snapshot Item table was not found.' }
    $jobLookup = Get-AttributeMetadata $Service `
        'gr_sitecheckchecklistsnapshotitem' 'gr_job'
    $servicePrivileges = @(
        'prvAppendgr_SiteCheckChecklistSnapshotItem',
        'prvAppendTogr_Job'
    )

    return [ordered]@{
        Mode = 'InspectChecklistCorrection'
        EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
        ReadOnly = $true
        SnapshotRowCountAtMostOne = Get-ChecklistSnapshotRowCount $Service
        JobLookup = [ordered]@{
            Found = $null -ne $jobLookup
            AttributeType = if ($jobLookup) { [string]$jobLookup.AttributeType } else { $null }
            RequiredLevel = if ($jobLookup) {
                [string]$jobLookup.RequiredLevel.Value
            } else {
                $null
            }
        }
        Keys = @($snapshot.Keys | ForEach-Object {
            [pscustomobject]@{
                LogicalName = $_.LogicalName
                KeyAttributes = @($_.KeyAttributes)
                Status = [string]$_.EntityKeyIndexStatus
            }
        })
        ServiceOperations = Get-RolePrivilegeSummary -Service $Service `
            -RoleName 'Service Operations' -PrivilegeNames $servicePrivileges
        Notes = @(
            'The count is deliberately capped at one; zero is required before correction.',
            'No Site, Equipment, Job, response, or other business rows were retrieved.',
            'Provisioning does not seed Templates, Items, Snapshots, or Responses.'
        )
    }
}

function Remove-ChecklistSnapshotSiteCheckKey {
    param([Parameter(Mandatory)]$Service)
    $entity = Get-EntityMetadata $Service 'gr_sitecheckchecklistsnapshotitem'
    $oldName = 'gr_sitecheckchecklistsnapshotitem_sitecheck_itemkey_key'
    $old = @($entity.Keys | Where-Object LogicalName -EQ $oldName)
    if ($old.Count -eq 0) {
        Write-Output 'Old Site Check + Item Key is already absent.'
        return
    }
    if ($old.Count -ne 1 -or
        ((@($old[0].KeyAttributes | Sort-Object) -join ',') -ne
            ((@('gr_sitecheck', 'gr_itemkey') | Sort-Object) -join ','))) {
        throw 'Conflict: the old Snapshot Item key is incompatible.'
    }
    $request = [Microsoft.Xrm.Sdk.Messages.DeleteEntityKeyRequest]::new()
    $request.EntityLogicalName = 'gr_sitecheckchecklistsnapshotitem'
    $request.Name = $oldName
    $Service.Execute($request) | Out-Null
    Write-Output 'Deleted the obsolete Snapshot Item Site Check + Item Key.'
}

function Invoke-ChecklistCorrectionProvisioning {
    param([Parameter(Mandatory)]$Service)
    if ((Get-ChecklistSnapshotRowCount $Service) -ne 0) {
        throw 'Checklist Snapshot Item rows exist. Stop and design a migration before changing the key.'
    }

    Remove-ChecklistSnapshotSiteCheckKey $Service
    Ensure-Lookup $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_Job' `
        'Job' 'gr_job' 'gr_job_sitecheckchecklistsnapshotitems' `
        'gr_job_sitecheckchecklistsnapshotitems' $true

    $publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $publish.ParameterXml = @'
<importexportxml>
  <entities>
    <entity>gr_sitecheckchecklistsnapshotitem</entity>
    <entity>gr_job</entity>
  </entities>
</importexportxml>
'@
    $Service.Execute($publish) | Out-Null
    Write-Output 'Published the per-Job Checklist Snapshot Item correction.'

    Ensure-Key $Service 'gr_sitecheckchecklistsnapshotitem' `
        'gr_SiteCheckChecklistSnapshotItem_Job_ItemKey_Key' `
        'Site Check Checklist Snapshot Item Job and Item Key' `
        @('gr_job', 'gr_itemkey')
    Assert-ChecklistSchema $Service
    Write-Output 'Checklist Snapshot Item per-Job correction completed without seeding business data.'
}

function Get-ChecklistContentDefinition {
    if (-not (Test-Path -LiteralPath $ChecklistContentPath)) {
        throw "Checklist content manifest was not found: $ChecklistContentPath"
    }
    $definition = Get-Content -LiteralPath $ChecklistContentPath -Raw | ConvertFrom-Json
    $templates = @($definition.templates)
    if ($templates.Count -ne 2) { throw 'Checklist content must define exactly two Templates.' }
    $expectedCounts = @{ SITE_CHECK_ICE = 23; SITE_CHECK_ELECTRIC = 22 }
    foreach ($template in $templates) {
        if (-not $expectedCounts.ContainsKey([string]$template.code)) {
            throw "Unsupported checklist Template code: $($template.code)"
        }
        if ([int]$template.version -ne 1 -or -not ([string]$template.name).Trim()) {
            throw "Checklist Template $($template.code) must have a name and version 1."
        }
        $items = @($template.items)
        if ($items.Count -ne $expectedCounts[[string]$template.code]) {
            throw "Checklist Template $($template.code) has $($items.Count) items; expected $($expectedCounts[[string]$template.code])."
        }
        $keys = @($items | ForEach-Object { ([string]$_.key).Trim().ToLowerInvariant() })
        $orders = @($items | ForEach-Object { [int]$_.order })
        if (@($keys | Where-Object { -not $_ }).Count -ne 0 -or
            @($keys | Sort-Object -Unique).Count -ne $keys.Count -or
            @($orders | Sort-Object -Unique).Count -ne $orders.Count) {
            throw "Checklist Template $($template.code) has empty or duplicated keys/orders."
        }
        foreach ($item in $items) {
            if (-not ([string]$item.group).Trim() -or -not ([string]$item.prompt).Trim()) {
                throw "Checklist Template $($template.code) has an item without group or prompt."
            }
        }
    }
    return $definition
}

function Get-ChecklistContentState {
    param([Parameter(Mandatory)]$Service)
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_sitecheckchecklisttemplate')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckchecklisttemplateid', 'gr_name', 'gr_templatecode', 'gr_version', 'gr_active'
    )
    $codes = [Microsoft.Xrm.Sdk.Query.FilterExpression]::new(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    foreach ($code in @('SITE_CHECK_ICE', 'SITE_CHECK_ELECTRIC')) {
        $codes.AddCondition('gr_templatecode', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $code)
    }
    $query.Criteria.AddFilter($codes)
    $templates = @($Service.RetrieveMultiple($query).Entities)
    $items = @()
    foreach ($template in $templates) {
        $itemQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new(
            'gr_sitecheckchecklisttemplateitem'
        )
        $itemQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
            'gr_sitecheckchecklisttemplateitemid', 'gr_name', 'gr_checklisttemplate',
            'gr_itemkey', 'gr_groupname', 'gr_prompt', 'gr_responsetype',
            'gr_displayorder', 'gr_required', 'gr_commentrequiredonnegative',
            'gr_photorequiredonnegative'
        )
        $itemQuery.Criteria.AddCondition(
            'gr_checklisttemplate',
            [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
            $template.Id
        )
        $items += @($Service.RetrieveMultiple($itemQuery).Entities)
    }
    return [pscustomobject]@{ Templates = $templates; Items = $items }
}

function Get-ChecklistItemRule {
    param($Item, $Defaults, [string]$Name)
    if ($Item.PSObject.Properties.Name -contains $Name) { return $Item.$Name }
    return $Defaults.$Name
}

function Assert-ChecklistContent {
    param(
        [Parameter(Mandatory)]$State,
        [Parameter(Mandatory)]$Definition
    )
    $templates = @($State.Templates)
    if ($templates.Count -ne 2) {
        throw "Checklist content verification expected two Templates; found $($templates.Count)."
    }
    foreach ($expected in @($Definition.templates)) {
        $actual = @($templates | Where-Object {
            [string]$_.Attributes['gr_templatecode'] -ceq [string]$expected.code -and
            [int]$_.Attributes['gr_version'] -eq [int]$expected.version
        })
        if ($actual.Count -ne 1 -or
            [string]$actual[0].Attributes['gr_name'] -cne [string]$expected.name -or
            [bool]$actual[0].Attributes['gr_active'] -ne $true) {
            throw "Checklist Template $($expected.code) does not match the approved v1 definition."
        }
        $actualItems = @($State.Items | Where-Object {
            $_.Attributes['gr_checklisttemplate'].Id -eq $actual[0].Id
        })
        if ($actualItems.Count -ne @($expected.items).Count) {
            throw "Checklist Template $($expected.code) item count does not match."
        }
        foreach ($item in @($expected.items)) {
            $row = @($actualItems | Where-Object {
                [string]$_.Attributes['gr_itemkey'] -ceq [string]$item.key
            })
            $responseType = [int](Get-ChecklistItemRule $item $Definition.defaults 'responseType')
            $commentRequired = [bool](Get-ChecklistItemRule $item $Definition.defaults 'commentRequiredOnNegative')
            if ($row.Count -ne 1 -or
                [string]$row[0].Attributes['gr_groupname'] -cne [string]$item.group -or
                [string]$row[0].Attributes['gr_prompt'] -cne [string]$item.prompt -or
                [int]$row[0].Attributes['gr_responsetype'].Value -ne $responseType -or
                [int]$row[0].Attributes['gr_displayorder'] -ne [int]$item.order -or
                [bool]$row[0].Attributes['gr_required'] -ne $true -or
                [bool]$row[0].Attributes['gr_commentrequiredonnegative'] -ne $commentRequired -or
                [bool]$row[0].Attributes['gr_photorequiredonnegative'] -ne $false) {
                throw "Checklist item $($expected.code)/$($item.key) does not match the approved v1 definition."
            }
        }
    }
}

function Get-ChecklistContentPreflight {
    param([Parameter(Mandatory)]$Service)
    $definition = Get-ChecklistContentDefinition
    $state = Get-ChecklistContentState $Service
    return [ordered]@{
        Mode = 'InspectChecklistContent'
        EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
        ReadOnly = $true
        ApprovedTemplateCount = @($definition.templates).Count
        ApprovedItemCount = @($definition.templates | ForEach-Object { @($_.items) }).Count
        ExistingMatchingTemplateCount = @($state.Templates).Count
        ExistingMatchingItemCount = @($state.Items).Count
        Templates = @($definition.templates | ForEach-Object {
            [pscustomobject]@{ Code = $_.code; Version = $_.version; Items = @($_.items).Count }
        })
        Notes = @(
            'Only the two approved Template codes and their child Items were read.',
            'No Site Check, Job, Equipment, Schedule, Snapshot, Response, or customer data was read.',
            'Provisioning uses one atomic transaction and is an exact-match no-op after success.'
        )
    }
}

function Invoke-ChecklistContentProvisioning {
    param([Parameter(Mandatory)]$Service)
    Assert-ChecklistSchema $Service -RequireActiveKeys
    $definition = Get-ChecklistContentDefinition
    $state = Get-ChecklistContentState $Service
    if (@($state.Templates).Count -gt 0) {
        Assert-ChecklistContent $state $definition
        Write-Output 'Approved Site Check checklist v1 content already exists exactly; no write was made.'
        return
    }
    if (@($state.Items).Count -gt 0) {
        throw 'Checklist Template Items exist without the approved parent Templates. Stop for review.'
    }

    $transaction = [Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new()
    $transaction.ReturnResponses = $false
    $transaction.Requests = [Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new()
    foreach ($template in @($definition.templates)) {
        $templateId = [guid]::NewGuid()
        $templateRow = [Microsoft.Xrm.Sdk.Entity]::new(
            'gr_sitecheckchecklisttemplate', $templateId
        )
        $templateRow['gr_name'] = [string]$template.name
        $templateRow['gr_templatecode'] = [string]$template.code
        $templateRow['gr_version'] = [int]$template.version
        $templateRow['gr_active'] = $true
        $templateRequest = [Microsoft.Xrm.Sdk.Messages.CreateRequest]::new()
        $templateRequest.Target = $templateRow
        $transaction.Requests.Add($templateRequest)

        foreach ($item in @($template.items)) {
            $itemRow = [Microsoft.Xrm.Sdk.Entity]::new(
                'gr_sitecheckchecklisttemplateitem', [guid]::NewGuid()
            )
            $itemRow['gr_name'] = [string]$item.key
            $itemRow['gr_checklisttemplate'] = [Microsoft.Xrm.Sdk.EntityReference]::new(
                'gr_sitecheckchecklisttemplate', $templateId
            )
            $itemRow['gr_itemkey'] = [string]$item.key
            $itemRow['gr_groupname'] = [string]$item.group
            $itemRow['gr_prompt'] = [string]$item.prompt
            $itemRow['gr_responsetype'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(
                [int](Get-ChecklistItemRule $item $definition.defaults 'responseType')
            )
            $itemRow['gr_displayorder'] = [int]$item.order
            $itemRow['gr_required'] = [bool](
                Get-ChecklistItemRule $item $definition.defaults 'required'
            )
            $itemRow['gr_commentrequiredonnegative'] = [bool](
                Get-ChecklistItemRule $item $definition.defaults 'commentRequiredOnNegative'
            )
            $itemRow['gr_photorequiredonnegative'] = [bool](
                Get-ChecklistItemRule $item $definition.defaults 'photoRequiredOnNegative'
            )
            $itemRequest = [Microsoft.Xrm.Sdk.Messages.CreateRequest]::new()
            $itemRequest.Target = $itemRow
            $transaction.Requests.Add($itemRequest)
        }
    }
    if ($transaction.Requests.Count -ne 47) {
        throw "Checklist seed transaction has $($transaction.Requests.Count) requests; expected 47."
    }
    $Service.Execute($transaction) | Out-Null
    Assert-ChecklistContent (Get-ChecklistContentState $Service) $definition
    Write-Output 'Created and verified two approved Site Check checklist v1 Templates and 45 Items atomically.'
}

function Assert-ChecklistSchema {
    param(
        [Parameter(Mandatory)]$Service,
        [switch]$RequireActiveKeys
    )

    $tableContracts = @(
        @{
            Name = 'gr_sitecheckchecklisttemplate'
            Key = 'gr_sitecheckchecklisttemplate_code_version_key'
            Attributes = @('gr_templatecode', 'gr_version')
        },
        @{
            Name = 'gr_sitecheckchecklisttemplateitem'
            Key = 'gr_sitecheckchecklisttemplateitem_template_itemkey_key'
            Attributes = @('gr_checklisttemplate', 'gr_itemkey')
        },
        @{
            Name = 'gr_sitecheckchecklistsnapshotitem'
            Key = 'gr_sitecheckchecklistsnapshotitem_job_itemkey_key'
            Attributes = @('gr_job', 'gr_itemkey')
        },
        @{
            Name = 'gr_sitecheckchecklistresponse'
            Key = 'gr_sitecheckchecklistresponse_job_snapshot_key'
            Attributes = @('gr_job', 'gr_snapshotitem')
        }
    )
    foreach ($contract in $tableContracts) {
        $entity = Get-EntityMetadata $Service $contract.Name
        if (-not $entity -or
            $entity.OwnershipType -ne
                [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::OrganizationOwned) {
            throw "Checklist verification failed for table $($contract.Name)."
        }
        $key = @($entity.Keys | Where-Object LogicalName -EQ $contract.Key)
        if ($key.Count -ne 1 -or
            ((@($key[0].KeyAttributes | Sort-Object) -join ',') -ne
                (@($contract.Attributes | Sort-Object) -join ','))) {
            throw "Checklist verification failed for key $($contract.Key)."
        }
        if ($RequireActiveKeys -and [string]$key[0].EntityKeyIndexStatus -ne 'Active') {
            throw "Checklist key $($contract.Key) is $($key[0].EntityKeyIndexStatus), not Active."
        }
        Write-Output "Verified checklist table/key: $($contract.Name) ($($key[0].EntityKeyIndexStatus))"
    }

    $responseType = Get-AttributeMetadata $Service `
        'gr_sitecheckchecklisttemplateitem' 'gr_responsetype'
    Assert-ChoiceOptions $responseType @(
        @{ Label = 'Pass / Fail / Not applicable'; Value = 122830000 },
        @{ Label = 'Yes / No'; Value = 122830001 },
        @{ Label = 'Number'; Value = 122830002 },
        @{ Label = 'Text'; Value = 122830003 }
    ) 'gr_sitecheckchecklisttemplateitem.gr_responsetype'
    $answer = Get-AttributeMetadata $Service `
        'gr_sitecheckchecklistresponse' 'gr_choiceanswer'
    Assert-ChoiceOptions $answer @(
        @{ Label = 'Pass'; Value = 122830000 },
        @{ Label = 'Fail'; Value = 122830001 },
        @{ Label = 'Not applicable'; Value = 122830002 },
        @{ Label = 'Yes'; Value = 122830003 },
        @{ Label = 'No'; Value = 122830004 }
    ) 'gr_sitecheckchecklistresponse.gr_choiceanswer'

    foreach ($lookup in @(
        @('gr_sitecheckschedule', 'gr_checklisttemplate', 'gr_sitecheckchecklisttemplate'),
        @('gr_jobphoto', 'gr_checklistresponse', 'gr_sitecheckchecklistresponse'),
        @('gr_sitecheckchecklistsnapshotitem', 'gr_job', 'gr_job')
    )) {
        $attribute = Get-AttributeMetadata $Service $lookup[0] $lookup[1]
        if (-not $attribute -or [string]$attribute.AttributeType -ne 'Lookup' -or
            @($attribute.Targets) -notcontains $lookup[2]) {
            throw "Checklist verification failed for $($lookup[0]).$($lookup[1])."
        }
    }

    $privileges = Get-ChecklistPrivilegeContracts
    foreach ($roleContract in @(
        @('Service Operations', $privileges.ServiceOperations),
        @('Public Portal Service', $privileges.PublicPortal)
    )) {
        $summary = Get-RolePrivilegeSummary -Service $Service `
            -RoleName $roleContract[0] -PrivilegeNames $roleContract[1]
        if ($summary.RoleCount -ne 1) {
            throw "Checklist security verification found $($summary.RoleCount) $($roleContract[0]) roles."
        }
        foreach ($grant in $summary.Roles[0].Privileges) {
            if (-not $grant.Granted -or $grant.Depth -ne 'Global') {
                throw "Checklist security verification failed for $($roleContract[0]) / $($grant.Name)."
            }
        }
    }
    Write-Output 'Phase 16 checklist schema, Choices, relationships, keys, and security passed verification.'
}

function Invoke-ChecklistProvisioning {
    param([Parameter(Mandatory)]$Service)

    Ensure-Table $Service 'gr_SiteCheckChecklistTemplate' 'Site Check Checklist Template' `
        'Site Check Checklist Templates' 'Versioned Site Check checklist definition.'
    Ensure-Text $Service 'gr_sitecheckchecklisttemplate' 'gr_TemplateCode' `
        'Template Code' 100 $true
    Ensure-Integer $Service 'gr_sitecheckchecklisttemplate' 'gr_Version' `
        'Version' 1 100000 $true
    Ensure-Boolean $Service 'gr_sitecheckchecklisttemplate' 'gr_Active' `
        'Active' $true $true
    Ensure-Lookup $Service 'gr_sitecheckchecklisttemplate' 'gr_SupersedesTemplate' `
        'Supersedes Template' 'gr_sitecheckchecklisttemplate' `
        'gr_sitecheckchecklisttemplate_supersedes' `
        'gr_sitecheckchecklisttemplate_supersededby'

    Ensure-Table $Service 'gr_SiteCheckChecklistTemplateItem' `
        'Site Check Checklist Template Item' 'Site Check Checklist Template Items' `
        'Ordered versioned Site Check checklist prompt.'
    Ensure-Lookup $Service 'gr_sitecheckchecklisttemplateitem' 'gr_ChecklistTemplate' `
        'Checklist Template' 'gr_sitecheckchecklisttemplate' `
        'gr_sitecheckchecklisttemplate_items' `
        'gr_sitecheckchecklisttemplate_items' $true
    Ensure-Text $Service 'gr_sitecheckchecklisttemplateitem' 'gr_ItemKey' `
        'Item Key' 100 $true
    Ensure-Text $Service 'gr_sitecheckchecklisttemplateitem' 'gr_GroupName' `
        'Group Name' 200 $true
    Ensure-Memo $Service 'gr_sitecheckchecklisttemplateitem' 'gr_Prompt' `
        'Prompt' 2000 $true
    Ensure-Choice $Service 'gr_sitecheckchecklisttemplateitem' 'gr_ResponseType' `
        'Response Type' @(
            @{ Label = 'Pass / Fail / Not applicable'; Value = 122830000 },
            @{ Label = 'Yes / No'; Value = 122830001 },
            @{ Label = 'Number'; Value = 122830002 },
            @{ Label = 'Text'; Value = 122830003 }
        ) $null $true
    Ensure-Integer $Service 'gr_sitecheckchecklisttemplateitem' 'gr_DisplayOrder' `
        'Display Order' 0 100000 $true
    Ensure-Boolean $Service 'gr_sitecheckchecklisttemplateitem' 'gr_Required' `
        'Required' $false $true
    Ensure-Boolean $Service 'gr_sitecheckchecklisttemplateitem' `
        'gr_CommentRequiredOnNegative' 'Comment Required on Negative' $false $true
    Ensure-Boolean $Service 'gr_sitecheckchecklisttemplateitem' `
        'gr_PhotoRequiredOnNegative' 'Photo Required on Negative' $false $true

    Ensure-Lookup $Service 'gr_sitecheckschedule' 'gr_ChecklistTemplate' `
        'Checklist Template' 'gr_sitecheckchecklisttemplate' `
        'gr_sitecheckschedule_checklisttemplate' `
        'gr_sitecheckchecklisttemplate_schedules'

    Ensure-Table $Service 'gr_SiteCheckChecklistSnapshotItem' `
        'Site Check Checklist Snapshot Item' 'Site Check Checklist Snapshot Items' `
        'Immutable checklist prompt copied to a Site Check occurrence.'
    Ensure-Lookup $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_SiteCheck' `
        'Site Check' 'gr_sitecheck' 'gr_sitecheck_checklistsnapshotitems' `
        'gr_sitecheck_checklistsnapshotitems' $true
    Ensure-Lookup $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_SourceTemplateItem' `
        'Source Template Item' 'gr_sitecheckchecklisttemplateitem' `
        'gr_sitecheckchecklisttemplateitem_snapshots' `
        'gr_sitecheckchecklisttemplateitem_snapshots'
    Ensure-Text $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_ItemKey' `
        'Item Key' 100 $true
    Ensure-Text $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_GroupName' `
        'Group Name' 200 $true
    Ensure-Memo $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_Prompt' `
        'Prompt' 2000 $true
    Ensure-Choice $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_ResponseType' `
        'Response Type' @(
            @{ Label = 'Pass / Fail / Not applicable'; Value = 122830000 },
            @{ Label = 'Yes / No'; Value = 122830001 },
            @{ Label = 'Number'; Value = 122830002 },
            @{ Label = 'Text'; Value = 122830003 }
        ) $null $true
    Ensure-Integer $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_DisplayOrder' `
        'Display Order' 0 100000 $true
    Ensure-Boolean $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_Required' `
        'Required' $false $true
    Ensure-Boolean $Service 'gr_sitecheckchecklistsnapshotitem' `
        'gr_CommentRequiredOnNegative' 'Comment Required on Negative' $false $true
    Ensure-Boolean $Service 'gr_sitecheckchecklistsnapshotitem' `
        'gr_PhotoRequiredOnNegative' 'Photo Required on Negative' $false $true

    Ensure-Table $Service 'gr_SiteCheckChecklistResponse' `
        'Site Check Checklist Response' 'Site Check Checklist Responses' `
        'Technician answer for one Job and occurrence checklist item.'
    Ensure-Lookup $Service 'gr_sitecheckchecklistresponse' 'gr_Job' `
        'Job' 'gr_job' 'gr_job_sitecheckchecklistresponses' `
        'gr_job_sitecheckchecklistresponses' $true
    Ensure-Lookup $Service 'gr_sitecheckchecklistresponse' 'gr_SnapshotItem' `
        'Snapshot Item' 'gr_sitecheckchecklistsnapshotitem' `
        'gr_sitecheckchecklistsnapshotitem_responses' `
        'gr_sitecheckchecklistsnapshotitem_responses' $true
    Ensure-Choice $Service 'gr_sitecheckchecklistresponse' 'gr_ChoiceAnswer' `
        'Choice Answer' @(
            @{ Label = 'Pass'; Value = 122830000 },
            @{ Label = 'Fail'; Value = 122830001 },
            @{ Label = 'Not applicable'; Value = 122830002 },
            @{ Label = 'Yes'; Value = 122830003 },
            @{ Label = 'No'; Value = 122830004 }
        )
    Ensure-Decimal $Service 'gr_sitecheckchecklistresponse' 'gr_NumericAnswer' `
        'Numeric Answer' -1000000000 1000000000 4
    Ensure-Memo $Service 'gr_sitecheckchecklistresponse' 'gr_TextAnswer' `
        'Text Answer' 10000
    Ensure-Memo $Service 'gr_sitecheckchecklistresponse' 'gr_Comment' `
        'Comment' 10000
    Ensure-DateTime $Service 'gr_sitecheckchecklistresponse' 'gr_SubmittedOn' `
        'Submitted On' $true
    Ensure-Lookup $Service 'gr_sitecheckchecklistresponse' 'gr_Technician' `
        'Technician' 'gr_mechanic' 'gr_mechanic_sitecheckchecklistresponses' `
        'gr_mechanic_sitecheckchecklistresponses' $true

    Ensure-Lookup $Service 'gr_jobphoto' 'gr_ChecklistResponse' `
        'Checklist Response' 'gr_sitecheckchecklistresponse' `
        'gr_sitecheckchecklistresponse_jobphotos' `
        'gr_sitecheckchecklistresponse_jobphotos'

    $publish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $publish.ParameterXml = @'
<importexportxml>
  <entities>
    <entity>gr_sitecheckchecklisttemplate</entity>
    <entity>gr_sitecheckchecklisttemplateitem</entity>
    <entity>gr_sitecheckschedule</entity>
    <entity>gr_sitecheckchecklistsnapshotitem</entity>
    <entity>gr_sitecheckchecklistresponse</entity>
    <entity>gr_jobphoto</entity>
  </entities>
</importexportxml>
'@
    $Service.Execute($publish) | Out-Null
    Write-Output 'Published approved Phase 16 checklist metadata.'

    Ensure-Key $Service 'gr_sitecheckchecklisttemplate' `
        'gr_SiteCheckChecklistTemplate_Code_Version_Key' `
        'Site Check Checklist Template Code and Version' `
        @('gr_templatecode', 'gr_version')
    Ensure-Key $Service 'gr_sitecheckchecklisttemplateitem' `
        'gr_SiteCheckChecklistTemplateItem_Template_ItemKey_Key' `
        'Site Check Checklist Template Item Template and Item Key' `
        @('gr_checklisttemplate', 'gr_itemkey')
    if ((Get-ChecklistSnapshotRowCount $Service) -ne 0) {
        throw 'Checklist Snapshot Item rows exist. Stop before applying the per-Job key correction.'
    }
    Remove-ChecklistSnapshotSiteCheckKey $Service
    Ensure-Lookup $Service 'gr_sitecheckchecklistsnapshotitem' 'gr_Job' `
        'Job' 'gr_job' 'gr_job_sitecheckchecklistsnapshotitems' `
        'gr_job_sitecheckchecklistsnapshotitems' $true
    $snapshotCorrectionPublish = [Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new()
    $snapshotCorrectionPublish.ParameterXml = @'
<importexportxml>
  <entities>
    <entity>gr_sitecheckchecklistsnapshotitem</entity>
    <entity>gr_job</entity>
  </entities>
</importexportxml>
'@
    $Service.Execute($snapshotCorrectionPublish) | Out-Null
    Ensure-Key $Service 'gr_sitecheckchecklistsnapshotitem' `
        'gr_SiteCheckChecklistSnapshotItem_Job_ItemKey_Key' `
        'Site Check Checklist Snapshot Item Job and Item Key' `
        @('gr_job', 'gr_itemkey')
    Ensure-Key $Service 'gr_sitecheckchecklistresponse' `
        'gr_SiteCheckChecklistResponse_Job_Snapshot_Key' `
        'Site Check Checklist Response Job and Snapshot Item' `
        @('gr_job', 'gr_snapshotitem')

    $privileges = Get-ChecklistPrivilegeContracts
    Ensure-RolePrivilegesGlobal $Service 'Service Operations' `
        $privileges.ServiceOperations
    Ensure-RolePrivilegesGlobal $Service 'Public Portal Service' `
        $privileges.PublicPortal
    Assert-ChecklistSchema $Service
    Write-Output 'Phase 16 provisioning completed without creating checklist templates or business data.'
}

function Get-AllRecords {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][Microsoft.Xrm.Sdk.Query.QueryExpression]$Query
    )
    $records = [System.Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
    $Query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $Query.PageInfo.Count = 5000
    $Query.PageInfo.PageNumber = 1
    do {
        $page = $Service.RetrieveMultiple($Query)
        foreach ($record in $page.Entities) { $records.Add($record) }
        $Query.PageInfo.PageNumber++
        $Query.PageInfo.PagingCookie = $page.PagingCookie
    } while ($page.MoreRecords)
    return @($records)
}

function Invoke-SiteChecksDataPurge {
    param([Parameter(Mandatory)]$Service)

    $jobQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
    $jobQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_jobid',
        'gr_sitecheck',
        'gr_jobtype'
    )
    $jobQuery.Criteria.FilterOperator = [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    $jobQuery.Criteria.AddCondition(
        'gr_sitecheck',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::NotNull
    )
    $jobQuery.Criteria.AddCondition(
        'gr_jobtype',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        122830004
    )
    $siteCheckQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_sitecheck')
    $siteCheckQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_sitecheckid')
    $scheduleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_sitecheckschedule')
    $scheduleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckscheduleid',
        'gr_activesitecheck'
    )
    $selectionQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new(
        'gr_sitecheckscheduleequipment'
    )
    $selectionQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckscheduleequipmentid'
    )
    $exclusionQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new(
        'gr_sitecheckequipmentexclusion'
    )
    $exclusionQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckequipmentexclusionid'
    )

    $jobs = @(Get-AllRecords $Service $jobQuery)
    $siteChecks = @(Get-AllRecords $Service $siteCheckQuery)
    $schedules = @(Get-AllRecords $Service $scheduleQuery)
    $selections = @(Get-AllRecords $Service $selectionQuery)
    $exclusions = @(Get-AllRecords $Service $exclusionQuery)
    $activeSchedules = @($schedules | Where-Object {
        $_.Attributes.ContainsKey('gr_activesitecheck')
    })

    Write-Output "Resolved purge targets: $($schedules.Count) Schedules, $($siteChecks.Count) Site Checks, $($jobs.Count) Site Check Jobs, $($selections.Count) manual selections, $($exclusions.Count) exclusions; $($activeSchedules.Count) active pointers."
    if (($jobs.Count + $siteChecks.Count + $schedules.Count + $selections.Count + $exclusions.Count) -eq 0) {
        Write-Output 'No Site Checks data exists. Nothing was deleted.'
        return
    }

    $transaction = [Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new()
    $transaction.ReturnResponses = $false
    $transaction.Requests = [Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new()

    foreach ($schedule in $activeSchedules) {
        $target = [Microsoft.Xrm.Sdk.Entity]::new('gr_sitecheckschedule', $schedule.Id)
        $target['gr_activesitecheck'] = $null
        $request = [Microsoft.Xrm.Sdk.Messages.UpdateRequest]::new()
        $request.Target = $target
        $transaction.Requests.Add($request)
    }
    foreach ($job in $jobs) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_job', $job.Id)
        $transaction.Requests.Add($request)
    }
    foreach ($exclusion in $exclusions) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new(
            'gr_sitecheckequipmentexclusion', $exclusion.Id
        )
        $transaction.Requests.Add($request)
    }
    foreach ($siteCheck in $siteChecks) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_sitecheck', $siteCheck.Id)
        $transaction.Requests.Add($request)
    }
    foreach ($selection in $selections) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new(
            'gr_sitecheckscheduleequipment',
            $selection.Id
        )
        $transaction.Requests.Add($request)
    }
    foreach ($schedule in $schedules) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new(
            'gr_sitecheckschedule',
            $schedule.Id
        )
        $transaction.Requests.Add($request)
    }

    $Service.Execute($transaction) | Out-Null

    $remainingJobs = @(Get-AllRecords $Service $jobQuery)
    $remainingSiteChecks = @(Get-AllRecords $Service $siteCheckQuery)
    $remainingSchedules = @(Get-AllRecords $Service $scheduleQuery)
    $remainingSelections = @(Get-AllRecords $Service $selectionQuery)
    $remainingExclusions = @(Get-AllRecords $Service $exclusionQuery)
    if ($remainingJobs.Count -or $remainingSiteChecks.Count -or
        $remainingSchedules.Count -or $remainingSelections.Count -or $remainingExclusions.Count) {
        throw "Purge verification failed: $($remainingSchedules.Count) Schedules, $($remainingSiteChecks.Count) Site Checks, $($remainingJobs.Count) Site Check Jobs, $($remainingSelections.Count) manual selections, and $($remainingExclusions.Count) exclusions remain."
    }
    Write-Output "Atomic purge verified: deleted $($schedules.Count) Schedules, $($siteChecks.Count) Site Checks, $($jobs.Count) Site Check Jobs, $($selections.Count) manual selections, and $($exclusions.Count) exclusions."
}

function Invoke-SiteCheckOccurrencePurge {
    param([Parameter(Mandatory)]$Service)

    $jobQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
    $jobQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_jobid', 'gr_sitecheck', 'gr_jobtype'
    )
    $jobQuery.Criteria.FilterOperator = [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    $jobQuery.Criteria.AddCondition(
        'gr_sitecheck', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::NotNull
    )
    $jobQuery.Criteria.AddCondition(
        'gr_jobtype', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, 122830004
    )
    $siteCheckQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_sitecheck')
    $siteCheckQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_sitecheckid')
    $scheduleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_sitecheckschedule')
    $scheduleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckscheduleid', 'gr_activesitecheck'
    )
    $exclusionQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new(
        'gr_sitecheckequipmentexclusion'
    )
    $exclusionQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'gr_sitecheckequipmentexclusionid'
    )

    $jobs = @(Get-AllRecords $Service $jobQuery)
    $siteChecks = @(Get-AllRecords $Service $siteCheckQuery)
    $schedules = @(Get-AllRecords $Service $scheduleQuery)
    $exclusions = @(Get-AllRecords $Service $exclusionQuery)
    $activeSchedules = @($schedules | Where-Object {
        $_.Attributes.ContainsKey('gr_activesitecheck')
    })

    Write-Output "Resolved occurrence purge targets: $($siteChecks.Count) Site Checks, $($jobs.Count) Site Check Jobs, $($exclusions.Count) exclusions, and $($activeSchedules.Count) active Schedule pointers. $($schedules.Count) Schedules will be preserved."
    if (($jobs.Count + $siteChecks.Count + $exclusions.Count + $activeSchedules.Count) -eq 0) {
        Write-Output 'No Site Check occurrences or generated Jobs exist. Nothing was deleted.'
        return
    }

    $transaction = [Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new()
    $transaction.ReturnResponses = $false
    $transaction.Requests = [Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new()
    foreach ($schedule in $activeSchedules) {
        $target = [Microsoft.Xrm.Sdk.Entity]::new('gr_sitecheckschedule', $schedule.Id)
        $target['gr_activesitecheck'] = $null
        $request = [Microsoft.Xrm.Sdk.Messages.UpdateRequest]::new()
        $request.Target = $target
        $transaction.Requests.Add($request)
    }
    foreach ($job in $jobs) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_job', $job.Id)
        $transaction.Requests.Add($request)
    }
    foreach ($exclusion in $exclusions) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new(
            'gr_sitecheckequipmentexclusion', $exclusion.Id
        )
        $transaction.Requests.Add($request)
    }
    foreach ($siteCheck in $siteChecks) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_sitecheck', $siteCheck.Id)
        $transaction.Requests.Add($request)
    }
    $Service.Execute($transaction) | Out-Null

    $remainingJobs = @(Get-AllRecords $Service $jobQuery)
    $remainingSiteChecks = @(Get-AllRecords $Service $siteCheckQuery)
    $remainingSchedules = @(Get-AllRecords $Service $scheduleQuery)
    $remainingExclusions = @(Get-AllRecords $Service $exclusionQuery)
    $remainingActiveSchedules = @($remainingSchedules | Where-Object {
        $_.Attributes.ContainsKey('gr_activesitecheck')
    })
    if ($remainingJobs.Count -or $remainingSiteChecks.Count -or $remainingExclusions.Count `
        -or $remainingActiveSchedules.Count) {
        throw "Occurrence purge verification failed: $($remainingSiteChecks.Count) Site Checks, $($remainingJobs.Count) Site Check Jobs, $($remainingExclusions.Count) exclusions, and $($remainingActiveSchedules.Count) active pointers remain."
    }
    if ($remainingSchedules.Count -ne $schedules.Count) {
        throw "Occurrence purge changed the Schedule count from $($schedules.Count) to $($remainingSchedules.Count)."
    }
    Write-Output "Atomic occurrence purge verified: deleted $($siteChecks.Count) Site Checks, $($jobs.Count) Site Check Jobs, and $($exclusions.Count) exclusions; cleared $($activeSchedules.Count) active pointers; preserved $($remainingSchedules.Count) Schedules."
}

function Get-ChecklistAdminSecurityContracts {
    return [ordered]@{
        AdminRoleName = 'Site Check Checklist Administrator'
        AdminPrivileges = @(
            'prvCreategr_SiteCheckChecklistTemplate',
            'prvReadgr_SiteCheckChecklistTemplate',
            'prvWritegr_SiteCheckChecklistTemplate',
            'prvAppendgr_SiteCheckChecklistTemplate',
            'prvAppendTogr_SiteCheckChecklistTemplate',
            'prvCreategr_SiteCheckChecklistTemplateItem',
            'prvReadgr_SiteCheckChecklistTemplateItem',
            'prvWritegr_SiteCheckChecklistTemplateItem',
            'prvAppendgr_SiteCheckChecklistTemplateItem',
            'prvAppendTogr_SiteCheckChecklistTemplateItem'
        )
        ServiceOperationsRemove = @(
            'prvCreategr_SiteCheckChecklistTemplate',
            'prvWritegr_SiteCheckChecklistTemplate',
            'prvDeletegr_SiteCheckChecklistTemplate',
            'prvAppendgr_SiteCheckChecklistTemplate',
            'prvCreategr_SiteCheckChecklistTemplateItem',
            'prvWritegr_SiteCheckChecklistTemplateItem',
            'prvDeletegr_SiteCheckChecklistTemplateItem',
            'prvAppendgr_SiteCheckChecklistTemplateItem'
        )
        ServiceOperationsRetain = @(
            'prvReadgr_SiteCheckChecklistTemplate',
            'prvAppendTogr_SiteCheckChecklistTemplate',
            'prvReadgr_SiteCheckChecklistTemplateItem',
            'prvAppendTogr_SiteCheckChecklistTemplateItem'
        )
    }
}

function Get-ChecklistAdminUser {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$Email
    )
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuser')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'systemuserid', 'domainname', 'internalemailaddress', 'businessunitid',
        'isdisabled', 'applicationid'
    )
    $match = $query.Criteria.AddFilter([Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or)
    $match.AddCondition(
        'domainname',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $Email
    )
    $match.AddCondition(
        'internalemailaddress',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $Email
    )
    $query.Criteria.AddCondition(
        'isdisabled',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $false
    )
    $query.Criteria.AddCondition(
        'applicationid',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Null
    )
    $users = @($Service.RetrieveMultiple($query).Entities)
    if ($users.Count -ne 1) {
        throw "Expected exactly one enabled human Dataverse user for the approved checklist administrator."
    }
    return $users[0]
}

function Get-RoleByName {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$Name
    )
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'roleid', 'name', 'ismanaged', 'businessunitid'
    )
    $query.Criteria.AddCondition(
        'name',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $Name
    )
    return @($Service.RetrieveMultiple($query).Entities)
}

function Get-PrivilegeMetadataByName {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string[]]$Names
    )
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $filter = $query.Criteria.AddFilter([Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or)
    foreach ($name in ($Names | Sort-Object -Unique)) {
        $filter.AddCondition(
            'name',
            [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
            $name
        )
    }
    $rows = @($Service.RetrieveMultiple($query).Entities)
    foreach ($name in ($Names | Sort-Object -Unique)) {
        if (-not ($rows | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1)) {
            throw "Checklist administrator privilege metadata was not found: $name"
        }
    }
    return $rows
}

function Test-UserRoleAssignment {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][Guid]$UserId,
        [Parameter(Mandatory)][Guid]$RoleId
    )
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuserroles')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('systemuserid', 'roleid')
    $query.Criteria.AddCondition(
        'systemuserid',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $UserId
    )
    $query.Criteria.AddCondition(
        'roleid',
        [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
        $RoleId
    )
    return @($Service.RetrieveMultiple($query).Entities).Count -eq 1
}

function Get-ChecklistAdminSecurityState {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$AdminEmail
    )
    $contracts = Get-ChecklistAdminSecurityContracts
    $user = Get-ChecklistAdminUser -Service $Service -Email $AdminEmail
    $adminRoles = @(Get-RoleByName -Service $Service -Name $contracts.AdminRoleName)
    $serviceRoles = @(Get-RoleByName -Service $Service -Name 'Service Operations')
    if ($serviceRoles.Count -ne 1 -or [bool]$serviceRoles[0].Attributes['ismanaged']) {
        throw 'Expected exactly one unmanaged Service Operations role.'
    }
    $allNames = @(
        $contracts.AdminPrivileges
        $contracts.ServiceOperationsRemove
        $contracts.ServiceOperationsRetain
    )
    $metadata = @(Get-PrivilegeMetadataByName -Service $Service -Names $allNames)
    $summary = {
        param($role, [string[]]$names)
        if (-not $role) { return @() }
        $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
        $request.RoleId = $role.Id
        $grants = @($Service.Execute($request).RolePrivileges)
        return @($names | ForEach-Object {
            $name = $_
            $privilege = $metadata | Where-Object {
                [string]$_.Attributes['name'] -ieq $name
            } | Select-Object -First 1
            $grant = $grants | Where-Object PrivilegeId -EQ $privilege.Id |
                Select-Object -First 1
            [pscustomobject]@{
                Name = $name
                Granted = [bool]$grant
                Depth = if ($grant) { [string]$grant.Depth } else { $null }
            }
        })
    }
    $adminRole = if ($adminRoles.Count -eq 1) { $adminRoles[0] } else { $null }
    return [pscustomobject]@{
        AdminRoleCount = $adminRoles.Count
        AdminRoleManaged = if ($adminRole) {
            [bool]$adminRole.Attributes['ismanaged']
        } else { $null }
        AdminAssignedToApprovedUser = if ($adminRole) {
            Test-UserRoleAssignment -Service $Service -UserId $user.Id -RoleId $adminRole.Id
        } else { $false }
        AdminPrivileges = & $summary $adminRole $contracts.AdminPrivileges
        ServiceOperationsRemovedPrivileges = & $summary $serviceRoles[0] `
            $contracts.ServiceOperationsRemove
        ServiceOperationsRetainedPrivileges = & $summary $serviceRoles[0] `
            $contracts.ServiceOperationsRetain
    }
}

function Assert-ChecklistAdminSecurity {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$AdminEmail
    )
    $state = Get-ChecklistAdminSecurityState -Service $Service -AdminEmail $AdminEmail
    if ($state.AdminRoleCount -ne 1 -or $state.AdminRoleManaged `
        -or -not $state.AdminAssignedToApprovedUser) {
        throw 'Checklist administrator role or assignment verification failed.'
    }
    foreach ($grant in $state.AdminPrivileges) {
        if (-not $grant.Granted -or $grant.Depth -ne 'Global') {
            throw "Checklist administrator privilege verification failed: $($grant.Name)"
        }
    }
    foreach ($grant in $state.ServiceOperationsRemovedPrivileges) {
        if ($grant.Granted) {
            throw "Service Operations still has disallowed checklist mutation privilege: $($grant.Name)"
        }
    }
    foreach ($grant in $state.ServiceOperationsRetainedPrivileges) {
        if (-not $grant.Granted -or $grant.Depth -ne 'Global') {
            throw "Service Operations lost required operational privilege: $($grant.Name)"
        }
    }
    Write-Output 'Checklist administrator role, assignment, and least-privilege boundary verified.'
}

function Invoke-ChecklistAdminSecurityProvisioning {
    param(
        [Parameter(Mandatory)]$Service,
        [Parameter(Mandatory)][string]$AdminEmail
    )
    $contracts = Get-ChecklistAdminSecurityContracts
    $user = Get-ChecklistAdminUser -Service $Service -Email $AdminEmail
    $roles = @(Get-RoleByName -Service $Service -Name $contracts.AdminRoleName)
    if ($roles.Count -gt 1) { throw 'Multiple Checklist Administrator roles already exist.' }
    if (-not $roles.Count) {
        $role = [Microsoft.Xrm.Sdk.Entity]::new('role')
        $role['name'] = $contracts.AdminRoleName
        $role['businessunitid'] = $user.Attributes['businessunitid']
        $roleId = $Service.Create($role)
        $roles = @($Service.Retrieve(
            'role',
            $roleId,
            [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
                'roleid', 'name', 'ismanaged', 'businessunitid'
            )
        ))
        Write-Output 'Created Site Check Checklist Administrator role.'
    }
    $adminRole = $roles[0]
    if ([bool]$adminRole.Attributes['ismanaged']) {
        throw 'Checklist Administrator role must be unmanaged.'
    }
    $serviceRoles = @(Get-RoleByName -Service $Service -Name 'Service Operations')
    if ($serviceRoles.Count -ne 1 -or [bool]$serviceRoles[0].Attributes['ismanaged']) {
        throw 'Expected exactly one unmanaged Service Operations role.'
    }
    $allNames = @(
        $contracts.AdminPrivileges
        $contracts.ServiceOperationsRemove
        $contracts.ServiceOperationsRetain
    )
    $metadata = @(Get-PrivilegeMetadataByName -Service $Service -Names $allNames)

    $adminCurrentRequest = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
    $adminCurrentRequest.RoleId = $adminRole.Id
    $adminCurrent = @($Service.Execute($adminCurrentRequest).RolePrivileges)
    $toAdd = [System.Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach ($name in $contracts.AdminPrivileges) {
        $privilege = $metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1
        $existing = $adminCurrent | Where-Object PrivilegeId -EQ $privilege.Id |
            Select-Object -First 1
        if ($existing) {
            if ($existing.Depth -ne [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global) {
                throw "Checklist Administrator has $name at an incompatible depth."
            }
            continue
        }
        $grant = [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new()
        $grant.PrivilegeId = $privilege.Id
        $grant.Depth = [Microsoft.Crm.Sdk.Messages.PrivilegeDepth]::Global
        $toAdd.Add($grant)
    }
    if ($toAdd.Count) {
        $add = [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new()
        $add.RoleId = $adminRole.Id
        $add.Privileges = $toAdd.ToArray()
        $Service.Execute($add) | Out-Null
        Write-Output "Added $($toAdd.Count) approved Checklist Administrator privileges."
    }

    if (-not (Test-UserRoleAssignment -Service $Service -UserId $user.Id -RoleId $adminRole.Id)) {
        $roleReferences = [Microsoft.Xrm.Sdk.EntityReferenceCollection]::new()
        $roleReferences.Add(
            [Microsoft.Xrm.Sdk.EntityReference]::new('role', $adminRole.Id)
        )
        $Service.Associate(
            'systemuser',
            $user.Id,
            [Microsoft.Xrm.Sdk.Relationship]::new('systemuserroles_association'),
            $roleReferences
        )
        Write-Output 'Assigned Checklist Administrator role to the approved user.'
    }

    $serviceCurrentRequest = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
    $serviceCurrentRequest.RoleId = $serviceRoles[0].Id
    $serviceCurrent = @($Service.Execute($serviceCurrentRequest).RolePrivileges)
    foreach ($name in $contracts.ServiceOperationsRemove) {
        $privilege = $metadata | Where-Object {
            [string]$_.Attributes['name'] -ieq $name
        } | Select-Object -First 1
        if (-not ($serviceCurrent | Where-Object PrivilegeId -EQ $privilege.Id |
            Select-Object -First 1)) { continue }
        $remove = [Microsoft.Crm.Sdk.Messages.RemovePrivilegeRoleRequest]::new()
        $remove.RoleId = $serviceRoles[0].Id
        $remove.PrivilegeId = $privilege.Id
        $Service.Execute($remove) | Out-Null
        Write-Output "Removed $name from Service Operations."
    }
    Assert-ChecklistAdminSecurity -Service $Service -AdminEmail $AdminEmail
}

$toolsPath = Get-PacToolsPath
Import-DataverseAssemblies -ToolsPath $toolsPath

if ($ValidateSdk) {
    $sdkQuery = [Microsoft.Xrm.Sdk.Metadata.Query.EntityQueryExpression]::new()
    $sdkQuery.Properties = New-AllPropertiesExpression
    $sdkQuery.Criteria = [Microsoft.Xrm.Sdk.Metadata.Query.MetadataFilterExpression]::new(
        [Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or
    )
    $sdkQuery.Criteria.Conditions.Add(
        [Microsoft.Xrm.Sdk.Metadata.Query.MetadataConditionExpression]::new(
            'LogicalName',
            [Microsoft.Xrm.Sdk.Metadata.Query.MetadataConditionOperator]::Equals,
            'gr_site'
        )
    )
    $sdkQuery.AttributeQuery = [Microsoft.Xrm.Sdk.Metadata.Query.AttributeQueryExpression]::new()
    $sdkQuery.RelationshipQuery = [Microsoft.Xrm.Sdk.Metadata.Query.RelationshipQueryExpression]::new()
    $sdkQuery.KeyQuery = [Microsoft.Xrm.Sdk.Metadata.Query.EntityKeyQueryExpression]::new()
    [Microsoft.Xrm.Sdk.Messages.RetrieveMetadataChangesRequest]::new().Query = $sdkQuery
    [Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Metadata.DecimalAttributeMetadata]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.InsertOptionValueRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.DeleteEntityKeyRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.RemovePrivilegeRoleRequest]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.RolePrivilege]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.UpdateRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new() | Out-Null
    New-RestrictCascadeConfiguration | Out-Null
    Write-Output 'Site Checks metadata and provisioning SDK types are available. No Dataverse connection was created.'
    return
}

$service = New-DataverseService

Write-Output "Connected once for Site Checks schema mode $Mode`: $($EnvironmentUrl.TrimEnd('/'))"
Write-Output "Login prompt policy: $LoginPrompt"

if ($Mode -eq 'PurgeData') {
    Invoke-SiteChecksDataPurge -Service $service
    return
}
if ($Mode -eq 'PurgeOccurrences') {
    Invoke-SiteCheckOccurrencePurge -Service $service
    return
}

if ($Mode -eq 'Provision') {
    Invoke-SiteChecksProvisioning -Service $service
    Assert-SiteChecksSchema -Service $service
    Write-Output 'Provision mode completed. Run Verify later if either alternate key is still Pending.'
    return
}

if ($Mode -eq 'ProvisionAvailability') {
    Invoke-SiteChecksProvisioning -Service $service
    Assert-SiteChecksSchema -Service $service
    Ensure-SiteChecksSecurityRole -Service $service
    Write-Output 'Availability schema, publishing, structural verification, and approved security grants completed in one connection. Run Verify later if the new alternate key is still Pending.'
    return
}

if ($Mode -eq 'Verify') {
    Assert-SiteChecksSchema -Service $service -RequireActiveKeys
    return
}

if ($Mode -eq 'AuditSecurity') {
    Get-SiteChecksSecurityAudit -Service $service | ConvertTo-Json -Depth 8
    return
}

if ($Mode -eq 'InspectTechnicianAccess') {
    Get-TechnicianAccessPreflight -Service $service | ConvertTo-Json -Depth 12
    return
}

if ($Mode -eq 'ProvisionTechnicianAccess') {
    Invoke-TechnicianAccessProvisioning -Service $service
    return
}

if ($Mode -eq 'InspectChecklist') {
    Get-ChecklistPreflight -Service $service | ConvertTo-Json -Depth 12
    return
}

if ($Mode -eq 'InspectChecklistCorrection') {
    Get-ChecklistCorrectionPreflight -Service $service | ConvertTo-Json -Depth 12
    return
}

if ($Mode -eq 'ProvisionChecklistCorrection') {
    Invoke-ChecklistCorrectionProvisioning -Service $service
    return
}

if ($Mode -eq 'InspectChecklistContent') {
    Get-ChecklistContentPreflight -Service $service | ConvertTo-Json -Depth 12
    return
}

if ($Mode -eq 'ProvisionChecklistContent') {
    Invoke-ChecklistContentProvisioning -Service $service
    return
}

if ($Mode -eq 'ProvisionChecklist') {
    Invoke-ChecklistProvisioning -Service $service
    return
}

if ($Mode -eq 'VerifyChecklist') {
    Assert-ChecklistSchema -Service $service -RequireActiveKeys
    return
}

if ($Mode -eq 'InspectChecklistAdminSecurity') {
    Get-ChecklistAdminSecurityState -Service $service -AdminEmail $ChecklistAdminEmail |
        ConvertTo-Json -Depth 12
    return
}

if ($Mode -eq 'ProvisionChecklistAdminSecurity') {
    Invoke-ChecklistAdminSecurityProvisioning -Service $service `
        -AdminEmail $ChecklistAdminEmail
    return
}

if ($Mode -eq 'VerifyChecklistAdminSecurity') {
    Assert-ChecklistAdminSecurity -Service $service -AdminEmail $ChecklistAdminEmail
    return
}

if ($Mode -eq 'ProvisionSecurity') {
    Ensure-SiteChecksSecurityRole -Service $service
    return
}

$metadata = @(Get-SiteChecksMetadata -Service $service)
$metadataByName = @{}
foreach ($entity in $metadata) { $metadataByName[$entity.LogicalName] = $entity }
$solutionComponentIds = @(Get-SolutionComponentIds -Service $service)

$entitySummary = foreach ($expected in $expectedEntities) {
    $entity = $metadataByName[[string]$expected.LogicalName]
    if ($null -eq $entity) {
        [pscustomobject]@{
            LogicalName = $expected.LogicalName
            Found = $false
            EntitySetName = $null
            OwnershipType = $null
            PrimaryId = $null
            PrimaryName = $null
            InSolution = $false
            MissingRequiredAttributes = @($expected.RequiredAttributes)
            Keys = @()
            ManyToOne = @()
        }
        continue
    }

    $attributeNames = @($entity.Attributes | ForEach-Object LogicalName)
    [pscustomobject]@{
        LogicalName = $entity.LogicalName
        Found = $true
        EntitySetName = $entity.EntitySetName
        OwnershipType = [string]$entity.OwnershipType
        PrimaryId = $entity.PrimaryIdAttribute
        PrimaryName = $entity.PrimaryNameAttribute
        InSolution = $solutionComponentIds -contains $entity.MetadataId
        MissingRequiredAttributes = @($expected.RequiredAttributes | Where-Object {
            $attributeNames -notcontains $_
        })
        Keys = @($entity.Keys | ForEach-Object {
            [pscustomobject]@{
                LogicalName = $_.LogicalName
                KeyAttributes = @($_.KeyAttributes)
            }
        })
        ManyToOne = @($entity.ManyToOneRelationships | ForEach-Object {
            [pscustomobject]@{
                SchemaName = $_.SchemaName
                ReferencingAttribute = $_.ReferencingAttribute
                ReferencedEntity = $_.ReferencedEntity
                NavigationProperty = $_.ReferencingEntityNavigationPropertyName
                DeleteBehavior = [string]$_.CascadeConfiguration.Delete
            }
        })
    }
}

$choiceSummary = foreach ($choice in $choiceAttributes) {
    $entity = $metadataByName[[string]$choice.Entity]
    if ($null -eq $entity) {
        [pscustomobject]@{
            Entity = $choice.Entity
            Attribute = $choice.Attribute
            Found = $false
            IsGlobal = $null
            OptionSetName = $null
            Options = @()
        }
    } else {
        Get-ChoiceSummary -Entity $entity -AttributeName $choice.Attribute
    }
}

$result = [ordered]@{
    Mode = $Mode
    EnvironmentUrl = $EnvironmentUrl.TrimEnd('/')
    SolutionUniqueName = $SolutionUniqueName
    RequestPlan = [ordered]@{
        Connections = 1
        MetadataRequests = 1
        SolutionQueries = 2
        DataProfileRequests = if ($IncludeDataProfile) { 1 } else { 0 }
    }
    Entities = @($entitySummary)
    Choices = @($choiceSummary)
    MaximumEquipmentPerSite = if ($IncludeDataProfile) {
        Get-MaximumEquipmentPerSite -Service $service
    } else {
        $null
    }
}

$result | ConvertTo-Json -Depth 12
