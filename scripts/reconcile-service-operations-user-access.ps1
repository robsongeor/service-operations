param(
    [ValidateSet('Plan', 'Apply', 'Verify')]
    [string]$Mode = 'Plan',
    [ValidateSet('ServiceCoordinator', 'JobBookAdmin')]
    [string]$TargetProfile,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[^@\s]+@[^@\s]+$')]
    [string]$UserPrincipalName,
    [string]$OperatorUpn = 'georger@liftrucks.co.nz',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$EnterpriseApplicationId = '2026a5a5-70a4-43fb-bc61-f4de80c3f550'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$profiles = @{
    ServiceCoordinator = @{
        AppRole = 'ServiceOperations.ServiceCoordinator'
        DataverseRole = 'Service Operations'
    }
    JobBookAdmin = @{
        AppRole = 'ServiceOperations.JobBookAdmin'
        DataverseRole = 'Service Operations - Job Book Admin'
    }
}
$serviceOperationsDataverseRoles = @(
    'Service Operations',
    'Service Operations - Office Admin',
    'Service Operations - Job Book Admin',
    'Service Operations - Job Book Only'
)

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Get-Token([string[]]$Arguments) {
    $json = & az account get-access-token @Arguments --output json
    Require ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($json -join "`n"))) `
        'Azure CLI could not obtain an access token.'
    $token = ($json -join "`n" | ConvertFrom-Json).accessToken
    Require (-not [string]::IsNullOrWhiteSpace([string]$token)) 'Azure CLI returned an empty access token.'
    [string]$token
}

function Escape-ODataString([string]$Value) {
    $Value.Replace("'", "''")
}

