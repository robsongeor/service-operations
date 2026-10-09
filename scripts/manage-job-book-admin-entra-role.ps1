param(
    [ValidateSet('Verify', 'ProvisionRole', 'SwitchPilot', 'SwitchToOfficeAdmin', 'RemoveLegacy')]
    [string]$Mode = 'Verify',
    [string]$TenantId = 'a348f38c-33d0-4ce9-a0df-6a66cc0562a1',
    [string]$ApplicationClientId = '9e9edbea-dfee-4995-aa1f-e9d10d16e093',
    [string]$EnterpriseApplicationId = '2026a5a5-70a4-43fb-bc61-f4de80c3f550',
    [string]$PilotUpn = 'pubudu@liftrucks.co.nz'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$bookAdminValue = 'ServiceOperations.JobBookAdmin'
$bookAdminRoleId = [Guid]'1a512868-88a6-4abf-a77a-a0879d227dd4'
$officeAdminValue = 'ServiceOperations.JobCardAdmin'
$legacyBookValue = 'ServiceOperations.JobBookOnly'

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Invoke-GraphGet([string]$Uri) {
    Invoke-MgGraphRequest -Method GET -Uri $Uri -OutputType PSObject
}

function Get-Application {
    $result = Invoke-GraphGet "https://graph.microsoft.com/v1.0/applications?`$filter=appId%20eq%20'$ApplicationClientId'&`$select=id,appId,displayName,appRoles"
    $items = @($result.value)
    Require ($items.Count -eq 1) "Expected exactly one application registration for $ApplicationClientId; found $($items.Count)."
    $items[0]
}

function Get-ServicePrincipal {
    $result = Invoke-GraphGet "https://graph.microsoft.com/v1.0/servicePrincipals/$EnterpriseApplicationId`?`$select=id,appId,displayName,appRoles"
    Require ([string]$result.id -eq $EnterpriseApplicationId) 'The enterprise application object did not match the reviewed object ID.'
    Require ([string]$result.appId -eq $ApplicationClientId) 'The enterprise application client ID did not match the reviewed application.'
    $result
}

function Get-User {
    $encoded = [Uri]::EscapeDataString($PilotUpn)
    $user = Invoke-GraphGet "https://graph.microsoft.com/v1.0/users/$encoded`?`$select=id,userPrincipalName,displayName,accountEnabled"
    Require ([string]$user.userPrincipalName -ieq $PilotUpn) 'Resolved user does not match the requested pilot UPN.'
    Require ([bool]$user.accountEnabled) "The user $PilotUpn is disabled."
    $user
}

function Get-Assignments([string]$UserId) {
    $result = Invoke-GraphGet "https://graph.microsoft.com/v1.0/users/$UserId/appRoleAssignments?`$filter=resourceId%20eq%20$EnterpriseApplicationId&`$select=id,appRoleId,principalId,resourceId,createdDateTime"
    @($result.value)
}

function Find-Role($Roles, [string]$Value) {
    @($Roles | Where-Object { [string]$_.value -ceq $Value })
}

function Write-AssignmentSummary($Assignments, $Roles, [string]$Label) {
    Write-Output "$Label for $PilotUpn`:"
    foreach ($assignment in $Assignments) {
        $role = @($Roles | Where-Object { [string]$_.id -eq [string]$assignment.appRoleId }) | Select-Object -First 1
        $name = if ($role) { [string]$role.value } elseif ([Guid]$assignment.appRoleId -eq [Guid]::Empty) { 'Default access' } else { "Unknown role $($assignment.appRoleId)" }
        Write-Output "- $name [$($assignment.id)]"
    }
}

Import-Module Microsoft.Graph.Authentication
Connect-MgGraph -TenantId $TenantId -Scopes @(
    'Application.ReadWrite.All',
    'AppRoleAssignment.ReadWrite.All',
    'Directory.Read.All'
) -UseDeviceCode -ContextScope CurrentUser -NoWelcome

$context = Get-MgContext
Require ([string]$context.TenantId -eq $TenantId) 'Microsoft Graph connected to the wrong tenant.'
Write-Output "Connected to Microsoft Graph as $($context.Account) in tenant $($context.TenantId)."

$application = Get-Application
$servicePrincipal = Get-ServicePrincipal
$user = Get-User
$applicationRoles = @($application.appRoles)
$bookRoles = @(Find-Role $applicationRoles $bookAdminValue)
$officeRoles = @(Find-Role $applicationRoles $officeAdminValue)
$legacyRoles = @(Find-Role $applicationRoles $legacyBookValue)
Require ($bookRoles.Count -le 1) 'Duplicate Job Book Admin application role definitions found.'
Require ($officeRoles.Count -eq 1) 'Expected exactly one existing Office Admin application role.'
Require ($legacyRoles.Count -eq 1) 'Expected exactly one existing legacy Job Book Only application role.'

if ($Mode -eq 'ProvisionRole' -and $bookRoles.Count -eq 0) {
    Require (@($applicationRoles | Where-Object { [string]$_.id -eq [string]$bookAdminRoleId }).Count -eq 0) 'The reviewed Job Book Admin role ID is already used by another role.'
    $newRole = [ordered]@{
        allowedMemberTypes = @('User')
        description = 'Service Operations Job Book entry and correction users without technician email, marker or Job Card review access.'
        displayName = 'Service Operations Job Book Admin'
        id = [string]$bookAdminRoleId
        isEnabled = $true
        value = $bookAdminValue
    }
    $body = @{ appRoles = @($applicationRoles) + @($newRole) } | ConvertTo-Json -Depth 10
    Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/applications/$($application.id)" -Body $body -ContentType 'application/json' | Out-Null
    $application = Get-Application
    $applicationRoles = @($application.appRoles)
    $bookRoles = @(Find-Role $applicationRoles $bookAdminValue)
    Require ($bookRoles.Count -eq 1 -and [string]$bookRoles[0].id -eq [string]$bookAdminRoleId) 'Job Book Admin role creation could not be verified.'
    Write-Output "Provisioned $bookAdminValue [$bookAdminRoleId]. Existing application roles were preserved."
}

if ($bookRoles.Count -eq 1) {
    Require ([bool]$bookRoles[0].isEnabled) 'Job Book Admin application role is disabled.'
    Require (@($bookRoles[0].allowedMemberTypes) -contains 'User') 'Job Book Admin role is not assignable to users.'
    Write-Output "Verified application role $bookAdminValue [$($bookRoles[0].id)]."
} else {
    Write-Output "Application role $bookAdminValue is not provisioned."
}

$assignments = @(Get-Assignments ([string]$user.id))
Write-AssignmentSummary $assignments $applicationRoles "Application assignments before $Mode"

if ($Mode -eq 'SwitchPilot') {
    Require ($bookRoles.Count -eq 1) 'Provision the Job Book Admin application role before switching the pilot.'
    $officeAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id })
    $bookAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$bookRoles[0].id })
    Require ($officeAssignments.Count -eq 1) "Refusing change because $PilotUpn does not have exactly one Office Admin assignment."
    Require ($bookAssignments.Count -le 1) "Duplicate Job Book Admin assignments found for $PilotUpn."

    if ($bookAssignments.Count -eq 0) {
        $body = @{
            principalId = [string]$user.id
            resourceId = $EnterpriseApplicationId
            appRoleId = [string]$bookRoles[0].id
        } | ConvertTo-Json
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments" -Body $body -ContentType 'application/json' | Out-Null
    }

    $withReplacement = @(Get-Assignments ([string]$user.id))
    Require (@($withReplacement | Where-Object { [string]$_.appRoleId -eq [string]$bookRoles[0].id }).Count -eq 1) 'Job Book Admin assignment could not be verified before removing Office Admin.'
    Require (@($withReplacement | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id }).Count -eq 1) 'Office Admin disappeared before the verified replacement was ready.'

    Invoke-MgGraphRequest -Method DELETE -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments/$($officeAssignments[0].id)" | Out-Null
    $after = @(Get-Assignments ([string]$user.id))
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$bookRoles[0].id }).Count -eq 1) 'Job Book Admin assignment is missing after the switch.'
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id }).Count -eq 0) 'Office Admin assignment is still present after the switch.'
    Require ($after.Count -eq $assignments.Count) 'Unexpected application-role count after the switch; stop and inspect the account.'
    foreach ($assignment in @($assignments | Where-Object { [string]$_.id -ne [string]$officeAssignments[0].id })) {
        Require (@($after | Where-Object { [string]$_.id -eq [string]$assignment.id }).Count -eq 1) 'An unrelated application-role assignment was not preserved.'
    }
    Write-AssignmentSummary $after $applicationRoles "Application assignments after $Mode"
    Write-Output "Verified: $PilotUpn switched from Office Admin to Job Book Admin; unrelated application assignments remain."
}

