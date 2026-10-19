param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never','Auto')][string]$LoginPrompt = 'Never'
)

# Read-only aggregate verification for the five GreenTree status-bearing tables.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Require([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
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
Require $service.IsReady "Dataverse sign-in failed: $($service.LastCrmError)"

$tables = @('gr_job','gr_jobbookentry','gr_waikatojobbookentry','gr_hastingsjobbookentry','gr_christchurchjobbookentry')
$rowsByCode = @{}
$tableReports = @()
try {
    foreach ($table in $tables) {
        $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($table)
        $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobnumber','gr_greentreestatus','gr_greentreestatuscheckedon')
        $query.Criteria.AddCondition('statecode',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,0)
        $query.Criteria.AddCondition('gr_jobnumber',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::NotNull)
        $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new(); $query.PageInfo.Count=5000; $query.PageInfo.PageNumber=1
        $rows = @()
        do {
            $page = $service.RetrieveMultiple($query); $rows += @($page.Entities)
            $query.PageInfo.PageNumber++; $query.PageInfo.PagingCookie=$page.PagingCookie
        } while ($page.MoreRecords)
        $tableReports += [ordered]@{
            table=$table; numbered=$rows.Count
            checked=@($rows | Where-Object { $_.Attributes.Contains('gr_greentreestatuscheckedon') }).Count
            notEntered=@($rows | Where-Object { -not $_.Attributes.Contains('gr_greentreestatus') }).Count
            open=@($rows | Where-Object { $_.Attributes.Contains('gr_greentreestatus') -and [string]$_['gr_greentreestatus'] -eq 'open' }).Count
            closed=@($rows | Where-Object { $_.Attributes.Contains('gr_greentreestatus') -and [string]$_['gr_greentreestatus'] -eq 'closed' }).Count
            finalised=@($rows | Where-Object { $_.Attributes.Contains('gr_greentreestatus') -and [string]$_['gr_greentreestatus'] -eq 'finalised' }).Count
        }
        foreach ($row in $rows) {
            $code = ([string]$row['gr_jobnumber']).Trim().ToUpperInvariant()
            if (-not $rowsByCode.ContainsKey($code)) { $rowsByCode[$code] = @() }
            $rowsByCode[$code] += $row
        }
    }
    $conflicts = 0
    foreach ($code in $rowsByCode.Keys) {
        $statuses = @($rowsByCode[$code] | Where-Object { $_.Attributes.Contains('gr_greentreestatus') } | ForEach-Object { [string]$_['gr_greentreestatus'] } | Where-Object { $_ } | Sort-Object -Unique)
        if ($statuses.Count -gt 1) { $conflicts++ }
    }
    $eligibleCodes = @($rowsByCode.Keys | Where-Object { $_ -match '^(?:[A-Z]{1,2})?[0-9]{1,20}$' })
    $ignoredCodes = @($rowsByCode.Keys | Where-Object { $_ -notmatch '^(?:[A-Z]{1,2})?[0-9]{1,20}$' } | Sort-Object)
    $remainingCodes = @($eligibleCodes | Where-Object { @($rowsByCode[$_] | Where-Object { $_.Attributes.Contains('gr_greentreestatuscheckedon') }).Count -eq 0 } | Sort-Object)
    [ordered]@{
        uniqueJobNumbers=$rowsByCode.Count
        eligibleJobNumbers=$eligibleCodes.Count
        checkedEligible=@($eligibleCodes | Where-Object { @($rowsByCode[$_] | Where-Object { $_.Attributes.Contains('gr_greentreestatuscheckedon') }).Count -gt 0 }).Count
        remainingEligible=$remainingCodes.Count
        remainingEligibleJobNumbers=$remainingCodes
        ignoredInvalidJobNumbers=$ignoredCodes
        crossRepresentationStatusConflicts=$conflicts
        tables=$tableReports
        mutationsPerformed=$false
    } | ConvertTo-Json -Depth 5
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
