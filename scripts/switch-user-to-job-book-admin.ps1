param(
    [ValidateSet('Plan', 'Apply', 'Verify')]
    [string]$Mode = 'Plan',
    [ValidateSet('JobBookAdmin', 'ServiceCoordinator')]
    [string]$TargetProfile = 'JobBookAdmin',
    [string]$UserUpn = 'pubudu@liftrucks.co.nz',
    [string]$OperatorUpn = 'georger@liftrucks.co.nz',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$EnterpriseApplicationId = '2026a5a5-70a4-43fb-bc61-f4de80c3f550'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$coordinatorAppRole = 'ServiceOperations.ServiceCoordinator'
$bookAppRole = 'ServiceOperations.JobBookAdmin'
$coordinatorDataverseRole = 'Service Operations'
$bookDataverseRole = 'Service Operations - Job Book Admin'

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Escape-ODataString([string]$Value) {
    $Value.Replace("'", "''")
}

function Get-Token([string[]]$Arguments) {
    $json = & az account get-access-token @Arguments --output json
    Require ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($json -join "`n"))) `
        'Azure CLI could not obtain an access token.'
    $token = ($json -join "`n" | ConvertFrom-Json).accessToken
    Require (-not [string]::IsNullOrWhiteSpace([string]$token)) 'Azure CLI returned an empty access token.'
    [string]$token
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

