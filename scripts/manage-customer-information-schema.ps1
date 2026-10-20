param(
    [ValidateSet('Verify', 'Provision')]
    [string]$Mode = 'Verify',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

# Idempotent Customer Info metadata provisioning through the Dataverse Web API.
# Authentication is obtained from the existing Azure CLI session; the token is never printed.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$base = $EnvironmentUrl.TrimEnd('/')
$token = (& az account get-access-token --resource $base --query accessToken -o tsv).Trim()
if ([string]::IsNullOrWhiteSpace($token)) { throw 'The cached Azure sign-in did not return a Dataverse access token.' }
$headers = @{ Authorization = "Bearer $token"; Accept = 'application/json'; 'OData-MaxVersion' = '4.0'; 'OData-Version' = '4.0' }
$writeHeaders = $headers.Clone()
$writeHeaders['Content-Type'] = 'application/json; charset=utf-8'
$writeHeaders['MSCRM.SolutionUniqueName'] = $SolutionUniqueName

$definitions = @(
    @{ logical = 'gr_accountscontact'; schema = 'gr_AccountsContact'; display = 'Accounts Contact'; type = 'String'; length = 200; description = 'Customer-level accounts contact name.' },
    @{ logical = 'gr_accountsphone'; schema = 'gr_AccountsPhone'; display = 'Accounts Phone'; type = 'String'; length = 100; description = 'Customer-level accounts telephone number.' },
    @{ logical = 'gr_accountsemail'; schema = 'gr_AccountsEmail'; display = 'Accounts Email'; type = 'String'; length = 320; description = 'Customer-level accounts email address.' },
    @{ logical = 'gr_purchaseorderrequirements'; schema = 'gr_PurchaseOrderRequirements'; display = 'Purchase Order Requirements'; type = 'Memo'; length = 4000; description = 'Long-term customer purchase-order requirements.' },
    @{ logical = 'gr_customernotes'; schema = 'gr_CustomerNotes'; display = 'Customer Notes'; type = 'Memo'; length = 10000; description = 'Long-term operational information about the customer.' }
)

function New-Label([string]$Text) {
    return @{ LocalizedLabels = @(@{ Label = $Text; LanguageCode = 1033 }) }
}

function Read-Attributes([string]$Type) {
    $uri = "$base/api/data/v9.2/EntityDefinitions(LogicalName='gr_customer')/Attributes/Microsoft.Dynamics.CRM.$($Type)AttributeMetadata?`$select=LogicalName,SchemaName,MaxLength"
    return @((Invoke-RestMethod -Uri $uri -Headers $headers -Method Get).value)
}

function Get-Existing {
    $rows = @((Read-Attributes 'String') + (Read-Attributes 'Memo'))
    $map = @{}
    foreach ($row in $rows) { $map[[string]$row.LogicalName] = $row }
    return $map
}

$existing = Get-Existing
$created = 0
foreach ($definition in $definitions) {
    $attribute = $existing[$definition.logical]
    if ($null -ne $attribute) {
        if ([int]$attribute.MaxLength -lt [int]$definition.length) { throw "Conflict: gr_customer.$($definition.logical) is shorter than $($definition.length) characters." }
        Write-Output "Verified gr_customer.$($definition.logical)."
        continue
    }
    if ($Mode -ne 'Provision') { throw "Missing column: gr_customer.$($definition.logical)" }
    $payload = [ordered]@{
        '@odata.type' = "Microsoft.Dynamics.CRM.$($definition.type)AttributeMetadata"
        SchemaName = $definition.schema
        DisplayName = New-Label $definition.display
        Description = New-Label $definition.description
        RequiredLevel = @{ Value = 'None'; CanBeChanged = $true; ManagedPropertyLogicalName = 'canmodifyrequirementlevelsettings' }
        MaxLength = [int]$definition.length
    }
    if ($definition.type -eq 'String') { $payload.FormatName = @{ Value = 'Text' } }
    $uri = "$base/api/data/v9.2/EntityDefinitions(LogicalName='gr_customer')/Attributes"
    Invoke-RestMethod -Uri $uri -Headers $writeHeaders -Method Post -Body ($payload | ConvertTo-Json -Depth 8) | Out-Null
    Write-Output "Created gr_customer.$($definition.logical)."
    $created++
}

if ($created -gt 0) {
    $publish = @{ ParameterXml = '<importexportxml><entities><entity>gr_customer</entity></entities></importexportxml>' } | ConvertTo-Json
    Invoke-RestMethod -Uri "$base/api/data/v9.2/PublishXml" -Headers $writeHeaders -Method Post -Body $publish | Out-Null
}

$verified = Get-Existing
foreach ($definition in $definitions) {
    $attribute = $verified[$definition.logical]
    if ($null -eq $attribute -or [int]$attribute.MaxLength -lt [int]$definition.length) { throw "Verification failed for gr_customer.$($definition.logical)." }
}
Write-Output "Customer information schema $($Mode.ToLowerInvariant()) completed successfully."
