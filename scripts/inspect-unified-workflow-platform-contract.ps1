param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$UserName = '',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

# Read-only validation of the Dataverse platform tables used by the unified workflow provisioner.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$toolsRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
$toolsPath = Get-ChildItem -LiteralPath $toolsRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
    Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
if (-not $toolsPath) { throw 'Power Apps CLI SDK assemblies were not found.' }
'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll' |
    ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $toolsPath $_)) | Out-Null }

$connection = "AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
if ($UserName) { $connection += ";UserName=$($UserName.Trim())" }
$service = [Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($connection)
if (-not $service.IsReady) { throw "Dataverse sign-in failed: $($service.LastCrmError)" }

$contract = [ordered]@{
    pluginassembly = @('name','content','isolationmode','sourcetype','version','culture','publickeytoken')
    plugintype = @('typename','name','friendlyname','pluginassemblyid')
    customapi = @('name','uniquename','displayname','description','isfunction','bindingtype','allowedcustomprocessingsteptype','executeprivilegename','plugintypeid')
    customapirequestparameter = @('name','uniquename','displayname','description','type','isoptional','customapiid')
    customapiresponseproperty = @('name','uniquename','displayname','description','type','customapiid')
    sdkmessageprocessingstepsecureconfig = @('secureconfig')
    sdkmessageprocessingstep = @('name','description','stage','mode','rank','supporteddeployment','sdkmessageid','sdkmessagefilterid','plugintypeid','sdkmessageprocessingstepsecureconfigid')
    sdkmessageprocessingstepimage = @('name','entityalias','imagetype','messagepropertyname','attributes','sdkmessageprocessingstepid')
    role = @('name','businessunitid','ismanaged')
    systemuserroles = @('systemuserid','roleid')
}

try {
    $missing = [Collections.Generic.List[string]]::new()
    foreach ($table in $contract.Keys) {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new()
        $request.LogicalName = $table
        $request.EntityFilters = [Microsoft.Xrm.Sdk.Metadata.EntityFilters]::Attributes
        $request.RetrieveAsIfPublished = $true
        $metadata = $service.Execute($request).EntityMetadata
        $names = @($metadata.Attributes | ForEach-Object LogicalName)
        foreach ($column in $contract[$table]) { if ($names -notcontains $column) { $missing.Add("$table.$column") } }
        Write-Output "Platform table OK: $table ($($contract[$table].Count) required columns)"
    }
    if ($missing.Count) { throw "Missing platform columns: $($missing -join ', ')" }
    foreach ($table in 'customapirequestparameter','customapiresponseproperty') {
        $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
        $request.EntityLogicalName=$table;$request.LogicalName='type';$request.RetrieveAsIfPublished=$true
        $attribute=$service.Execute($request).AttributeMetadata
        $values=@($attribute.OptionSet.Options|ForEach-Object{"$($_.Value)=$($_.Label.UserLocalizedLabel.Label)"}) -join '; '
        Write-Output "$table.type values: $values"
    }
    $request = [Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new()
    $request.EntityLogicalName='solutioncomponent';$request.LogicalName='componenttype';$request.RetrieveAsIfPublished=$true
    $componentType=$service.Execute($request).AttributeMetadata
    $relevant=@($componentType.OptionSet.Options|Where-Object{$_.Label.UserLocalizedLabel.Label -match 'Role|Plug-in|Plugin|Custom API|SDK Message Processing Step'}|ForEach-Object{"$($_.Value)=$($_.Label.UserLocalizedLabel.Label)"}) -join '; '
    Write-Output "solutioncomponent.componenttype relevant values: $relevant"
    Write-Output 'PLATFORM_CONTRACT_OK (read-only)'
} finally {
    if ($service -is [IDisposable]) { $service.Dispose() }
}
