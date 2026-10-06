param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

# Creates a legacy CSP signature key suitable for .NET Framework strong-name signing.
# This utility is local-only and never connects to Dataverse or deploys an assembly.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repository = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
if ($resolvedOutput.StartsWith($repository, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The strong-name key must be stored outside the repository.'
}
if ([IO.Path]::GetExtension($resolvedOutput) -ne '.snk') {
    throw 'The output must use the .snk extension.'
}
if (Test-Path -LiteralPath $resolvedOutput) {
    throw 'The requested signing key already exists and will not be overwritten.'
}

$directory = Split-Path -Parent $resolvedOutput
[IO.Directory]::CreateDirectory($directory) | Out-Null

$csp = $null
try {
    $parameters = New-Object Security.Cryptography.CspParameters 1
    $parameters.ProviderName = 'Microsoft Strong Cryptographic Provider'
    $parameters.KeyNumber = [int][Security.Cryptography.KeyNumber]::Signature
    $parameters.Flags = [Security.Cryptography.CspProviderFlags]::CreateEphemeralKey
    $csp = New-Object Security.Cryptography.RSACryptoServiceProvider 2048, $parameters
    $keyBlob = $csp.ExportCspBlob($true)
    [IO.File]::WriteAllBytes($resolvedOutput, $keyBlob)
} finally {
    if ($csp) {
        $csp.PersistKeyInCsp = $false
        $csp.Dispose()
    }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $directory '/inheritance:r' '/grant:r' "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to secure the signing-key directory.' }
& icacls.exe $resolvedOutput '/inheritance:r' '/grant:r' "${identity}:F" 'SYSTEM:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to secure the signing key.' }

[pscustomobject]@{
    path = $resolvedOutput
    owner = $identity
    keySize = 2048
    provider = 'Microsoft Strong Cryptographic Provider'
    purpose = 'Strong-name signature'
    privateKeyDisplayed = $false
}
