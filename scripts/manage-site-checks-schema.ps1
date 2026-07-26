param(
    [ValidateSet('Inspect', 'Provision', 'Verify', 'AuditSecurity', 'ProvisionSecurity', 'PurgeData')]
    [string]$Mode = 'Inspect',

    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',

    [string]$SolutionUniqueName = 'ServiceOperationsNew',

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
)

$choiceAttributes = @(
    @{ Entity = 'gr_equipment'; Attribute = 'gr_ownershiptype' },
    @{ Entity = 'gr_job'; Attribute = 'gr_jobtype' },
    @{ Entity = 'gr_job'; Attribute = 'gr_status' },
    @{ Entity = 'gr_job'; Attribute = 'gr_jobcardstatus' }
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

    Ensure-Table $Service 'gr_SiteCheckSchedule' 'Site Check Schedule' 'Site Check Schedules' `
        'Recurring Site Check configuration for one Site.'
    Ensure-Table $Service 'gr_SiteCheck' 'Site Check' 'Site Checks' `
        'One occurrence of a recurring Site Check.'
    Ensure-Table $Service 'gr_SiteCheckScheduleEquipment' 'Site Check Schedule Equipment' `
        'Site Check Schedule Equipment' `
        'One manually selected Equipment record for a Site Check Schedule.'

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

    Ensure-JobType $Service
    Publish-SiteChecksSchema $Service

    Ensure-Key $Service 'gr_sitecheckschedule' 'gr_SiteCheckSchedule_Site_Key' `
        'Site Check Schedule Site Key' @('gr_site')
    Ensure-Key $Service 'gr_sitecheck' 'gr_SiteCheck_CreationRequestKey_Key' `
        'Site Check Creation Request Key' @('gr_creationrequestkey')
    Ensure-Key $Service 'gr_sitecheckscheduleequipment' `
        'gr_SiteCheckScheduleEquipment_ScheduleEquipment_Key' `
        'Site Check Schedule Equipment Key' @('gr_sitecheckschedule', 'gr_equipment')
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

    $schedule = Get-EntityMetadata $Service 'gr_sitecheckschedule'
    $siteCheck = Get-EntityMetadata $Service 'gr_sitecheck'
    $scheduleEquipment = Get-EntityMetadata $Service 'gr_sitecheckscheduleequipment'
    if ($null -eq $schedule -or $null -eq $siteCheck -or $null -eq $scheduleEquipment) {
        throw 'Site Check Schedule, Site Check, and Site Check Schedule Equipment tables must exist.'
    }
    foreach ($entity in @($schedule, $siteCheck, $scheduleEquipment)) {
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
        @{ Entity = 'gr_sitecheckscheduleequipment'; Name = 'gr_sitecheckschedule'; Type = 'Lookup' },
        @{ Entity = 'gr_sitecheckscheduleequipment'; Name = 'gr_equipment'; Type = 'Lookup' },
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

    $jobs = @(Get-AllRecords $Service $jobQuery)
    $siteChecks = @(Get-AllRecords $Service $siteCheckQuery)
    $schedules = @(Get-AllRecords $Service $scheduleQuery)
    $selections = @(Get-AllRecords $Service $selectionQuery)
    $activeSchedules = @($schedules | Where-Object {
        $_.Attributes.ContainsKey('gr_activesitecheck')
    })

    Write-Output "Resolved purge targets: $($schedules.Count) Schedules, $($siteChecks.Count) Site Checks, $($jobs.Count) Site Check Jobs, $($selections.Count) manual selections; $($activeSchedules.Count) active pointers."
    if (($jobs.Count + $siteChecks.Count + $schedules.Count + $selections.Count) -eq 0) {
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
    if ($remainingJobs.Count -or $remainingSiteChecks.Count -or
        $remainingSchedules.Count -or $remainingSelections.Count) {
        throw "Purge verification failed: $($remainingSchedules.Count) Schedules, $($remainingSiteChecks.Count) Site Checks, $($remainingJobs.Count) Site Check Jobs, and $($remainingSelections.Count) manual selections remain."
    }
    Write-Output "Atomic purge verified: deleted $($schedules.Count) Schedules, $($siteChecks.Count) Site Checks, $($jobs.Count) Site Check Jobs, and $($selections.Count) manual selections."
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
    [Microsoft.Xrm.Sdk.Messages.InsertOptionValueRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new() | Out-Null
    [Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new() | Out-Null
    [Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new() | Out-Null
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

if ($Mode -eq 'Provision') {
    Invoke-SiteChecksProvisioning -Service $service
    Assert-SiteChecksSchema -Service $service
    Write-Output 'Provision mode completed. Run Verify later if either alternate key is still Pending.'
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
