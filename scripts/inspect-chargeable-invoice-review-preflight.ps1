param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [switch]$ValidateDefinition
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$proposedTables = @(
    'gr_chargeableinvoicereview',
    'gr_chargeableinvoicerevision',
    'gr_chargeableinvoiceline',
    'gr_chargeableinvoicecorrection',
    'gr_chargeableinvoicedocument',
    'gr_chargeableinvoiceactivity'
)

$existingContracts = @(
    @{ LogicalName = 'gr_job'; Attributes = @('gr_jobid', 'gr_jobnumber', 'gr_site', 'gr_equipment', 'gr_contact', 'gr_mechanic', 'gr_status') },
    @{ LogicalName = 'gr_customer'; Attributes = @('gr_customerid', 'gr_name') },
    @{ LogicalName = 'gr_site'; Attributes = @('gr_siteid', 'gr_name', 'gr_address', 'gr_customer') },
    @{ LogicalName = 'gr_equipment'; Attributes = @('gr_equipmentid', 'gr_fleet', 'gr_make', 'gr_model', 'gr_serial', 'gr_site') },
    @{ LogicalName = 'gr_contact'; Attributes = @('gr_contactid', 'gr_name', 'gr_email', 'gr_phone') },
    @{ LogicalName = 'gr_sitecontact'; Attributes = @('gr_sitecontactid', 'gr_site', 'gr_contact') },
    @{ LogicalName = 'gr_mechanic'; Attributes = @('gr_mechanicid', 'gr_name', 'gr_email', 'statecode', 'statuscode') }
)

$proposedRelationships = @(
    'gr_job_chargeableinvoicereviews',
    'gr_customer_chargeableinvoicereviews',
    'gr_site_chargeableinvoicereviews',
    'gr_equipment_chargeableinvoicereviews',
    'gr_chargeableinvoicereview_revisions',
    'gr_chargeableinvoicereview_lines',
    'gr_chargeableinvoicereview_corrections',
    'gr_chargeableinvoicereview_documents',
    'gr_chargeableinvoicereview_activities',
    'gr_mechanic_chargeableinvoicephotorequests'
)

if (($proposedTables | Sort-Object -Unique).Count -ne $proposedTables.Count) {
    throw 'Proposed table names are not unique.'
}
if (($proposedRelationships | Sort-Object -Unique).Count -ne $proposedRelationships.Count) {
    throw 'Proposed relationship names are not unique.'
}
foreach ($name in @($proposedTables) + @($proposedRelationships)) {
    if (-not $name.StartsWith('gr_')) { throw "Unexpected publisher prefix: $name" }
}

if ($ValidateDefinition) {
    Write-Output 'Chargeable Invoice Review preflight definition is valid. No Dataverse connection was created.'
    return
}

function Get-PacToolsPath {
    $pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $tools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $tools) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $tools
}

foreach ($assembly in @('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll')) {
    [Reflection.Assembly]::LoadFrom((Join-Path (Get-PacToolsPath) $assembly)) | Out-Null
}

$connectionString = @(
    'AuthType=OAuth',
    "Url=$($EnvironmentUrl.TrimEnd('/'))",
    'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d',
    'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97',
    "LoginPrompt=$LoginPrompt"
) -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) {
    $advice = if ($LoginPrompt -eq 'Never') { ' No cached session was used; do not retry with Auto without explicit approval.' } else { '' }
    throw "Dataverse sign-in failed: $($service.LastCrmError).$advice"
}

function Get-EntityMetadata([string]$LogicalName) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $LogicalName
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    $request.RetrieveAsIfPublished = $true
    try {
        return $service.Execute($request).EntityMetadata
    } catch [System.ServiceModel.FaultException[Microsoft.Xrm.Sdk.OrganizationServiceFault]] {
        if ($_.Exception.Detail.ErrorCode -eq -2147220969) { return $null }
        throw
    }
}

function Test-Relationship([string]$SchemaName) {
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveRelationshipRequest]::new()
    $request.Name = $SchemaName
    $request.RetrieveAsIfPublished = $true
    try {
        $service.Execute($request) | Out-Null
        return $true
    } catch [System.ServiceModel.FaultException[Microsoft.Xrm.Sdk.OrganizationServiceFault]] {
        if ($_.Exception.Detail.ErrorCode -eq -2147220969) { return $false }
        throw
    }
}

