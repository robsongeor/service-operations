param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never'
)

# Read-only check of whether the provisioned runtime/security records belong to the target solution.
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$root=Split-Path -Parent $PSScriptRoot
$readiness=Get-Content (Join-Path $root 'dataverse\job-registration\readiness-manifest.json') -Raw|ConvertFrom-Json
$manifest=Get-Content (Join-Path $root 'dataverse\job-registration\deployment-plan.json') -Raw|ConvertFrom-Json
$toolsRoot=Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$tools=Get-ChildItem $toolsRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*'|Sort-Object Name -Descending|ForEach-Object{Join-Path $_.FullName tools}|Where-Object{Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll')}|Select-Object -First 1
foreach($name in 'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll'){[Reflection.Assembly]::LoadFrom((Join-Path $tools $name))|Out-Null}
$connection="AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt";if($UserName){$connection+=";UserName=$UserName"}
$service=[Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection);if(-not$service.IsReady){throw "Dataverse sign-in failed: $($service.LastCrmError)"}
function Find($table,$column,$value,$columns){$q=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new($table);$q.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($columns);$q.Criteria.AddCondition($column,[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$value);@($service.RetrieveMultiple($q).Entities)}
try{
  $solution=@(Find solution uniquename $SolutionUniqueName @('solutionid'));if($solution.Count-ne1){throw "Expected one solution $SolutionUniqueName"}
  $targets=[Collections.Generic.List[object]]::new()
  foreach($name in 'Service Operations - Office Admin','Service Operations - Job Book Admin'){foreach($row in @(Find role name $name @('roleid','name'))){$targets.Add([pscustomobject]@{Kind='Security Role';Name=$name;Id=$row.Id})}}
  foreach($row in @(Find pluginassembly name 'ServiceOperations.UnifiedJobWorkflow' @('pluginassemblyid','name'))){$targets.Add([pscustomobject]@{Kind='Plugin Assembly';Name=[string]$row['name'];Id=$row.Id})}
  foreach($name in @('ServiceOperations.Access.RestrictedAccessPlugin','ServiceOperations.JobRegistration.JobNumberInvariantPlugin','ServiceOperations.JobRegistration.JobRegistrationPlugin','ServiceOperations.JobRegistration.JobWorkflowPlugin')){foreach($row in @(Find plugintype typename $name @('plugintypeid','typename'))){$targets.Add([pscustomobject]@{Kind='Plugin Type';Name=$name;Id=$row.Id})}}
  foreach($api in $readiness.customApis){foreach($row in @(Find customapi uniquename ([string]$api.name) @('customapiid','uniquename'))){$targets.Add([pscustomobject]@{Kind='Custom API';Name=[string]$api.name;Id=$row.Id})}}
  $stepQuery=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessageprocessingstep');$stepQuery.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessageprocessingstepid','name','statecode','statuscode');$stepQuery.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::BeginsWith,'Service Operations Unified |');$steps=@($service.RetrieveMultiple($stepQuery).Entities);foreach($row in $steps){$targets.Add([pscustomobject]@{Kind='Plugin Step';Name=[string]$row['name'];Id=$row.Id})}
  $componentQuery=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('solutioncomponent');$componentQuery.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('objectid','componenttype');$componentQuery.Criteria.AddCondition('solutionid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$solution[0].Id);$components=@($service.RetrieveMultiple($componentQuery).Entities)
  $rows=foreach($target in $targets){$matches=@($components|Where-Object{$_['objectid']-eq$target.Id});[pscustomobject]@{Kind=$target.Kind;Name=$target.Name;InSolution=$matches.Count-gt0;ComponentType=if($matches.Count){$matches[0].FormattedValues['componenttype']}else{''};Id=$target.Id}}
  $rows|Sort-Object Kind,Name|Format-Table -AutoSize
  $enabled=@($steps|Where-Object{$_['statecode'].Value-eq0});$disabled=@($steps|Where-Object{$_['statecode'].Value-eq1});Write-Output "Guard states: $($enabled.Count) enabled; $($disabled.Count) disabled."
  $missing=@($rows|Where-Object{-not$_.InSolution});Write-Output "Solution membership: $($rows.Count-$missing.Count)/$($rows.Count) present; $($missing.Count) missing. Read-only."
  if($missing.Count){exit 2}
}finally{if($service-is[IDisposable]){$service.Dispose()}}
