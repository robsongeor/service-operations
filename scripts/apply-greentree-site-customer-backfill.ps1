param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$PlanPath = '.tmp/greentree-site-customer-backfill-plan.json',
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$resolvedPlanPath = (Resolve-Path -LiteralPath $PlanPath).Path
$plan = Get-Content -LiteralPath $resolvedPlanPath -Raw -Encoding UTF8 | ConvertFrom-Json
$updates = @($plan.rows | Where-Object { $_.action -eq 'update' })
$errors = @($plan.rows | Where-Object { $_.action -eq 'error' })
if ($errors.Count -gt 0) { throw "The reviewed plan contains $($errors.Count) error row(s). Nothing was changed." }

$invalidCount = 0
foreach ($row in $updates) {
    $parsedSiteId = [Guid]::Empty
    if (-not [Guid]::TryParse([string]$row.siteId, [ref]$parsedSiteId) -or
        [string]::IsNullOrWhiteSpace([string]$row.code)) {
        $invalidCount += 1
    }
}
if ($invalidCount -gt 0) { throw "The reviewed plan contains $invalidCount invalid update row(s). Nothing was changed." }

Write-Output "Reviewed plan contains $($updates.Count) Site mapping update(s)."
if (-not $Apply) {
    Write-Output 'Audit only. No Dataverse records changed. Pass -Apply to use the delegated admin connection.'
    exit 0
}

$pacTools = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\PowerAppsCLI" -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $pacTools) { throw 'Microsoft PowerApps CLI SDK files were not found. Install Microsoft.PowerAppsCLI first.' }
foreach ($assemblyName in @('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll')) {
    [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $assemblyName)) | Out-Null
}

$connectionString = @(
    'AuthType=OAuth'
    "Url=$EnvironmentUrl"
    'AppId=51f81489-12ee-4a9e-aaae-a2591f45987d'
    'RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97'
    'LoginPrompt=Auto'
) -join ';'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

$request = [Microsoft.Xrm.Sdk.Messages.ExecuteMultipleRequest]::new()
$request.Settings = [Microsoft.Xrm.Sdk.ExecuteMultipleSettings]::new()
$request.Settings.ContinueOnError = $false
$request.Settings.ReturnResponses = $true
$request.Requests = [Microsoft.Xrm.Sdk.OrganizationRequestCollection]::new()

foreach ($row in $updates) {
    $site = [Microsoft.Xrm.Sdk.Entity]::new('gr_site', [Guid]$row.siteId)
    $site['gr_greentreecustomercode'] = ([string]$row.code).Trim()
    $site['gr_greentreecustomername'] = if ([string]::IsNullOrWhiteSpace([string]$row.name)) { $null } else { ([string]$row.name).Trim() }
    $update = [Microsoft.Xrm.Sdk.Messages.UpdateRequest]::new()
    $update.Target = $site
    $request.Requests.Add($update)
}

$response = [Microsoft.Xrm.Sdk.Messages.ExecuteMultipleResponse]$service.Execute($request)
$faults = @($response.Responses | Where-Object { $_.Fault })
if ($faults.Count -gt 0) {
    $first = $faults[0]
    throw "Dataverse mapping backfill failed at request $($first.RequestIndex): $($first.Fault.Message)"
}

Write-Output "Updated $($updates.Count) Site mapping record(s)."
Write-Output 'Only gr_greentreecustomercode and gr_greentreecustomername were written; operational relationships and GreenTree were not changed.'
