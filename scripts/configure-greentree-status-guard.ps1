param(
    [ValidateSet('Plan','Apply')][string]$Mode = 'Plan',
    [Guid]$ApplicationId = 'ba0bb04d-dcb3-4434-9383-3001de294214',
    [Guid]$ApplicationUserId = 'df19118f-9cc3-f111-aaad-6045bde73762',
    [Guid]$RoleId = 'a58887ab-9bc3-f111-aaad-6045bde73762',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never',
    [switch]$ConfirmExactGreenTreeStatusWriter,
    [switch]$ConfirmExclusiveDeploymentWindow,
    [string]$BackupPath = ''
)

# Attaches the exact GreenTree sync application identity to the existing 14 access guards.
# It does not create identities, roles, grants, schema, steps, schedules or feature flags.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
foreach ($value in @($ApplicationId,$ApplicationUserId,$RoleId)) { Require ($value -ne [Guid]::Empty) 'Application, user and role IDs are required.' }
if ($Mode -eq 'Apply') {
    Require $ConfirmExactGreenTreeStatusWriter.IsPresent 'Confirm the application may write only the GreenTree status marker, status and checked-on fields.'
    Require $ConfirmExclusiveDeploymentWindow.IsPresent 'Prevent concurrent plugin/role administration during snapshot and Apply.'
    Require (-not [string]::IsNullOrWhiteSpace($BackupPath)) 'Apply requires an explicit new rollback snapshot path.'
    $BackupPath = [IO.Path]::GetFullPath($BackupPath)
    Require (-not (Test-Path -LiteralPath $BackupPath)) 'Rollback snapshot already exists; never overwrite it.'
    Require (Test-Path -LiteralPath (Split-Path -Parent $BackupPath) -PathType Container) 'Rollback snapshot parent must already exist.'
}

$sdkRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$toolsPath = Get-ChildItem -LiteralPath $sdkRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
Require (-not [string]::IsNullOrWhiteSpace($toolsPath)) 'Power Apps CLI SDK assemblies were not found.'
'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll' |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $toolsPath $_)) | Out-Null }
$connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
if ($UserName) { Require ($UserName -match '^[^;\s@]+@[^;\s@]+$') 'Invalid account hint.'; $connection += ";UserName=$UserName" }
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
Require $service.IsReady "Sign-in failed: $($service.LastCrmError)"

