param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Read-only readiness audit. This script contains no create, update, publish, role-grant,
# assignment, registration or business-data mutation operation.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repository 'dataverse\job-registration\readiness-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$findings = [Collections.Generic.List[object]]::new()
$entityCache = @{}
$attributeCache = @{}

function Add-Finding([string]$Area, [string]$Item, [string]$Status, [string]$Detail) {
    $findings.Add([pscustomobject]@{ Area=$Area; Item=$Item; Status=$Status; Detail=$Detail })
}
function Same-Set([object[]]$Left, [object[]]$Right) {
    (@($Left | ForEach-Object { [string]$_ } | Sort-Object -Unique) -join '|') -eq
        (@($Right | ForEach-Object { [string]$_ } | Sort-Object -Unique) -join '|')
}
function Read-OptionValue($Value) {
    if ($Value -is [Microsoft.Xrm.Sdk.OptionSetValue]) { return [int]$Value.Value }
    return [int]$Value
}
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
function Get-EntityMetadata($Service, [string]$Name) {
    if ($entityCache.ContainsKey($Name)) { return $entityCache[$Name] }
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
    $request.LogicalName = $Name
    $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    $request.RetrieveAsIfPublished = $true
    try { $entityCache[$Name] = $Service.Execute($request).EntityMetadata }
    catch { $entityCache[$Name] = $null }
    $entityCache[$Name]
}
function Get-AttributeMetadata($Service, [string]$Table, [string]$Name) {
    $key = "$Table.$Name"
    if ($attributeCache.ContainsKey($key)) { return $attributeCache[$key] }
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName = $Table
    $request.LogicalName = $Name
    $request.RetrieveAsIfPublished = $true
    try { $attributeCache[$key] = $Service.Execute($request).AttributeMetadata }
    catch { $attributeCache[$key] = $null }
    $attributeCache[$key]
}
function Find-Exactly($Service, [string]$Table, [string]$Column, [string]$Value, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.Criteria.AddCondition($Column, [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Value)
    @($Service.RetrieveMultiple($query).Entities)
}
function Read-ChildNames($Service, [string]$Table, [guid]$ApiId) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('uniquename')
    $query.Criteria.AddCondition('customapiid', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $ApiId)
    @($Service.RetrieveMultiple($query).Entities | ForEach-Object { [string]$_['uniquename'] } | Sort-Object)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $who = $service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    Add-Finding 'Connection' $EnvironmentUrl 'Pass' "WhoAmI $($who.UserId)"

    $solutions = @(Find-Exactly $service 'solution' 'uniquename' $SolutionUniqueName @('solutionid','uniquename','ismanaged'))
    if ($solutions.Count -eq 1 -and -not [bool]$solutions[0]['ismanaged']) { Add-Finding 'Solution' $SolutionUniqueName 'Pass' 'One unmanaged solution found.' }
    else { Add-Finding 'Solution' $SolutionUniqueName 'Fail' "Expected one unmanaged solution; found $($solutions.Count)." }

    $assemblies = @(Find-Exactly $service 'pluginassembly' 'name' 'ServiceOperations.UnifiedJobWorkflow' @('pluginassemblyid','name','version','publickeytoken','isolationmode','content'))
    if ($assemblies.Count -eq 1) {
        $content = if ($assemblies[0].Attributes.ContainsKey('content')) { [string]$assemblies[0]['content'] } else { '' }
        $hash = if ($content) {
            $sha = [Security.Cryptography.SHA256]::Create()
            try { ([BitConverter]::ToString($sha.ComputeHash([Convert]::FromBase64String($content)))).Replace('-', '').ToLowerInvariant() }
            finally { $sha.Dispose() }
        } else { '(content unavailable)' }
        Add-Finding 'Plugin assembly' 'ServiceOperations.UnifiedJobWorkflow' 'Review' "Version $($assemblies[0]['version']); token $($assemblies[0]['publickeytoken']); SHA-256 $hash."
    } else {
        Add-Finding 'Plugin assembly' 'ServiceOperations.UnifiedJobWorkflow' 'Missing' "Expected one assembly; found $($assemblies.Count)."
    }

    foreach ($column in $manifest.columns) {
        $attribute = Get-AttributeMetadata $service $column.table $column.name
        $item = "$($column.table).$($column.name)"
        if (-not $attribute) { Add-Finding 'Schema' $item 'Missing' 'Column is not present.'; continue }
        if ([string]$attribute.AttributeType -ne [string]$column.type) { Add-Finding 'Schema' $item 'Conflict' "Type is $($attribute.AttributeType); expected $($column.type)."; continue }
        $minimumLength = $column.PSObject.Properties['minimumLength']
        $target = $column.PSObject.Properties['target']
        if ($minimumLength -and [int]$attribute.MaxLength -lt [int]$minimumLength.Value) { Add-Finding 'Schema' $item 'Conflict' "Length is $($attribute.MaxLength); expected at least $($minimumLength.Value)."; continue }
        if ($target -and @($attribute.Targets) -notcontains [string]$target.Value) { Add-Finding 'Schema' $item 'Conflict' "Lookup does not target $($target.Value)."; continue }
        Add-Finding 'Schema' $item 'Pass' 'Column contract matches.'
    }

    $jobMetadata = Get-EntityMetadata $service 'gr_job'
    if ($jobMetadata -and [bool]$jobMetadata.IsOptimisticConcurrencyEnabled) { Add-Finding 'Invariant' 'gr_job optimistic concurrency' 'Pass' 'Enabled.' }
    else { Add-Finding 'Invariant' 'gr_job optimistic concurrency' 'Fail' 'Not enabled or table unavailable.' }
    foreach ($table in $manifest.regionalTables) {
        $metadata = Get-EntityMetadata $service $table
        if ($metadata -and [bool]$metadata.IsOptimisticConcurrencyEnabled) { Add-Finding 'Invariant' "$table optimistic concurrency" 'Pass' 'Enabled.' }
        else { Add-Finding 'Invariant' "$table optimistic concurrency" 'Fail' 'Required by atomic registered-entry Void; not enabled or table unavailable.' }
        $stage = Get-AttributeMetadata $service $table 'gr_stage'
        $registeredStage = [int]$manifest.registeredStage
        $option = @(if ($stage -and $stage.OptionSet) { $stage.OptionSet.Options | Where-Object { $_.Value -eq $registeredStage } })
        if ($option.Count -eq 1) { Add-Finding 'Schema' "$table.gr_stage Registered" 'Pass' "Choice $($manifest.registeredStage) exists." }
        else { Add-Finding 'Schema' "$table.gr_stage Registered" 'Missing' "Choice $($manifest.registeredStage) is absent." }
    }
    foreach ($numberContract in $manifest.regionalNumberContracts) {
        $attribute = Get-AttributeMetadata $service $numberContract.table 'gr_jobnumber'
        $actualFormat = if ($attribute -and $attribute.PSObject.Properties['AutoNumberFormat']) { [string]$attribute.AutoNumberFormat } else { '' }
        if ($actualFormat -eq [string]$numberContract.autoNumberFormat) { Add-Finding 'Regional sequence' "$($numberContract.book) AutoNumber format" 'Pass' $actualFormat }
        else { Add-Finding 'Regional sequence' "$($numberContract.book) AutoNumber format" 'Conflict' "Expected $($numberContract.autoNumberFormat); found $actualFormat." }
        $metadata = Get-EntityMetadata $service $numberContract.table
        $keys = @(if ($metadata) { $metadata.Keys | Where-Object { $_.LogicalName -eq [string]$numberContract.key } })
        if ($keys.Count -eq 1 -and [string]$keys[0].EntityKeyIndexStatus -eq 'Active' -and (Same-Set @($keys[0].KeyAttributes) @('gr_jobnumber'))) {
            Add-Finding 'Regional sequence' "$($numberContract.book) number key" 'Pass' 'Active unique Job-number key.'
        } else {
            $detail = if ($keys.Count -eq 1) { "Status $($keys[0].EntityKeyIndexStatus); attributes $(@($keys[0].KeyAttributes) -join ',')." } else { "Expected one key; found $($keys.Count)." }
            Add-Finding 'Regional sequence' "$($numberContract.book) number key" 'Conflict' $detail
        }
    }

    $privileges = @{}
    $privilegeIds = @{}
    foreach ($api in $manifest.customApis) { $privileges[[string]$api.executePrivilege] = $true }
    foreach ($name in $privileges.Keys) {
        $rows = @(Find-Exactly $service 'privilege' 'name' $name @('privilegeid','name'))
        if ($rows.Count -eq 1) { $privilegeIds[$name] = $rows[0].Id; Add-Finding 'Privilege' $name 'Pass' 'Generated privilege exists.' }
        else { Add-Finding 'Privilege' $name 'Fail' "Expected one generated privilege; found $($rows.Count)." }
    }

    foreach ($api in $manifest.customApis) {
        $rows = @(Find-Exactly $service 'customapi' 'uniquename' $api.name @('customapiid','uniquename','isfunction','bindingtype','allowedcustomprocessingsteptype','executeprivilegename','plugintypeid'))
        if ($rows.Count -ne 1) { Add-Finding 'Custom API' $api.name 'Missing' "Expected one API; found $($rows.Count)."; continue }
        $row = $rows[0]
        $problems = [Collections.Generic.List[string]]::new()
        if ([bool]$row['isfunction']) { $problems.Add('isfunction must be false') }
        if ((Read-OptionValue $row['bindingtype']) -ne 0) { $problems.Add('binding must be Global') }
        if ((Read-OptionValue $row['allowedcustomprocessingsteptype']) -ne 0) { $problems.Add('custom processing steps must be disabled') }
        if ([string]$row['executeprivilegename'] -ne [string]$api.executePrivilege) { $problems.Add('ExecutePrivilegeName mismatch') }
        $pluginReference = if ($row.Attributes.ContainsKey('plugintypeid')) { [Microsoft.Xrm.Sdk.EntityReference]$row['plugintypeid'] } else { $null }
        if (-not $pluginReference) { $problems.Add('plugin type is missing') }
        else {
            $plugin = $service.Retrieve('plugintype', $pluginReference.Id, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('typename'))
            if ([string]$plugin['typename'] -ne [string]$api.pluginType) { $problems.Add('plugin type mismatch') }
        }
        $requestNames = Read-ChildNames $service 'customapirequestparameter' $row.Id
        $responseNames = Read-ChildNames $service 'customapiresponseproperty' $row.Id
        $expectedRequestNames = @($api.requests | Sort-Object)
        $expectedResponseNames = @($api.responses | Sort-Object)
        if (($requestNames -join ',') -ne ($expectedRequestNames -join ',')) {
            $problems.Add("request parameter set mismatch (actual: $($requestNames -join ', '); expected: $($expectedRequestNames -join ', '))")
        }
        if (($responseNames -join ',') -ne ($expectedResponseNames -join ',')) {
            $problems.Add("response property set mismatch (actual: $($responseNames -join ', '); expected: $($expectedResponseNames -join ', '))")
        }
        if ($problems.Count) { Add-Finding 'Custom API' $api.name 'Conflict' ($problems -join '; ') }
        else { Add-Finding 'Custom API' $api.name 'Pass' 'API, privilege, plugin and parameter sets match.' }
    }

    foreach ($role in $manifest.roles) {
        $rows = @(Find-Exactly $service 'role' 'name' $role.name @('roleid','name','businessunitid','ismanaged'))
        $status = if ($rows.Count) { 'Review' } else { 'Missing' }
        Add-Finding 'Role' $role.profile $status "$($role.name): $($rows.Count) business-unit role record(s); planned state $($role.state)."
        $allowedNames = @($manifest.customApis | Where-Object { @($role.allowedApis) -contains $_.name } | ForEach-Object executePrivilege | Sort-Object -Unique)
        $forbiddenNames = @($manifest.customApis | Where-Object { @($role.allowedApis) -notcontains $_.name } | ForEach-Object executePrivilege | Sort-Object -Unique | Where-Object { $allowedNames -notcontains $_ })
        foreach ($roleRow in $rows) {
            $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new()
            $request.RoleId = $roleRow.Id
            $held = @($service.Execute($request).RolePrivileges | ForEach-Object { $_.PrivilegeId })
            $missing = @($allowedNames | Where-Object { -not $privilegeIds.ContainsKey($_) -or $held -notcontains $privilegeIds[$_] })
            $forbidden = @($forbiddenNames | Where-Object { $privilegeIds.ContainsKey($_) -and $held -contains $privilegeIds[$_] })
            if ($missing.Count -or $forbidden.Count) {
                Add-Finding 'Role API gate' $role.profile 'Conflict' "Missing: $($missing -join ', '); forbidden present: $($forbidden -join ', ')."
            } else { Add-Finding 'Role API gate' $role.profile 'Pass' 'Required API privileges present and coordinator-only privileges absent.' }
        }
    }

    foreach ($blocker in $manifest.activationBlockers) { Add-Finding 'Activation gate' 'Required before enablement' 'Blocked' ([string]$blocker) }
    $findings | Sort-Object Area, Item | Format-Table -AutoSize -Wrap
    $notReady = @($findings | Where-Object Status -in @('Missing','Conflict','Fail','Blocked'))
    Write-Output "Read-only readiness audit completed: $($findings.Count) checks; $($notReady.Count) not ready. No changes were made."
    if ($notReady.Count) { exit 2 }
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