function Get-RoleSummary([string]$RoleName) {
    $roleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $roleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid', 'name', 'ismanaged')
    $roleQuery.Criteria.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $RoleName)
    $roles = @($service.RetrieveMultiple($roleQuery).Entities)
    return [ordered]@{
        Name = $RoleName
        Count = $roles.Count
        Roles = @($roles | ForEach-Object {
            [ordered]@{ RoleId = $_.Id; IsManaged = [bool]$_.Attributes['ismanaged'] }
        })
    }
}

function Get-RelevantServiceOperationsPrivileges {
    $roleQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role')
    $roleQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid', 'name', 'ismanaged')
    $roleQuery.Criteria.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, 'Service Operations')
    $roles = @($service.RetrieveMultiple($roleQuery).Entities | Where-Object { -not [bool]$_.Attributes['ismanaged'] })

    $privilegeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege')
    $privilegeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name')
    $filter = $privilegeQuery.Criteria.AddFilter([Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or)
    foreach ($pattern in @('%gr_Job', '%gr_Customer', '%gr_Site', '%gr_Equipment', '%gr_Contact', '%gr_SiteContact', '%gr_Mechanic')) {
        $filter.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Like, $pattern)
    }
    $privileges = @($service.RetrieveMultiple($privilegeQuery).Entities)
    $names = @{}
    foreach ($privilege in $privileges) { $names[$privilege.Id] = [string]$privilege.Attributes['name'] }

    return @($roles | ForEach-Object {
        $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
        $request.RoleId = $_.Id
        [ordered]@{
            RoleId = $_.Id
            Grants = @($service.Execute($request).RolePrivileges | Where-Object { $names.ContainsKey($_.PrivilegeId) } | ForEach-Object {
                [ordered]@{ Name = $names[$_.PrivilegeId]; Depth = [string]$_.Depth }
            } | Sort-Object Name)
        }
    })
}

$solutionQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('solution')
$solutionQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('solutionid', 'uniquename', 'friendlyname', 'ismanaged')
$solutionQuery.Criteria.AddCondition('uniquename', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $SolutionUniqueName)
$solutions = @($service.RetrieveMultiple($solutionQuery).Entities)

$existing = @($existingContracts | ForEach-Object {
    $definition = $_
    $metadata = Get-EntityMetadata $definition.LogicalName
    [ordered]@{
        LogicalName = $definition.LogicalName
        Found = $null -ne $metadata
        EntitySetName = if ($metadata) { $metadata.EntitySetName } else { $null }
        OwnershipType = if ($metadata) { [string]$metadata.OwnershipType } else { $null }
        IsActivity = if ($metadata) { [bool]$metadata.IsActivity } else { $null }
        MissingAttributes = if ($metadata) {
            @($definition.Attributes | Where-Object { $metadata.Attributes.LogicalName -notcontains $_ })
        } else { @($definition.Attributes) }
    }
})

$organizationQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('organization')
$organizationQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('organizationid', 'maxuploadfilesize')
$organizations = @($service.RetrieveMultiple($organizationQuery).Entities)

$result = [ordered]@{
    EnvironmentUrl = $EnvironmentUrl
    LoginPrompt = $LoginPrompt
    Solution = [ordered]@{
        UniqueName = $SolutionUniqueName
        Count = $solutions.Count
        IsManaged = if ($solutions.Count -eq 1) { [bool]$solutions[0].Attributes['ismanaged'] } else { $null }
    }
    ExistingContracts = $existing
    ProposedTableCollisions = @($proposedTables | ForEach-Object {
        [ordered]@{ LogicalName = $_; Exists = $null -ne (Get-EntityMetadata $_) }
    })
    ProposedRelationshipCollisions = @($proposedRelationships | ForEach-Object {
        [ordered]@{ SchemaName = $_; Exists = Test-Relationship $_ }
    })
    Security = [ordered]@{
        ServiceOperations = Get-RoleSummary 'Service Operations'
        ProposedManagerRole = Get-RoleSummary 'Chargeable Invoice Manager'
        ServiceOperationsRelevantGrants = Get-RelevantServiceOperationsPrivileges
    }
    FileStorage = [ordered]@{
        OrganizationCount = $organizations.Count
        MaximumUploadBytes = if ($organizations.Count -eq 1) { [int]$organizations[0].Attributes['maxuploadfilesize'] } else { $null }
    }
    Notes = @(
        'No business rows, user names, email addresses, documents, or file content were retrieved.',
        'No metadata, privileges, role assignments, solution components, or data were changed.',
        'One Dataverse connection was used with the requested login-prompt policy.'
    )
}

$result | ConvertTo-Json -Depth 12