if ($Mode -eq 'SwitchToOfficeAdmin') {
    Require ($bookRoles.Count -eq 1) 'The Job Book Admin application role must exist before switching the pilot.'
    $officeAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id })
    $bookAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$bookRoles[0].id })
    Require ($bookAssignments.Count -eq 1) "Refusing change because $PilotUpn does not have exactly one Job Book Admin assignment."
    Require ($officeAssignments.Count -le 1) "Duplicate Office Admin assignments found for $PilotUpn."

    if ($officeAssignments.Count -eq 0) {
        $body = @{
            principalId = [string]$user.id
            resourceId = $EnterpriseApplicationId
            appRoleId = [string]$officeRoles[0].id
        } | ConvertTo-Json
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments" -Body $body -ContentType 'application/json' | Out-Null
    }

    $withReplacement = @(Get-Assignments ([string]$user.id))
    Require (@($withReplacement | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id }).Count -eq 1) 'Office Admin assignment could not be verified before removing Job Book Admin.'
    Require (@($withReplacement | Where-Object { [string]$_.appRoleId -eq [string]$bookRoles[0].id }).Count -eq 1) 'Job Book Admin disappeared before the verified replacement was ready.'

    Invoke-MgGraphRequest -Method DELETE -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments/$($bookAssignments[0].id)" | Out-Null
    $after = @(Get-Assignments ([string]$user.id))
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id }).Count -eq 1) 'Office Admin assignment is missing after the switch.'
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$bookRoles[0].id }).Count -eq 0) 'Job Book Admin assignment is still present after the switch.'
    Require ($after.Count -eq $assignments.Count) 'Unexpected application-role count after the switch; stop and inspect the account.'
    foreach ($assignment in @($assignments | Where-Object { [string]$_.id -ne [string]$bookAssignments[0].id })) {
        Require (@($after | Where-Object { [string]$_.id -eq [string]$assignment.id }).Count -eq 1) 'An unrelated application-role assignment was not preserved.'
    }
    Write-AssignmentSummary $after $applicationRoles "Application assignments after $Mode"
    Write-Output "Verified: $PilotUpn switched from Job Book Admin to Office Admin; unrelated application assignments remain."
}

