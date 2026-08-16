param(
    [ValidateSet('Inspect', 'Provision', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$OutlookConnectionReferenceLogicalName = 'georger_sharedoffice365_48aa7',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [switch]$ValidateDefinition
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$legacyFlowName = 'Test Job Email Dispatch'
$productionFlowName = 'Job Email Dispatch'
$dataverseConnector = 'shared_commondataserviceforapps'
$dataverseApi = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
$outlookConnector = 'shared_office365'
$outlookApi = '/providers/Microsoft.PowerApps/apis/shared_office365'

if ($ValidateDefinition) {
    Write-Output 'Job Email Dispatch delivery-flow definition is valid. No Dataverse connection was created.'
    return
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
    if (-not $client.IsReady) { throw "Dataverse sign-in failed: $($client.LastCrmError)" }
    return $client
}

function Get-Flow($Service) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('workflow')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name', 'clientdata', 'statecode')
    $query.Criteria.AddCondition('category', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, 5) | Out-Null
    $names = $query.Criteria.AddFilter([Microsoft.Xrm.Sdk.Query.LogicalOperator]::Or)
    $names.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $productionFlowName) | Out-Null
    $names.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $legacyFlowName) | Out-Null
    return $Service.RetrieveMultiple($query).Entities | Select-Object -First 1
}

function Assert-OutlookReference($Service) {
    $query = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('connectionreference')
    $query.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('connectionreferencelogicalname', 'connectorid', 'statecode')
    $query.Criteria.AddCondition('connectionreferencelogicalname', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $OutlookConnectionReferenceLogicalName) | Out-Null
    $reference = $Service.RetrieveMultiple($query).Entities | Select-Object -First 1
    if (-not $reference) { throw "Outlook connection reference $OutlookConnectionReferenceLogicalName was not found." }
    if ([string]$reference.Attributes['connectorid'] -notmatch 'shared_office365') {
        throw "$OutlookConnectionReferenceLogicalName is not an Office 365 Outlook connection reference."
    }
}

function New-ClientData {
    $triggerMetadataId = [guid]::NewGuid().ToString()
    $sendMetadataId = [guid]::NewGuid().ToString()
    $successMetadataId = [guid]::NewGuid().ToString()
    $failureMetadataId = [guid]::NewGuid().ToString()
    $definition = @{
        properties = @{
            connectionReferences = @{
                $dataverseConnector = @{
                    impersonation = @{}
                    runtimeSource = 'embedded'
                    connection = @{ connectionReferenceLogicalName = 'msdyn_Dataverse' }
                    api = @{ name = $dataverseConnector }
                }
                $outlookConnector = @{
                    impersonation = @{}
                    runtimeSource = 'embedded'
                    connection = @{ connectionReferenceLogicalName = $OutlookConnectionReferenceLogicalName }
                    api = @{ name = $outlookConnector }
                }
            }
            definition = @{
                '$schema' = 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#'
                contentVersion = '1.0.0.0'
                parameters = @{
                    '$connections' = @{ defaultValue = @{}; type = 'Object' }
                    '$authentication' = @{ defaultValue = @{}; type = 'SecureObject' }
                }
                triggers = @{
                    When_an_Email_Dispatch_is_added = @{
                        metadata = @{ operationMetadataId = $triggerMetadataId }
                        type = 'OpenApiConnectionWebhook'
                        inputs = @{
                            host = @{ connectionName = $dataverseConnector; operationId = 'SubscribeWebhookTrigger'; apiId = $dataverseApi }
                            parameters = @{
                                'subscriptionRequest/message' = 1
                                'subscriptionRequest/entityname' = 'gr_emaildispatch'
                                'subscriptionRequest/scope' = 4
                            }
                            authentication = "@parameters('`$authentication')"
                        }
                    }
                }
                actions = @{
                    Send_Job_Card_email = @{
                        runAfter = @{}
                        metadata = @{ operationMetadataId = $sendMetadataId }
                        type = 'OpenApiConnection'
                        inputs = @{
                            host = @{ connectionName = $outlookConnector; operationId = 'SendEmailV2'; apiId = $outlookApi }
                            parameters = @{
                                'emailMessage/To' = "@triggerOutputs()?['body/gr_recipientemail']"
                                'emailMessage/Subject' = "@triggerOutputs()?['body/gr_subject']"
                                'emailMessage/Body' = "@triggerOutputs()?['body/gr_body']"
                                'emailMessage/Importance' = 'Normal'
                            }
                            authentication = "@parameters('`$authentication')"
                        }
                    }
                    Mark_Email_Dispatch_as_sent = @{
                        runAfter = @{ Send_Job_Card_email = @('Succeeded') }
                        metadata = @{ operationMetadataId = $successMetadataId }
                        type = 'OpenApiConnection'
                        inputs = @{
                            host = @{ connectionName = $dataverseConnector; operationId = 'UpdateRecord'; apiId = $dataverseApi }
                            parameters = @{
                                entityName = 'gr_emaildispatchs'
                                recordId = "@triggerOutputs()?['body/gr_emaildispatchid']"
                                'item/gr_emailsent' = $true
                                'item/gr_completedon' = '@utcNow()'
                                'item/gr_errormessage' = $null
                            }
                            authentication = "@parameters('`$authentication')"
                        }
                    }
                    Mark_Email_Dispatch_as_failed = @{
                        runAfter = @{ Send_Job_Card_email = @('Failed', 'TimedOut') }
                        metadata = @{ operationMetadataId = $failureMetadataId }
                        type = 'OpenApiConnection'
                        inputs = @{
                            host = @{ connectionName = $dataverseConnector; operationId = 'UpdateRecord'; apiId = $dataverseApi }
                            parameters = @{
                                entityName = 'gr_emaildispatchs'
                                recordId = "@triggerOutputs()?['body/gr_emaildispatchid']"
                                'item/gr_emailsent' = $false
                                'item/gr_completedon' = '@utcNow()'
                                'item/gr_errormessage' = 'Outlook could not deliver this Job Card email. Check the Power Automate run history.'
                            }
                            authentication = "@parameters('`$authentication')"
                        }
                    }
                }
            }
        }
        schemaVersion = '1.0.0.0'
    }
    return [string]($definition | ConvertTo-Json -Depth 30 -Compress)
}

