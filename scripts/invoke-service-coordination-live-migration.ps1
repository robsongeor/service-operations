param(
    [ValidateSet('JobBranchApply', 'JobBranchVerify', 'JobStatusApply', 'JobStatusVerify', 'UserBranchApply', 'UserBranchVerify')]
    [string]$Operation,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = 'georger@liftrucks.co.nz',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [Parameter(Mandatory = $true)]
    [string]$PlanPath,
    [Parameter(Mandatory = $true)]
    [string]$ApprovedPlanHash,
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [string]$CheckpointPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$null = $LoginPrompt # Retained for command compatibility; live migration uses the cached Azure CLI identity.
$account = & az account show --query user.name -o tsv
if ($LASTEXITCODE -ne 0 -or $account.Trim() -ne $UserName.Trim()) { throw "Azure CLI must be signed in as $UserName." }
try {
    $base = $EnvironmentUrl.TrimEnd('/')
    $token = (& az account get-access-token --resource $base --query accessToken -o tsv).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Dataverse access token was unavailable.' }
    $env:DATAVERSE_ACCESS_TOKEN = $token
    $isUser = $Operation.StartsWith('UserBranch')
    $mode = if ($Operation.EndsWith('Apply')) { 'Apply' } else { 'Verify' }
    $scriptPath = Join-Path $PSScriptRoot $(if ($isUser) { 'service-coordination-user-branch-plan.mjs' } else { 'service-coordination-migration.mjs' })
    $arguments = @($scriptPath, '--mode', $mode, '--plan', [IO.Path]::GetFullPath($PlanPath), '--approved-plan-hash', $ApprovedPlanHash, '--environment-url', $EnvironmentUrl, '--live', '--output', [IO.Path]::GetFullPath($OutputPath))
    if ($mode -eq 'Apply') {
        if ([string]::IsNullOrWhiteSpace($CheckpointPath)) { throw 'Apply requires CheckpointPath.' }
        $arguments += @('--checkpoint', [IO.Path]::GetFullPath($CheckpointPath))
    }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "Migration $Operation failed with exit code $LASTEXITCODE." }
} finally {
    Remove-Item Env:DATAVERSE_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
