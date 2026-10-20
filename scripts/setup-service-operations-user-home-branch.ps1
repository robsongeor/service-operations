param(
    [ValidateSet('Plan', 'Apply', 'Verify')]
    [string]$Mode = 'Plan',
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[^@\s]+@[^@\s]+$')]
    [string]$UserPrincipalName,
    [Parameter(Mandatory = $true)]
    [ValidateSet('Auckland', 'Waikato', 'Hastings', 'Christchurch')]
    [string]$HomeBranch,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$OperatorUserName = 'georger@liftrucks.co.nz',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [string]$MappingPath = 'dataverse/service-coordination/user-branch-mapping.json',
    [string]$ArtifactDirectory = 'output/service-operations-user-setup',
    [string]$PlanPath = '',
    [string]$ApprovedPlanHash = ''
)

# The installed Dataverse SDK uses .NET Framework cryptography types. Relaunch transparently when
# this command is started from PowerShell 7 so operators do not need to remember the host detail.
if ($PSVersionTable.PSEdition -eq 'Core') {
    $windowsPowerShellArguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $PSCommandPath,
        '-Mode', $Mode,
        '-UserPrincipalName', $UserPrincipalName,
        '-HomeBranch', $HomeBranch,
        '-EnvironmentUrl', $EnvironmentUrl,
        '-OperatorUserName', $OperatorUserName,
        '-LoginPrompt', $LoginPrompt,
        '-MappingPath', $MappingPath,
        '-ArtifactDirectory', $ArtifactDirectory
    )
    if (-not [string]::IsNullOrWhiteSpace($PlanPath)) {
        $windowsPowerShellArguments += @('-PlanPath', $PlanPath)
    }
    if (-not [string]::IsNullOrWhiteSpace($ApprovedPlanHash)) {
        $windowsPowerShellArguments += @('-ApprovedPlanHash', $ApprovedPlanHash)
    }
    & powershell.exe @windowsPowerShellArguments
    if ($LASTEXITCODE -ne 0) { throw "Windows PowerShell user home-branch setup failed with exit code $LASTEXITCODE." }
    exit 0
}

# Mandatory home-branch gate for Service Operations user onboarding.
# Plan is read-only. Apply requires the exact approved Plan hash and always performs live Verify.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$branchValues = @{
    Auckland = 122830000
    Waikato = 122830001
    Hastings = 122830002
    Christchurch = 122830003
}