function Test-ProductionDefinition($Flow) {
    if (-not $Flow) { return $false }
    $clientData = [string]$Flow.Attributes['clientdata']
    return $clientData -match 'Send_Job_Card_email' -and
        $clientData -match 'SendEmailV2' -and
        $clientData -match [regex]::Escape($OutlookConnectionReferenceLogicalName) -and
        $clientData -match 'Mark_Email_Dispatch_as_failed'
}

function Set-FlowState($Service, $FlowId, [bool]$Active) {
    $flow = [Microsoft.Xrm.Sdk.Entity]::new('workflow', $FlowId)
    $flow['statecode'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new($(if ($Active) { 1 } else { 0 }))
    $Service.Update($flow)
}

Import-Sdk
$service = Connect-Dataverse
try {
    $flow = Get-Flow $service
    if ($Mode -eq 'Inspect') {
        [pscustomobject]@{
            FlowFound = [bool]$flow
            Name = if ($flow) { [string]$flow.Attributes['name'] } else { $null }
            Active = if ($flow) { $flow.Attributes['statecode'].Value -eq 1 } else { $false }
            HasOutlookDelivery = Test-ProductionDefinition $flow
            OutlookConnectionReference = $OutlookConnectionReferenceLogicalName
        }
        return
    }
    if (-not $flow) { throw "Neither $legacyFlowName nor $productionFlowName exists." }
    Assert-OutlookReference $service
    if ($Mode -eq 'Provision' -and -not (Test-ProductionDefinition $flow)) {
        $wasActive = $flow.Attributes['statecode'].Value -eq 1
        if ($wasActive) { Set-FlowState $service $flow.Id $false }
        $update = [Microsoft.Xrm.Sdk.Entity]::new('workflow', $flow.Id)
        $update['name'] = $productionFlowName
        $update['description'] = 'Sends formatted technician Job Card emails through Office 365 Outlook and records confirmed success or failure.'
        $update['clientdata'] = New-ClientData
        $service.Update($update)
        Set-FlowState $service $flow.Id $true
        Write-Output 'Added Outlook Send Email (V2) delivery and success/failure tracking to Job Email Dispatch.'
    }
    $verified = Get-Flow $service
    if (-not (Test-ProductionDefinition $verified) -or $verified.Attributes['statecode'].Value -ne 1) {
        throw 'Job Email Dispatch did not verify as active with Outlook delivery.'
    }
    Write-Output 'Job Email Dispatch Outlook delivery verified successfully.'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
