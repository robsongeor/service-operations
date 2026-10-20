param(
    [ValidateSet('Inspect', 'Plan')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [string]$InputPath = '',
    [string]$OutputPath = '',
    [int]$MaximumRecords = 0
)

# Read-only migration preflight and plan generator for the deterministic legacy Unconfirmed
# retirement. This script has no Apply mode and contains no Dataverse create, update, delete,
# metadata publish, import or relationship operation.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $repository 'dataverse\service-coordination\job-status-retirement-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$limit = if ($MaximumRecords -gt 0) { $MaximumRecords } else { [int]$manifest.maximumRecords }
if ($limit -lt 1) { throw 'MaximumRecords must be positive.' }
if ($Mode -eq 'Plan' -and [string]::IsNullOrWhiteSpace($OutputPath)) {
    throw 'Plan mode requires an explicit OutputPath for the review artifact.'
}

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem -LiteralPath $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
        Select-Object -First 1
    if (-not $path) { throw 'Power Apps CLI SDK assemblies were not found.' }
    return $path
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
    return $client
}

function Get-PropertyValue($Object, [string]$Name, $Default = $null) {
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) { return $Default }
    return $property.Value
}

function Convert-ToInteger($Value, [string]$Name) {
    $parsed = 0
    if ($null -eq $Value -or -not [int]::TryParse([string]$Value, [ref]$parsed)) {
        throw "$Name must be an integer."
    }
    return $parsed
}

function Get-Sha256([string]$Value) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString(
            $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))
        ).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Write-JsonFile([string]$Path, $Value) {
    $resolved = [IO.Path]::GetFullPath($Path)
    $directory = [IO.Path]::GetDirectoryName($resolved)
    if ([string]::IsNullOrWhiteSpace($directory) -or -not [IO.Directory]::Exists($directory)) {
        throw "Output directory does not exist: $directory"
    }
    $encoding = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($resolved, ($Value | ConvertTo-Json -Depth 12), $encoding)
    return $resolved
}

function Assert-Snapshot($Snapshot) {
    if ($null -eq $Snapshot) { throw 'Snapshot is empty.' }
    $metadata = Get-PropertyValue $Snapshot 'metadata'
    if ($null -eq $metadata) { throw 'Snapshot metadata is missing.' }
    if ([string](Get-PropertyValue $metadata 'table') -ne [string]$manifest.table) {
        throw "Snapshot table must be $($manifest.table)."
    }
    if ([string](Get-PropertyValue $metadata 'attribute') -ne [string]$manifest.statusColumn) {
        throw "Snapshot attribute must be $($manifest.statusColumn)."
    }
    if (-not [bool](Get-PropertyValue $metadata 'isGlobal' $false)) {
        throw "$($manifest.table).$($manifest.statusColumn) must reference a global Choice."
    }
    if ([string](Get-PropertyValue $metadata 'optionSetName') -ne [string]$manifest.globalChoice) {
        throw "Global Choice must be $($manifest.globalChoice)."
    }

    $options = @(Get-PropertyValue $metadata 'options' @())
    $actualValues = @($options | ForEach-Object { Convert-ToInteger (Get-PropertyValue $_ 'value') 'metadata option value' })
    foreach ($known in $manifest.knownStatuses) {
        if ($actualValues -notcontains [int]$known.value) {
            throw "Global Choice $($manifest.globalChoice) is missing required value $($known.value)."
        }
    }

    $jobs = @(Get-PropertyValue $Snapshot 'jobs' @())
    if ($jobs.Count -gt $limit) {
        throw "$($manifest.table) exceeds the reviewed $limit-row migration bound; no complete plan was produced."
    }
    $seen = @{}
    foreach ($job in $jobs) {
        $idText = [string](Get-PropertyValue $job 'id')
        $id = [Guid]::Empty
        if (-not [Guid]::TryParse($idText, [ref]$id) -or $id -eq [Guid]::Empty) {
            throw 'Every snapshot Job requires a non-empty GUID id.'
        }
        $canonicalId = $id.ToString('D').ToLowerInvariant()
        if ($seen.ContainsKey($canonicalId)) { throw "Duplicate Job id in snapshot: $canonicalId" }
        $seen[$canonicalId] = $true
        Convert-ToInteger (Get-PropertyValue $job 'status') "status for Job $canonicalId" | Out-Null
    }
}

function Read-OfflineSnapshot([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not [IO.File]::Exists($resolved)) { throw "Input snapshot was not found: $resolved" }
    $snapshot = Get-Content -LiteralPath $resolved -Raw | ConvertFrom-Json
    Assert-Snapshot $snapshot
    return $snapshot
}