if ($Mode -eq 'RemoveLegacy') {
    Require ($bookRoles.Count -eq 1) 'The Job Book Admin application role must exist before removing legacy access.'
    $legacyAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$legacyRoles[0].id })
    $replacementAssignments = @($assignments | Where-Object { [string]$_.appRoleId -in @([string]$bookRoles[0].id, [string]$officeRoles[0].id) })
    Require ($legacyAssignments.Count -eq 1) "Refusing change because $PilotUpn does not have exactly one legacy Job Book Only assignment."
    Require ($replacementAssignments.Count -eq 1) "Refusing change because $PilotUpn does not have exactly one approved Job Book Admin or Office Admin replacement."

    Invoke-MgGraphRequest -Method DELETE -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments/$($legacyAssignments[0].id)" | Out-Null
    $after = @(Get-Assignments ([string]$user.id))
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$legacyRoles[0].id }).Count -eq 0) 'Legacy Job Book Only assignment is still present.'
    Require (@($after | Where-Object { [string]$_.id -eq [string]$replacementAssignments[0].id }).Count -eq 1) 'Approved replacement assignment was not preserved.'
    Require ($after.Count -eq $assignments.Count - 1) 'Unexpected application-role count after legacy removal.'
    foreach ($assignment in @($assignments | Where-Object { [string]$_.id -ne [string]$legacyAssignments[0].id })) {
        Require (@($after | Where-Object { [string]$_.id -eq [string]$assignment.id }).Count -eq 1) 'An unrelated application-role assignment was not preserved.'
    }
    Write-AssignmentSummary $after $applicationRoles "Application assignments after $Mode"
    Write-Output "Verified: removed only $legacyBookValue from $PilotUpn; the approved replacement and unrelated assignments remain."
}
