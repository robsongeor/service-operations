param([string]$SdkToolsPath = '')
# Offline compilation/tests only. No connection, provisioning, signing key, or deploy operation.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $SdkToolsPath) {
    $sdkRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $SdkToolsPath = Get-ChildItem -LiteralPath $sdkRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
}
if (-not $SdkToolsPath) { throw 'Install the approved Power Apps CLI SDK locally, or supply -SdkToolsPath. This test never downloads dependencies.' }
$sdkAssembly = Join-Path $SdkToolsPath 'Microsoft.Xrm.Sdk.dll'
[Reflection.Assembly]::LoadFrom($sdkAssembly) | Out-Null
$repository = Split-Path -Parent $PSScriptRoot
$sources = @(
    (Join-Path $repository 'dataverse\job-registration\JobRegistrationPlugin.cs'),
    (Join-Path $repository 'dataverse\job-registration\JobNumberInvariantPlugin.cs'),
    (Join-Path $repository 'tests\dataverse\JobRegistrationPluginTests.cs')
)
Add-Type -Path $sources -ReferencedAssemblies @($sdkAssembly, 'System.Core', 'System.Runtime.Serialization', 'System.ServiceModel')
[ServiceOperations.JobRegistration.Tests.RegistrationTests]::Run()