function Resolve-WorkspacePath([string]$Path) {
    if ([IO.Path]::IsPathRooted($Path)) { return [IO.Path]::GetFullPath($Path) }
    return [IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

$upn = $UserPrincipalName.Trim().ToLowerInvariant()
$expectedBranch = [int]$branchValues[$HomeBranch]
$resolvedMappingPath = Resolve-WorkspacePath $MappingPath
if (-not (Test-Path -LiteralPath $resolvedMappingPath -PathType Leaf)) {
    throw "The reviewed user branch mapping was not found: $resolvedMappingPath"
}

$mapping = Get-Content -LiteralPath $resolvedMappingPath -Raw | ConvertFrom-Json
if ($mapping.schemaVersion -ne 1 -or $mapping.allBranchesAvailable -ne $true) {
    throw 'The reviewed user branch mapping must use schemaVersion 1 and allBranchesAvailable true.'
}
$reviewedUsers = @($mapping.users | Where-Object {
    ([string]$_.userPrincipalName).Trim().ToLowerInvariant() -eq $upn
})
if ($reviewedUsers.Count -ne 1) {
    throw "$upn must have exactly one reviewed entry in $resolvedMappingPath before user setup can continue."
}
if ([int]$reviewedUsers[0].homeBranch -ne $expectedBranch) {
    throw "The requested $HomeBranch branch does not match the reviewed mapping for $upn."
}

$resolvedArtifactDirectory = Resolve-WorkspacePath $ArtifactDirectory
if (-not (Test-Path -LiteralPath $resolvedArtifactDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $resolvedArtifactDirectory | Out-Null
}
$slug = $upn -replace '[^a-z0-9]+', '-'
$snapshotPath = Join-Path $resolvedArtifactDirectory "$slug-snapshot.json"
$singleUserMappingPath = Join-Path $resolvedArtifactDirectory "$slug-mapping.json"
$defaultPlanPath = Join-Path $resolvedArtifactDirectory "$slug-plan.json"
$resolvedPlanPath = if ([string]::IsNullOrWhiteSpace($PlanPath)) {
    $defaultPlanPath
} else {
    Resolve-WorkspacePath $PlanPath
}
$applyPath = Join-Path $resolvedArtifactDirectory "$slug-apply.json"
$checkpointPath = Join-Path $resolvedArtifactDirectory "$slug-apply-checkpoint.json"
$verifyPath = Join-Path $resolvedArtifactDirectory "$slug-verify.json"

$planScript = Join-Path $PSScriptRoot 'service-coordination-user-branch-plan.mjs'
$snapshotScript = Join-Path $PSScriptRoot 'export-service-coordination-user-branch-snapshot.ps1'
$liveScript = Join-Path $PSScriptRoot 'invoke-service-coordination-live-migration.ps1'

if ($Mode -eq 'Plan') {
    $singleUserMapping = [ordered]@{
        schemaVersion = 1
        scope = 'single-user-onboarding-home-branch'
        allBranchesAvailable = $true
        users = @([ordered]@{
            userPrincipalName = $upn
            homeBranch = $expectedBranch
        })
    }
    [IO.File]::WriteAllText(
        $singleUserMappingPath,
        ($singleUserMapping | ConvertTo-Json -Depth 5),
        [Text.UTF8Encoding]::new($false)
    )

    & $snapshotScript `
        -EnvironmentUrl $EnvironmentUrl `
        -UserName $OperatorUserName `
        -LoginPrompt $LoginPrompt `
        -UserPrincipalNames @($upn) `
        -OutputPath $snapshotPath | Out-Null

    & node $planScript `
        --mode Plan `
        --input $snapshotPath `
        --mapping $singleUserMappingPath `
        --output $resolvedPlanPath | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Home-branch Plan failed with exit code $LASTEXITCODE." }

    $plan = Get-Content -LiteralPath $resolvedPlanPath -Raw | ConvertFrom-Json
    [pscustomobject]@{
        mode = 'Plan'
        mutationsPerformed = $false
        userPrincipalName = $upn
        homeBranch = $HomeBranch
        homeBranchValue = $expectedBranch
        disposition = [string]$plan.outcomes[0].disposition
        planHash = [string]$plan.planHash
        planPath = $resolvedPlanPath
        nextStep = "Review this artifact, then rerun with -Mode Apply -ApprovedPlanHash '$($plan.planHash)'. Apply automatically verifies the live branch."
    } | ConvertTo-Json -Depth 4
    exit 0
}

if ([string]::IsNullOrWhiteSpace($ApprovedPlanHash)) {
    throw "$Mode requires ApprovedPlanHash from the reviewed single-user Plan."
}
if (-not (Test-Path -LiteralPath $resolvedPlanPath -PathType Leaf)) {
    throw "The approved single-user Plan was not found: $resolvedPlanPath"
}
$approvedPlan = Get-Content -LiteralPath $resolvedPlanPath -Raw | ConvertFrom-Json
$outcomes = @($approvedPlan.outcomes)
if ($outcomes.Count -ne 1) {
    throw 'User setup accepts only a Plan containing exactly one user.'
}
if (([string]$outcomes[0].userPrincipalName).Trim().ToLowerInvariant() -ne $upn) {
    throw 'The approved Plan belongs to a different user.'
}
if ([int]$outcomes[0].proposedValue -ne $expectedBranch) {
    throw 'The approved Plan belongs to a different home branch.'
}

if ($Mode -eq 'Apply') {
    & $liveScript `
        -Operation UserBranchApply `
        -EnvironmentUrl $EnvironmentUrl `
        -UserName $OperatorUserName `
        -LoginPrompt $LoginPrompt `
        -PlanPath $resolvedPlanPath `
        -ApprovedPlanHash $ApprovedPlanHash `
        -OutputPath $applyPath `
        -CheckpointPath $checkpointPath | Out-Null
}

# Verify is mandatory after Apply and may also be run independently.
& $liveScript `
    -Operation UserBranchVerify `
    -EnvironmentUrl $EnvironmentUrl `
    -UserName $OperatorUserName `
    -LoginPrompt $LoginPrompt `
    -PlanPath $resolvedPlanPath `
    -ApprovedPlanHash $ApprovedPlanHash `
    -OutputPath $verifyPath | Out-Null

$verification = Get-Content -LiteralPath $verifyPath -Raw | ConvertFrom-Json
if ([int]$verification.counts.verified -ne 1 -or [int]$verification.counts.mismatch -ne 0) {
    throw "Home-branch verification failed for $upn. User setup is incomplete. See $verifyPath"
}

[pscustomobject]@{
    mode = if ($Mode -eq 'Apply') { 'ApplyAndVerify' } else { 'Verify' }
    mutationsPerformed = if ($Mode -eq 'Apply') {
        [bool](Get-Content -LiteralPath $applyPath -Raw | ConvertFrom-Json).mutationsPerformed
    } else {
        $false
    }
    userPrincipalName = $upn
    homeBranch = $HomeBranch
    homeBranchValue = $expectedBranch
    verified = 1
    mismatch = 0
    planHash = [string]$verification.planHash
    applyPath = if ($Mode -eq 'Apply') { $applyPath } else { $null }
    verifyPath = $verifyPath
    onboardingComplete = $true
} | ConvertTo-Json -Depth 4
