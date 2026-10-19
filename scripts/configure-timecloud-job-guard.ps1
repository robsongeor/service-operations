param(
    [ValidateSet('Plan','Apply')][string]$Mode = 'Plan',
    [Guid]$ApplicationId = 'dfad95a1-0541-47f0-b599-cb09b7181c72',
    [Guid]$ApplicationUserId = '4322873e-ce87-f111-ab10-0022489917ff',
    [Guid]$RoleId = '3b0845b7-ceb7-48c6-8cf2-a8dd90a20850',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never',
    [switch]$ConfirmExactThreeFieldWriter,
    [switch]$ConfirmExclusiveDeploymentWindow,
    [string]$BackupPath = ''
)
# Attaches an exact TimeCloud application identity tuple to the existing 14 access guards.
# It does not create identities, roles, grants, schema, steps, or feature flags.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
foreach ($value in @($ApplicationId,$ApplicationUserId,$RoleId)) { Require ($value -ne [Guid]::Empty) 'Application, user and role IDs are required.' }
if ($Mode -eq 'Apply') {
    Require $ConfirmExactThreeFieldWriter.IsPresent 'Confirm the application may write only the three TimeCloud confirmation fields.'
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
    Require ([string]$role['name'] -eq 'Public Portal Service') 'The configured TimeCloud role is not Public Portal Service.'
    $user = $service.Retrieve('systemuser',$ApplicationUserId,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('applicationid','isdisabled'))
    Require (-not [bool]$user['isdisabled'] -and [Guid]$user['applicationid'] -eq $ApplicationId) 'The exact enabled Dataverse application user was not verified.'
    $membership = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('systemuserroles')
    $membership.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false)
    $membership.Criteria.AddCondition('systemuserid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$ApplicationUserId)
    $membership.Criteria.AddCondition('roleid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$RoleId)
    Require ($service.RetrieveMultiple($membership).Entities.Count -eq 1) 'The application user does not hold the exact TimeCloud role.'

    $typeQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('plugintype')
    $typeQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('plugintypeid','pluginassemblyid')
    $typeQuery.Criteria.AddCondition('typename',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'ServiceOperations.Access.RestrictedAccessPlugin')
    $types = @($service.RetrieveMultiple($typeQuery).Entities)
    Require ($types.Count -eq 1) 'Expected one restricted-access plugin type.'
    $assembly = $service.Retrieve('pluginassembly',$types[0]['pluginassemblyid'].Id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('version','publickeytoken'))
    Require ([Version]$assembly['version'] -ge [Version]'1.0.7.0' -and [string]$assembly['publickeytoken'] -eq '0edea2881bb8578c') 'Deploy the reviewed signed guard 1.0.7.0 or later first.'

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
        $meterCount = @(@('meterrole','meteruser','meterapplication') | Where-Object { $settings.ContainsKey($_) }).Count
        Require ($meterCount -in @(0,3)) 'Existing meter writer configuration is partial.'
        $timecloudCount = @(@('timecloudrole','timeclouduser','timecloudapplication') | Where-Object { $settings.ContainsKey($_) }).Count
        Require ($timecloudCount -in @(0,3)) 'Existing TimeCloud writer configuration is partial.'
        $greenTreeCount = @(@('greentreerole','greentreeuser','greentreeapplication') | Where-Object { $settings.ContainsKey($_) }).Count
        Require ($greenTreeCount -in @(0,3)) 'Existing GreenTree writer configuration is partial.'
        $humanIds = @(@('full','coordinator','office','book') | ForEach-Object { $settings[$_].Split(',') | ForEach-Object { [Guid]$_.Trim() } })
        Require ($humanIds -notcontains $RoleId) 'The TimeCloud role overlaps a human access profile.'
        if ($meterCount -eq 3) {
            Require ([Guid]$settings['meterrole'] -ne $RoleId -and [Guid]$settings['meteruser'] -ne $ApplicationUserId -and [Guid]$settings['meterapplication'] -ne $ApplicationId) 'The TimeCloud and meter writer identities must be distinct.'
        }
        if ($timecloudCount -eq 3) {
            Require ([Guid]$settings['timecloudrole'] -eq $RoleId -and [Guid]$settings['timeclouduser'] -eq $ApplicationUserId -and [Guid]$settings['timecloudapplication'] -eq $ApplicationId) 'A different TimeCloud writer is already configured.'
        }
        if ($greenTreeCount -eq 3) {
            Require ([Guid]$settings['greentreerole'] -ne $RoleId -and [Guid]$settings['greentreeuser'] -ne $ApplicationUserId -and [Guid]$settings['greentreeapplication'] -ne $ApplicationId) 'The TimeCloud and GreenTree writer identities must be distinct.'
        }
        if (-not $baseConfig) { $baseConfig = $value }
        Require ($baseConfig -eq $value) 'The 14 guards do not share one reviewed secure configuration.'
        $snapshot += [ordered]@{ stepId=$step.Id; name=[string]$step['name']; secureConfigurationId=$reference.Id; secureConfiguration=$value }
    }
    if ($baseConfig -match '(^|;)timecloudrole=') { Write-Output 'Exact TimeCloud identity is already configured on all 14 guards; no changes.'; return }
    $newConfig = "$baseConfig;timecloudrole=$RoleId;timeclouduser=$ApplicationUserId;timecloudapplication=$ApplicationId"
    if ($Mode -eq 'Plan') {
        [pscustomobject]@{ applicationId=$ApplicationId; applicationUserId=$ApplicationUserId; roleId=$RoleId; guardVersion=[string]$assembly['version']; existingGuards=$steps.Count; existingConfigurationPreserved=$true; mutationsPerformed=$false } | ConvertTo-Json
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
    Write-Output 'TimeCloud identity attached to all 14 guards atomically; existing profiles, meter settings, grants, steps and flags were preserved.'
} finally { if ($service -is [IDisposable]) { $service.Dispose() } }
