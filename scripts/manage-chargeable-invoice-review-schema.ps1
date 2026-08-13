param(
    [ValidateSet('Inspect', 'Provision', 'Verify')]
    [string]$Mode = 'Inspect',
    [string]$EnvironmentUrl = 'https://org0d4246d7.crm6.dynamics.com',
    [string]$SolutionUniqueName = 'ServiceOperationsNew',
    [ValidateSet('Never', 'Auto')]
    [string]$LoginPrompt = 'Never',
    [switch]$ValidateDefinition
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$tables = @(
    @{ Schema='gr_ChargeableInvoiceReview'; Display='Chargeable Invoice Review'; Collection='Chargeable Invoice Reviews' },
    @{ Schema='gr_ChargeableInvoiceRevision'; Display='Chargeable Invoice Revision'; Collection='Chargeable Invoice Revisions' },
    @{ Schema='gr_ChargeableInvoiceLine'; Display='Chargeable Invoice Line'; Collection='Chargeable Invoice Lines' },
    @{ Schema='gr_ChargeableInvoiceCorrection'; Display='Chargeable Invoice Correction'; Collection='Chargeable Invoice Corrections' },
    @{ Schema='gr_ChargeableInvoiceDocument'; Display='Chargeable Invoice Document'; Collection='Chargeable Invoice Documents' },
    @{ Schema='gr_ChargeableInvoiceActivity'; Display='Chargeable Invoice Activity'; Collection='Chargeable Invoice Activities' },
    @{ Schema='gr_PurchaseOrderRecipient'; Display='Purchase Order Recipient'; Collection='Purchase Order Recipients' }
)

$choices = @{
    MatchStatus = @('Matched exactly','Matched manually','Unmatched','Ambiguous')
    ImportStatus = @('Staging','Active','Failed')
    WaitingOn = @('Technician','Customer','Nargiza / Accounts','Sales','Management','Other')
    PhotosStatus = @('Not requested','Requested','Received')
    Disposition = @('Ready to Process','Do Not Process')
    LineType = @('Labour','Parts','Other')
    CorrectionType = @('Header field','Story','Change line','Add line','Remove line')
    ComparisonStatus = @('Outstanding','Matched in revision','Not made','Superseded')
    DocumentType = @('GreenTree Invoice','Approval PDF','Supporting Photo','Customer PO','Job Card','Other')
    UploadStatus = @('Pending','Complete','Failed')
    RecipientRole = @('Primary','CC')
    ActivityEvent = @(
        'Invoice Uploaded','Job Matched','Review Started','Correction Added',
        'Correction Changed','Waiting Changed','Technician Selected','Photo Request Prepared',
        'Photos Received','Revised Invoice Uploaded','Revision Compared','PO Requirement Changed',
        'Approval PDF Generated','PO Request Prepared','PO Received','Ready to Process',
        'Do Not Process','Manual Note'
    )
}

function C([string]$Entity,[string]$Schema,[string]$Display,[string]$Kind,[bool]$Required=$false,$Extra=$null) {
    @{ Entity=$Entity; Schema=$Schema; Display=$Display; Kind=$Kind; Required=$Required; Extra=$Extra }
}

$columns = @(
    C 'gr_chargeableinvoicereview' 'gr_InvoiceNumber' 'Invoice Number' Text $true 50
    C 'gr_chargeableinvoicereview' 'gr_InvoiceDate' 'Invoice Date' DateOnly $true
    C 'gr_chargeableinvoicereview' 'gr_GreenTreeReference' 'GreenTree Reference' Text $true 50
    C 'gr_chargeableinvoicereview' 'gr_MatchStatus' 'Match Status' Choice $true $choices.MatchStatus
    C 'gr_chargeableinvoicereview' 'gr_ImportStatus' 'Import Status' Choice $true $choices.ImportStatus
    C 'gr_chargeableinvoicereview' 'gr_ReviewStartedOn' 'Review Started On' DateTime
    C 'gr_chargeableinvoicereview' 'gr_WaitingOn' 'Waiting On' Choice $false $choices.WaitingOn
    C 'gr_chargeableinvoicereview' 'gr_WaitingNote' 'Waiting Note' Memo $false 4000
    C 'gr_chargeableinvoicereview' 'gr_PORequired' 'PO Required' Boolean
    C 'gr_chargeableinvoicereview' 'gr_PONumber' 'PO Number' Text $false 100
    C 'gr_chargeableinvoicereview' 'gr_POReceivedOn' 'PO Received On' DateTime
    C 'gr_chargeableinvoicereview' 'gr_PhotosRequired' 'Photos Required' Boolean
    C 'gr_chargeableinvoicereview' 'gr_PhotosStatus' 'Photos Status' Choice $false $choices.PhotosStatus
    C 'gr_chargeableinvoicereview' 'gr_PhotoRequestPreparedOn' 'Photo Request Prepared On' DateTime
    C 'gr_chargeableinvoicereview' 'gr_PORequestPreparedOn' 'PO Request Prepared On' DateTime
    C 'gr_chargeableinvoicereview' 'gr_Disposition' 'Disposition' Choice $false $choices.Disposition
    C 'gr_chargeableinvoicereview' 'gr_DispositionOn' 'Disposition On' DateTime
    C 'gr_chargeableinvoicereview' 'gr_DispositionReason' 'Disposition Reason' Memo $false 4000

    C 'gr_chargeableinvoicerevision' 'gr_RevisionNumber' 'Revision Number' Integer $true @(1,100000)
    C 'gr_chargeableinvoicerevision' 'gr_ExtractionVersion' 'Extraction Version' Text $true 100
    C 'gr_chargeableinvoicerevision' 'gr_ExtractionConfidence' 'Extraction Confidence' Decimal $false @(-100000000000,100000000000,5)
    C 'gr_chargeableinvoicerevision' 'gr_InvoiceNumber' 'Invoice Number' Text $true 50
    C 'gr_chargeableinvoicerevision' 'gr_InvoiceDate' 'Invoice Date' DateOnly $true
    C 'gr_chargeableinvoicerevision' 'gr_RawOrderNumber' 'Raw Order Number' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_GreenTreeReference' 'GreenTree Reference' Text $true 50
    C 'gr_chargeableinvoicerevision' 'gr_AccountSnapshot' 'Account Snapshot' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_CustomerSnapshot' 'Customer Snapshot' Text $false 500
    C 'gr_chargeableinvoicerevision' 'gr_SiteSnapshot' 'Site Snapshot' Memo $false 4000
    C 'gr_chargeableinvoicerevision' 'gr_Headline' 'Headline' Text $false 500
    C 'gr_chargeableinvoicerevision' 'gr_Fleet' 'Fleet' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_Make' 'Make' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_Model' 'Model' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_Serial' 'Serial' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_Meter' 'Meter' Decimal $false @(0,100000000000,2)
    C 'gr_chargeableinvoicerevision' 'gr_DateOfJob' 'Date of Job' DateOnly
    C 'gr_chargeableinvoicerevision' 'gr_ServiceInterval' 'Service Interval' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_NextDue' 'Next Due' Text $false 100
    C 'gr_chargeableinvoicerevision' 'gr_RepairDescription' 'Repair Description' Memo $false 10000
    C 'gr_chargeableinvoicerevision' 'gr_WorkCompleted' 'Work Completed' Memo $false 20000
    C 'gr_chargeableinvoicerevision' 'gr_Subtotal' 'Subtotal' Money
    C 'gr_chargeableinvoicerevision' 'gr_GSTRate' 'GST Rate' Decimal $false @(0,100,5)
    C 'gr_chargeableinvoicerevision' 'gr_GSTAmount' 'GST Amount' Money
    C 'gr_chargeableinvoicerevision' 'gr_Total' 'Total' Money
    C 'gr_chargeableinvoicerevision' 'gr_ExtractionJson' 'Extraction JSON' Memo $true 1048576

    C 'gr_chargeableinvoiceline' 'gr_LineKey' 'Line Key' Text $true 100
    C 'gr_chargeableinvoiceline' 'gr_LineType' 'Line Type' Choice $true $choices.LineType
    C 'gr_chargeableinvoiceline' 'gr_Description' 'Description' Memo $true 4000
    C 'gr_chargeableinvoiceline' 'gr_Quantity' 'Quantity' Decimal $false @(-100000000000,100000000000,5)
    C 'gr_chargeableinvoiceline' 'gr_UnitPrice' 'Unit Price' Money
    C 'gr_chargeableinvoiceline' 'gr_ExtendedPrice' 'Extended Price' Money
    C 'gr_chargeableinvoiceline' 'gr_SortOrder' 'Sort Order' Integer $true @(0,100000)
    C 'gr_chargeableinvoiceline' 'gr_Confidence' 'Confidence' Decimal $false @(-100000000000,100000000000,5)
    C 'gr_chargeableinvoiceline' 'gr_RawText' 'Raw Text' Memo $false 4000

    C 'gr_chargeableinvoicecorrection' 'gr_CorrectionType' 'Correction Type' Choice $true $choices.CorrectionType
    C 'gr_chargeableinvoicecorrection' 'gr_FieldKey' 'Field Key' Text $false 100
    C 'gr_chargeableinvoicecorrection' 'gr_OriginalSnapshot' 'Original Snapshot' Memo $false 10000
    C 'gr_chargeableinvoicecorrection' 'gr_RequestedText' 'Requested Text' Memo $false 10000
    C 'gr_chargeableinvoicecorrection' 'gr_RequestedLineType' 'Requested Line Type' Choice $false $choices.LineType
    C 'gr_chargeableinvoicecorrection' 'gr_RequestedDescription' 'Requested Description' Memo $false 4000
    C 'gr_chargeableinvoicecorrection' 'gr_RequestedQuantity' 'Requested Quantity' Decimal $false @(-100000000000,100000000000,5)
    C 'gr_chargeableinvoicecorrection' 'gr_RequestedUnitPrice' 'Requested Unit Price' Money
    C 'gr_chargeableinvoicecorrection' 'gr_ComparisonStatus' 'Comparison Status' Choice $true $choices.ComparisonStatus

    C 'gr_chargeableinvoicedocument' 'gr_DocumentType' 'Document Type' Choice $true $choices.DocumentType
    C 'gr_chargeableinvoicedocument' 'gr_File' 'File' File $true 5120
    C 'gr_chargeableinvoicedocument' 'gr_ContentType' 'Content Type' Text $true 100
    C 'gr_chargeableinvoicedocument' 'gr_ByteCount' 'Byte Count' Integer $true @(0,5242880)
    C 'gr_chargeableinvoicedocument' 'gr_TemplateVersion' 'Template Version' Text $false 100
    C 'gr_chargeableinvoicedocument' 'gr_SourceSnapshotHash' 'Source Snapshot Hash' Text $false 128
    C 'gr_chargeableinvoicedocument' 'gr_UploadStatus' 'Upload Status' Choice $true $choices.UploadStatus
    C 'gr_chargeableinvoicedocument' 'gr_UploadError' 'Upload Error' Memo $false 1000

    C 'gr_chargeableinvoiceactivity' 'gr_Event' 'Event' Choice $true $choices.ActivityEvent
    C 'gr_chargeableinvoiceactivity' 'gr_Detail' 'Detail' Memo $false 4000
    C 'gr_chargeableinvoiceactivity' 'gr_OccurredOn' 'Occurred On' DateTime $true

    C 'gr_purchaseorderrecipient' 'gr_RecipientRole' 'Recipient Role' Choice $true $choices.RecipientRole
    C 'gr_purchaseorderrecipient' 'gr_SortOrder' 'Sort Order' Integer $true @(0,1000)
)

function L([string]$From,[string]$Schema,[string]$Display,[string]$To,[string]$Relationship,[bool]$Required=$false) {
    @{ From=$From; Schema=$Schema; Display=$Display; To=$To; Relationship=$Relationship; Required=$Required }
}
$lookups = @(
    L 'gr_chargeableinvoicereview' 'gr_Job' 'Job' 'gr_job' 'gr_chargeableinvoicereview_Job_gr_job'
    L 'gr_chargeableinvoicereview' 'gr_Customer' 'Customer' 'gr_customer' 'gr_chargeableinvoicereview_Customer_gr_customer'
    L 'gr_chargeableinvoicereview' 'gr_Site' 'Site' 'gr_site' 'gr_chargeableinvoicereview_Site_gr_site'
    L 'gr_chargeableinvoicereview' 'gr_Equipment' 'Equipment' 'gr_equipment' 'gr_chargeableinvoicereview_Equipment_gr_equipment'
    L 'gr_chargeableinvoicereview' 'gr_PhotoRequestTechnician' 'Photo Request Technician' 'gr_mechanic' 'gr_chargeableinvoicereview_PhotoRequestTechnician_gr_mechanic'
    L 'gr_chargeableinvoicerevision' 'gr_Review' 'Review' 'gr_chargeableinvoicereview' 'gr_chargeableinvoicerevision_Review_gr_chargeableinvoicereview' $true
    L 'gr_chargeableinvoiceline' 'gr_Revision' 'Revision' 'gr_chargeableinvoicerevision' 'gr_chargeableinvoiceline_Revision_gr_chargeableinvoicerevision' $true
    L 'gr_chargeableinvoicecorrection' 'gr_Review' 'Review' 'gr_chargeableinvoicereview' 'gr_chargeableinvoicecorrection_Review_gr_chargeableinvoicereview' $true
    L 'gr_chargeableinvoicecorrection' 'gr_SourceRevision' 'Source Revision' 'gr_chargeableinvoicerevision' 'gr_chargeableinvoicecorrection_SourceRevision_gr_chargeableinvoicerevision' $true
    L 'gr_chargeableinvoicecorrection' 'gr_SourceLine' 'Source Line' 'gr_chargeableinvoiceline' 'gr_chargeableinvoicecorrection_SourceLine_gr_chargeableinvoiceline'
    L 'gr_chargeableinvoicecorrection' 'gr_MatchedRevision' 'Matched Revision' 'gr_chargeableinvoicerevision' 'gr_chargeableinvoicecorrection_MatchedRevision_gr_chargeableinvoicerevision'
    L 'gr_chargeableinvoicedocument' 'gr_Review' 'Review' 'gr_chargeableinvoicereview' 'gr_chargeableinvoicedocument_Review_gr_chargeableinvoicereview' $true
    L 'gr_chargeableinvoicedocument' 'gr_Revision' 'Revision' 'gr_chargeableinvoicerevision' 'gr_chargeableinvoicedocument_Revision_gr_chargeableinvoicerevision'
    L 'gr_chargeableinvoiceactivity' 'gr_Review' 'Review' 'gr_chargeableinvoicereview' 'gr_chargeableinvoiceactivity_Review_gr_chargeableinvoicereview' $true
    L 'gr_chargeableinvoiceactivity' 'gr_Revision' 'Revision' 'gr_chargeableinvoicerevision' 'gr_chargeableinvoiceactivity_Revision_gr_chargeableinvoicerevision'
    L 'gr_chargeableinvoiceactivity' 'gr_Document' 'Document' 'gr_chargeableinvoicedocument' 'gr_chargeableinvoiceactivity_Document_gr_chargeableinvoicedocument'
    L 'gr_chargeableinvoiceactivity' 'gr_Correction' 'Correction' 'gr_chargeableinvoicecorrection' 'gr_chargeableinvoiceactivity_Correction_gr_chargeableinvoicecorrection'
    L 'gr_chargeableinvoicereview' 'gr_CurrentRevision' 'Current Revision' 'gr_chargeableinvoicerevision' 'gr_chargeableinvoicereview_CurrentRevision_gr_chargeableinvoicerevision'
    L 'gr_chargeableinvoicerevision' 'gr_SourceDocument' 'Source Document' 'gr_chargeableinvoicedocument' 'gr_chargeableinvoicerevision_SourceDocument_gr_chargeableinvoicedocument' $true
    L 'gr_purchaseorderrecipient' 'gr_Customer' 'Customer' 'gr_customer' 'gr_purchaseorderrecipient_Customer_gr_customer' $true
    L 'gr_purchaseorderrecipient' 'gr_Site' 'Site' 'gr_site' 'gr_purchaseorderrecipient_Site_gr_site'
    L 'gr_purchaseorderrecipient' 'gr_Contact' 'Contact' 'gr_contact' 'gr_purchaseorderrecipient_Contact_gr_contact' $true
)

$keys = @(
    @{ Entity='gr_chargeableinvoicereview'; Schema='gr_ChargeableInvoiceReview_InvoiceNumber_Key'; Attributes=@('gr_invoicenumber') },
    @{ Entity='gr_chargeableinvoicerevision'; Schema='gr_ChargeableInvoiceRevision_ReviewRevision_Key'; Attributes=@('gr_review','gr_revisionnumber') },
    @{ Entity='gr_chargeableinvoiceline'; Schema='gr_ChargeableInvoiceLine_RevisionLineKey_Key'; Attributes=@('gr_revision','gr_linekey') }
)

if (($tables.Schema | Sort-Object -Unique).Count -ne 7 -or ($lookups.Relationship | Sort-Object -Unique).Count -ne $lookups.Count) {
    throw 'Schema definition contains duplicate table or relationship names.'
}
if ($ValidateDefinition) { Write-Output 'Chargeable Invoice Review schema definition is valid. No connection was created.'; return }

function New-Label([string]$Text) { [Microsoft.Xrm.Sdk.Label]::new($Text,1033) }
function New-Required([bool]$Required) {
    [Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevelManagedProperty]::new(
        $(if($Required){[Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::ApplicationRequired}else{[Microsoft.Xrm.Sdk.Metadata.AttributeRequiredLevel]::None})
    )
}
function Get-ToolsPath {
    $root=Join-Path $env:LOCALAPPDATA 'Microsoft\PowerAppsCLI'
    $path=Get-ChildItem $root -Directory -Filter 'Microsoft.PowerApps.CLI.*' | Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName 'tools' } | Where-Object { Test-Path (Join-Path $_ 'Microsoft.Xrm.Sdk.dll') } | Select-Object -First 1
    if(-not $path){throw 'Power Apps CLI SDK assemblies were not found.'}; $path
}
function Import-Sdk {
    $path=Get-ToolsPath
    'Microsoft.Xrm.Sdk.dll','Microsoft.Crm.Sdk.Proxy.dll','Microsoft.Xrm.Tooling.Connector.dll' |
        ForEach-Object { [Reflection.Assembly]::LoadFrom((Join-Path $path $_)) | Out-Null }
}
function Connect-Dataverse {
    $cs="AuthType=OAuth;Url=$($EnvironmentUrl.TrimEnd('/'));AppId=51f81489-12ee-4a9e-aaae-a2591f45987d;RedirectUri=app://58145B91-0C36-4500-8554-080854F2AC97;LoginPrompt=$LoginPrompt"
    $client=[Microsoft.Xrm.Tooling.Connector.CrmServiceClient]::new($cs)
    if(-not $client.IsReady){throw "Dataverse sign-in failed: $($client.LastCrmError)"}; $client
}
function Get-Entity($Service,[string]$Name) {
    $r=[Microsoft.Xrm.Sdk.Messages.RetrieveEntityRequest]::new();$r.LogicalName=$Name
    $r.EntityFilters=[Microsoft.Xrm.Sdk.Metadata.EntityFilters]::All
    try{$Service.Execute($r).EntityMetadata}catch{if($_.Exception.Message -match 'not found|does not exist|Could not find'){return $null};throw}
}
function Get-Attribute($Service,[string]$Entity,[string]$Name) {
    $r=[Microsoft.Xrm.Sdk.Messages.RetrieveAttributeRequest]::new();$r.EntityLogicalName=$Entity;$r.LogicalName=$Name;$r.RetrieveAsIfPublished=$true
    try{$Service.Execute($r).AttributeMetadata}catch{if($_.Exception.Message -match 'not found|does not exist|Could not find'){return $null};throw}
}
function Ensure-Table($Service,$Def,[bool]$Provision) {
    $name=$Def.Schema.ToLowerInvariant();$existing=Get-Entity $Service $name
    if($existing){if($existing.OwnershipType -ne [Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned -or $existing.PrimaryNameAttribute -ne 'gr_name'){throw "Conflict: $name table contract."};return}
    if(-not $Provision){throw "Missing table: $name"}
    $e=[Microsoft.Xrm.Sdk.Metadata.EntityMetadata]::new();$e.SchemaName=$Def.Schema;$e.DisplayName=New-Label $Def.Display;$e.DisplayCollectionName=New-Label $Def.Collection;$e.OwnershipType=[Microsoft.Xrm.Sdk.Metadata.OwnershipTypes]::UserOwned;$e.IsActivity=$false
    $p=[Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new();$p.SchemaName='gr_Name';$p.DisplayName=New-Label 'Name';$p.MaxLength=200;$p.RequiredLevel=New-Required $true
    $r=[Microsoft.Xrm.Sdk.Messages.CreateEntityRequest]::new();$r.Entity=$e;$r.PrimaryAttribute=$p;$r.SolutionUniqueName=$SolutionUniqueName;$Service.Execute($r)|Out-Null;Write-Output "Created table $name"
}
function Add-Column($Service,$Def,$Attribute) {
    $r=[Microsoft.Xrm.Sdk.Messages.CreateAttributeRequest]::new();$r.EntityName=$Def.Entity;$r.Attribute=$Attribute;$r.SolutionUniqueName=$SolutionUniqueName;$Service.Execute($r)|Out-Null;Write-Output "Created column $($Def.Entity).$($Def.Schema.ToLowerInvariant())"
}
function Ensure-Column($Service,$Def,[bool]$Provision) {
    $logical=$Def.Schema.ToLowerInvariant();$a=Get-Attribute $Service $Def.Entity $logical
    $expected=@{Text='String';Memo='Memo';Boolean='Boolean';Choice='Picklist';DateOnly='DateTime';DateTime='DateTime';Integer='Integer';Decimal='Decimal';Money='Money';File='Virtual'}[$Def.Kind]
    if($a){
        if([string]$a.AttributeType -ne $expected){throw "Conflict: $($Def.Entity).$logical type is $($a.AttributeType), expected $expected"}
        if([string]$a.RequiredLevel.Value -ne $(if($Def.Required){'ApplicationRequired'}else{'None'})){throw "Conflict: $($Def.Entity).$logical required level."}
        if($Def.Kind -in @('Text','Memo') -and $a.MaxLength -ne [int]$Def.Extra){throw "Conflict: $($Def.Entity).$logical maximum length."}
        if($Def.Kind -eq 'File' -and $a.MaxSizeInKB -ne 5120){throw "Conflict: $($Def.Entity).$logical file limit."}
        if($Def.Kind -eq 'Choice'){
            $actual=@($a.OptionSet.Options|Sort-Object Value)
            if($actual.Count-ne $Def.Extra.Count){throw "Conflict: $($Def.Entity).$logical choice count."}
            for($i=0;$i-lt$Def.Extra.Count;$i++){
                $label=[string]$actual[$i].Label.UserLocalizedLabel.Label
                if($actual[$i].Value-ne 122830000+$i -or $label-ne [string]$Def.Extra[$i]){throw "Conflict: $($Def.Entity).$logical choice value $i."}
            }
        }
        return
    }
    if(-not $Provision){throw "Missing column: $($Def.Entity).$logical"}
    switch($Def.Kind){
        Text {$a=[Microsoft.Xrm.Sdk.Metadata.StringAttributeMetadata]::new();$a.MaxLength=[int]$Def.Extra}
        Memo {$a=[Microsoft.Xrm.Sdk.Metadata.MemoAttributeMetadata]::new();$a.MaxLength=[int]$Def.Extra}
        Boolean {$a=[Microsoft.Xrm.Sdk.Metadata.BooleanAttributeMetadata]::new();$a.OptionSet=[Microsoft.Xrm.Sdk.Metadata.BooleanOptionSetMetadata]::new([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'Yes'),1),[Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label 'No'),0))}
        Choice {$a=[Microsoft.Xrm.Sdk.Metadata.PicklistAttributeMetadata]::new();$a.OptionSet=[Microsoft.Xrm.Sdk.Metadata.OptionSetMetadata]::new();$a.OptionSet.IsGlobal=$false;$i=0;foreach($label in $Def.Extra){$a.OptionSet.Options.Add([Microsoft.Xrm.Sdk.Metadata.OptionMetadata]::new((New-Label $label),122830000+$i));$i++}}
        DateOnly {$a=[Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new();$a.Format=[Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateOnly;$a.DateTimeBehavior=[Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::DateOnly}
        DateTime {$a=[Microsoft.Xrm.Sdk.Metadata.DateTimeAttributeMetadata]::new();$a.Format=[Microsoft.Xrm.Sdk.Metadata.DateTimeFormat]::DateAndTime;$a.DateTimeBehavior=[Microsoft.Xrm.Sdk.Metadata.DateTimeBehavior]::UserLocal}
        Integer {$a=[Microsoft.Xrm.Sdk.Metadata.IntegerAttributeMetadata]::new();$a.MinValue=[int]$Def.Extra[0];$a.MaxValue=[int]$Def.Extra[1];$a.Format=[Microsoft.Xrm.Sdk.Metadata.IntegerFormat]::None}
        Decimal {$a=[Microsoft.Xrm.Sdk.Metadata.DecimalAttributeMetadata]::new();$a.MinValue=[decimal]$Def.Extra[0];$a.MaxValue=[decimal]$Def.Extra[1];$a.Precision=[int]$Def.Extra[2]}
        Money {$a=[Microsoft.Xrm.Sdk.Metadata.MoneyAttributeMetadata]::new();$a.MinValue=[double]-100000000000;$a.MaxValue=[double]100000000000;$a.Precision=2}
        File {$a=[Microsoft.Xrm.Sdk.Metadata.FileAttributeMetadata]::new();$a.MaxSizeInKB=5120}
    }
    $a.SchemaName=$Def.Schema;$a.DisplayName=New-Label $Def.Display;$a.RequiredLevel=New-Required $Def.Required;Add-Column $Service $Def $a
}
function New-Cascade {
    $c=[Microsoft.Xrm.Sdk.Metadata.CascadeConfiguration]::new();$c.Assign='NoCascade';$c.Share='NoCascade';$c.Unshare='NoCascade';$c.Reparent='NoCascade';$c.Merge='NoCascade';$c.Delete='Restrict';$c
}
function Ensure-Lookup($Service,$Def,[bool]$Provision) {
    $logical=$Def.Schema.ToLowerInvariant();$a=Get-Attribute $Service $Def.From $logical
    if($a){if([string]$a.AttributeType -ne 'Lookup' -or @($a.Targets) -notcontains $Def.To){throw "Conflict: $($Def.From).$logical lookup."};return}
    if(-not $Provision){throw "Missing lookup: $($Def.From).$logical"}
    $lookup=[Microsoft.Xrm.Sdk.Metadata.LookupAttributeMetadata]::new();$lookup.SchemaName=$Def.Schema;$lookup.DisplayName=New-Label $Def.Display;$lookup.RequiredLevel=New-Required $Def.Required
    $rel=[Microsoft.Xrm.Sdk.Metadata.OneToManyRelationshipMetadata]::new();$rel.SchemaName=$Def.Relationship;$rel.ReferencedEntity=$Def.To;$rel.ReferencingEntity=$Def.From;$rel.ReferencingEntityNavigationPropertyName=$Def.Schema;$rel.ReferencedEntityNavigationPropertyName="$(($Def.To))_$($Def.From)_$logical";$rel.CascadeConfiguration=New-Cascade
    $r=[Microsoft.Xrm.Sdk.Messages.CreateOneToManyRequest]::new();$r.Lookup=$lookup;$r.OneToManyRelationship=$rel;$r.SolutionUniqueName=$SolutionUniqueName;$Service.Execute($r)|Out-Null;Write-Output "Created lookup $($Def.From).$logical"
}
function Ensure-Key($Service,$Def,[bool]$Provision) {
    $e=Get-Entity $Service $Def.Entity;$logical=$Def.Schema.ToLowerInvariant();$found=@($e.Keys|Where-Object LogicalName -eq $logical)
    if($found.Count){if((@($found[0].KeyAttributes|Sort-Object)-join ',') -ne (@($Def.Attributes|Sort-Object)-join ',')){throw "Conflict: key $logical"};if(-not $Provision -and [string]$found[0].EntityKeyIndexStatus -ne 'Active'){throw "Key $logical is $($found[0].EntityKeyIndexStatus), expected Active."};return}
    if(-not $Provision){throw "Missing key: $logical"}
    $k=[Microsoft.Xrm.Sdk.Metadata.EntityKeyMetadata]::new();$k.SchemaName=$Def.Schema;$k.DisplayName=New-Label $Def.Schema;$k.KeyAttributes=$Def.Attributes
    $r=[Microsoft.Xrm.Sdk.Messages.CreateEntityKeyRequest]::new();$r.EntityName=$Def.Entity;$r.EntityKey=$k;$r.SolutionUniqueName=$SolutionUniqueName;$Service.Execute($r)|Out-Null;Write-Output "Created key $logical"
}
function Publish-All($Service) {
    $names=($tables|ForEach-Object{"<entity>$($_.Schema.ToLowerInvariant())</entity>"}) -join ''
    $r=[Microsoft.Crm.Sdk.Messages.PublishXmlRequest]::new();$r.ParameterXml="<importexportxml><entities>$names</entities></importexportxml>";$Service.Execute($r)|Out-Null;Write-Output 'Published Chargeable Invoice Review metadata.'
}
function Get-Role($Service) {
    $q=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role');$q.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name','ismanaged','businessunitid');$q.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'Chargeable Invoice Manager');@($Service.RetrieveMultiple($q).Entities)
}
function Ensure-Role($Service,[bool]$Provision) {
    $roles=@(Get-Role $Service);if($roles.Count -gt 1){throw 'Multiple Chargeable Invoice Manager roles exist.'}
    if(-not $roles.Count){
        if(-not $Provision){throw 'Chargeable Invoice Manager role is missing.'}
        $q=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('businessunit');$q.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('businessunitid');$q.Criteria.AddCondition('parentbusinessunitid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Null);$bus=@($Service.RetrieveMultiple($q).Entities);if($bus.Count-ne 1){throw 'Expected one root business unit.'}
        $role=[Microsoft.Xrm.Sdk.Entity]::new('role');$role['name']='Chargeable Invoice Manager';$role['businessunitid']=[Microsoft.Xrm.Sdk.EntityReference]::new('businessunit',$bus[0].Id);$id=$Service.Create($role);$roles=@($Service.Retrieve('role',$id,[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name','ismanaged','businessunitid')));Write-Output 'Created unassigned Chargeable Invoice Manager role.'
    }
    $role=$roles[0];if([bool]$role['ismanaged']){throw 'Manager role must be unmanaged.'}
    $names=@();$forbidden=@();foreach($table in $tables){
        $verbs=if($table.Schema -eq 'gr_PurchaseOrderRecipient'){@('Create','Read','Write','Delete','Append','AppendTo')}else{@('Create','Read','Write','Append','AppendTo')}
        foreach($verb in $verbs){$names+="prv$verb$($table.Schema)"}
        foreach($verb in 'Assign','Share'){$forbidden+="prv$verb$($table.Schema)"}
        if($table.Schema -ne 'gr_PurchaseOrderRecipient'){$forbidden+="prvDelete$($table.Schema)"}
    }
    $q=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege');$q.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name');$q.PageInfo=[Microsoft.Xrm.Sdk.Query.PagingInfo]::new();$q.PageInfo.Count=5000;$q.PageInfo.PageNumber=1
    $all=[Collections.Generic.List[Microsoft.Xrm.Sdk.Entity]]::new()
    do{$page=$Service.RetrieveMultiple($q);foreach($item in $page.Entities){$all.Add($item)};if($page.MoreRecords){$q.PageInfo.PageNumber++;$q.PageInfo.PagingCookie=$page.PagingCookie}}while($page.MoreRecords)
    $metadata=@($all|Where-Object{$names -icontains [string]$_['name']})
    if($metadata.Count-ne $names.Count){$missing=$names|Where-Object{$n=$_;-not($metadata|Where-Object{[string]$_['name']-ieq$n})};throw "Missing generated privileges: $($missing -join ', ')"}
    $r=[Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new();$r.RoleId=$role.Id;$current=@($Service.Execute($r).RolePrivileges);$add=[Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach($name in $names){$p=$metadata|Where-Object{[string]$_['name']-ieq$name}|Select-Object -First 1;$have=$current|Where-Object PrivilegeId -eq $p.Id|Select-Object -First 1;if($have){if([string]$have.Depth-ne 'Global'){throw "Privilege $name has incompatible depth."}}elseif($Provision){$g=[Microsoft.Crm.Sdk.Messages.RolePrivilege]::new();$g.PrivilegeId=$p.Id;$g.Depth='Global';$add.Add($g)}else{throw "Missing role privilege: $name"}}
    if($add.Count){$r=[Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new();$r.RoleId=$role.Id;$r.Privileges=$add.ToArray();$Service.Execute($r)|Out-Null;Write-Output "Granted $($add.Count) organization-depth privileges."}
    foreach($name in $forbidden){$p=$all|Where-Object{[string]$_['name']-ieq$name}|Select-Object -First 1;if($p -and ($current|Where-Object PrivilegeId -eq $p.Id|Select-Object -First 1)){throw "Manager role has forbidden privilege: $name"}}
    foreach($junction in 'systemuserroles','teamroles'){$q=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new($junction);$q.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new($false);$q.Criteria.AddCondition('roleid',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,$role.Id);if($Service.RetrieveMultiple($q).Entities.Count){throw "Manager role unexpectedly has assignments in $junction."}}
}
function Ensure-ServiceOperationsPOPrivileges($Service,[bool]$Provision) {
    $q=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('role');$q.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('roleid','name','ismanaged');$q.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::Equal,'Service Operations');$roles=@($Service.RetrieveMultiple($q).Entities)
    if($roles.Count-ne 1 -or [bool]$roles[0]['ismanaged']){throw 'Expected exactly one unmanaged Service Operations role.'}
    $names=@('Create','Read','Write','Delete','Append','AppendTo')|ForEach-Object{"prv$($_)gr_PurchaseOrderRecipient"}
    $pq=[Microsoft.Xrm.Sdk.Query.QueryExpression]::new('privilege');$pq.ColumnSet=[Microsoft.Xrm.Sdk.Query.ColumnSet]::new('name');$pq.Criteria.AddCondition('name',[Microsoft.Xrm.Sdk.Query.ConditionOperator]::In,[object[]]$names);$metadata=@($Service.RetrieveMultiple($pq).Entities)
    if($metadata.Count-ne $names.Count){throw 'Purchase Order Recipient generated privileges are incomplete.'}
    $r=[Microsoft.Crm.Sdk.Messages.RetrieveRolePrivilegesRoleRequest]::new();$r.RoleId=$roles[0].Id;$current=@($Service.Execute($r).RolePrivileges);$add=[Collections.Generic.List[Microsoft.Crm.Sdk.Messages.RolePrivilege]]::new()
    foreach($name in $names){$p=$metadata|Where-Object{[string]$_['name']-ieq$name}|Select-Object -First 1;$have=$current|Where-Object PrivilegeId -eq $p.Id|Select-Object -First 1;if($have){if([string]$have.Depth-ne 'Global'){throw "Privilege $name has incompatible depth."}}elseif($Provision){$g=[Microsoft.Crm.Sdk.Messages.RolePrivilege]::new();$g.PrivilegeId=$p.Id;$g.Depth='Global';$add.Add($g)}else{throw "Missing Service Operations role privilege: $name"}}
    if($add.Count){$a=[Microsoft.Crm.Sdk.Messages.AddPrivilegesRoleRequest]::new();$a.RoleId=$roles[0].Id;$a.Privileges=$add.ToArray();$Service.Execute($a)|Out-Null;Write-Output "Granted $($add.Count) Purchase Order Recipient privileges to Service Operations."}
}
function Ensure-Contract($Service,[bool]$Provision) {
    foreach($table in $tables){Ensure-Table $Service $table $Provision}
    foreach($column in $columns){Ensure-Column $Service $column $Provision}
    foreach($lookup in $lookups){Ensure-Lookup $Service $lookup $Provision}
    if($Provision){Publish-All $Service}
    foreach($key in $keys){Ensure-Key $Service $key $Provision}
    if($Provision){Publish-All $Service}
    Ensure-Role $Service $Provision
    Ensure-ServiceOperationsPOPrivileges $Service $Provision
}

Import-Sdk
$service=Connect-Dataverse
try {
    if($Mode -eq 'Inspect') {
        foreach($table in $tables){$e=Get-Entity $service $table.Schema.ToLowerInvariant();[pscustomobject]@{Table=$table.Schema.ToLowerInvariant();Exists=($null-ne$e);Ownership=if($e){[string]$e.OwnershipType}else{$null}}}
        [pscustomobject]@{Role='Chargeable Invoice Manager';Count=@(Get-Role $service).Count}
    } elseif($Mode -eq 'Provision') {
        Ensure-Contract $service $true
        Ensure-Contract $service $false
        Write-Output 'Chargeable Invoice Review and Purchase Order Recipient schema and roles provisioned and verified.'
    } else {
        Ensure-Contract $service $false
        Write-Output 'Chargeable Invoice Review and Purchase Order Recipient schema and roles verified.'
    }
} finally { if($service -is [IDisposable]){$service.Dispose()} }