try {
    $role = $service.Retrieve('role',$RoleId,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
    Require ([string]$role['name'] -eq 'Service Operations GreenTree Sync') 'The configured role is not Service Operations GreenTree Sync.'
    $user = $service.Retrieve('systemuser',$ApplicationUserId,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('applicationid','isdisabled'))
    Require (-not [bool]$user['isdisabled'] -and [Guid]$user['applicationid'] -eq $ApplicationId) 'The exact enabled GreenTree Dataverse application user was not verified.'
    $membership = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuserroles')
    $membership.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false)
    $membership.Criteria.AddCondition('systemuserid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$ApplicationUserId)
    $membership.Criteria.AddCondition('roleid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$RoleId)
    Require ($service.RetrieveMultiple($membership).Entities.Count -eq 1) 'The application user does not hold the exact GreenTree role.'

    $typeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('plugintype')
    $typeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('plugintypeid','pluginassemblyid')
    $typeQuery.Criteria.AddCondition('typename',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'ServiceOperations.Access.RestrictedAccessPlugin')
    $types = @($service.RetrieveMultiple($typeQuery).Entities)
    Require ($types.Count -eq 1) 'Expected one restricted-access plugin type.'
    $assembly = $service.Retrieve('pluginassembly',$types[0]['pluginassemblyid'].Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('version','publickeytoken'))
    Require ([Version]$assembly['version'] -ge [Version]'1.0.18.0' -and [string]$assembly['publickeytoken'] -eq '0edea2881bb8578c') 'Deploy the reviewed signed guard 1.0.18.0 or later first.'

    $stepQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessageprocessingstep')
    $stepQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessageprocessingstepid','name','sdkmessageprocessingstepsecureconfigid','statecode','stage','mode','filteringattributes','impersonatinguserid')
    $stepQuery.Criteria.AddCondition('plugintypeid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$types[0].Id)
    $steps = @($service.RetrieveMultiple($stepQuery).Entities)
    Require ($steps.Count -eq 14) 'Expected exactly 14 existing restricted-access guards.'
    $baseConfig = ''
    $snapshot = @()
    foreach ($step in $steps) {
        Require ([int]$step['statecode'].Value -eq 0 -and [int]$step['stage'].Value -eq 20 -and [int]$step['mode'].Value -eq 0 -and
            -not $step.Attributes.Contains('impersonatinguserid') -and (-not $step.Attributes.Contains('filteringattributes') -or -not [string]$step['filteringattributes'])) 'Every guard must remain active synchronous caller-context PreOperation without filters.'
        Require $step.Attributes.Contains('sdkmessageprocessingstepsecureconfigid') 'Every guard requires an existing secure role map.'
        $reference = $step['sdkmessageprocessingstepsecureconfigid']
        $config = $service.Retrieve('sdkmessageprocessingstepsecureconfig',$reference.Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('secureconfig'))
        $value = [string]$config['secureconfig']; $settings = @{}
        foreach ($part in $value.Split(';')) {
            $pair = $part.Split('=')
            Require ($pair.Count -eq 2 -and @('full','coordinator','office','book','meterrole','meteruser','meterapplication','timecloudrole','timeclouduser','timecloudapplication','greentreerole','greentreeuser','greentreeapplication') -contains $pair[0] -and -not $settings.ContainsKey($pair[0])) 'Unexpected or duplicate secure guard setting.'
            $settings[$pair[0]] = $pair[1]
        }
        foreach ($required in @('full','coordinator','office','book')) { Require $settings.ContainsKey($required) 'Human role map must remain complete.' }
        foreach ($prefix in @('meter','timecloud','greentree')) {
            $count = @(@("${prefix}role","${prefix}user","${prefix}application") | Where-Object { $settings.ContainsKey($_) }).Count
            Require ($count -in @(0,3)) "Existing $prefix writer configuration is partial."
        }
        $humanIds = @(@('full','coordinator','office','book') | ForEach-Object { $settings[$_].Split(',') | ForEach-Object { [Guid]$_.Trim() } })
        Require ($humanIds -notcontains $RoleId) 'The GreenTree role overlaps a human access profile.'
        foreach ($prefix in @('meter','timecloud')) {
            if ($settings.ContainsKey("${prefix}role")) {
                Require ([Guid]$settings["${prefix}role"] -ne $RoleId -and [Guid]$settings["${prefix}user"] -ne $ApplicationUserId -and [Guid]$settings["${prefix}application"] -ne $ApplicationId) "The GreenTree and $prefix writer identities must be distinct."
            }
        }
        if ($settings.ContainsKey('greentreerole')) {
            Require ([Guid]$settings['greentreerole'] -eq $RoleId -and [Guid]$settings['greentreeuser'] -eq $ApplicationUserId -and [Guid]$settings['greentreeapplication'] -eq $ApplicationId) 'A different GreenTree writer is already configured.'
        }
        if (-not $baseConfig) { $baseConfig = $value }
        Require ($baseConfig -eq $value) 'The 14 guards do not share one reviewed secure configuration.'
        $snapshot += [ordered]@{ stepId=$step.Id; name=[string]$step['name']; secureConfigurationId=$reference.Id; secureConfiguration=$value }
    }
    if ($baseConfig -match '(^|;)greentreerole=') { Write-Output 'Exact GreenTree identity is already configured on all 14 guards; no changes.'; return }
    $newConfig = "$baseConfig;greentreerole=$RoleId;greentreeuser=$ApplicationUserId;greentreeapplication=$ApplicationId"
    if ($Mode -eq 'Plan') {
        [pscustomobject]@{ applicationId=$ApplicationId; applicationUserId=$ApplicationUserId; roleId=$RoleId; roleName=[string]$role['name']; guardVersion=[string]$assembly['version']; existingGuards=$steps.Count; existingConfigurationPreserved=$true; mutationsPerformed=$false } | ConvertTo-Json
        return
    }
    $backup = [ordered]@{ environment=$EnvironmentUrl; capturedUtc=[DateTime]::UtcNow.ToString('o'); applicationId=$ApplicationId; priorSteps=$snapshot }
    $stream = [IO.File]::Open($BackupPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes(($backup | ConvertTo-Json -Depth 6)); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    $newId = [Guid]::NewGuid()
    $secure = [Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstepsecureconfig',$newId); $secure['secureconfig']=$newConfig
    $transaction = [Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new()
    $transaction.Requests = [Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new(); $transaction.ReturnResponses=$true
    $create = [Microsoft.Xrm.Sdk.Messages.CreateRequest]::new(); $create.Target=$secure; $transaction.Requests.Add($create)
    foreach ($step in $steps) {
        $change=[Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstep',$step.Id)
        $change['sdkmessageprocessingstepsecureconfigid']=[Microsoft.Xrm.Sdk.EntityReference]::new('sdkmessageprocessingstepsecureconfig',$newId)
        $update=[Microsoft.Xrm.Sdk.Messages.UpdateRequest]::new(); $update.Target=$change; $transaction.Requests.Add($update)
    }
    $service.Execute($transaction) | Out-Null
    Write-Output 'GreenTree identity attached to all 14 guards atomically; human, meter and TimeCloud settings were preserved.'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
