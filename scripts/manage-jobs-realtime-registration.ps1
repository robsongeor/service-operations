param(
    [ValidateSet('Inspect', 'Register', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [Guid]$ServiceEndpointId = '85b89b0f-bd59-44cb-9d98-86cc3660963e',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$messages = @('Create', 'Update', 'Delete')
$stepPrefix = 'Service Operations Jobs Realtime'
$filteringAttributes = @(
    'gr_jobnumber', 'gr_status', 'gr_ordernumber', 'gr_description', 'gr_jobtype',
    'gr_jobcardstatus', 'gr_jobcardsenton', 'gr_jobcardsubmittedon', 'gr_jobcardclosedon',
    'gr_hourmeter', 'gr_hourmeterreadingtype', 'gr_hourmeterrecordeddate', 'gr_completeddate',
    'gr_servicetype', 'gr_currentofficeaction', 'gr_officeactionowner', 'gr_officeattentionrequired',
    'gr_techniciansubmissiontokencreatedon', 'gr_techniciansubmissiontokenexpireson',
    'gr_techniciansubmissiontokenused', 'gr_techniciansubmissionsubmittedon',
    'gr_techniciansubmissionhourmeter', 'gr_techniciansubmissionstory',
    'gr_techniciansubmissionfurtherworkrequired', 'gr_techniciansubmissionfurtherworkdetails',
    'gr_techniciansubmissionsafetyissueidentified', 'gr_techniciansubmissionsafetyissuedetails',
    'gr_equipment', 'gr_mechanic', 'gr_site', 'gr_contact'
) -join ','

function Get-ToolsPath {
    $root = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path = Get-ChildItem $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } |
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
    $client = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
    if (-not $client.IsReady) {
        $advice = if ($LoginPrompt -eq 'Never') { ' Rerun with -LoginPrompt Auto only after sign-in approval.' } else { '' }
        throw "Dataverse sign-in failed: $($client.LastCrmError).$advice"
    }
    return $client
}

function Get-JobMessageFilters($Service) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessagefilter')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('sdkmessagefilterid', 'sdkmessageid', 'primaryobjecttypecode')
    $query.Criteria.AddCondition('primaryobjecttypecode', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, 'gr_job') | Out-Null
    $filters = $Service.RetrieveMultiple($query).Entities
    $result = @{}
    foreach ($filter in $filters) {
        $messageRef = [Microsoft.Xrm.Sdk.EntityReference]$filter.Attributes['sdkmessageid']
        if (-not $messageRef) { continue }
        $message = $Service.Retrieve('sdkmessage', $messageRef.Id, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name'))
        $name = [string]$message['name']
        if ($messages -contains $name) { $result[$name] = $filter }
    }
    return $result
}

function Get-RealtimeSteps($Service) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('sdkmessageprocessingstep')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new(
        'sdkmessageprocessingstepid', 'name', 'statecode', 'statuscode', 'mode', 'stage',
        'rank', 'asyncautodelete', 'filteringattributes', 'sdkmessageid', 'sdkmessagefilterid', 'eventhandler'
    )
    $query.Criteria.AddCondition('eventhandler', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $ServiceEndpointId) | Out-Null
    return @($Service.RetrieveMultiple($query).Entities)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $endpoint = $service.Retrieve('serviceendpoint', $ServiceEndpointId, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name', 'url', 'contract', 'authtype'))
    Write-Output "Endpoint: $($endpoint['name'])"
    Write-Output "URL: $($endpoint['url'])"
    $filters = Get-JobMessageFilters $service
    foreach ($message in $messages) {
        if (-not $filters.ContainsKey($message)) { throw "No $message message filter exists for gr_job." }
    }

    $steps = Get-RealtimeSteps $service
    $jobSteps = @($steps | Where-Object { [string]$_['name'] -like "$stepPrefix*" })
    Write-Output "Existing Job realtime steps: $($jobSteps.Count)"
    foreach ($step in $jobSteps) {
        Write-Output "- $($step['name']) | state=$($step.FormattedValues['statecode']) | mode=$($step['mode'].Value) | stage=$($step['stage'].Value)"
    }

    if ($Mode -eq 'Register') {
        foreach ($message in $messages) {
            $name = "$stepPrefix - $message"
            $existing = $jobSteps | Where-Object { [string]$_['name'] -eq $name } | Select-Object -First 1
            if ($existing) {
                Write-Output "Exists: $name"
                continue
            }
            $filter = $filters[$message]
            $step = [Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstep')
            $step['name'] = $name
            $step['description'] = 'Broadcast a bounded Job cache-invalidation event to authenticated Service Operations clients.'
            $step['eventhandler'] = [Microsoft.Xrm.Sdk.EntityReference]::new('serviceendpoint', $ServiceEndpointId)
            $step['sdkmessageid'] = [Microsoft.Xrm.Sdk.EntityReference]$filter.Attributes['sdkmessageid']
            $step['sdkmessagefilterid'] = [Microsoft.Xrm.Sdk.EntityReference]::new('sdkmessagefilter', $filter.Id)
            $step['stage'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(40)
            $step['mode'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(1)
            $step['rank'] = 1
            $step['supporteddeployment'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(0)
            $step['asyncautodelete'] = $true
            if ($message -eq 'Update') { $step['filteringattributes'] = $filteringAttributes }
            $id = $service.Create($step)
            Write-Output "Created: $name ($id)"
        }
    }

    if ($Mode -in @('Register', 'Verify')) {
        $verified = @(Get-RealtimeSteps $service | Where-Object { [string]$_['name'] -like "$stepPrefix*" })
        $names = @($verified | ForEach-Object { [string]$_['name'] })
        foreach ($message in $messages) {
            $expected = "$stepPrefix - $message"
            if ($names -notcontains $expected) { throw "Missing registered step: $expected" }
        }
        if ($verified.Count -ne 3) { throw "Expected exactly three Job realtime steps; found $($verified.Count)." }
        Write-Output 'Verified three asynchronous PostOperation Job realtime steps.'
    }
} finally {
    $service.Dispose()
}
