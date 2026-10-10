param(
    [ValidateSet('Plan','Apply')][string]$Mode = 'Plan',
    [Guid]$ApplicationId = [Guid]::Empty,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never',
    [switch]$ConfirmMeterFeatureDisabled,
    [switch]$ConfirmExclusiveDeploymentWindow,
    [string]$BackupPath = ''
)
# Does NOT create identities, roles, grants, schema, plugin assemblies or activate a feature.
# Apply only attaches the exact validated optional meter tuple to the 14 existing guards atomically.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
Require ($ApplicationId -ne [Guid]::Empty) 'Supply the dedicated application client ID.'
if ($Mode -eq 'Apply') {
    Require $ConfirmMeterFeatureDisabled.IsPresent 'Confirm both meter feature flags are disabled before Apply.'
    Require $ConfirmExclusiveDeploymentWindow.IsPresent 'Prevent concurrent plugin/role administration during snapshot and Apply.'
    Require (-not [string]::IsNullOrWhiteSpace($BackupPath)) 'Apply requires an explicit new rollback snapshot path.'
    $BackupPath = [IO.Path]::GetFullPath($BackupPath)
    Require (-not (Test-Path -LiteralPath $BackupPath)) 'Rollback snapshot already exists; never overwrite it.'
    Require (Test-Path -LiteralPath (Split-Path -Parent $BackupPath) -PathType Container) 'Rollback snapshot parent must already exist.'
}
$inspection = & (Join-Path $PSScriptRoot 'inspect-job-card-meter-access.ps1') -EnvironmentUrl $EnvironmentUrl -ApplicationId $ApplicationId -UserName $UserName -LoginPrompt $LoginPrompt | ConvertFrom-Json
Require ($inspection.roleExists -and $inspection.privilegeMatch -and $inspection.applicationUserVerified -and $inspection.exclusiveRole) 'Dedicated identity/privileges have not passed inspection. No configuration was changed.'
Require ($inspection.guardStepCount -eq 14 -and [Version]$inspection.guardVersion -eq [Version]'1.0.2.0') 'Deploy and verify the reviewed 1.0.2.0 assembly before configuring the writer.'
if ($inspection.guardIdentityMatch) { Write-Output 'Exact meter identity is already configured; no changes.'; return }
$connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
if ($UserName) { Require ($UserName -match '^[^;\s@]+@[^;\s@]+$') 'Invalid account hint.'; $connection += ";UserName=$UserName" }
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
Require $service.IsReady "Sign-in failed: $($service.LastCrmError)"
try {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessageprocessingstep')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessageprocessingstepid','name','sdkmessageprocessingstepsecureconfigid','statecode','stage','mode','filteringattributes','impersonatinguserid')
    $query.AddLink('plugintype','plugintypeid','plugintypeid').LinkCriteria.AddCondition('typename',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'ServiceOperations.Access.RestrictedAccessPlugin')
    $result = $service.RetrieveMultiple($query); $steps = @($result.Entities)
    Require (-not $result.MoreRecords -and $steps.Count -eq 14) 'Expected exactly 14 existing guards.'
    $baseConfig = ''
    $snapshot = @()
    foreach ($step in $steps) {
        Require ([int]$step['statecode'].Value -eq 0 -and [int]$step['stage'].Value -eq 20 -and [int]$step['mode'].Value -eq 0 -and
            -not $step.Attributes.Contains('impersonatinguserid') -and (-not $step.Attributes.Contains('filteringattributes') -or -not [string]$step['filteringattributes'])) 'Guard must be active synchronous caller-context PreOperation without filters.'
        Require ($step.Attributes.Contains('sdkmessageprocessingstepsecureconfigid')) 'Every guard requires its existing human-role map.'
        $reference = $step['sdkmessageprocessingstepsecureconfigid']
        $config = $service.Retrieve('sdkmessageprocessingstepsecureconfig',$reference.Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('secureconfig'))
        $value = [string]$config['secureconfig']; $settings = @{}; $held = @()
        foreach ($part in $value.Split(';')) {
            $pair = $part.Split('=')
            Require ($pair.Count -eq 2 -and @('full','coordinator','office','book') -contains $pair[0] -and -not $settings.ContainsKey($pair[0])) 'Unexpected or partially configured role map. Reconcile explicitly; do not replace it.'
            $ids = @($pair[1].Split(',') | ForEach-Object { [Guid]$_.Trim() })
            Require ($ids.Count -gt 0 -and $ids -notcontains [Guid]::Empty -and $ids -notcontains [Guid]$inspection.roleId) 'Human/meter role overlap is forbidden.'
            $held += $ids; $settings[$pair[0]] = ($ids | Sort-Object) -join ','
        }
        Require ($settings.Count -eq 4 -and @($held | Select-Object -Unique).Count -eq $held.Count) 'Human role map must be complete and disjoint.'
        $canonical = (@('full','coordinator','office','book') | ForEach-Object { "$_=$($settings[$_])" }) -join ';'
        if (-not $baseConfig) { $baseConfig=$canonical }
        Require ($baseConfig -eq $canonical) 'Guards do not share the same reviewed human-role map.'
        $snapshot += [ordered]@{ stepId=$step.Id; name=[string]$step['name']; secureConfigurationId=$reference.Id; secureConfiguration=$value }
    }
    $newConfig = "$baseConfig;meterrole=$($inspection.roleId);meteruser=$($inspection.applicationUserId);meterapplication=$ApplicationId"
    if ($Mode -eq 'Plan') {
        [pscustomobject]@{ applicationId=$ApplicationId; applicationUserId=$inspection.applicationUserId; roleId=$inspection.roleId; existingGuards=$steps.Count; humanProfilesPreserved=$true; mutationsPerformed=$false } | ConvertTo-Json
        return
    }
    # Keep the old secure-configuration entities intact for rollback. No guard is disabled.
    $backup = [ordered]@{ environment=$EnvironmentUrl; capturedUtc=[DateTime]::UtcNow.ToString('o'); applicationId=$ApplicationId; priorSteps=$snapshot }
    $stream = [IO.File]::Open($BackupPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes(($backup | ConvertTo-Json -Depth 6)); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    $newId=[Guid]::NewGuid()
    $secure=[Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstepsecureconfig',$newId); $secure['secureconfig']=$newConfig
    $create=[Microsoft.Xrm.Sdk.Messages.CreateRequest]::new(); $create.Target=$secure
    $transaction=[Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new()
    $transaction.Requests=[Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new(); $transaction.ReturnResponses=$true
    $transaction.Requests.Add($create)
    foreach ($step in $steps) {
        $change=[Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstep',$step.Id)
        $change['sdkmessageprocessingstepsecureconfigid']=[Microsoft.Xrm.Sdk.EntityReference]::new('sdkmessageprocessingstepsecureconfig',$newId)
        $update=[Microsoft.Xrm.Sdk.Messages.UpdateRequest]::new(); $update.Target=$change; $transaction.Requests.Add($update)
    }
    $service.Execute($transaction) | Out-Null
    Write-Output 'Meter configuration attached to 14 guards in one transaction; human maps, grants and flags unchanged.'
} finally { if ($service -is [IDisposable]) { $service.Dispose() } }
