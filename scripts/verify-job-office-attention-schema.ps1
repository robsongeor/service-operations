$ErrorActionPreference = 'Stop'

$pacTools = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\PowerAppsCLI" -Directory -Recurse -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'Microsoft.Xrm.Sdk.dll') } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $pacTools) { throw 'Microsoft PowerApps CLI SDK files were not found.' }

foreach ($assemblyName in @('Microsoft.Xrm.Sdk.dll', 'Microsoft.Crm.Sdk.Proxy.dll', 'Microsoft.Xrm.Tooling.Connector.dll')) {
    [System.Reflection.Assembly]::LoadFrom((Join-Path $pacTools $assemblyName)) | Out-Null
}

$connectionString = 'AuthType=OAuth;Url=https://org0d4246d7.crm6.dynamics.com;AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=Auto'
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connectionString)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

$request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
$request.EntityLogicalName = 'gr_job'
$request.LogicalName = 'gr_officeattentionrequired'
$request.RetrieveAsIfPublished = $true
$attribute = $service.Execute($request).AttributeMetadata

Write-Output "logical=$($attribute.LogicalName); schema=$($attribute.SchemaName); type=$($attribute.AttributeType); default=$($attribute.DefaultValue)"