$activeAccount = (& az account show --query user.name --output tsv).Trim()
Require ($LASTEXITCODE -eq 0 -and $activeAccount -ieq $OperatorUpn) `
    "The active Azure session is not the reviewed operator $OperatorUpn."

$graphHeaders = @{
    Authorization = "Bearer $(Get-Token @('--resource-type', 'ms-graph'))"
    Accept = 'application/json'
}
$environmentRoot = $EnvironmentUrl.TrimEnd('/')
$dataverseRoot = "$environmentRoot/api/data/v9.2"
$dataverseHeaders = @{
    Authorization = "Bearer $(Get-Token @('--resource', $environmentRoot))"
    Accept = 'application/json'
    'OData-Version' = '4.0'
    'OData-MaxVersion' = '4.0'
}

function Invoke-GraphGet([string]$Path) {
    Invoke-RestMethod -Method Get -Uri "https://graph.microsoft.com/v1.0/$Path" -Headers $graphHeaders
}

function Invoke-DataverseGet([string]$Path) {
    Invoke-RestMethod -Method Get -Uri "$dataverseRoot/$Path" -Headers $dataverseHeaders
}

function Get-State {
    $encodedUpn = [Uri]::EscapeDataString($UserPrincipalName)
    $user = Invoke-GraphGet "users/$encodedUpn`?`$select=id,userPrincipalName,displayName,accountEnabled"
    Require ([string]$user.userPrincipalName -ieq $UserPrincipalName -and [bool]$user.accountEnabled) `
        "$UserPrincipalName did not resolve to one enabled Entra user."

    $servicePrincipal = Invoke-GraphGet "servicePrincipals/$EnterpriseApplicationId`?`$select=id,appId,displayName,appRoles"
    $targetAppRoles = @($servicePrincipal.appRoles | Where-Object {
        [string]$_.value -ceq [string]$profiles[$TargetProfile].AppRole
    })
    Require ($targetAppRoles.Count -eq 1 -and [bool]$targetAppRoles[0].isEnabled) `
        "The target application role $($profiles[$TargetProfile].AppRole) is missing or disabled."

    $assignmentResponse = Invoke-GraphGet "users/$($user.id)/appRoleAssignments?`$filter=resourceId%20eq%20$EnterpriseApplicationId&`$select=id,appRoleId,principalId,resourceId"
    $assignments = @($assignmentResponse.value)

    $safeUpn = Escape-ODataString $UserPrincipalName
    $filter = [Uri]::EscapeDataString("domainname eq '$safeUpn' or internalemailaddress eq '$safeUpn'")
    $userResponse = Invoke-DataverseGet "systemusers?`$select=systemuserid,domainname,internalemailaddress,isdisabled,_businessunitid_value&`$filter=$filter&`$expand=systemuserroles_association(`$select=roleid,name)"
    $dataverseUsers = @($userResponse.value)
    Require ($dataverseUsers.Count -eq 1 -and -not [bool]$dataverseUsers[0].isdisabled) `
        "$UserPrincipalName did not resolve to one enabled Dataverse user."
    $dataverseUser = $dataverseUsers[0]
    $businessUnitId = [string]$dataverseUser._businessunitid_value
    Require (-not [string]::IsNullOrWhiteSpace($businessUnitId)) 'The Dataverse user has no verifiable business unit.'

    $targetName = Escape-ODataString ([string]$profiles[$TargetProfile].DataverseRole)
    $roleFilter = [Uri]::EscapeDataString("name eq '$targetName' and _businessunitid_value eq $businessUnitId")
    $roleResponse = Invoke-DataverseGet "roles?`$select=roleid,name,_businessunitid_value,ismanaged&`$filter=$roleFilter"
    $targetDataverseRoles = @($roleResponse.value)
    Require ($targetDataverseRoles.Count -eq 1 -and -not [bool]$targetDataverseRoles[0].ismanaged) `
        "Expected one unmanaged target Dataverse role $($profiles[$TargetProfile].DataverseRole)."

    [pscustomobject]@{
        User = $user
        ServicePrincipal = $servicePrincipal
        Assignments = $assignments
        TargetAppRole = $targetAppRoles[0]
        TargetAppAssignments = @($assignments | Where-Object {
            [string]$_.appRoleId -eq [string]$targetAppRoles[0].id
        })
        DataverseUser = $dataverseUser
        DataverseRoles = @($dataverseUser.systemuserroles_association)
        TargetDataverseRole = $targetDataverseRoles[0]
        TargetDataverseAssignments = @($dataverseUser.systemuserroles_association | Where-Object {
            [string]$_.roleid -eq [string]$targetDataverseRoles[0].roleid
        })
    }
}

function Get-AppRoleLabel($State, $Assignment) {
    if ([Guid]$Assignment.appRoleId -eq [Guid]::Empty) { return 'Default access' }
    $definition = @($State.ServicePrincipal.appRoles | Where-Object {
        [string]$_.id -eq [string]$Assignment.appRoleId
    }) | Select-Object -First 1
    if ($definition) { return [string]$definition.value }
    "Unknown role $($Assignment.appRoleId)"
}

function Assert-TargetState($State) {
    Require ($State.TargetAppAssignments.Count -eq 1) `
        "The exact target Entra role $($profiles[$TargetProfile].AppRole) is not assigned once."
    Require ($State.Assignments.Count -eq 1) `
        'The account still has another assignment for this enterprise application.'
    Require ($State.TargetDataverseAssignments.Count -eq 1) `
        "The exact target Dataverse role $($profiles[$TargetProfile].DataverseRole) is not assigned once."
    $otherServiceRoles = @($State.DataverseRoles | Where-Object {
        [string]$_.name -in $serviceOperationsDataverseRoles -and
        [string]$_.roleid -ne [string]$State.TargetDataverseRole.roleid
    })
    Require ($otherServiceRoles.Count -eq 0) `
        "Other Service Operations Dataverse roles remain: $(@($otherServiceRoles | ForEach-Object name) -join ', ')."
    Require (@($State.DataverseRoles | Where-Object name -eq 'System Administrator').Count -eq 0) `
        'System Administrator remains assigned and would override the restricted target profile.'
}

$before = Get-State
$beforeAppLabels = @($before.Assignments | ForEach-Object { Get-AppRoleLabel $before $_ })
$beforeServiceRoles = @($before.DataverseRoles | Where-Object { [string]$_.name -in $serviceOperationsDataverseRoles } | ForEach-Object name)

