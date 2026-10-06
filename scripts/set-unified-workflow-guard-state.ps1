param(
    [ValidateSet('Disable','Enable')][string]$Mode = 'Disable',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never'
)

# Explicit safety switch for only the unified workflow's named synchronous guard steps.
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$toolsRoot=Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$tools=Get-ChildItem $toolsRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*'|Sort-Object Name -Descending|ForEach-Object{Join-Path $_.FullName tools}|Where-Object{Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll')}|Select-Object -First 1
if(-not$tools){throw 'Power Apps CLI SDK assemblies were not found.'}
foreach($name in 'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll'){[Reflection.Assembly]::LoadFrom((Join-Path $tools $name))|Out-Null}
$connection="AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt";if($UserName){$connection+=";UserName=$UserName"}
$service=[Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection);if(-not$service.IsReady){throw "Dataverse sign-in failed: $($service.LastCrmError)"}
try{
    $query=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessageprocessingstep');$query.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessageprocessingstepid','name','statecode','statuscode');$query.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::BeginsWith,'Service Operations Unified |');$steps=@($service.RetrieveMultiple($query).Entities)
    if($steps.Count-ne29){throw "Safety stop: expected exactly 29 unified guard steps; found $($steps.Count)."}
    $targetState=if($Mode-eq'Disable'){1}else{0};$targetStatus=if($Mode-eq'Disable'){2}else{1}
    $changed=0
    foreach($step in $steps){if($step['statecode'].Value-ne$targetState){$request=[Microsoft.Crm.Sdk.Messages.SetStateRequest]::new();$request.EntityMoniker=$step.ToEntityReference();$request.State=[Microsoft.Xrm.Sdk.OptionSetValue]::new($targetState);$request.Status=[Microsoft.Xrm.Sdk.OptionSetValue]::new($targetStatus);$service.Execute($request)|Out-Null;$changed++}}
    $verify=@($service.RetrieveMultiple($query).Entities);$wrong=@($verify|Where-Object{$_['statecode'].Value-ne$targetState});if($wrong.Count){throw "$($wrong.Count) unified guard steps did not reach target state."}
    Write-Output "Unified guard steps $($Mode.ToLowerInvariant())d: $changed changed; $($verify.Count) verified."
}finally{if($service-is[IDisposable]){$service.Dispose()}}
