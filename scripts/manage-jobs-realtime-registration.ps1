param(
    [ValidateSet('Inspect', 'Register', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [Guid]$ServiceEndpointId = '85b89b0f-bd59-44cb-9d98-86cc3660963e',
    [ValidateSet('gr_job', 'gr_mechanic', 'gr_jobbookentry')]
    [string]$EntityName = 'gr_job',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [switch]$UseAzureCliToken
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$messages = @('Create', 'Update', 'Delete')
$stepPrefix = switch ($EntityName) {
    'gr_mechanic' { 'Service Operations Staff Realtime' }
    'gr_jobbookentry' { 'Service Operations Auckland Job Book Realtime' }
    default { 'Service Operations Jobs Realtime' }
}
$jobFilteringAttributes = @(
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
$staffFilteringAttributes = @(
    'gr_name', 'gr_phone', 'gr_email', 'gr_camnumber', 'gr_rego', 'gr_region',
    'gr_department', 'gr_jobassignmentenabled', 'gr_customeremailccenabled',
    'statecode', 'statuscode'
) -join ','
$jobBookFilteringAttributes = @(
    'gr_jobnumber', 'gr_description', 'gr_customerpo', 'gr_stage', 'gr_voidreason',
    'gr_fleetsnapshot', 'gr_serialsnapshot', 'gr_makesnapshot', 'gr_modelsnapshot',
    'gr_customersnapshot', 'gr_sitesnapshot', 'gr_addresssnapshot', 'gr_mechanictext',
    'gr_entered', 'gr_timecloudentered', 'gr_greentreestatus', 'gr_greentreestatuscheckedon',
    'gr_equipment', 'gr_customer', 'gr_site', 'gr_contact', 'gr_mechanic', 'gr_registeredjob'
) -join ','
$filteringAttributes = switch ($EntityName) {
    'gr_mechanic' { $staffFilteringAttributes }
    'gr_jobbookentry' { $jobBookFilteringAttributes }
    default { $jobFilteringAttributes }
}

function Invoke-AzureCliDataverseRegistration {
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is required for token-based Dataverse access.' }
    $token = (& az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv)
    if ($LASTEXITCODE -ne 0 -or -not [string]$token) { throw 'Azure CLI could not acquire a Dataverse token.' }
    $apiRoot = "$($EnvironmentUrl.TrimEnd('/'))/api/data/v9.2"
    $headers = @{
        Authorization = "Bearer $token"
        Accept = 'application/json'
        'OData-Version' = '4.0'
        'OData-MaxVersion' = '4.0'
    }
    $endpoint = Invoke-RestMethod -Uri "$apiRoot/serviceendpoints($ServiceEndpointId)?`$select=name,url" -Headers $headers
    Write-Output "Endpoint: $($endpoint.name)"
    Write-Output "URL: $($endpoint.url)"

    $messageResponse = Invoke-RestMethod -Uri "$apiRoot/sdkmessages?`$select=sdkmessageid,name&`$filter=name eq 'Create' or name eq 'Update' or name eq 'Delete'" -Headers $headers
    $messagesByName = @{}
    foreach ($message in $messageResponse.value) { $messagesByName[[string]$message.name] = [Guid]$message.sdkmessageid }
    foreach ($messageName in $messages) {
        if (-not $messagesByName.ContainsKey($messageName)) { throw "No $messageName SDK message exists." }
    }

    $encodedEntityName = $EntityName.Replace("'", "''")
    $filterResponse = Invoke-RestMethod -Uri "$apiRoot/sdkmessagefilters?`$select=sdkmessagefilterid,primaryobjecttypecode,_sdkmessageid_value&`$filter=primaryobjecttypecode eq '$encodedEntityName'" -Headers $headers
    $filtersByMessage = @{}
    foreach ($messageName in $messages) {
        $messageId = $messagesByName[$messageName]
        $match = @($filterResponse.value | Where-Object { [Guid]$_._sdkmessageid_value -eq $messageId })
        if ($match.Count -ne 1) { throw "Expected one $messageName message filter for $EntityName; found $($match.Count)." }
        $filtersByMessage[$messageName] = [Guid]$match[0].sdkmessagefilterid
    }

    $stepResponse = Invoke-RestMethod -Uri "$apiRoot/sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode,statuscode,mode,stage,rank,asyncautodelete,filteringattributes,_sdkmessageid_value,_sdkmessagefilterid_value&`$filter=_eventhandler_value eq $ServiceEndpointId" -Headers $headers
    $entitySteps = @($stepResponse.value | Where-Object { [string]$_.name -like "$stepPrefix*" })
    Write-Output "Existing $EntityName realtime steps: $($entitySteps.Count)"
    foreach ($step in $entitySteps) {
        Write-Output "- $($step.name) | state=$($step.statecode) | mode=$($step.mode) | stage=$($step.stage)"
        if ([string]$step.filteringattributes) { Write-Output "  filteringattributes=$($step.filteringattributes)" }
    }

    if ($Mode -eq 'Register') {
        foreach ($messageName in $messages) {
            $name = "$stepPrefix - $messageName"
            $existing = @($entitySteps | Where-Object { [string]$_.name -eq $name })
            if ($existing.Count) { Write-Output "Exists: $name"; continue }
            $payload = @{
                name = $name
                description = "Broadcast a bounded $EntityName cache-invalidation event to authenticated Service Operations clients."
                'eventhandler_serviceendpoint@odata.bind' = "/serviceendpoints($ServiceEndpointId)"
                'sdkmessageid@odata.bind' = "/sdkmessages($($messagesByName[$messageName]))"
                'sdkmessagefilterid@odata.bind' = "/sdkmessagefilters($($filtersByMessage[$messageName]))"
                stage = 40
                mode = 1
                rank = 1
                supporteddeployment = 0
                asyncautodelete = $true
            }
            if ($messageName -eq 'Update') { $payload.filteringattributes = $filteringAttributes }
            Invoke-RestMethod -Method Post -Uri "$apiRoot/sdkmessageprocessingsteps" -Headers $headers -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 5) | Out-Null
            Write-Output "Created: $name"
        }
        $stepResponse = Invoke-RestMethod -Uri "$apiRoot/sdkmessageprocessingsteps?`$select=sdkmessageprocessingstepid,name,statecode,statuscode,mode,stage,rank,asyncautodelete,filteringattributes,_sdkmessageid_value,_sdkmessagefilterid_value&`$filter=_eventhandler_value eq $ServiceEndpointId" -Headers $headers
        $entitySteps = @($stepResponse.value | Where-Object { [string]$_.name -like "$stepPrefix*" })
    }

    if ($Mode -in @('Register', 'Verify')) {
        if ($entitySteps.Count -ne 3) { throw "Expected exactly three $EntityName realtime steps; found $($entitySteps.Count)." }
        foreach ($messageName in $messages) {
            $name = "$stepPrefix - $messageName"
            $step = @($entitySteps | Where-Object { [string]$_.name -eq $name })
            if ($step.Count -ne 1) { throw "Missing or duplicate realtime step: $name" }
            if ($step[0].statecode -ne 0 -or $step[0].statuscode -ne 1 -or $step[0].mode -ne 1 -or $step[0].stage -ne 40) {
                throw "Realtime step is not enabled asynchronous PostOperation: $name"
            }
        }
        $updateStep = $entitySteps | Where-Object { [string]$_.name -eq "$stepPrefix - Update" } | Select-Object -First 1
        $configuredAttributes = @([string]$updateStep.filteringattributes -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
        foreach ($attribute in @($filteringAttributes -split ',')) {
            if ($configuredAttributes -notcontains $attribute.ToLowerInvariant()) { throw "The Update step is missing filtering attribute: $attribute" }
        }
        Write-Output "Verified three asynchronous PostOperation $EntityName realtime steps."
    }
}

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
    $query.Criteria.AddCondition('primaryobjecttypecode', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $EntityName) | Out-Null
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

if ($UseAzureCliToken) {
    Invoke-AzureCliDataverseRegistration
    exit 0
}

Import-Sdk
$service = Connect-Dataverse
try {
    $endpoint = $service.Retrieve('serviceendpoint', $ServiceEndpointId, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name', 'url', 'contract', 'authtype'))
    Write-Output "Endpoint: $($endpoint['name'])"
    Write-Output "URL: $($endpoint['url'])"
    $filters = Get-JobMessageFilters $service
    foreach ($message in $messages) {
        if (-not $filters.ContainsKey($message)) { throw "No $message message filter exists for $EntityName." }
    }

    $steps = Get-RealtimeSteps $service
    $entitySteps = @($steps | Where-Object { [string]$_['name'] -like "$stepPrefix*" })
    Write-Output "Existing $EntityName realtime steps: $($entitySteps.Count)"
    foreach ($step in $entitySteps) {
        Write-Output "- $($step['name']) | state=$($step.FormattedValues['statecode']) | mode=$($step['mode'].Value) | stage=$($step['stage'].Value)"
        if ($step.Attributes.ContainsKey('filteringattributes') -and [string]$step['filteringattributes']) {
            Write-Output "  filteringattributes=$($step['filteringattributes'])"
        }
    }

    if ($Mode -eq 'Register') {
        foreach ($message in $messages) {
            $name = "$stepPrefix - $message"
            $existing = $entitySteps | Where-Object { [string]$_['name'] -eq $name } | Select-Object -First 1
            if ($existing) {
                Write-Output "Exists: $name"
                continue
            }
            $filter = $filters[$message]
            $step = [Microsoft.Xrm.Sdk.Entity]::new('sdkmessageprocessingstep')
            $step['name'] = $name
            $step['description'] = "Broadcast a bounded $EntityName cache-invalidation event to authenticated Service Operations clients."
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
        if ($verified.Count -ne 3) { throw "Expected exactly three $EntityName realtime steps; found $($verified.Count)." }
        $updateStep = $verified | Where-Object { [string]$_['name'] -eq "$stepPrefix - Update" } | Select-Object -First 1
        $configuredAttributes = if ($updateStep.Attributes.ContainsKey('filteringattributes')) {
            @([string]$updateStep['filteringattributes'] -split ',' | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
        } else { @() }
        foreach ($attribute in @($filteringAttributes -split ',')) {
            if ($configuredAttributes -notcontains $attribute.ToLowerInvariant()) {
                throw "The Update step is missing filtering attribute: $attribute"
            }
        }
        Write-Output "Verified three asynchronous PostOperation $EntityName realtime steps."
    }
} finally {
    $service.Dispose()
}
