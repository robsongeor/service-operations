param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = 'georger@liftrucks.co.nz',
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [int]$MaximumRecords = 100000
)

# Read-only, privacy-minimal export for the deterministic legacy Unconfirmed retirement.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($MaximumRecords -lt 1) { throw 'MaximumRecords must be positive.' }
$account = & az account show --query user.name -o tsv
if ($LASTEXITCODE -ne 0 -or $account.Trim() -ne $UserName.Trim()) { throw "Azure CLI must be signed in as $UserName." }
$base = $EnvironmentUrl.TrimEnd('/')
$token = (& az account get-access-token --resource $base --query accessToken -o tsv).Trim()
if ([string]::IsNullOrWhiteSpace($token)) { throw 'The cached Azure sign-in did not return a Dataverse access token.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; Prefer = 'odata.maxpagesize=5000' }
$next = "$base/api/data/v9.2/gr_jobs?`$select=gr_jobid,gr_status,gr_registrationvoid,statecode&`$orderby=gr_jobid"
$jobs = [Collections.Generic.List[object]]::new()
while (-not [string]::IsNullOrWhiteSpace($next)) {
    $page = Invoke-RestMethod -Uri $next -Headers $headers -Method Get
    foreach ($row in @($page.value)) {
        if ($jobs.Count -ge $MaximumRecords) { throw "Job export exceeds the reviewed $MaximumRecords-record bound." }
        $jobs.Add([ordered]@{
            id = ([string]$row.gr_jobid).ToLowerInvariant()
            etag = [string]$row.'@odata.etag'
            status = [int]$row.gr_status
            operatingBranch = $null
            registrationVoid = [bool]$row.gr_registrationvoid
            inactive = [int]$row.statecode -ne 0
            registeredLedgerBranches = @()
            approvedLegacySourceBranches = @()
        })
    }
    $nextProperty = $page.PSObject.Properties['@odata.nextLink']
    $next = if ($null -ne $nextProperty) { [string]$nextProperty.Value } else { '' }
}
$artifact = [ordered]@{
    schemaVersion = 1
    exportedAtUtc = [DateTime]::UtcNow.ToString('o')
    source = 'Dataverse Job status retirement evidence only'
    mutationsPerformed = $false
    jobs = @($jobs)
}
$resolved = [IO.Path]::GetFullPath($OutputPath)
$directory = [IO.Path]::GetDirectoryName($resolved)
if (-not [IO.Directory]::Exists($directory)) { throw "Output directory does not exist: $directory" }
[IO.File]::WriteAllText($resolved, ($artifact | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
[pscustomobject]@{
    mode = 'Export'
    mutationsPerformed = $false
    jobs = $jobs.Count
    legacyUnconfirmed = @($jobs | Where-Object status -eq 122830005).Count
    outputPath = $resolved
} | ConvertTo-Json
