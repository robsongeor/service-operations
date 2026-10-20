param(
    [ValidateSet('Plan', 'Apply', 'Verify')]
    [string]$Mode = 'Plan',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$OperatorUpn = 'georger@liftrucks.co.nz',
    [string[]]$RoleNames = @('Service Operations')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$requiredPrivileges = @(
    'prvReadgr_JobCardSubmission',
    'prvReadgr_JobCardSubmissionTimeEntry',
    'prvReadgr_JobMaterial',
    'prvReadgr_JobPhoto'
)

function Require([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Escape-ODataString([string]$Value) {
    $Value.Replace("'", "''")
}

$environmentRoot = $EnvironmentUrl.TrimEnd('/')
$apiRoot = "$environmentRoot/api/data/v9.2"
$tokenJson = & az account get-access-token --resource $environmentRoot --output json
Require ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace(($tokenJson -join "`n"))) `
    'Azure CLI could not obtain an in-memory Dataverse access token.'
$token = ($tokenJson -join "`n" | ConvertFrom-Json).accessToken
Require (-not [string]::IsNullOrWhiteSpace([string]$token)) 'Azure CLI returned an empty Dataverse access token.'

$headers = @{
    Authorization = "Bearer $token"
    Accept = 'application/json'
    'OData-Version' = '4.0'
    'OData-MaxVersion' = '4.0'
}

function Invoke-DataverseGet([string]$Path) {
    Invoke-RestMethod -Method Get -Uri "$apiRoot/$Path" -Headers $headers
}

function Get-One([string]$EntitySet, [string]$Filter, [string]$Select, [string]$Description) {
    $encodedFilter = [Uri]::EscapeDataString($Filter)
    $result = Invoke-DataverseGet "$EntitySet`?`$select=$Select&`$filter=$encodedFilter"
    $rows = @($result.value)
    Require ($rows.Count -eq 1) "Expected exactly one $Description; found $($rows.Count)."
    $rows[0]
}

$who = Invoke-DataverseGet 'WhoAmI'
$operator = Invoke-DataverseGet "systemusers($($who.UserId))?`$select=systemuserid,domainname,internalemailaddress,isdisabled"
Require (-not [bool]$operator.isdisabled) 'The authenticated Dataverse operator is disabled.'
Require (
    ([string]$operator.domainname -ieq $OperatorUpn) -or
    ([string]$operator.internalemailaddress -ieq $OperatorUpn)
) "The active Azure session is not the reviewed operator $OperatorUpn."

$privilegeMetadata = @{}
foreach ($privilegeName in $requiredPrivileges) {
    $safeName = Escape-ODataString $privilegeName
    $privilegeMetadata[$privilegeName] = Get-One 'privileges' "name eq '$safeName'" `
        'privilegeid,name' "privilege named $privilegeName"
}

$plans = [Collections.Generic.List[object]]::new()
foreach ($roleName in $RoleNames) {
    $safeRoleName = Escape-ODataString $roleName
    $role = Get-One 'roles' "name eq '$safeRoleName'" `
        'roleid,name,_businessunitid_value,ismanaged' "security role named $roleName"
    Require (-not [bool]$role.ismanaged) "$roleName is managed; refusing to alter it."
    Require (-not [string]::IsNullOrWhiteSpace([string]$role._businessunitid_value)) `
        "$roleName has no verifiable business unit."

    $current = Invoke-DataverseGet "RetrieveRolePrivilegesRole(RoleId=$($role.roleid))"
    $heldByName = @{}
    foreach ($grant in @($current.RolePrivileges)) { $heldByName[[string]$grant.PrivilegeName] = $grant }

    $missing = [Collections.Generic.List[string]]::new()
    foreach ($privilegeName in $requiredPrivileges) {
        if (-not $heldByName.ContainsKey($privilegeName)) {
            $missing.Add($privilegeName)
            continue
        }
        Require ([string]$heldByName[$privilegeName].Depth -eq 'Global') `
            "$roleName has $privilegeName at $($heldByName[$privilegeName].Depth) depth; refusing an implicit depth replacement."
    }

    $plans.Add([pscustomobject]@{
        Role = $roleName
        RoleId = [string]$role.roleid
        Missing = @($missing)
        AlreadyGlobal = @($requiredPrivileges | Where-Object { $heldByName.ContainsKey($_) })
    })

    if ($Mode -eq 'Apply' -and $missing.Count -gt 0) {
        $grants = @($missing | ForEach-Object {
            $metadata = $privilegeMetadata[$_]
            @{
                Depth = 'Global'
                PrivilegeId = [string]$metadata.privilegeid
                BusinessUnitId = [string]$role._businessunitid_value
                PrivilegeName = $_
            }
        })
        $body = @{ Privileges = $grants } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Method Post `
            -Uri "$apiRoot/roles($($role.roleid))/Microsoft.Dynamics.CRM.AddPrivilegesRole" `
            -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
        Write-Output "Applied $($missing.Count) organization-depth Job Card read privilege(s) to $roleName."
    }
}

if ($Mode -eq 'Plan') {
    $plans | ConvertTo-Json -Depth 5
    Write-Output 'Plan complete. No Dataverse role or user changes were made.'
    exit 0
}

$verificationFailures = [Collections.Generic.List[string]]::new()
foreach ($plan in $plans) {
    $current = Invoke-DataverseGet "RetrieveRolePrivilegesRole(RoleId=$($plan.RoleId))"
    foreach ($privilegeName in $requiredPrivileges) {
        $grant = @($current.RolePrivileges | Where-Object { $_.PrivilegeName -eq $privilegeName })
        if ($grant.Count -ne 1 -or [string]$grant[0].Depth -ne 'Global') {
            $verificationFailures.Add("$($plan.Role): $privilegeName is not Global")
        }
    }
}
Require ($verificationFailures.Count -eq 0) `
    "Job Card role verification failed: $($verificationFailures -join '; ')"
Write-Output "Verified organization-depth read access for all four Job Card evidence tables on $($RoleNames.Count) role(s)."
Write-Output 'No user assignments or non-read table privileges were changed.'
