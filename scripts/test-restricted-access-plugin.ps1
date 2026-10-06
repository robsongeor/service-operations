param([string]$SdkToolsPath = '')
# Offline only: no authentication, provisioning, downloads or deployment.
$ErrorActionPreference = 'Stop'
if (-not $SdkToolsPath) {
    $sdkRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $SdkToolsPath = Get-ChildItem -LiteralPath $sdkRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
}
if (-not $SdkToolsPath) { throw 'The locally installed Power Apps CLI SDK is required.' }
$sdkAssembly = Join-Path $SdkToolsPath 'Microsoft.Xrm.Sdk.dll'
[Reflection.Assembly]::LoadFrom($sdkAssembly) | Out-Null
$repository = Split-Path -Parent $PSScriptRoot
Add-Type -Path @((Join-Path $repository 'dataverse\access\RestrictedAccessPlugin.cs'), (Join-Path $repository 'tests\dataverse\RestrictedAccessTests.cs')) -ReferencedAssemblies @($sdkAssembly, 'System.Core', 'System.Runtime.Serialization', 'System.ServiceModel')
[RestrictedAccessTests]::Run()
