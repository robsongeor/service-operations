param(
    [ValidateSet('Verify', 'Package')]
    [string]$Mode = 'Verify',
    [string]$SdkToolsPath = '',
    [string]$SigningKeyPath = '',
    [string]$OutputDirectory = ''
)

# Local build/package utility only. It does not connect to Dataverse, register an assembly,
# provision metadata, assign roles, deploy an application or enable a feature flag.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = Split-Path -Parent $PSScriptRoot
if (-not $SdkToolsPath) {
    $sdkRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $SdkToolsPath = Get-ChildItem -LiteralPath $sdkRoot -Directory -Filter 'Microsoft.PowerApps.CLI.*' |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'tools' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
}
if (-not $SdkToolsPath) { throw 'Power Apps CLI SDK assemblies were not found.' }

$sources = @(
    (Join-Path $repository 'dataverse\job-registration\AssemblyInfo.cs'),
    (Join-Path $repository 'dataverse\job-registration\JobRegistrationPlugin.cs'),
    (Join-Path $repository 'dataverse\job-registration\JobWorkflowPlugin.cs'),
    (Join-Path $repository 'dataverse\job-registration\JobNumberInvariantPlugin.cs'),
    (Join-Path $repository 'dataverse\access\RestrictedAccessPlugin.cs')
)
foreach ($source in $sources) { if (-not (Test-Path -LiteralPath $source)) { throw "Missing plugin source: $source" } }
$sdkAssembly = Join-Path $SdkToolsPath 'Microsoft.Xrm.Sdk.dll'
if (-not (Test-Path -LiteralPath $sdkAssembly)) { throw 'Microsoft.Xrm.Sdk.dll was not found.' }
[Reflection.Assembly]::LoadFrom($sdkAssembly) | Out-Null

$temporary = ''
if ($Mode -eq 'Package') {
    if ([string]::IsNullOrWhiteSpace($SigningKeyPath) -or -not (Test-Path -LiteralPath $SigningKeyPath -PathType Leaf)) {
        throw 'Package mode requires an existing, owner-approved strong-name key via -SigningKeyPath.'
    }
    $resolvedKey = [IO.Path]::GetFullPath($SigningKeyPath)
    $repositoryRoot = [IO.Path]::GetFullPath($repository).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if ($resolvedKey.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The strong-name key must be stored outside the repository.'
    }
    if ([IO.Path]::GetExtension($resolvedKey) -ne '.snk') { throw 'The owner-approved strong-name key must be an .snk file.' }
    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { throw 'Package mode requires -OutputDirectory.' }
    $resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
    if (-not (Test-Path -LiteralPath $resolvedOutput)) { [IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null }
    $assemblyPath = Join-Path $resolvedOutput 'ServiceOperations.UnifiedJobWorkflow.dll'
    $packageManifestPath = Join-Path $resolvedOutput 'ServiceOperations.UnifiedJobWorkflow.manifest.json'
    if ((Test-Path -LiteralPath $assemblyPath) -or (Test-Path -LiteralPath $packageManifestPath)) {
        throw 'Package output already exists. Use a new reviewed output directory; existing artifacts are never overwritten.'
    }
    $compilerOptions = "/keyfile:`"$resolvedKey`""
} else {
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ("service-operations-plugin-" + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($temporary) | Out-Null
    $assemblyPath = Join-Path $temporary 'ServiceOperations.UnifiedJobWorkflow.dll'
    $compilerOptions = ''
}

$provider = $null
try {
    $provider = [Microsoft.CSharp.CSharpCodeProvider]::new()
    $parameters = [CodeDom.Compiler.CompilerParameters]::new()
    $parameters.GenerateExecutable = $false
    $parameters.GenerateInMemory = $false
    $parameters.OutputAssembly = $assemblyPath
    $parameters.CompilerOptions = $compilerOptions
    foreach ($reference in @($sdkAssembly, 'System.dll', 'System.Core.dll', 'System.Runtime.Serialization.dll', 'System.ServiceModel.dll')) {
        [void]$parameters.ReferencedAssemblies.Add($reference)
    }
    $compiled = $provider.CompileAssemblyFromFile($parameters, [string[]]$sources)
    if ($compiled.Errors.HasErrors) {
        $details = @($compiled.Errors | ForEach-Object { $_.ToString() }) -join [Environment]::NewLine
        throw "Plugin compilation failed:$([Environment]::NewLine)$details"
    }
    $name = [Reflection.AssemblyName]::GetAssemblyName($assemblyPath)
    $token = @($name.GetPublicKeyToken())
    $tokenText = if ($token.Count) { ($token | ForEach-Object { $_.ToString('x2') }) -join '' } else { '' }
    if ($Mode -eq 'Package' -and -not $tokenText) { throw 'The packaged assembly is not strong-name signed.' }
    $assemblyHash = (Get-FileHash -LiteralPath $assemblyPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $sourceHashes = @($sources | ForEach-Object {
        [pscustomobject]@{ file = [IO.Path]::GetFileName($_); sha256 = (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    $compiledAssembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($assemblyPath))
    $types = @($compiledAssembly.GetTypes() | Where-Object { @($_.GetInterfaces() | ForEach-Object FullName) -contains 'Microsoft.Xrm.Sdk.IPlugin' } | ForEach-Object FullName | Sort-Object)
    $result = [ordered]@{
        mode = $Mode
        assembly = $name.Name
        version = $name.Version.ToString()
        publicKeyToken = $tokenText
        sha256 = $assemblyHash
        pluginTypes = $types
        sourceHashes = $sourceHashes
        output = if ($Mode -eq 'Package') { $assemblyPath } else { '(temporary verification output removed)' }
        deploymentPerformed = $false
    }
    $json = $result | ConvertTo-Json -Depth 5
    if ($Mode -eq 'Package') {
        [IO.File]::WriteAllText($packageManifestPath, $json, [Text.UTF8Encoding]::new($false))
    }
    $json
} finally {
    if ($provider -is [IDisposable]) { $provider.Dispose() }
    if ($Mode -eq 'Verify' -and $temporary -and (Test-Path -LiteralPath $temporary)) {
        $resolvedTemporary = [IO.Path]::GetFullPath($temporary)
        $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
        if (-not $resolvedTemporary.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove a verification directory outside the temporary root.' }
        Remove-Item -LiteralPath $resolvedTemporary -Recurse -Force
    }
}