function Get-LiveSnapshot {
    Import-Sdk
    $service = Connect-Dataverse
    try {
        $attributeRequest = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $attributeRequest.EntityLogicalName = [string]$manifest.table
        $attributeRequest.LogicalName = [string]$manifest.statusColumn
        $attributeRequest.RetrieveAsIfPublished = $true
        $attribute = $service.Execute($attributeRequest).AttributeMetadata
        if ([string]$attribute.AttributeType -ne 'Picklist') {
            throw "$($manifest.table).$($manifest.statusColumn) must be a Choice column."
        }

        $options = @($attribute.OptionSet.Options | ForEach-Object {
            [pscustomobject]@{
                value = [int]$_.Value
                labels = @($_.Label.LocalizedLabels | ForEach-Object {
                    [pscustomobject]@{ languageCode = [int]$_.LanguageCode; label = [string]$_.Label }
                })
            }
        })
        $metadata = [pscustomobject]@{
            table = [string]$manifest.table
            attribute = [string]$manifest.statusColumn
            isGlobal = [bool]$attribute.OptionSet.IsGlobal
            optionSetName = [string]$attribute.OptionSet.Name
            options = $options
        }

        $entityRequest = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $entityRequest.LogicalName = [string]$manifest.table
        $entityRequest.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Attributes
        $entityRequest.RetrieveAsIfPublished = $true
        $entityMetadata = $service.Execute($entityRequest).EntityMetadata
        $available = @{}
        foreach ($item in $entityMetadata.Attributes) { $available[[string]$item.LogicalName] = $true }
        $columns = @([string]$manifest.statusColumn, 'statecode')
        foreach ($optional in @('gr_registrationvoid', 'gr_jobtype')) {
            if ($available.ContainsKey($optional)) { $columns += $optional }
        }

        $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new([string]$manifest.table)
        $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new([string[]]$columns)
        $query.PageInfo = [Microsoft.Xrm.Sdk.Query.PagingInfo]::new()
        $query.PageInfo.Count = [Math]::Min(5000, $limit)
        $query.PageInfo.PageNumber = 1
        $jobs = [Collections.Generic.List[object]]::new()
        do {
            $page = $service.RetrieveMultiple($query)
            foreach ($row in $page.Entities) {
                if ($jobs.Count -ge $limit) {
                    throw "$($manifest.table) exceeds the reviewed $limit-row migration bound; no complete plan was produced."
                }
                $status = if ($row.Attributes.ContainsKey([string]$manifest.statusColumn)) {
                    [int]([Microsoft.Xrm.Sdk.OptionSetValue]$row[[string]$manifest.statusColumn]).Value
                } else { -1 }
                $stateCode = if ($row.Attributes.ContainsKey('statecode')) {
                    [int]([Microsoft.Xrm.Sdk.OptionSetValue]$row['statecode']).Value
                } else { -1 }
                $jobType = if ($row.Attributes.ContainsKey('gr_jobtype')) {
                    [int]([Microsoft.Xrm.Sdk.OptionSetValue]$row['gr_jobtype']).Value
                } else { $null }
                $jobs.Add([pscustomobject]@{
                    id = $row.Id.ToString('D').ToLowerInvariant()
                    status = $status
                    stateCode = $stateCode
                    registrationVoid = if ($row.Attributes.ContainsKey('gr_registrationvoid')) { [bool]$row['gr_registrationvoid'] } else { $false }
                    jobType = $jobType
                    etag = [string]$row.RowVersion
                })
            }
            $query.PageInfo.PageNumber++
            $query.PageInfo.PagingCookie = $page.PagingCookie
        } while ($page.MoreRecords)

        $snapshot = [pscustomobject]@{ metadata = $metadata; jobs = @($jobs) }
        Assert-Snapshot $snapshot
        return $snapshot
    } finally {
        if ($service -is [IDisposable]) { $service.Dispose() }
    }
}

function Get-CountKey($Job) {
    $status = Convert-ToInteger (Get-PropertyValue $Job 'status') 'Job status'
    $state = Convert-ToInteger (Get-PropertyValue $Job 'stateCode' -1) 'Job stateCode'
    $void = [bool](Get-PropertyValue $Job 'registrationVoid' $false)
    $jobTypeValue = Get-PropertyValue $Job 'jobType'
    $jobType = if ($null -eq $jobTypeValue -or [string]::IsNullOrWhiteSpace([string]$jobTypeValue)) { 'unset' } else { [string](Convert-ToInteger $jobTypeValue 'Job type') }
    return "status=$status;state=$state;void=$($void.ToString().ToLowerInvariant());type=$jobType"
}

