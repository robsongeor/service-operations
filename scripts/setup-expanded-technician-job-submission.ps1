param(
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew'
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $scriptRoot 'setup-job-card-submission-expansion-schema.ps1') -EnvironmentUrl $EnvironmentUrl -SolutionUniqueName $SolutionUniqueName
& (Join-Path $scriptRoot 'setup-job-photo-schema.ps1') -EnvironmentUrl $EnvironmentUrl -SolutionUniqueName $SolutionUniqueName
& (Join-Path $scriptRoot 'update-public-portal-expanded-submission-role.ps1') -EnvironmentUrl $EnvironmentUrl
Write-Output 'Expanded Technician Job Submission schema and least-privilege role update completed.'
