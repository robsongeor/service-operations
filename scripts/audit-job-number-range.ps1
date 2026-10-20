param(
    [long]$Minimum = 147475,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

function Get-NumericRows($Service, [string]$Table, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
    $query.PageInfo.Count = 5000
    $query.PageInfo.PageNumber = 1
    $rows = [Collections.Generic.List[object]]::new()
    do {
        $page = $Service.RetrieveMultiple($query)
        foreach ($record in $page.Entities) {
            $raw = if ($record.Attributes.ContainsKey('gr_jobnumber')) { [string]$record['gr_jobnumber'] } else { '' }
            $number = 0L
            if ([long]::TryParse($raw.Trim(), [ref]$number) -and $number -ge $Minimum) {
                $rows.Add([pscustomobject]@{
                    Table = $Table
                    JobNumber = $number
                    RecordId = $record.Id
                    StateCode = if ($record.FormattedValues.ContainsKey('statecode')) { $record.FormattedValues['statecode'] } elseif ($record.Attributes.ContainsKey('statecode')) { [string]$record['statecode'] } else { '' }
                    CreatedOn = if ($record.Attributes.ContainsKey('createdon')) { $record['createdon'] } else { $null }
                    Description = if ($record.Attributes.ContainsKey('gr_description')) { [string]$record['gr_description'] } else { '' }
                    PromotedJobId = if ($record.Attributes.ContainsKey('gr_promotedjob')) { $record['gr_promotedjob'].Id } else { $null }
                })
            }
        }
        if ($page.MoreRecords) {
            $query.PageInfo.PageNumber++
            $query.PageInfo.PagingCookie = $page.PagingCookie
        }
    } while ($page.MoreRecords)
    $rows
}

Import-Sdk
$service = Connect-Dataverse
try {
    $who = $service.Execute([Microsoft.Crm.Sdk.Messages.WhoAmIRequest]::new())
    Write-Output "Connected to $EnvironmentUrl as $($who.UserId)."
    $rows = @()
    $rows += Get-NumericRows $service 'gr_job' @('gr_jobnumber', 'statecode', 'createdon', 'gr_description')
    $rows += Get-NumericRows $service 'gr_jobbookentry' @('gr_jobnumber', 'statecode', 'createdon', 'gr_description', 'gr_promotedjob')
    $rows = @($rows | Sort-Object JobNumber, Table)
    if (-not $rows.Count) {
        Write-Output "No Auckland numeric Job or Job Book ledger rows exist at or above $Minimum."
        return
    }
    Write-Output "Found $($rows.Count) Auckland numeric Job or Job Book ledger rows at or above ${Minimum}:"
    $rows | Format-Table Table, JobNumber, StateCode, CreatedOn, Description, RecordId, PromotedJobId -AutoSize | Out-String -Width 260 | Write-Output
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