function Get-Inspection($Snapshot) {
    $counts = @{}
    $missingEtags = 0
    $legacyRows = 0
    foreach ($job in @($Snapshot.jobs)) {
        $key = Get-CountKey $job
        if (-not $counts.ContainsKey($key)) { $counts[$key] = 0 }
        $counts[$key] = [int]$counts[$key] + 1
        if ((Convert-ToInteger (Get-PropertyValue $job 'status') 'Job status') -eq [int]$manifest.sourceStatus) {
            $legacyRows++
            if ([string]::IsNullOrWhiteSpace([string](Get-PropertyValue $job 'etag' ''))) { $missingEtags++ }
        }
    }
    $groups = @($counts.Keys | Sort-Object | ForEach-Object {
        [pscustomobject]@{ classification = $_; count = [int]$counts[$_] }
    })
    return [pscustomobject]@{
        schemaVersion = [int]$manifest.schemaVersion
        migrationId = [string]$manifest.migrationId
        mode = 'Inspect'
        mutationsPerformed = $false
        jobsInspected = @($Snapshot.jobs).Count
        legacyUnconfirmedRows = $legacyRows
        legacyRowsMissingEtag = $missingEtags
        metadata = $Snapshot.metadata
        population = $groups
        nextAction = 'Review counts, resolve missing ETags, then run Plan with an explicit output path. Apply is intentionally not implemented in this phase.'
    }
}

function New-Plan($Snapshot) {
    $changes = @($Snapshot.jobs | Where-Object {
        (Convert-ToInteger (Get-PropertyValue $_ 'status') 'Job status') -eq [int]$manifest.sourceStatus
    } | ForEach-Object {
        $guid = [Guid]::Parse([string](Get-PropertyValue $_ 'id'))
        $etag = [string](Get-PropertyValue $_ 'etag' '')
        [pscustomobject]@{
            jobId = $guid.ToString('D').ToLowerInvariant()
            expectedRowVersion = $etag
            currentStatus = [int]$manifest.sourceStatus
            proposedStatus = [int]$manifest.targetStatus
            reasonCode = [string]$manifest.reasonCode
            disposition = if ([string]::IsNullOrWhiteSpace($etag)) { 'exception-missing-etag' } else { 'ready' }
        }
    } | Sort-Object jobId)

    $canonicalLines = @($changes | ForEach-Object {
        '{0}|{1}|{2}|{3}|{4}|{5}' -f $_.jobId, $_.expectedRowVersion, $_.currentStatus, $_.proposedStatus, $_.reasonCode, $_.disposition
    })
    $hashInput = @(
        [string]$manifest.migrationId,
        "table=$($manifest.table)",
        "column=$($manifest.statusColumn)",
        "source=$($manifest.sourceStatus)",
        "target=$($manifest.targetStatus)"
    ) + $canonicalLines
    $ready = @($changes | Where-Object { $_.disposition -eq 'ready' }).Count
    $exceptions = $changes.Count - $ready
    return [pscustomobject]@{
        schemaVersion = [int]$manifest.schemaVersion
        migrationId = [string]$manifest.migrationId
        mode = 'Plan'
        generatedAtUtc = [DateTime]::UtcNow.ToString('o')
        mutationsPerformed = $false
        scope = [pscustomobject]@{
            table = [string]$manifest.table
            idColumn = [string]$manifest.primaryId
            statusColumn = [string]$manifest.statusColumn
            sourceStatus = [int]$manifest.sourceStatus
            targetStatus = [int]$manifest.targetStatus
            otherStatusReclassificationIncluded = $false
            choiceRetirementIncluded = $false
        }
        planHash = Get-Sha256 ([string]::Join("`n", $hashInput))
        counts = [pscustomobject]@{
            jobsInspected = @($Snapshot.jobs).Count
            plannedChanges = $changes.Count
            ready = $ready
            exceptions = $exceptions
        }
        changes = $changes
        approval = [pscustomobject]@{
            approved = $false
            applySupportedByThisTool = $false
            note = 'Review artifact only. A later approved Apply implementation must verify this hash and every expectedRowVersion.'
        }
    }
}

$snapshot = if ([string]::IsNullOrWhiteSpace($InputPath)) {
    Get-LiveSnapshot
} else {
    Read-OfflineSnapshot $InputPath
}

if ($Mode -eq 'Inspect') {
    Get-Inspection $snapshot | ConvertTo-Json -Depth 12
    return
}

$plan = New-Plan $snapshot
$resolvedOutput = Write-JsonFile $OutputPath $plan
[pscustomobject]@{
    mode = 'Plan'
    mutationsPerformed = $false
    outputPath = $resolvedOutput
    planHash = $plan.planHash
    jobsInspected = $plan.counts.jobsInspected
    plannedChanges = $plan.counts.plannedChanges
    ready = $plan.counts.ready
    exceptions = $plan.counts.exceptions
    applySupportedByThisTool = $false
} | ConvertTo-Json -Depth 5
