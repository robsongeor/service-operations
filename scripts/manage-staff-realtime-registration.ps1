param(
    [ValidateSet('Inspect', 'Register', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [Guid]$ServiceEndpointId = '85b89b0f-bd59-44cb-9d98-86cc3660963e',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never'
)

& (Join-Path $PSScriptRoot 'manage-jobs-realtime-registration.ps1') `
    -Mode $Mode `
    -EnvironmentUrl $EnvironmentUrl `
    -ServiceEndpointId $ServiceEndpointId `
    -EntityName gr_mechanic `
    -LoginPrompt $LoginPrompt
