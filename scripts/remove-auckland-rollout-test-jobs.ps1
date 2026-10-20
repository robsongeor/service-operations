param(
    [switch]$Apply,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expected = @(
    @{ JobNumber = '150005'; RecordId = [Guid]'8d30f210-0406-4203-a9ef-876e28aa7f25'; Description = 'TEST' },
    @{ JobNumber = '150006'; RecordId = [Guid]'ed49327e-6006-4f81-a427-5da714a6ee95'; Description = 'TEST' }
)
$tables = @('gr_jobbookentry', 'gr_job')

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    $path
}

function Import-Sdk {
    $path = Get-ToolsPath
    @('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll') |
        ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $path $_)) | Out-Null }
}

function Connect-Dataverse {
    $connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
    if (-not [string]::IsNullOrWhiteSpace($UserName)) { $connection += ";UserName=$($UserName.Trim())" }
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}

function Get-ExactRecord($Service, [string]$Table, [string]$JobNumber) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobnumber', 'gr_description', 'statecode', 'createdon')
    $query.Criteria.AddCondition('gr_jobnumber', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $JobNumber)
    @($Service.RetrieveMultiple($query).Entities)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $who = $service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    Write-Output "Connected to $EnvironmentUrl as $($who.UserId)."

    $targets = [Collections.Generic.List[object]]::new()
    foreach ($item in $expected) {
        foreach ($table in $tables) {
            $records = @(Get-ExactRecord $service $table $item.JobNumber)
            if ($records.Count -ne 1) {
                throw "Cleanup blocked: expected exactly one $table row for Job $($item.JobNumber); found $($records.Count)."
            }
            $record = $records[0]
            $description = if ($record.Attributes.ContainsKey('gr_description')) { [string]$record['gr_description'] } else { '' }
            if ($record.Id -ne $item.RecordId) {
                throw "Cleanup blocked: $table Job $($item.JobNumber) has unexpected identity $($record.Id)."
            }
            if ($description.Trim() -cne $item.Description) {
                throw "Cleanup blocked: $table Job $($item.JobNumber) has description '$description', not '$($item.Description)'."
            }
            $targets.Add([pscustomobject]@{
                Table = $table
                JobNumber = $item.JobNumber
                RecordId = $record.Id
                Description = $description
                StateCode = if ($record.FormattedValues.ContainsKey('statecode')) { $record.FormattedValues['statecode'] } else { [string]$record['statecode'] }
                CreatedOn = $record['createdon']
            })
        }
    }

    Write-Output 'Validated exact rollout-test cleanup targets:'
    $targets | Format-Table Table, JobNumber, Description, StateCode, CreatedOn, RecordId -AutoSize | Out-String -Width 220 | Write-Output

    if (-not $Apply) {
        Write-Output 'DRY_RUN_COMPLETE: no records were deleted. Re-run with -Apply to execute the atomic cleanup.'
        return
    }

    $transaction = [Microsoft.Xrm.Sdk.Messages.ExecuteTransactionRequest]::new()
    $transaction.ReturnResponses = $false
    $transaction.Requests = [Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new()
    foreach ($target in $targets) {
        $request = [Microsoft.Xrm.Sdk.Messages.DeleteRequest]::new()
        $request.Target = [Microsoft.Xrm.Sdk.EntityReference]::new($target.Table, $target.RecordId)
        $transaction.Requests.Add($request)
    }
    $service.Execute($transaction) | Out-Null

    foreach ($item in $expected) {
        foreach ($table in $tables) {
            $remaining = @(Get-ExactRecord $service $table $item.JobNumber)
            if ($remaining.Count) { throw "Post-delete verification failed: $table Job $($item.JobNumber) still exists." }
        }
    }
    Write-Output 'ROLLOUT_TEST_CLEANUP_COMPLETE: deleted Jobs 150005 and 150006 and their matching Auckland Job Book ledger records.'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
