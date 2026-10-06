param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^(WJ|HJ|CJ)?[0-9]+$')]
    [string]$JobNumber,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Read-only diagnostic for one registered Job Book Void attempt. It emits eligibility facts only:
# no record identifiers, user identifiers, free text, writes, role grants or plugin trace content.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    $path
}
function Import-Sdk {
    $path = Get-ToolsPath
    'Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll' |
        ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $path $_)) | Out-Null }
}
function Connect-Dataverse {
    $connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
    if (-not [string]::IsNullOrWhiteSpace($UserName)) { $connection += ";UserName=$($UserName.Trim())" }
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    $client
}
function Find-Rows($Service, [string]$Table, [string]$Column, $Value, [string[]]$Columns) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new($Table)
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new($Columns)
    $query.Criteria.AddCondition($Column, [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $Value)
    @($Service.RetrieveMultiple($query).Entities)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $jobs = @(Find-Rows $service 'gr_job' 'gr_jobnumber' $JobNumber @(
        'gr_jobnumber', 'gr_coordinatormanaged', 'gr_registrationvoid', 'gr_registrationvoidreason', 'gr_gtentered', 'gr_timecloudentered'))
    if ($jobs.Count -ne 1) { throw "Expected one Job for $JobNumber; found $($jobs.Count)." }
    $job = $jobs[0]
    $books = @(
        @{ Book='auckland'; Table='gr_jobbookentry' },
        @{ Book='waikato'; Table='gr_waikatojobbookentry' },
        @{ Book='hastings'; Table='gr_hastingsjobbookentry' },
        @{ Book='christchurch'; Table='gr_christchurchjobbookentry' })
    $matches = [Collections.Generic.List[object]]::new()
    foreach ($definition in $books) {
        foreach ($ledger in @(Find-Rows $service $definition.Table 'gr_registeredjob' $job.Id @(
            'gr_jobnumber', 'gr_stage', 'gr_voidreason', 'gr_registeredjob', 'gr_entered', 'gr_timecloudentered'))) {
            $matches.Add([pscustomobject]@{ Definition=$definition; Ledger=$ledger })
        }
    }
    if ($matches.Count -ne 1) { throw "Expected one linked regional ledger; found $($matches.Count)." }
    $match = $matches[0]
    $ledger = $match.Ledger
    $stage = if ($ledger.Attributes.Contains('gr_stage')) { [Microsoft.Xrm.Sdk.OptionSetValue]$ledger['gr_stage'] } else { $null }
    [pscustomobject]@{
        JobNumber = $JobNumber
        Book = [string]$match.Definition.Book
        NumberMatches = [string]$ledger['gr_jobnumber'] -eq $JobNumber
        RegisteredStage = $null -ne $stage -and $stage.Value -eq 122830004
        VoidStage = $null -ne $stage -and $stage.Value -eq 122830003
        CoordinatorManaged = $job.Attributes.Contains('gr_coordinatormanaged') -and [bool]$job['gr_coordinatormanaged']
        JobVoid = $job.Attributes.Contains('gr_registrationvoid') -and [bool]$job['gr_registrationvoid']
        JobGtEntered = $job.Attributes.Contains('gr_gtentered') -and [bool]$job['gr_gtentered']
        JobTimecloudEntered = $job.Attributes.Contains('gr_timecloudentered') -and [bool]$job['gr_timecloudentered']
        LedgerGtEntered = $ledger.Attributes.Contains('gr_entered') -and [bool]$ledger['gr_entered']
        LedgerTimecloudEntered = $ledger.Attributes.Contains('gr_timecloudentered') -and [bool]$ledger['gr_timecloudentered']
        VoidReasonPresent = $job.Attributes.Contains('gr_registrationvoidreason') -and -not [string]::IsNullOrWhiteSpace([string]$job['gr_registrationvoidreason'])
        VoidReasonsMatch = $job.Attributes.Contains('gr_registrationvoidreason') -and $ledger.Attributes.Contains('gr_voidreason') -and [string]$job['gr_registrationvoidreason'] -ceq [string]$ledger['gr_voidreason']
        JobVersionAvailable = -not [string]::IsNullOrWhiteSpace($job.RowVersion)
        LedgerVersionAvailable = -not [string]::IsNullOrWhiteSpace($ledger.RowVersion)
    } | Format-List
    Write-Output 'Read-only diagnostic completed; no identifiers or changes were emitted.'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
