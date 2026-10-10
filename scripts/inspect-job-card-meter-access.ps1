param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [Guid]$ApplicationId = [Guid]::Empty,
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')][string]$LoginPrompt = 'Never',
    [switch]$ValidateDefinition
)
# Read-only preflight. No tokens, secrets, business records or mutation requests are emitted.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repository = Split-Path -Parent $PSScriptRoot
$definition = Get-Content -LiteralPath (Join-Path $repository 'dataverse\access\job-card-meter-writer.json') -Raw | ConvertFrom-Json
$deployment = Get-Content -LiteralPath (Join-Path $repository 'dataverse\job-registration\deployment-plan.json') -Raw | ConvertFrom-Json
function Require([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
Require (-not $definition.featureEnableIncluded -and $null -eq $definition.baselineRole) 'Meter policy must not activate or inherit a broad baseline.'
Require (@($definition.privileges).Count -eq 6 -and @($definition.privileges | Group-Object name | Where-Object Count -ne 1).Count -eq 0) 'Expected six distinct meter privileges.'
Require (@($definition.privileges | Where-Object { $_.name -match '^prv(Create|Delete|Assign|Share|Append|ActOnBehalf)' }).Count -eq 0) 'Prohibited meter privilege.'
if ($ValidateDefinition) { Write-Output 'Meter writer definition valid. No connection or mutation.'; return }
$toolsRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$sdkPath = Get-ChildItem -LiteralPath $toolsRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' | Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'tools' } | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
Require ([bool]$sdkPath) 'Power Apps SDK not found.'
foreach ($dll in 'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll') { [Reflection.Assembly]::LoadFrom((Join-Path $sdkPath $dll)) | Out-Null }
$connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
if ($UserName) { Require ($UserName -match '^[^;\s@]+@[^;\s@]+$') 'Invalid account hint.'; $connection += ";UserName=$UserName" }
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
Require $service.IsReady "Dataverse sign-in failed: $($service.LastCrmError)"
function Find-Rows([string]$Table, [string[]]$Columns, [string]$Key, $Value) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.Criteria.AddCondition($Key, [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Value)
    $result = $service.RetrieveMultiple($query)
    Require (-not $result.MoreRecords) "Incomplete $Table result; do not infer least privilege."
    @($result.Entities)
}
try {
    $roles = @(Find-Rows 'role' @('roleid','name') 'name' ([string]$definition.roleName))
    Require ($roles.Count -le 1) 'Duplicate meter-writer role; resolve exact identity before configuration.'
    $report = [ordered]@{ roleExists=($roles.Count -eq 1); roleId=$null; privilegeMatch=$false; applicationUserVerified=$false; exclusiveRole=$false; guardVersion=$null; guardStepCount=0; guardIdentityMatch=$false; mutationsPerformed=$false }
    $roleId = [Guid]::Empty
    if ($roles.Count) {
        $roleId = $roles[0].Id; $report.roleId = $roleId
        $request = [Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new(); $request.RoleId = $roleId
        $privileges = @($service.Execute($request).RolePrivileges)
        $actual = @($privileges | ForEach-Object {
            $metadata = $service.Retrieve('privilege', $_.PrivilegeId, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
            "$( $metadata['name'] ):$($_.Depth)".Replace(' ','')
        } | Sort-Object)
        $expected = @($definition.privileges | ForEach-Object { "$($_.name):$($_.depth)" } | Sort-Object)
        $report.privilegeMatch = ($actual -join ',') -ceq ($expected -join ',')
        $report.rolePrivileges = $actual
    }
    $users = @()
    if ($ApplicationId -ne [Guid]::Empty) { $users = @(Find-Rows 'systemuser' @('systemuserid','applicationid','isdisabled') 'applicationid' $ApplicationId) }
    Require ($users.Count -le 1) 'Duplicate application user.'
    if ($users.Count) {
        $user = $users[0]
        $report.applicationUserId = $user.Id
        $report.applicationUserVerified = $user.Attributes.Contains('isdisabled') -and -not [bool]$user['isdisabled']
        $direct = @(Find-Rows 'systemuserroles' @('roleid') 'systemuserid' $user.Id)
        $teamQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('teamroles'); $teamQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid')
        $teamQuery.AddLink('teammembership','teamid','teamid').LinkCriteria.AddCondition('systemuserid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$user.Id)
        $teamResult = $service.RetrieveMultiple($teamQuery); Require (-not $teamResult.MoreRecords) 'Incomplete team-role result.'
        $held = @(@($direct) + @($teamResult.Entities) | ForEach-Object { [string]$_['roleid'] } | Sort-Object -Unique)
        $report.exclusiveRole = $held.Count -eq 1 -and $held[0] -eq $roleId.ToString()
        $report.effectiveRoleIds = $held
        if ($roleId -ne [Guid]::Empty) {
            $assignments = @(Find-Rows 'systemuserroles' @('systemuserid') 'roleid' $roleId)
            $teamAssignments = @(Find-Rows 'teamroles' @('teamid') 'roleid' $roleId)
            $report.exclusiveRole = $report.exclusiveRole -and $assignments.Count -eq 1 -and $assignments[0]['systemuserid'] -eq $user.Id -and $teamAssignments.Count -eq 0
        }
    }
    $types = @(Find-Rows 'plugintype' @('plugintypeid','pluginassemblyid') 'typename' 'ServiceOperations.Access.RestrictedAccessPlugin')
    Require ($types.Count -le 1) 'Multiple access guard types.'
    if ($types.Count) {
        $assembly = $service.Retrieve('pluginassembly',$types[0]['pluginassemblyid'].Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('version','publickeytoken'))
        $report.guardVersion = [string]$assembly['version']
        $steps = @(Find-Rows 'sdkmessageprocessingstep' @('name','stage','mode','statecode','filteringattributes','impersonatinguserid','sdkmessageprocessingstepsecureconfigid','sdkmessageid','sdkmessagefilterid') 'plugintypeid' $types[0].Id)
        $report.guardStepCount = $steps.Count
        $matching = 0
        $registrations = @()
        foreach ($step in $steps) {
            $message = $service.Retrieve('sdkmessage',$step['sdkmessageid'].Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
            $filter = $service.Retrieve('sdkmessagefilter',$step['sdkmessagefilterid'].Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('primaryobjecttypecode'))
            $registrations += "$($message['name']):$($filter['primaryobjecttypecode'])"
            if (-not $step.Attributes.Contains('sdkmessageprocessingstepsecureconfigid')) { continue }
            $config = $service.Retrieve('sdkmessageprocessingstepsecureconfig',$step['sdkmessageprocessingstepsecureconfigid'].Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('secureconfig'))
            $settings = @{}
            foreach ($part in ([string]$config['secureconfig']).Split(';')) {
                $pair = $part.Split('='); Require ($pair.Count -eq 2 -and -not $settings.ContainsKey($pair[0])) 'Malformed guard configuration.'
                $settings[$pair[0]] = $pair[1]
            }
            if ($users.Count -eq 1 -and $settings['meterrole'] -eq $roleId.ToString() -and $settings['meteruser'] -eq $users[0].Id.ToString() -and $settings['meterapplication'] -eq $ApplicationId.ToString() -and
                [int]$step['stage'].Value -eq 20 -and [int]$step['mode'].Value -eq 0 -and [int]$step['statecode'].Value -eq 0 -and
                -not $step.Attributes.Contains('impersonatinguserid') -and (-not $step.Attributes.Contains('filteringattributes') -or -not [string]$step['filteringattributes'])) { $matching++ }
        }
        $expectedRegistrations = @($deployment.guardSteps[1].registrations | ForEach-Object { $registration=$_; $registration.tables | ForEach-Object { "$($registration.message):$_" } })
        $registrationMatch = (@($registrations | Sort-Object) -join ',') -ceq (@($expectedRegistrations | Sort-Object) -join ',')
        $report.guardIdentityMatch = $steps.Count -eq 14 -and $matching -eq 14 -and
            $registrationMatch -and [Version]$report.guardVersion -ge [Version]$definition.minimumAssemblyVersion -and [string]$assembly['publickeytoken'] -eq '0edea2881bb8578c'
    }
    $report.readyForControlledWriteTest = $report.roleExists -and $report.privilegeMatch -and $report.applicationUserVerified -and $report.exclusiveRole -and $report.guardIdentityMatch
    $report | ConvertTo-Json -Depth 5
} finally { if ($service -is [IDisposable]) { $service.Dispose() } }
