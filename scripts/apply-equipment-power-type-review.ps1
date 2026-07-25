param(
    [Parameter(Mandatory = $true)]
    [string]$ReviewPath,
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com'
)

$ErrorActionPreference = 'Stop'

$resolvedReviewPath = (Resolve-Path -LiteralPath $ReviewPath).Path
$rows = @(Get-Content -Raw -LiteralPath $resolvedReviewPath | ConvertFrom-Csv -Delimiter "`t")
if ($rows.Count -eq 0) { throw 'The corrected review contains no Equipment rows.' }

$duplicateIds = $rows | Group-Object EquipmentId | Where-Object Count -gt 1
if ($duplicateIds) { throw "The corrected review contains duplicate Equipment IDs: $($duplicateIds.Name -join ', ')" }

$choiceValues = @{ ICE = 122830000; Electric = 122830001 }
foreach ($row in $rows) {
    if ($row.EquipmentId -notmatch '^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') {
        throw "Invalid Equipment ID in corrected review: $($row.EquipmentId)"
    }
    if (-not $choiceValues.ContainsKey($row.ProposedPowerType)) {
        throw "Unsupported proposed Power Type '$($row.ProposedPowerType)' for Equipment $($row.EquipmentId)."
    }
}

$pacTools = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\PowerAppsCLI" -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $pacTools) { throw 'Microsoft PowerApps CLI SDK files were not found.' }
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

$updated = [System.Collections.Generic.List[object]]::new()
$preserved = [System.Collections.Generic.List[object]]::new()
$failed = [System.Collections.Generic.List[object]]::new()

foreach ($row in $rows) {
    if ($row.CurrentPowerType -ne 'Unset') {
        $preserved.Add([pscustomobject]@{
            EquipmentId = $row.EquipmentId
            Fleet = $row.Fleet
            Reason = 'Existing value in reviewed data was preserved.'
        })
        continue
    }

    try {
        $id = [guid]$row.EquipmentId
        $current = $service.Retrieve(
            'gr_equipment',
            $id,
            [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_powertype')
        )
        if ($current.Attributes.ContainsKey('gr_powertype')) {
            $preserved.Add([pscustomobject]@{
                EquipmentId = $row.EquipmentId
                Fleet = $row.Fleet
                Reason = 'Dataverse gained a Power Type after review; existing value was preserved.'
            })
            continue
        }

        $update = [Microsoft.Xrm.Sdk.Entity]::new('gr_equipment', $id)
        $update['gr_powertype'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new($choiceValues[$row.ProposedPowerType])
        $service.Update($update)
        $updated.Add([pscustomobject]@{
            EquipmentId = $row.EquipmentId
            Fleet = $row.Fleet
            PowerType = $row.ProposedPowerType
        })
    } catch {
        $failed.Add([pscustomobject]@{
            EquipmentId = $row.EquipmentId
            Fleet = $row.Fleet
            Error = $_.Exception.Message
        })
    }
}

$verificationFailures = [System.Collections.Generic.List[object]]::new()
foreach ($item in $updated) {
    try {
        $record = $service.Retrieve(
            'gr_equipment',
            [guid]$item.EquipmentId,
            [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_powertype')
        )
        $actual = if ($record.Attributes.ContainsKey('gr_powertype')) {
            $record['gr_powertype'].Value
        } else {
            $null
        }
        if ($actual -ne $choiceValues[$item.PowerType]) {
            $verificationFailures.Add([pscustomobject]@{
                EquipmentId = $item.EquipmentId
                Fleet = $item.Fleet
                Expected = $item.PowerType
                ActualValue = $actual
            })
        }
    } catch {
        $verificationFailures.Add([pscustomobject]@{
            EquipmentId = $item.EquipmentId
            Fleet = $item.Fleet
            Expected = $item.PowerType
            ActualValue = "Reload failed: $($_.Exception.Message)"
        })
    }
}

[pscustomobject]@{
    Reviewed = $rows.Count
    Updated = $updated.Count
    UpdatedElectric = @($updated | Where-Object PowerType -eq 'Electric').Count
    UpdatedIce = @($updated | Where-Object PowerType -eq 'ICE').Count
    ExistingPreserved = $preserved.Count
    UpdateFailures = $failed.Count
    VerificationFailures = $verificationFailures.Count
    Preserved = $preserved
    Failures = $failed
    VerificationErrors = $verificationFailures
    VerifiedSample = @($updated | Select-Object -First 10)
} | ConvertTo-Json -Depth 5

if ($failed.Count -gt 0 -or $verificationFailures.Count -gt 0) { exit 1 }
