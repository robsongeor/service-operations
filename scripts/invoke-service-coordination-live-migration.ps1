param(
    [ValidateSet('JobBranchApply', 'JobBranchVerify', 'UserBranchApply', 'UserBranchVerify')]
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

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $path
}

$toolsPath = Get-ToolsPath
'Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll' |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $toolsPath $_)) | Out-Null }
$connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt;UserName=$($UserName.Trim())"
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }
try {
    $token = [string]$service.CurrentAccessToken
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
    if ($service -is [IDisposable]) { $service.Dispose() }
}