if ($Mode -eq 'Plan') {
    [pscustomobject]@{
        User = $UserPrincipalName.ToLowerInvariant()
        CurrentApplicationAssignments = $beforeAppLabels
        CurrentServiceOperationsDataverseRoles = $beforeServiceRoles
        TargetApplicationAssignment = [string]$profiles[$TargetProfile].AppRole
        TargetDataverseRole = [string]$profiles[$TargetProfile].DataverseRole
        PreservesUnrelatedDataverseRoles = $true
        ChangesHomeBranch = $false
    } | ConvertTo-Json -Depth 5
    Write-Output 'Plan complete. No Entra, Dataverse, home-branch, or reviewer changes were made.'
    exit 0
}

if ($Mode -eq 'Apply') {
    Require ($before.TargetAppAssignments.Count -le 1) 'Duplicate target Entra assignments already exist.'
    Require ($before.TargetDataverseAssignments.Count -le 1) 'Duplicate target Dataverse assignments already exist.'

    if ($before.TargetAppAssignments.Count -eq 0) {
        $body = @{
            principalId = [string]$before.User.id
            resourceId = $EnterpriseApplicationId
            appRoleId = [string]$before.TargetAppRole.id
        } | ConvertTo-Json
        Invoke-RestMethod -Method Post `
            -Uri "https://graph.microsoft.com/v1.0/users/$($before.User.id)/appRoleAssignments" `
            -Headers $graphHeaders -ContentType 'application/json' -Body $body | Out-Null
    }
    if ($before.TargetDataverseAssignments.Count -eq 0) {
        $body = @{ '@odata.id' = "$dataverseRoot/roles($($before.TargetDataverseRole.roleid))" } | ConvertTo-Json
        Invoke-RestMethod -Method Post `
            -Uri "$dataverseRoot/systemusers($($before.DataverseUser.systemuserid))/systemuserroles_association/`$ref" `
            -Headers $dataverseHeaders -ContentType 'application/json' -Body $body | Out-Null
    }

    $withReplacement = Get-State
    Require ($withReplacement.TargetAppAssignments.Count -eq 1) 'Target Entra role could not be verified before source removal.'
    Require ($withReplacement.TargetDataverseAssignments.Count -eq 1) 'Target Dataverse role could not be verified before source removal.'

    foreach ($assignment in @($withReplacement.Assignments | Where-Object {
        [string]$_.id -ne [string]$withReplacement.TargetAppAssignments[0].id
    })) {
        Invoke-RestMethod -Method Delete `
            -Uri "https://graph.microsoft.com/v1.0/users/$($withReplacement.User.id)/appRoleAssignments/$($assignment.id)" `
            -Headers $graphHeaders | Out-Null
    }
    foreach ($role in @($withReplacement.DataverseRoles | Where-Object {
        [string]$_.name -in $serviceOperationsDataverseRoles -and
        [string]$_.roleid -ne [string]$withReplacement.TargetDataverseRole.roleid
    })) {
        Invoke-RestMethod -Method Delete `
            -Uri "$dataverseRoot/systemusers($($withReplacement.DataverseUser.systemuserid))/systemuserroles_association($($role.roleid))/`$ref" `
            -Headers $dataverseHeaders | Out-Null
    }
}

$after = Get-State
Assert-TargetState $after

$unrelatedBefore = @($before.DataverseRoles | Where-Object {
    [string]$_.name -notin $serviceOperationsDataverseRoles
})
foreach ($role in $unrelatedBefore) {
    Require (@($after.DataverseRoles | Where-Object { [string]$_.roleid -eq [string]$role.roleid }).Count -eq 1) `
        "Unrelated Dataverse role '$($role.name)' was not preserved."
}

Write-Output "Verified $($UserPrincipalName.ToLowerInvariant()) with only $($profiles[$TargetProfile].AppRole) in the Service Operations app and $($profiles[$TargetProfile].DataverseRole) in Dataverse."
Write-Output 'Unrelated Dataverse roles were preserved; home branch and reviewer configuration were not changed.'