function Get-GraphState {
    $encodedUpn = [Uri]::EscapeDataString($UserUpn)
    $user = Invoke-GraphGet "users/$encodedUpn`?`$select=id,userPrincipalName,displayName,accountEnabled"
    Require ([string]$user.userPrincipalName -ieq $UserUpn -and [bool]$user.accountEnabled) `
        "$UserUpn did not resolve to one enabled Entra user."
    $servicePrincipal = Invoke-GraphGet "servicePrincipals/$EnterpriseApplicationId`?`$select=id,appId,displayName,appRoles"
    $coordinator = @($servicePrincipal.appRoles | Where-Object { $_.value -ceq $coordinatorAppRole })
    $book = @($servicePrincipal.appRoles | Where-Object { $_.value -ceq $bookAppRole })
    Require ($coordinator.Count -eq 1 -and [bool]$coordinator[0].isEnabled) 'The coordinator app role is missing or disabled.'
    Require ($book.Count -eq 1 -and [bool]$book[0].isEnabled) 'The Job Book Admin app role is missing or disabled.'
    $result = Invoke-GraphGet "users/$($user.id)/appRoleAssignments?`$filter=resourceId%20eq%20$EnterpriseApplicationId&`$select=id,appRoleId,principalId,resourceId"
    $assignments = @($result.value)
    [pscustomobject]@{
        User = $user
        CoordinatorDefinition = $coordinator[0]
        BookDefinition = $book[0]
        Assignments = $assignments
        Coordinator = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$coordinator[0].id })
        Book = @($assignments | Where-Object { [string]$_.appRoleId -eq [string]$book[0].id })
    }
}

function Get-DataverseState {
    $safeUpn = Escape-ODataString $UserUpn
    $filter = [Uri]::EscapeDataString("domainname eq '$safeUpn' or internalemailaddress eq '$safeUpn'")
    $result = Invoke-DataverseGet "systemusers?`$select=systemuserid,domainname,internalemailaddress,isdisabled,_businessunitid_value&`$filter=$filter&`$expand=systemuserroles_association(`$select=roleid,name)"
    $users = @($result.value)
    Require ($users.Count -eq 1 -and -not [bool]$users[0].isdisabled) `
        "$UserUpn did not resolve to one enabled Dataverse user."
    $user = $users[0]
    $businessUnitId = [string]$user._businessunitid_value
    Require (-not [string]::IsNullOrWhiteSpace($businessUnitId)) 'The Dataverse user has no verifiable business unit.'

    $definitions = @{}
    foreach ($roleName in @($coordinatorDataverseRole, $bookDataverseRole)) {
        $safeName = Escape-ODataString $roleName
        $roleFilter = [Uri]::EscapeDataString("name eq '$safeName' and _businessunitid_value eq $businessUnitId")
        $roleResult = Invoke-DataverseGet "roles?`$select=roleid,name,_businessunitid_value,ismanaged&`$filter=$roleFilter"
        $roles = @($roleResult.value)
        Require ($roles.Count -eq 1 -and -not [bool]$roles[0].ismanaged) `
            "Expected one unmanaged $roleName role in the user's business unit."
        $definitions[$roleName] = $roles[0]
    }
    $roles = @($user.systemuserroles_association)
    [pscustomobject]@{
        User = $user
        Roles = $roles
        CoordinatorDefinition = $definitions[$coordinatorDataverseRole]
        BookDefinition = $definitions[$bookDataverseRole]
        Coordinator = @($roles | Where-Object { [string]$_.roleid -eq [string]$definitions[$coordinatorDataverseRole].roleid })
        Book = @($roles | Where-Object { [string]$_.roleid -eq [string]$definitions[$bookDataverseRole].roleid })
    }
}

function Assert-TransitionState($Graph, $Dataverse, [bool]$Final) {
    Require ($Graph.Coordinator.Count -le 1 -and $Graph.Book.Count -le 1) 'Duplicate relevant Entra assignments found.'
    Require ($Dataverse.Coordinator.Count -le 1 -and $Dataverse.Book.Count -le 1) 'Duplicate relevant Dataverse assignments found.'
    if ($Final) {
        if ($TargetProfile -eq 'JobBookAdmin') {
            Require ($Graph.Book.Count -eq 1 -and $Graph.Coordinator.Count -eq 0) 'Entra is not exclusively Job Book Admin.'
            Require ($Dataverse.Book.Count -eq 1 -and $Dataverse.Coordinator.Count -eq 0) 'Dataverse is not exclusively Job Book Admin.'
        } else {
            Require ($Graph.Coordinator.Count -eq 1 -and $Graph.Book.Count -eq 0) 'Entra is not exclusively Service Coordinator.'
            Require ($Dataverse.Coordinator.Count -eq 1 -and $Dataverse.Book.Count -eq 0) 'Dataverse is not exclusively Service Coordinator.'
        }
    } else {
        Require (($Graph.Coordinator.Count + $Graph.Book.Count) -ge 1) 'No supported Entra source or target profile is assigned.'
        Require (($Dataverse.Coordinator.Count + $Dataverse.Book.Count) -ge 1) 'No supported Dataverse source or target profile is assigned.'
    }
}

$graphBefore = Get-GraphState
$dataverseBefore = Get-DataverseState
Assert-TransitionState $graphBefore $dataverseBefore ($Mode -eq 'Verify')

if ($Mode -eq 'Plan') {
    [pscustomobject]@{
        User = $UserUpn
        EntraCurrent = @($graphBefore.Assignments | ForEach-Object appRoleId)
        EntraCoordinatorAssigned = $graphBefore.Coordinator.Count -eq 1
        EntraJobBookAdminAssigned = $graphBefore.Book.Count -eq 1
        DataverseCurrent = @($dataverseBefore.Roles | ForEach-Object name)
        DataverseCoordinatorAssigned = $dataverseBefore.Coordinator.Count -eq 1
        DataverseJobBookAdminAssigned = $dataverseBefore.Book.Count -eq 1
        Target = if ($TargetProfile -eq 'JobBookAdmin') { 'Job Book Admin in Entra and Dataverse; unrelated assignments preserved' } else { 'Service Coordinator in Entra and Dataverse; unrelated assignments preserved' }
    } | ConvertTo-Json -Depth 5
    Write-Output 'Plan complete. No Entra, Dataverse, branch, or reviewer-allowlist changes were made.'
    exit 0
}

if ($Mode -eq 'Apply') {
    $targetGraphDefinition = if ($TargetProfile -eq 'JobBookAdmin') { $graphBefore.BookDefinition } else { $graphBefore.CoordinatorDefinition }
    $targetDataverseDefinition = if ($TargetProfile -eq 'JobBookAdmin') { $dataverseBefore.BookDefinition } else { $dataverseBefore.CoordinatorDefinition }
    $targetGraphAssignments = @(if ($TargetProfile -eq 'JobBookAdmin') { $graphBefore.Book } else { $graphBefore.Coordinator })
    $targetDataverseAssignments = @(if ($TargetProfile -eq 'JobBookAdmin') { $dataverseBefore.Book } else { $dataverseBefore.Coordinator })
    if ($targetGraphAssignments.Count -eq 0) {
        $body = @{
            principalId = [string]$graphBefore.User.id
            resourceId = $EnterpriseApplicationId
            appRoleId = [string]$targetGraphDefinition.id
        } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "https://graph.microsoft.com/v1.0/users/$($graphBefore.User.id)/appRoleAssignments" `
            -Headers $graphHeaders -ContentType 'application/json' -Body $body | Out-Null
    }
    if ($targetDataverseAssignments.Count -eq 0) {
        $body = @{ '@odata.id' = "$dataverseRoot/roles($($targetDataverseDefinition.roleid))" } | ConvertTo-Json
        Invoke-RestMethod -Method Post `
            -Uri "$dataverseRoot/systemusers($($dataverseBefore.User.systemuserid))/systemuserroles_association/`$ref" `
            -Headers $dataverseHeaders -ContentType 'application/json' -Body $body | Out-Null
    }

    $withReplacementGraph = Get-GraphState
    $withReplacementDataverse = Get-DataverseState
    $verifiedTargetGraph = @(if ($TargetProfile -eq 'JobBookAdmin') { $withReplacementGraph.Book } else { $withReplacementGraph.Coordinator })
    $verifiedTargetDataverse = @(if ($TargetProfile -eq 'JobBookAdmin') { $withReplacementDataverse.Book } else { $withReplacementDataverse.Coordinator })
    Require ($verifiedTargetGraph.Count -eq 1) "$TargetProfile Entra assignment could not be verified before source removal."
    Require ($verifiedTargetDataverse.Count -eq 1) "$TargetProfile Dataverse role could not be verified before source removal."

    $sourceGraphAssignments = @(if ($TargetProfile -eq 'JobBookAdmin') { $withReplacementGraph.Coordinator } else { $withReplacementGraph.Book })
    $sourceDataverseAssignments = @(if ($TargetProfile -eq 'JobBookAdmin') { $withReplacementDataverse.Coordinator } else { $withReplacementDataverse.Book })
    $sourceDataverseDefinition = if ($TargetProfile -eq 'JobBookAdmin') { $withReplacementDataverse.CoordinatorDefinition } else { $withReplacementDataverse.BookDefinition }
    if ($sourceGraphAssignments.Count -eq 1) {
        Invoke-RestMethod -Method Delete `
            -Uri "https://graph.microsoft.com/v1.0/users/$($withReplacementGraph.User.id)/appRoleAssignments/$($sourceGraphAssignments[0].id)" `
            -Headers $graphHeaders | Out-Null
    }
    if ($sourceDataverseAssignments.Count -eq 1) {
        Invoke-RestMethod -Method Delete `
            -Uri "$dataverseRoot/systemusers($($withReplacementDataverse.User.systemuserid))/systemuserroles_association($($sourceDataverseDefinition.roleid))/`$ref" `
            -Headers $dataverseHeaders | Out-Null
    }
}

$graphAfter = Get-GraphState
$dataverseAfter = Get-DataverseState
Assert-TransitionState $graphAfter $dataverseAfter $true

$unrelatedGraphBefore = @($graphBefore.Assignments | Where-Object {
    [string]$_.appRoleId -notin @([string]$graphBefore.CoordinatorDefinition.id, [string]$graphBefore.BookDefinition.id)
})
foreach ($assignment in $unrelatedGraphBefore) {
    Require (@($graphAfter.Assignments | Where-Object { [string]$_.id -eq [string]$assignment.id }).Count -eq 1) `
        'An unrelated Entra application assignment was not preserved.'
}
$unrelatedDataverseBefore = @($dataverseBefore.Roles | Where-Object {
    [string]$_.roleid -notin @([string]$dataverseBefore.CoordinatorDefinition.roleid, [string]$dataverseBefore.BookDefinition.roleid)
})
foreach ($role in $unrelatedDataverseBefore) {
    Require (@($dataverseAfter.Roles | Where-Object { [string]$_.roleid -eq [string]$role.roleid }).Count -eq 1) `
        'An unrelated Dataverse role was not preserved.'
}

$targetLabel = if ($TargetProfile -eq 'JobBookAdmin') { 'Job Book Admin' } else { 'Service Coordinator' }
$removedLabel = if ($TargetProfile -eq 'JobBookAdmin') { 'Coordinator' } else { 'Job Book Admin' }
Write-Output "Verified $UserUpn as $targetLabel in Entra and Dataverse."
Write-Output "$removedLabel assignments were removed; unrelated roles and the home-branch record were not changed."
