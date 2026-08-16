param(
    [string]$Token,
    [string]$JobNumber,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com'
)

$ErrorActionPreference = 'Stop'
$pacRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$pacTools = Get-ChildItem -LiteralPath $pacRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
if (-not $pacTools) { throw 'Power Apps CLI SDK assemblies were not found.' }
@('Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll') |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $pacTools $_)) | Out-Null }
$connectionString = @('AuthType=OAuth',"Url=$EnvironmentUrl",'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d','RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97','LoginPrompt=Auto') -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

if (-not $Token -and -not $JobNumber) { throw 'Supply Token or JobNumber.' }

$jobs = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
$jobs.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobid','gr_jobnumber','gr_techniciansubmissiontokenused','gr_techniciansubmissiontokenexpireson')
if ($Token) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Token))) -replace '-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
    $jobs.Criteria.AddCondition('gr_techniciansubmissiontokenhash',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$hash)
} else {
    $jobs.Criteria.AddCondition('gr_jobnumber',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$JobNumber)
}
$jobRows = $service.RetrieveMultiple($jobs).Entities
if ($jobRows.Count -ne 1) { throw "Expected exactly one Job for the supplied token; found $($jobRows.Count)." }
$job = $jobRows[0]

$accessRequest = [Microsoft.Crm.Sdk.Messages.RetrievePrincipalAccessRequest]::new()
$accessRequest.Principal = [Microsoft.Xrm.Sdk.EntityReference]::new('systemuser',[Guid]'4322873e-ce87-f111-ab10-0022489917ff')
$accessRequest.Target = $job.ToEntityReference()
$access = $service.Execute($accessRequest)
Write-Output "Job $($job.Attributes['gr_jobnumber']): token used=$($job.Attributes['gr_techniciansubmissiontokenused']); expires=$($job.Attributes['gr_techniciansubmissiontokenexpireson'])"
Write-Output "Public Portal Service effective Job access: $($access.AccessRights)"

try {
    $traceQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('plugintracelog')
    $traceQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('createdon','typename','messagename','primaryentity','exceptiondetails','messageblock')
    $traceQuery.Criteria.AddCondition('createdon',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::LastXHours,2)
    $traceQuery.AddOrder('createdon',[Microsoft.Xrm.Sdk.Query.OrderType]::Descending)
    $traceQuery.TopCount = 50
    $traces = $service.RetrieveMultiple($traceQuery).Entities | Where-Object {
        [string]$_.Attributes['primaryentity'] -eq 'gr_job' -or
        [string]$_.Attributes['messageblock'] -match 'gr_job|Job submission'
    }
    if (-not $traces) { Write-Output 'No recent Job plug-in trace entries were available.' }
    foreach ($trace in $traces) {
        $exception = [string]$trace.Attributes['exceptiondetails']
        if ($exception.Length -gt 1200) { $exception = $exception.Substring(0,1200) }
        Write-Output "TRACE $($trace.Attributes['createdon']) $($trace.Attributes['messagename']) $($trace.Attributes['typename'])"
        if ($exception) { Write-Output $exception }
    }
} catch {
    Write-Output "Plug-in traces could not be read: $($_.Exception.Message)"
}
