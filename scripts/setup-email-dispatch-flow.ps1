param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'
$pacTools = 'C:\Users\George\AppData\Local\Microsoft\PowerAppsCLI\Microsoft.PowerApps.CLI.2.9.3\tools'
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

function Add-SolutionComponent([guid]$componentId, [int]$componentType, [bool]$includeDependencies) {
    $request = [Microsoft.Crm.Sdk.Messages.AddSolutionComponentRequest]::new()
    $request.ComponentId = $componentId
    $request.ComponentType = $componentType
    $request.SolutionUniqueName = $SolutionUniqueName
    $request.AddRequiredComponents = $includeDependencies
    $service.Execute($request) | Out-Null
}

$flowName = 'Test Job Email Dispatch'
$flowQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('workflow')
$flowQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('workflowid', 'statecode')
$flowQuery.Criteria.AddCondition('category', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, 5) | Out-Null
$flowQuery.Criteria.AddCondition('name', [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal, $flowName) | Out-Null
$existingFlow = $service.RetrieveMultiple($flowQuery).Entities | Select-Object -First 1
$flowIsActive = $existingFlow -and $existingFlow.Attributes['statecode'].Value -eq 1

if ($existingFlow) {
    Write-Output "Flow already exists: $($existingFlow.Id)"
    Write-Output "State: $($existingFlow.FormattedValues['statecode'])"
}

$connectorName = 'shared_commondataserviceforapps'
$connectorApiId = '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps'
$triggerMetadataId = [guid]::NewGuid().ToString()
$actionMetadataId = [guid]::NewGuid().ToString()

$clientDataObject = @{
    properties = @{
        connectionReferences = @{
            $connectorName = @{
                impersonation = @{}
                runtimeSource = 'embedded'
                connection = @{
                    connectionReferenceLogicalName = 'msdyn_Dataverse'
                }
                api = @{ name = $connectorName }
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
                        host = @{
                            connectionName = $connectorName
                            operationId = 'SubscribeWebhookTrigger'
                            apiId = $connectorApiId
                        }
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
                Mark_Email_Dispatch_as_sent = @{
                    runAfter = @{}
                    metadata = @{ operationMetadataId = $actionMetadataId }
                    type = 'OpenApiConnection'
                    inputs = @{
                        host = @{
                            connectionName = $connectorName
                            operationId = 'UpdateRecord'
                            apiId = $connectorApiId
                        }
                        parameters = @{
                            entityName = 'gr_emaildispatchs'
                            recordId = '@triggerOutputs()?[''body/gr_emaildispatchid'']'
                            'item/gr_emailsent' = $true
                            'item/gr_completedon' = '@utcNow()'
                        }
                        authentication = "@parameters('`$authentication')"
                    }
                }
            }
        }
    }
    schemaVersion = '1.0.0.0'
}
$clientData = [string]($clientDataObject | ConvertTo-Json -Depth 30 -Compress)

if ($existingFlow) {
    $workflowId = $existingFlow.Id
    if (-not $flowIsActive) {
        $workflow = [Microsoft.Xrm.Sdk.Entity]::new('workflow', $workflowId)
        $workflow['clientdata'] = $clientData
        $service.Update($workflow)
        Write-Output "Updated cloud flow $workflowId"
    }
} else {
    $workflow = [Microsoft.Xrm.Sdk.Entity]::new('workflow')
    $workflow['category'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(5)
    $workflow['name'] = $flowName
    $workflow['type'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(1)
    $workflow['description'] = 'Test flow: marks Email Dispatch rows as sent so Service Operations can verify the button-to-flow integration.'
    $workflow['primaryentity'] = 'none'
    $workflow['clientdata'] = $clientData
    $workflowId = $service.Create($workflow)
    Write-Output "Created cloud flow $workflowId"

    Add-SolutionComponent $workflowId 29 $true
    Write-Output "Added flow and dependencies to $SolutionUniqueName"
}

if (-not $flowIsActive) {
    $activate = [Microsoft.Xrm.Sdk.Entity]::new('workflow', $workflowId)
    $activate['statecode'] = [Microsoft.Xrm.Sdk.OptionSetValue]::new(1)
    $service.Update($activate)
}

$verified = $service.Retrieve('workflow', $workflowId, [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('statecode'))
Write-Output "Flow state: $($verified.FormattedValues['statecode'])"
Write-Output 'Email Dispatch test flow created and enabled successfully.'

$unusedReferenceQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('connectionreference')
$unusedReferenceQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('connectionreferenceid')
$unusedReferenceQuery.Criteria.AddCondition(
    'connectionreferencelogicalname',
    [Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,
    'gr_sharedcommondataserviceforapps_emaildispatch'
) | Out-Null
$unusedReference = $service.RetrieveMultiple($unusedReferenceQuery).Entities | Select-Object -First 1
if ($unusedReference) {
    try {
        $service.Delete('connectionreference', $unusedReference.Id)
        Write-Output 'Removed the unused temporary Dataverse connection reference.'
    } catch {
        Write-Warning "The unused temporary connection reference could not be removed: $($_.Exception.Message)"
    }
}
