$ErrorActionPreference = 'Stop'
$pacTools = 'C:\Users\George\AppData\Local\Microsoft\PowerAppsCLI\Microsoft.PowerApps.CLI.2.9.3\tools'
foreach ($assemblyName in @('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll')) {
    [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $assemblyName)) | Out-Null
}
$connectionString = 'AuthType=OAuth;Url=https://org0d4246d7.crm6.dynamics.com;AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=Auto'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw $service.LastCrmError }

$jobQuery = [Microsoft.Xrm.Sdk.Query.QueryExpression]::new('gr_job')
$jobQuery.ColumnSet = [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_jobid')
$jobQuery.TopCount = 1
$job = $service.RetrieveMultiple($jobQuery).Entities | Select-Object -First 1
if (-not $job) { throw 'No Job record is available for the dispatch-flow test.' }

$dispatch = [Microsoft.Xrm.Sdk.Entity]::new('gr_emaildispatch')
$dispatch['gr_name'] = 'Automated flow integration test'
$dispatch['gr_recipientemail'] = 'test@example.invalid'
$dispatch['gr_recipientname'] = 'Integration Test'
$dispatch['gr_subject'] = 'Service Operations flow test'
$dispatch['gr_body'] = 'No email is sent. This row verifies the Power Automate completion response.'
$dispatch['gr_emailsent'] = $false
$dispatch['gr_requestedon'] = [datetime]::UtcNow
$dispatch['gr_job'] = [Microsoft.Xrm.Sdk.EntityReference]::new('gr_job', $job.Id)
$dispatchId = $service.Create($dispatch)
Write-Output "Created temporary dispatch $dispatchId"

try {
    $deadline = [datetime]::UtcNow.AddSeconds(60)
    do {
        Start-Sleep -Seconds 2
        $result = $service.Retrieve(
            'gr_emaildispatch',
            $dispatchId,
            [Microsoft.Xrm.Sdk.Query.ColumnSet]::new('gr_emailsent', 'gr_completedon', 'gr_errormessage')
        )
        if ($result.Attributes['gr_errormessage']) { throw [string]$result.Attributes['gr_errormessage'] }
        if ($result.Attributes['gr_emailsent'] -eq $true) {
            Write-Output "PASS: Email Sent=True; Completed On=$($result.Attributes['gr_completedon'])"
            exit 0
        }
    } while ([datetime]::UtcNow -lt $deadline)
    throw 'The flow did not mark the test dispatch as sent within 60 seconds.'
} finally {
    $service.Delete('gr_emaildispatch', $dispatchId)
    Write-Output 'Removed temporary test dispatch.'
}
