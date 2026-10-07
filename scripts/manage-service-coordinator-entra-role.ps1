param(
    [ValidateSet('Verify', 'ProvisionRole', 'AssignBruce', 'AssignServiceCoordinator', 'RemoveServiceCoordinator')]
    [string]$Mode = 'Verify',
    [string]$TenantId = 'a348f38c-33d0-4ce9-a0df-6a66cc0562a1',
    [string]$ApplicationClientId = '9e9edbea-dfee-4995-aa1f-e9d10d16e093',
    [string]$EnterpriseApplicationId = '2026a5a5-70a4-43fb-bc61-f4de80c3f550',
    [string]$PilotUpn = 'brucef@liftrucks.co.nz'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$coordinatorValue = 'ServiceOperations.ServiceCoordinator'
$coordinatorRoleId = [Guid]'367042d5-563a-4828-9d9a-6d8c75b5afa5'
$fullAccessValue = 'ServiceOperations.FullAccess'
$officeAdminValue = 'ServiceOperations.JobCardAdmin'

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

function Write-AssignmentSummary($Assignments, $Roles) {
    Write-Output "Current application assignments for $PilotUpn`:"
    foreach ($assignment in $Assignments) {
        $role = @($Roles | Where-Object { [string]$_.id -eq [string]$assignment.appRoleId }) | Select-Object -First 1
        $label = if ($role) { [string]$role.value } elseif ([Guid]$assignment.appRoleId -eq [Guid]::Empty) { 'Default access' } else { "Unknown role $($assignment.appRoleId)" }
        Write-Output "- $label [$($assignment.id)]"
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
$coordinatorRoles = @(Find-Role $applicationRoles $coordinatorValue)
$fullRoles = @(Find-Role $applicationRoles $fullAccessValue)
$officeRoles = @(Find-Role $applicationRoles $officeAdminValue)
Require ($coordinatorRoles.Count -le 1) 'Duplicate Service Coordinator application role definitions found.'
Require ($fullRoles.Count -eq 1) 'Expected exactly one existing FullAccess application role.'
Require ($officeRoles.Count -eq 1) 'Expected exactly one existing Office Admin application role.'

if ($Mode -eq 'ProvisionRole' -and $coordinatorRoles.Count -eq 0) {
    Require (@($applicationRoles | Where-Object { [string]$_.id -eq [string]$coordinatorRoleId }).Count -eq 0) 'The reviewed Service Coordinator role ID is already used by another role.'
    $newRole = [ordered]@{
        allowedMemberTypes = @('User')
        description = 'Service Operations managers with the approved operational screen boundary.'
        displayName = 'Service Operations Manager'
        id = [string]$coordinatorRoleId
        isEnabled = $true
        value = $coordinatorValue
    }
    $body = @{ appRoles = @($applicationRoles) + @($newRole) } | ConvertTo-Json -Depth 10
    Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/applications/$($application.id)" -Body $body -ContentType 'application/json' | Out-Null
    $application = Get-Application
    $applicationRoles = @($application.appRoles)
    $coordinatorRoles = @(Find-Role $applicationRoles $coordinatorValue)
    Require ($coordinatorRoles.Count -eq 1 -and [string]$coordinatorRoles[0].id -eq [string]$coordinatorRoleId) 'Service Coordinator role creation could not be verified.'
    Write-Output "Provisioned $coordinatorValue [$coordinatorRoleId]. Existing application roles were preserved."
}

if ($coordinatorRoles.Count -eq 1) {
    $coordinator = $coordinatorRoles[0]
    Require ([bool]$coordinator.isEnabled) 'Service Coordinator application role is disabled.'
    Require (@($coordinator.allowedMemberTypes) -contains 'User') 'Service Coordinator role is not assignable to users.'
    Write-Output "Verified application role $coordinatorValue [$($coordinator.id)]."
} else {
    Write-Output "Application role $coordinatorValue is not provisioned."
}

$assignments = @(Get-Assignments ([string]$user.id))
Write-AssignmentSummary $assignments $applicationRoles

if ($Mode -eq 'AssignBruce' -or $Mode -eq 'AssignServiceCoordinator') {
    Require ($coordinatorRoles.Count -eq 1) 'Provision the Service Coordinator application role before assignment.'
    $coordinator = $coordinatorRoles[0]
    $fullAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$fullRoles[0].id })
    if ($Mode -eq 'AssignBruce') {
        Require ($fullAssignments.Count -eq 1) 'Bruce must retain exactly one FullAccess assignment during the additive pilot step.'
    }
    $coordinatorAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$coordinator.id })
    Require ($coordinatorAssignments.Count -le 1) "Duplicate Service Coordinator assignments found for $PilotUpn."
    if ($coordinatorAssignments.Count -eq 0) {
        $body = @{
            principalId = [string]$user.id
            resourceId = $EnterpriseApplicationId
            appRoleId = [string]$coordinator.id
        } | ConvertTo-Json
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments" -Body $body -ContentType 'application/json' | Out-Null
    }
    $after = @(Get-Assignments ([string]$user.id))
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$coordinator.id }).Count -eq 1) 'Service Coordinator assignment could not be verified.'
    if ($Mode -eq 'AssignBruce') {
        Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$fullRoles[0].id }).Count -eq 1) 'FullAccess was not preserved during the additive pilot assignment.'
    }
    $expectedCount = if ($coordinatorAssignments.Count -eq 0) { $assignments.Count + 1 } else { $assignments.Count }
    Require ($after.Count -eq $expectedCount) 'Unexpected application-role count after assignment; stop and inspect the account.'
    foreach ($assignment in $assignments) {
        Require (@($after | Where-Object { [string]$_.id -eq [string]$assignment.id }).Count -eq 1) 'An existing application-role assignment was not preserved.'
    }
    Write-AssignmentSummary $after $applicationRoles
    Write-Output "Verified additive pilot assignment: Service Coordinator added for $PilotUpn and all existing assignments were preserved."
} elseif ($Mode -eq 'RemoveServiceCoordinator') {
    Require ($coordinatorRoles.Count -eq 1) 'The Service Coordinator application role is not provisioned.'
    $coordinatorAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$coordinatorRoles[0].id })
    $officeAssignments = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id })
    Require ($coordinatorAssignments.Count -eq 1) "Refusing change because $PilotUpn does not have exactly one Service Coordinator assignment."
    Require ($officeAssignments.Count -eq 1) "Refusing change because $PilotUpn does not have exactly one Office Admin assignment."

    Invoke-MgGraphRequest -Method DELETE -Uri "https://graph.microsoft.com/v1.0/users/$($user.id)/appRoleAssignments/$($coordinatorAssignments[0].id)" | Out-Null

    $after = @(Get-Assignments ([string]$user.id))
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$coordinatorRoles[0].id }).Count -eq 0) 'Service Coordinator assignment is still present after removal.'
    Require (@($after | Where-Object { [string]$_.appRoleId -eq [string]$officeRoles[0].id }).Count -eq 1) 'Office Admin assignment was not preserved.'
    Require ($after.Count -eq ($assignments.Count - 1)) 'Unexpected application-role count after removal; stop and inspect the account.'
    foreach ($assignment in @($assignments | Where-Object { [string]$_.id -ne [string]$coordinatorAssignments[0].id })) {
        Require (@($after | Where-Object { [string]$_.id -eq [string]$assignment.id }).Count -eq 1) 'An unrelated application-role assignment was not preserved.'
    }
    Write-AssignmentSummary $after $applicationRoles
    Write-Output "Verified: Service Coordinator removed for $PilotUpn; Office Admin and unrelated application assignments remain."
}
