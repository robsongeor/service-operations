using System;
using System.Collections.Generic;
using System.Runtime.Remoting.Messaging;
using System.Runtime.Remoting.Proxies;
using Microsoft.Xrm.Sdk;
using ServiceOperations.Access;

public static class RestrictedAccessTests
{
    static int passed;
    static readonly Guid Id = new Guid("00000000-0000-4000-8000-000000000001");
    static readonly Guid OtherId = new Guid("00000000-0000-4000-8000-000000000002");
    static Entity Row(string table) { return new Entity(table, Id); }
    static void Test(string name, Action action) { action(); passed++; Console.WriteLine("PASS " + name); }
    static void Denied(Action action) { try { action(); } catch (InvalidPluginExecutionException) { return; } throw new Exception("Expected access denial"); }
    static void Change(string role, string table, string field, object value)
    {
        var target = Row(table); target[field] = value;
        RestrictedWritePolicy.Validate(role, "Update", target, Row(table));
    }
    public static void Run()
    {
        Test("no secure configuration fails closed", () => Denied(() => new RestrictedAccessPlugin("full=ignored", null)));
        Test("role IDs cannot overlap", () => Denied(() => new RestrictedAccessPlugin(null, "full="+Id+";coordinator="+Id+";office="+Id+";book="+Id)));
        MeterTests();
        TimeCloudTests();
        foreach (string role in new[] { "office", "book" })
        {
            string r = role;
            Test(r+" corrects managed Job description", () => Change(r, "gr_job", "gr_description", "Corrected"));
            Test(r+" edits Equipment details", () => Change(r, "gr_equipment", "gr_serial", "Corrected serial"));
            Test(r+" moves Equipment", () => Change(r, "gr_equipment", "gr_site", new EntityReference("gr_site", Id)));
            Test(r+" moves Equipment with validated Dataverse update metadata", () => {
                var target=Row("gr_equipment"); target["gr_site"]=new EntityReference("gr_site",Id);
                target["gr_equipmentid"]=Id; target["modifiedby"]=new EntityReference("systemuser",Id);
                target["modifiedon"]=DateTime.UtcNow; target["modifiedonbehalfby"]=null;
                target["ownerid"]=new EntityReference("systemuser",OtherId); target["statecode"]=new OptionSetValue(0);
                target["timezoneruleversionnumber"]=4; target["utcconversiontimezonecode"]=null;
                var before=Row("gr_equipment"); before["ownerid"]=new EntityReference("systemuser",OtherId); before["statecode"]=new OptionSetValue(0);
                before["timezoneruleversionnumber"]=4; before["utcconversiontimezonecode"]=null;
                RestrictedWritePolicy.Validate(r,"Update",target,before,Id);
            });
            Test(r+" rejects Equipment update metadata for another user", () => {
                var target=Row("gr_equipment"); target["gr_site"]=new EntityReference("gr_site",Id);
                target["modifiedby"]=new EntityReference("systemuser",OtherId);
                Denied(() => RestrictedWritePolicy.Validate(r,"Update",target,Row("gr_equipment"),Id));
            });
            Test(r+" rejects a mismatched Equipment primary key", () => {
                var target=Row("gr_equipment"); target["gr_site"]=new EntityReference("gr_site",Id); target["gr_equipmentid"]=OtherId;
                Denied(() => RestrictedWritePolicy.Validate(r,"Update",target,Row("gr_equipment"),Id));
            });
            Test(r+" rejects a future Equipment modification time", () => {
                var target=Row("gr_equipment"); target["gr_site"]=new EntityReference("gr_site",Id); target["modifiedon"]=DateTime.UtcNow.AddHours(1);
                Denied(() => RestrictedWritePolicy.Validate(r,"Update",target,Row("gr_equipment"),Id));
            });
            Test(r+" rejects delegated Equipment update metadata", () => {
                var target=Row("gr_equipment"); target["gr_site"]=new EntityReference("gr_site",Id); target["modifiedonbehalfby"]=new EntityReference("systemuser",OtherId);
                Denied(() => RestrictedWritePolicy.Validate(r,"Update",target,Row("gr_equipment"),Id));
            });
            Test(r+" rejects changed platform-owned Equipment metadata", () => {
                var target=Row("gr_equipment"); target["gr_site"]=new EntityReference("gr_site",Id); target["ownerid"]=new EntityReference("systemuser",OtherId);
                var before=Row("gr_equipment"); before["ownerid"]=new EntityReference("systemuser",Id);
                Denied(() => RestrictedWritePolicy.Validate(r,"Update",target,before,Id));
            });
            Test(r+" creates Customer", () => { var target=Row("gr_customer"); target["gr_name"]="New Customer"; RestrictedWritePolicy.Validate(r,"Create",target,null); });
            Test(r+" creates Site", () => { var target=Row("gr_site"); target["gr_name"]="New Site"; target["gr_customer"]=new EntityReference("gr_customer",Id); RestrictedWritePolicy.Validate(r,"Create",target,null); });
            Test(r+" creates platform-enriched Site", () => {
                var target=Row("gr_site"); target["gr_name"]="New Site"; target["gr_address"]="13 Sims Road"; target["gr_customer"]=new EntityReference("gr_customer",Id);
                target["gr_siteid"]=Id; target["ownerid"]=new EntityReference("systemuser",Id); target["createdby"]=new EntityReference("systemuser",Id);
                target["createdon"]=DateTime.UtcNow; target["statecode"]=new OptionSetValue(0); target["statuscode"]=new OptionSetValue(1);
                RestrictedWritePolicy.Validate(r,"Create",target,null,Id);
            });
            Test(r+" rejects Site owned by another user", () => {
                var target=Row("gr_site"); target["gr_name"]="New Site"; target["gr_customer"]=new EntityReference("gr_customer",Id);
                target["ownerid"]=new EntityReference("systemuser",OtherId);
                Denied(() => RestrictedWritePolicy.Validate(r,"Create",target,null,Id));
            });
            Test(r+" rejects inactive Site create", () => {
                var target=Row("gr_site"); target["gr_name"]="New Site"; target["gr_customer"]=new EntityReference("gr_customer",Id); target["statecode"]=new OptionSetValue(1);
                Denied(() => RestrictedWritePolicy.Validate(r,"Create",target,null,Id));
            });
            Test(r+" rejects mismatched Site primary key", () => {
                var target=Row("gr_site"); target["gr_name"]="New Site"; target["gr_customer"]=new EntityReference("gr_customer",Id); target["gr_siteid"]=OtherId;
                Denied(() => RestrictedWritePolicy.Validate(r,"Create",target,null,Id));
            });
            Test(r+" assigns an active technician", () => {
                var before=Row("gr_job"); var target=Row("gr_job"); target["gr_mechanic"]=new EntityReference("gr_mechanic",OtherId);
                var mechanic=new Entity("gr_mechanic",OtherId); mechanic["statecode"]=new OptionSetValue(0); mechanic["gr_jobassignmentenabled"]=true;
                RestrictedWritePolicy.ValidateJobAssignment(target,before,mechanic); RestrictedWritePolicy.Validate(r,"Update",target,before);
            });
            Test(r+" rejects an inactive technician", () => {
                var before=Row("gr_job"); var target=Row("gr_job"); target["gr_mechanic"]=new EntityReference("gr_mechanic",OtherId);
                var mechanic=new Entity("gr_mechanic",OtherId); mechanic["statecode"]=new OptionSetValue(1); mechanic["gr_jobassignmentenabled"]=true;
                Denied(() => RestrictedWritePolicy.ValidateJobAssignment(target,before,mechanic));
            });
            Test(r+" rejects a technician disabled for Job assignment", () => {
                var before=Row("gr_job"); var target=Row("gr_job"); target["gr_mechanic"]=new EntityReference("gr_mechanic",OtherId);
                var mechanic=new Entity("gr_mechanic",OtherId); mechanic["statecode"]=new OptionSetValue(0); mechanic["gr_jobassignmentenabled"]=false;
                Denied(() => RestrictedWritePolicy.ValidateJobAssignment(target,before,mechanic));
            });
            Test(r+" rejects simultaneous technician and other supplier", () => {
                var before=Row("gr_job"); before["gr_externalsupplierdetails"]="Supplier";
                var target=Row("gr_job"); target["gr_mechanic"]=new EntityReference("gr_mechanic",OtherId);
                var mechanic=new Entity("gr_mechanic",OtherId); mechanic["statecode"]=new OptionSetValue(0); mechanic["gr_jobassignmentenabled"]=true;
                Denied(() => RestrictedWritePolicy.ValidateJobAssignment(target,before,mechanic));
            });
            foreach (string field in new[] { "gr_status", "gr_jobtype", "gr_jobnumber", "gr_coordinatormanaged", "gr_techniciansubmissionstory" })
            {
                string f=field; Test(r+" rejects Job field "+f, () => Denied(() => Change(r,"gr_job",f,"tampered")));
            }
            // Office approval is a backend operation, never a direct browser meter edit.
            // A dedicated server-writer policy is still a release gate, not a broad Office grant.
            foreach (var field in new Dictionary<string, object> {
                { "gr_hourmeter", 1620 },
                { "gr_hourmeterreadingtype", new OptionSetValue(122830000) },
                { "gr_hourmeterrecordeddate", new DateTime(2026, 10, 9) },
                { "gr_hourmeterapprovalreference", Id+"|1620|2026-10-09|"+OtherId }
            })
            {
                var f=field; Test(r+" denies direct meter approval field "+f.Key, () => Denied(() => Change(r,"gr_job",f.Key,f.Value)));
            }
            foreach (string field in new[] { "gr_currenthourmeter", "gr_maintenanceprofile", "statecode", "gr_ownershiptype" })
            {
                string f=field; Test(r+" rejects Equipment field "+f, () => Denied(() => Change(r,"gr_equipment",f,1)));
            }
            Test(r+" denies existing Customer edit", () => Denied(() => Change(r,"gr_customer","gr_name","changed")));
            Test(r+" denies delete", () => Denied(() => RestrictedWritePolicy.Validate(r,"Delete",Row("gr_equipment"),Row("gr_equipment"))));
            Test(r+" rejects missing image", () => Denied(() => RestrictedWritePolicy.Validate(r,"Update",Row("gr_job"),null)));
            Test(r+" rejects Void Job correction", () => { var before=Row("gr_job"); before["gr_registrationvoid"]=true; Denied(() => RestrictedWritePolicy.Validate(r,"Update",Row("gr_job"),before)); });
        }
        Test("book rejects GreenTree marker", () => Denied(() => Change("book","gr_job","gr_gtentered",true)));
        Test("book rejects GreenTree status", () => Denied(() => Change("book","gr_job","gr_greentreestatus","open")));
        Test("book rejects Timecloud marker", () => Denied(() => Change("book","gr_job","gr_timecloudentered",true)));
        Test("office may record GreenTree marker", () => Change("office","gr_job","gr_gtentered",true));
        foreach (string status in new[] { "open", "closed", "finalised" })
        {
            string value=status; Test("office may record GreenTree status "+value, () => { var before=Row("gr_job"); var target=Row("gr_job"); target["gr_gtentered"]=true; target["gr_greentreestatus"]=value; RestrictedWritePolicy.Validate("office","Update",target,before); });
        }
        Test("office cannot record an invalid GreenTree status", () => { var before=Row("gr_job"); var target=Row("gr_job"); target["gr_gtentered"]=true; target["gr_greentreestatus"]="Finished & Invoiced"; Denied(() => RestrictedWritePolicy.Validate("office","Update",target,before)); });
        Test("office cannot record GreenTree status without its marker", () => Denied(() => Change("office","gr_job","gr_greentreestatus","closed")));
        Test("office may record GreenTree checked time without a match", () => Change("office","gr_job","gr_greentreestatuscheckedon",DateTime.UtcNow));
        Test("office cannot record a future GreenTree checked time", () => Denied(() => Change("office","gr_job","gr_greentreestatuscheckedon",DateTime.UtcNow.AddHours(1))));
        Test("book rejects GreenTree checked time", () => Denied(() => Change("book","gr_job","gr_greentreestatuscheckedon",DateTime.UtcNow)));
        Test("office may record Timecloud marker", () => Change("office","gr_job","gr_timecloudentered",true));
        foreach (string table in new[] { "gr_jobbookentry", "gr_waikatojobbookentry", "gr_hastingsjobbookentry", "gr_christchurchjobbookentry" })
        {
            string t=table;
            var before=Row(t); before["gr_stage"]=new OptionSetValue(122830000); before["gr_entered"]=false; before["gr_timecloudentered"]=false;
            var target=Row(t); target["gr_stage"]=new OptionSetValue(122830003); target["gr_voidreason"]="Duplicate";
            Test(t+" book may Void eligible Intake", () => RestrictedWritePolicy.Validate("book","Update",target,before));
            Test(t+" marked entry cannot Void", () => { before["gr_entered"]=true; Denied(() => RestrictedWritePolicy.Validate("book","Update",target,before)); before["gr_entered"]=false; });
            Test(t+" missing marker cannot Void", () => { before.Attributes.Remove("gr_timecloudentered"); Denied(() => RestrictedWritePolicy.Validate("book","Update",target,before)); before["gr_timecloudentered"]=false; });
            Test(t+" linked registration requires atomic operation", () => { before["gr_registeredjob"]=new EntityReference("gr_job",Id); Denied(() => RestrictedWritePolicy.Validate("book","Update",target,before)); });
            Test(t+" office may record GreenTree status", () => { var statusBefore=Row(t); statusBefore["gr_stage"]=new OptionSetValue(122830000); var statusTarget=Row(t); statusTarget["gr_entered"]=true; statusTarget["gr_greentreestatus"]="open"; RestrictedWritePolicy.Validate("office","Update",statusTarget,statusBefore); });
            Test(t+" office rejects GreenTree status without marker", () => { var statusBefore=Row(t); statusBefore["gr_stage"]=new OptionSetValue(122830000); var statusTarget=Row(t); statusTarget["gr_greentreestatus"]="closed"; Denied(() => RestrictedWritePolicy.Validate("office","Update",statusTarget,statusBefore)); });
        }
        Test("linked Void access exception requires the exact transactional API parent and fields", () => {
            var inputs = new ParameterCollection { { "Book", "auckland" }, { "JobId", Id }, { "LedgerId", Id }, { "Reason", "Duplicate" } };
            var parent = Context("gr_VoidRegisteredJobBookEntry", inputs, null, 30);
            var child = Context("Update", new ParameterCollection(), parent, 20);
            var job = Row("gr_job"); job["gr_registrationvoid"] = true; job["gr_registrationvoidreason"] = "Duplicate";
            if (!RestrictedAccessPlugin.IsRegisteredVoidChild(child, job)) throw new Exception("Exact Job child was not accepted");
            var ledger = Row("gr_jobbookentry"); ledger["gr_stage"] = new OptionSetValue(122830003); ledger["gr_voidreason"] = "Duplicate";
            if (!RestrictedAccessPlugin.IsRegisteredVoidChild(child, ledger)) throw new Exception("Exact ledger child was not accepted");
            job["gr_status"] = new OptionSetValue(122830000);
            if (RestrictedAccessPlugin.IsRegisteredVoidChild(child, job)) throw new Exception("Additional Job field was accepted");
            if (RestrictedAccessPlugin.IsRegisteredVoidChild(Context("Update", new ParameterCollection(), null, 20), ledger)) throw new Exception("Direct ledger update was accepted");
        });
        Test("registration access exception requires exact API children", () => {
            var inputs = new ParameterCollection {
                { "RequestId", Id }, { "Book", "auckland" }, { "Description", "Repair mast" }, { "OrderNumber", "PO-1" },
                { "SiteId", OtherId }, { "EquipmentId", null }, { "EquipmentUnknown", true }, { "ContactId", null }, { "MechanicId", null }
            };
            var parent = Context("gr_RegisterJobBookJob", inputs, null, 30);
            var create = Context("Create", new ParameterCollection(), parent, 20);
            var job = Row("gr_job"); job["gr_description"]="Repair mast"; job["gr_ordernumber"]="PO-1";
            job["gr_site"]=new EntityReference("gr_site",OtherId); job["gr_status"]=new OptionSetValue(122830001); job["gr_coordinatormanaged"]=false; job["gr_operatingbranch"]=new OptionSetValue(122830000);
            if (!RestrictedAccessPlugin.IsRegistrationChild(create, job)) throw new Exception("Exact registration Job create was not accepted");
            foreach(var field in new[]{"gr_gtentered","gr_officeattentionrequired","gr_registrationvoid","gr_techniciansubmissionfurtherworkrequired","gr_techniciansubmissionsafetyissueidentified","gr_techniciansubmissiontokenused","gr_timecloudentered"}) job[field]=false;
            foreach(var field in new[]{"gr_currentofficeaction","gr_jobcardstatus","gr_servicetype"}) job[field]=new OptionSetValue(1);
            job["gr_jobid"]=Id; job["createdon"]=new DateTime(2026,10,15); job["ownerid"]=new EntityReference("systemuser",Id); job["statecode"]=new OptionSetValue(0); job["statuscode"]=new OptionSetValue(1);
            if (!RestrictedAccessPlugin.IsRegistrationChild(create, job)) throw new Exception("Platform-enriched registration Job create was not accepted");
            inputs["MechanicId"] = Id;
            parent = Context("gr_RegisterJobBookJob", inputs, null, 30);
            create = Context("Create", new ParameterCollection(), parent, 20);
            job["gr_mechanic"] = new EntityReference("gr_mechanic",Id);
            if (!RestrictedAccessPlugin.IsRegistrationChild(create, job)) throw new Exception("Assigned registration in Staging was not accepted");
            job["gr_status"] = new OptionSetValue(122830000);
            if (RestrictedAccessPlugin.IsRegistrationChild(create, job)) throw new Exception("Assignment was allowed to imply With Technician");
            job["gr_status"] = new OptionSetValue(122830001);
            var ledger = RegistrationLedger("gr_jobbookentry", Id, Id);
            ledger["gr_jobbookentryid"]=Id; ledger["createdon"]=new DateTime(2026,10,15); ledger["ownerid"]=new EntityReference("systemuser",Id); ledger["organizationid"]=new EntityReference("organization",OtherId);
            if (!RestrictedAccessPlugin.IsRegistrationChild(create, ledger)) throw new Exception("Exact registration ledger create was not accepted");
            var update = Context("Update", new ParameterCollection(), parent, 20);
            var number = Row("gr_job"); number["gr_jobnumber"]="123456"; number["gr_operatingbranch"]=new OptionSetValue(122830000);
            number["modifiedon"]=new DateTime(2026,10,15); number["modifiedby"]=new EntityReference("systemuser",Id);
            if (!RestrictedAccessPlugin.IsRegistrationChild(update, number)) throw new Exception("Exact registration Job number update was not accepted");
            number["gr_operatingbranch"] = new OptionSetValue(122830001);
            if (RestrictedAccessPlugin.IsRegistrationChild(update, number)) throw new Exception("Wrong registration branch was accepted");
            number["gr_operatingbranch"] = new OptionSetValue(122830000);
            job["gr_jobtype"] = new OptionSetValue(1);
            if (RestrictedAccessPlugin.IsRegistrationChild(create, job)) throw new Exception("Additional registration Job field was accepted");
            ledger["gr_jobnumber"] = "WJ1234";
            if (RestrictedAccessPlugin.IsRegistrationChild(create, ledger)) throw new Exception("Wrong regional number format was accepted");
            if (RestrictedAccessPlugin.IsRegistrationChild(Context("Create", new ParameterCollection(), null, 20), ledger)) throw new Exception("Direct ledger create was accepted");
        });
        Test("allocation access exception binds request ledger and existing Job", () => {
            var inputs = new ParameterCollection { { "RequestId", Id }, { "Book", "waikato" }, { "JobId", OtherId }, { "ExpectedRowVersion", "42" } };
            var parent = Context("gr_AllocateJobBookNumber", inputs, null, 30);
            var ledger = RegistrationLedger("gr_waikatojobbookentry", Id, OtherId); ledger["gr_jobnumber"] = "WJ1548";
            if (!RestrictedAccessPlugin.IsRegistrationChild(Context("Create", new ParameterCollection(), parent, 20), ledger)) throw new Exception("Exact allocation ledger was not accepted");
            var job = new Entity("gr_job", OtherId); job["gr_jobnumber"]="WJ1548"; job["gr_operatingbranch"]=new OptionSetValue(122830001);
            if (!RestrictedAccessPlugin.IsRegistrationChild(Context("Update", new ParameterCollection(), parent, 20), job)) throw new Exception("Exact allocation Job update was not accepted");
            job.Id = Id;
            if (RestrictedAccessPlugin.IsRegistrationChild(Context("Update", new ParameterCollection(), parent, 20), job)) throw new Exception("Allocation updated the request ID instead of the Job ID");
        });
        Test("initial dispatch access exception requires the exact transactional API parent and fields", () => {
            var inputs = new ParameterCollection { { "RequestId", Id }, { "JobId", Id }, { "RecipientEmail", "tech@example.invalid" }, { "Subject", "Job details" }, { "Body", "<p>Body</p>" } };
            var parent = Context("gr_QueueInitialJobDispatch", inputs, null, 30);
            var child = Context("Create", new ParameterCollection(), parent, 20);
            var dispatch = Row("gr_emaildispatch");
            dispatch["gr_name"] = "Job email to Technician"; dispatch["gr_recipientemail"] = "tech@example.invalid"; dispatch["gr_recipientname"] = "Technician";
            dispatch["gr_subject"] = "Job details"; dispatch["gr_body"] = "<p>Body</p>"; dispatch["gr_emailsent"] = false; dispatch["gr_requestedon"] = DateTime.UtcNow;
            dispatch["gr_job"] = new EntityReference("gr_job", Id); dispatch["gr_jobdispatchfingerprint"] = new string('a', 64);
            if (!RestrictedAccessPlugin.IsInitialDispatchChild(child, dispatch)) throw new Exception("Exact dispatch child was not accepted");
            dispatch["gr_jobassignment"] = new EntityReference("gr_jobassignment", Id);
            if (RestrictedAccessPlugin.IsInitialDispatchChild(child, dispatch)) throw new Exception("Assignment override was accepted");
            dispatch.Attributes.Remove("gr_jobassignment"); dispatch["gr_recipientemail"] = "other@example.invalid";
            if (RestrictedAccessPlugin.IsInitialDispatchChild(child, dispatch)) throw new Exception("Recipient override was accepted");
            if (RestrictedAccessPlugin.IsInitialDispatchChild(Context("Create", new ParameterCollection(), null, 20), dispatch)) throw new Exception("Direct dispatch create was accepted");
        });
        Console.WriteLine(passed+" restricted-access tests passed (offline; no live security claim).");
    }

    static readonly Guid FullRole = new Guid("00000000-0000-4000-8000-000000000011");
    static readonly Guid CoordinatorRole = new Guid("00000000-0000-4000-8000-000000000012");
    static readonly Guid OfficeRole = new Guid("00000000-0000-4000-8000-000000000013");
    static readonly Guid BookRole = new Guid("00000000-0000-4000-8000-000000000014");
    static readonly Guid MeterRole = new Guid("00000000-0000-4000-8000-000000000015");
    static readonly Guid MeterApp = new Guid("00000000-0000-4000-8000-000000000016");
    static readonly Guid TimeCloudRole = new Guid("00000000-0000-4000-8000-000000000017");
    static readonly Guid TimeCloudUser = new Guid("00000000-0000-4000-8000-000000000018");
    static readonly Guid TimeCloudApp = new Guid("00000000-0000-4000-8000-000000000019");
    static readonly Guid GreenTreeRole = new Guid("00000000-0000-4000-8000-00000000001a");
    static readonly Guid GreenTreeUser = new Guid("00000000-0000-4000-8000-00000000001b");
    static readonly Guid GreenTreeApp = new Guid("00000000-0000-4000-8000-00000000001c");
    static string LegacyConfig { get { return "full="+FullRole+";coordinator="+CoordinatorRole+";office="+OfficeRole+";book="+BookRole; } }
    static string MeterConfig { get { return LegacyConfig+";meterrole="+MeterRole+";meteruser="+Id+";meterapplication="+MeterApp; } }
    static string TimeCloudConfig { get { return LegacyConfig+";timecloudrole="+TimeCloudRole+";timeclouduser="+TimeCloudUser+";timecloudapplication="+TimeCloudApp; } }
    static string GreenTreeConfig { get { return LegacyConfig+";greentreerole="+GreenTreeRole+";greentreeuser="+GreenTreeUser+";greentreeapplication="+GreenTreeApp; } }
    static Entity MeterTarget()
    {
        var row=Row("gr_job"); row["gr_hourmeter"]=1620; row["gr_hourmeterreadingtype"]=new OptionSetValue(122830000);
        row["gr_hourmeterrecordeddate"]=new DateTime(2026,10,9); row["gr_hourmeterapprovalreference"]=Id+"|1620|2026-10-09|"+OtherId;
        return row;
    }
    static Entity MeterCurrent()
    {
        var row=Row("gr_job"); row["statecode"]=new OptionSetValue(0); row["gr_status"]=new OptionSetValue(122830004);
        row["gr_registrationvoid"]=false; row["gr_equipment"]=new EntityReference("gr_equipment",OtherId); return row;
    }
    static Entity MeterCaller() { var row=Row("systemuser"); row["applicationid"]=MeterApp; row["isdisabled"]=false; return row; }
    static void ValidateMeter(Entity target, Entity current) { MeterWritePolicy.Validate(target,current,new DateTime(2026,10,10)); }
    static void MeterTests()
    {
        Test("legacy role configuration remains valid", () => new RestrictedAccessPlugin(null,LegacyConfig));
        Test("dedicated meter configuration is opt in", () => new RestrictedAccessPlugin(null,MeterConfig));
        Test("partial meter configuration fails closed", () => Denied(() => new RestrictedAccessPlugin(null,LegacyConfig+";meterrole="+MeterRole)));
        Test("meter role cannot reuse a human profile", () => Denied(() => new RestrictedAccessPlugin(null,MeterConfig.Replace(MeterRole.ToString(),OfficeRole.ToString()))));
        Test("duplicate meter setting fails closed", () => Denied(() => new RestrictedAccessPlugin(null,MeterConfig+";meteruser="+Id)));
        Test("exact meter patch is allowed", () => ValidateMeter(MeterTarget(),MeterCurrent()));
        foreach(var message in new[]{"Create","Delete","Upsert"}) { var m=message; Test("meter denies "+m,()=>Denied(()=>MeterWritePolicy.ValidateTarget(m,MeterTarget()))); }
        foreach(var field in new[]{"gr_status","gr_equipment","gr_completeddate","gr_description"}) {
            var f=field; Test("meter denies extra field "+f,()=>{var row=MeterTarget();row[f]="extra";Denied(()=>ValidateMeter(row,MeterCurrent()));});
        }
        foreach(var field in new[]{"gr_hourmeter","gr_hourmeterreadingtype","gr_hourmeterrecordeddate","gr_hourmeterapprovalreference"}) {
            var f=field; Test("meter requires nonnull field "+f,()=>{var row=MeterTarget();row[f]=null;Denied(()=>ValidateMeter(row,MeterCurrent()));});
        }
        Test("meter cannot write Equipment",()=>{var row=MeterTarget();row.LogicalName="gr_equipment";Denied(()=>ValidateMeter(row,MeterCurrent()));});
        Test("meter requires a nonnegative whole number",()=>{var row=MeterTarget();row["gr_hourmeter"]=-1;Denied(()=>ValidateMeter(row,MeterCurrent()));});
        Test("meter rejects estimated readings",()=>{var row=MeterTarget();row["gr_hourmeterreadingtype"]=new OptionSetValue(122830001);Denied(()=>ValidateMeter(row,MeterCurrent()));});
        Test("meter denies missing and future dates",()=>{var row=MeterTarget();row["gr_hourmeterrecordeddate"]=new DateTime(2999,1,1);Denied(()=>ValidateMeter(row,MeterCurrent()));});
        Test("meter denies time component",()=>{var row=MeterTarget();row["gr_hourmeterrecordeddate"]=new DateTime(2026,10,9,1,0,0);Denied(()=>ValidateMeter(row,MeterCurrent()));});
        foreach(var value in new[]{"bad",Id+"|1621|2026-10-09|"+OtherId,Id+"|1620|2026-10-08|"+OtherId,Id+"|1620|2026-10-09|"+Id,Guid.Empty+"|1620|2026-10-09|"+OtherId}) {
            var v=value; Test("meter denies mismatched approval "+v,()=>{var row=MeterTarget();row["gr_hourmeterapprovalreference"]=v;Denied(()=>ValidateMeter(row,MeterCurrent()));});
        }
        Test("meter denies completed Job",()=>{var current=MeterCurrent();current["gr_status"]=new OptionSetValue(122830003);Denied(()=>ValidateMeter(MeterTarget(),current));});
        Test("meter denies inactive Job",()=>{var current=MeterCurrent();current["statecode"]=new OptionSetValue(1);Denied(()=>ValidateMeter(MeterTarget(),current));});
        Test("meter denies void Job",()=>{var current=MeterCurrent();current["gr_registrationvoid"]=true;Denied(()=>ValidateMeter(MeterTarget(),current));});
        Test("meter denies missing equipment",()=>{var current=MeterCurrent();current.Attributes.Remove("gr_equipment");Denied(()=>ValidateMeter(MeterTarget(),current));});
        Test("meter denies older or same-day conflicting readings",()=>{var current=MeterCurrent();current["gr_hourmeterrecordeddate"]=new DateTime(2026,10,10);Denied(()=>ValidateMeter(MeterTarget(),current));current["gr_hourmeterrecordeddate"]=new DateTime(2026,10,9);current["gr_hourmeter"]=1621;Denied(()=>ValidateMeter(MeterTarget(),current));});
        Test("meter denies a manually edited approval replay",()=>{var current=MeterCurrent();current["gr_hourmeterapprovalreference"]=MeterTarget()["gr_hourmeterapprovalreference"];Denied(()=>ValidateMeter(MeterTarget(),current));});
        Test("meter requires the exact application user and role",()=>MeterWritePolicy.ValidateCaller(Id,MeterCaller(),new[]{MeterRole},Id,MeterApp,MeterRole));
        Test("human holding meter role is denied",()=>{var caller=MeterCaller();caller.Attributes.Remove("applicationid");Denied(()=>MeterWritePolicy.ValidateCaller(Id,caller,new[]{MeterRole},Id,MeterApp,MeterRole));});
        Test("other application is denied",()=>{var caller=MeterCaller();caller["applicationid"]=OtherId;Denied(()=>MeterWritePolicy.ValidateCaller(Id,caller,new[]{MeterRole},Id,MeterApp,MeterRole));});
        Test("disabled application is denied",()=>{var caller=MeterCaller();caller["isdisabled"]=true;Denied(()=>MeterWritePolicy.ValidateCaller(Id,caller,new[]{MeterRole},Id,MeterApp,MeterRole));});
        Test("missing meter role is denied",()=>Denied(()=>MeterWritePolicy.ValidateCaller(Id,MeterCaller(),new[]{OfficeRole},Id,MeterApp,MeterRole)));
        Test("different user is denied",()=>Denied(()=>MeterWritePolicy.ValidateCaller(OtherId,MeterCaller(),new[]{MeterRole},Id,MeterApp,MeterRole)));
        Test("guard executes exact meter path",()=>ExecuteMeterGuard(MeterTarget(),new[]{MeterRole},MeterCaller()));
        Test("Full role cannot bypass meter field guard",()=>{var row=MeterTarget();row["gr_status"]=new OptionSetValue(122830003);Denied(()=>ExecuteMeterGuard(row,new[]{MeterRole,FullRole},MeterCaller()));});
        Test("configured meter user without meter role cannot use Full bypass",()=>Denied(()=>ExecuteMeterGuard(MeterTarget(),new[]{FullRole},MeterCaller())));
    }
    static void ExecuteMeterGuard(Entity target, Guid[] held, Entity caller)
    {
        var identityReads=0;var membershipReads=0;
        var context=Proxy.For<IPluginExecutionContext>(new Dictionary<string,object>{
            {"Stage",20},{"Mode",0},{"IsInTransaction",true},{"UserId",Id},{"InitiatingUserId",Id},{"MessageName","Update"},
            {"InputParameters",new ParameterCollection{{"Target",target}}}
        });
        var service=Proxy.For<IOrganizationService>(new Dictionary<string,object>{
            {"RetrieveMultiple",new Func<object[],object>(args=>{
                var query=(Microsoft.Xrm.Sdk.Query.QueryExpression)args[0];var result=new EntityCollection();
                if(query.EntityName=="systemuserroles") foreach(var id in held){var row=new Entity("systemuserroles");row["roleid"]=id;result.Entities.Add(row);} return result;
            })},
            {"Retrieve",new Func<object[],object>(args=>{if((string)args[0]=="systemuser")throw new Exception("Caller service must not read the application identity");return MeterCurrent();})}
        });
        var identityService=Proxy.For<IOrganizationService>(new Dictionary<string,object>{
            {"Retrieve",new Func<object[],object>(args=>{if((string)args[0]!="systemuser"||(Guid)args[1]!=Id)throw new Exception("Elevated identity lookup escaped its exact user target");identityReads++;return caller;})},
            {"RetrieveMultiple",new Func<object[],object>(args=>{var query=(Microsoft.Xrm.Sdk.Query.QueryExpression)args[0];if(query.EntityName!="systemuserroles"||query.Criteria.Conditions.Count!=2)throw new Exception("Elevated membership lookup escaped its exact association");membershipReads++;var result=new EntityCollection();if(Array.IndexOf(held,MeterRole)>=0)result.Entities.Add(new Entity("systemuserroles"));return result;})}
        });
        var factory=Proxy.For<IOrganizationServiceFactory>(new Dictionary<string,object>{{"CreateOrganizationService",new Func<object[],object>(args=>{if(args[0]==null)return identityService;if((Guid)args[0]!=Id)throw new Exception("Impersonation is forbidden");return service;})}});
        var provider=Proxy.For<IServiceProvider>(new Dictionary<string,object>{{"GetService",new Func<object[],object>(args=>(Type)args[0]==typeof(IPluginExecutionContext)?(object)context:(Type)args[0]==typeof(IOrganizationServiceFactory)?(object)factory:null)}});
        new RestrictedAccessPlugin(null,MeterConfig).Execute(provider);
        if(identityReads!=1||membershipReads!=1)throw new Exception("Expected one exact elevated identity and membership read");
    }

    static Entity TimeCloudTarget()
    {
        var row=new Entity("gr_job",TimeCloudUser); row["gr_timecloudentered"]=true;
        row["gr_timecloudjobitemid"]="6aab1673160d0477d2e3e07d"; row["gr_timecloudcode"]="26958"; return row;
    }
    static Entity TimeCloudCurrent()
    {
        var row=new Entity("gr_job",TimeCloudUser); row["statecode"]=new OptionSetValue(0);
        row["gr_registrationvoid"]=false; row["gr_timecloudentered"]=false; return row;
    }
    static Entity TimeCloudCaller() { var row=new Entity("systemuser",TimeCloudUser); row["applicationid"]=TimeCloudApp; row["isdisabled"]=false; return row; }
    static Entity GreenTreeTarget(string table, string status)
    {
        var row=new Entity(table,GreenTreeUser); row["gr_greentreestatuscheckedon"]=DateTime.UtcNow;
        if(status!=null) { row[table=="gr_job"?"gr_gtentered":"gr_entered"]=true; row["gr_greentreestatus"]=status; }
        return row;
    }
    static Entity GreenTreeCurrent(string table, string status)
    {
        var row=new Entity(table,GreenTreeUser); row["statecode"]=new OptionSetValue(0);
        var marker=table=="gr_job"?"gr_gtentered":"gr_entered"; row[marker]=!String.IsNullOrWhiteSpace(status);
        if(!String.IsNullOrWhiteSpace(status)) row["gr_greentreestatus"]=status;
        if(table=="gr_job") row["gr_registrationvoid"]=false;
        return row;
    }
    static void TimeCloudTests()
    {
        Test("dedicated TimeCloud configuration is opt in",()=>new RestrictedAccessPlugin(null,TimeCloudConfig));
        Test("partial TimeCloud configuration fails closed",()=>Denied(()=>new RestrictedAccessPlugin(null,LegacyConfig+";timecloudrole="+TimeCloudRole)));
        Test("TimeCloud role cannot reuse a human profile",()=>Denied(()=>new RestrictedAccessPlugin(null,TimeCloudConfig.Replace(TimeCloudRole.ToString(),OfficeRole.ToString()))));
        Test("duplicate TimeCloud setting fails closed",()=>Denied(()=>new RestrictedAccessPlugin(null,TimeCloudConfig+";timeclouduser="+TimeCloudUser)));
        Test("server writer identities must be distinct",()=>Denied(()=>new RestrictedAccessPlugin(null,MeterConfig+";timecloudrole="+TimeCloudRole+";timeclouduser="+Id+";timecloudapplication="+TimeCloudApp)));
        Test("exact TimeCloud confirmation is allowed",()=>TimeCloudWritePolicy.Validate(TimeCloudTarget(),TimeCloudCurrent()));
        Test("TimeCloud permits exact Dataverse platform fields",()=>{var row=TimeCloudTarget();row["gr_jobid"]=row.Id;row["modifiedby"]=new EntityReference("systemuser",TimeCloudUser);row["modifiedon"]=DateTime.UtcNow;row["modifiedonbehalfby"]=null;TimeCloudWritePolicy.Validate(row,TimeCloudCurrent());});
        foreach(var message in new[]{"Create","Delete","Upsert"}) { var m=message; Test("TimeCloud denies "+m,()=>Denied(()=>TimeCloudWritePolicy.ValidateTarget(m,TimeCloudTarget()))); }
        foreach(var field in new[]{"gr_status","gr_description","gr_gtentered"}) { var f=field; Test("TimeCloud denies extra field "+f,()=>{var row=TimeCloudTarget();row[f]="extra";Denied(()=>TimeCloudWritePolicy.Validate(row,TimeCloudCurrent()));}); }
        Test("TimeCloud requires entered true",()=>{var row=TimeCloudTarget();row["gr_timecloudentered"]=false;Denied(()=>TimeCloudWritePolicy.Validate(row,TimeCloudCurrent()));});
        foreach(var field in new[]{"gr_timecloudjobitemid","gr_timecloudcode"}) {
            var f=field; Test("TimeCloud requires bounded nonempty "+f,()=>{var row=TimeCloudTarget();row[f]=" ";Denied(()=>TimeCloudWritePolicy.Validate(row,TimeCloudCurrent()));});
            Test("TimeCloud rejects oversized "+f,()=>{var row=TimeCloudTarget();row[f]=new string('x',101);Denied(()=>TimeCloudWritePolicy.Validate(row,TimeCloudCurrent()));});
        }
        Test("TimeCloud denies inactive Job",()=>{var current=TimeCloudCurrent();current["statecode"]=new OptionSetValue(1);Denied(()=>TimeCloudWritePolicy.Validate(TimeCloudTarget(),current));});
        Test("TimeCloud denies void Job",()=>{var current=TimeCloudCurrent();current["gr_registrationvoid"]=true;Denied(()=>TimeCloudWritePolicy.Validate(TimeCloudTarget(),current));});
        Test("TimeCloud denies overwriting partial confirmation",()=>{var current=TimeCloudCurrent();current["gr_timecloudjobitemid"]="other";Denied(()=>TimeCloudWritePolicy.Validate(TimeCloudTarget(),current));});
        Test("TimeCloud permits exact idempotent confirmation",()=>{var current=TimeCloudCurrent();current["gr_timecloudentered"]=true;current["gr_timecloudjobitemid"]=TimeCloudTarget()["gr_timecloudjobitemid"];current["gr_timecloudcode"]=TimeCloudTarget()["gr_timecloudcode"];TimeCloudWritePolicy.Validate(TimeCloudTarget(),current);});
        Test("TimeCloud denies replacing confirmed identity",()=>{var current=TimeCloudCurrent();current["gr_timecloudentered"]=true;current["gr_timecloudjobitemid"]="other";current["gr_timecloudcode"]="26958";Denied(()=>TimeCloudWritePolicy.Validate(TimeCloudTarget(),current));});
        Test("TimeCloud requires exact application user and role",()=>TimeCloudWritePolicy.ValidateCaller(TimeCloudUser,TimeCloudCaller(),new[]{TimeCloudRole},TimeCloudUser,TimeCloudApp,TimeCloudRole));
        Test("human holding TimeCloud role is denied",()=>{var caller=TimeCloudCaller();caller.Attributes.Remove("applicationid");Denied(()=>TimeCloudWritePolicy.ValidateCaller(TimeCloudUser,caller,new[]{TimeCloudRole},TimeCloudUser,TimeCloudApp,TimeCloudRole));});
        Test("other TimeCloud application is denied",()=>{var caller=TimeCloudCaller();caller["applicationid"]=OtherId;Denied(()=>TimeCloudWritePolicy.ValidateCaller(TimeCloudUser,caller,new[]{TimeCloudRole},TimeCloudUser,TimeCloudApp,TimeCloudRole));});
        Test("disabled TimeCloud application is denied",()=>{var caller=TimeCloudCaller();caller["isdisabled"]=true;Denied(()=>TimeCloudWritePolicy.ValidateCaller(TimeCloudUser,caller,new[]{TimeCloudRole},TimeCloudUser,TimeCloudApp,TimeCloudRole));});
        Test("TimeCloud missing role is denied",()=>Denied(()=>TimeCloudWritePolicy.ValidateCaller(TimeCloudUser,TimeCloudCaller(),new[]{OfficeRole},TimeCloudUser,TimeCloudApp,TimeCloudRole)));
        Test("guard executes exact TimeCloud path",()=>ExecuteTimeCloudGuard(TimeCloudTarget(),new[]{TimeCloudRole},TimeCloudCaller()));
        Test("Full role cannot bypass TimeCloud field guard",()=>{var row=TimeCloudTarget();row["gr_status"]=new OptionSetValue(122830003);Denied(()=>ExecuteTimeCloudGuard(row,new[]{TimeCloudRole,FullRole},TimeCloudCaller()));});
        Test("configured TimeCloud user without TimeCloud role cannot use Full bypass",()=>Denied(()=>ExecuteTimeCloudGuard(TimeCloudTarget(),new[]{FullRole},TimeCloudCaller())));
        foreach(var table in new[]{"gr_job","gr_jobbookentry","gr_waikatojobbookentry","gr_hastingsjobbookentry","gr_christchurchjobbookentry"}) {
            var t=table;
            Test(t+" server may record exact GreenTree status",()=>GreenTreeStatusWritePolicy.Validate(GreenTreeTarget(t,"open"),GreenTreeCurrent(t,null)));
            Test(t+" server permits Dataverse timezone metadata",()=>{var row=GreenTreeTarget(t,"open");row["timezoneruleversionnumber"]=4;row["utcconversiontimezonecode"]=12;GreenTreeStatusWritePolicy.Validate(row,GreenTreeCurrent(t,null));});
            Test(t+" server may record Not entered check time",()=>GreenTreeStatusWritePolicy.Validate(GreenTreeTarget(t,null),GreenTreeCurrent(t,null)));
            Test(t+" server validation reads only table-specific GreenTree columns",()=>{
                var columns=GreenTreeStatusWritePolicy.CurrentColumns(t).Columns;
                if(t=="gr_job") {
                    if(!columns.Contains("gr_registrationvoid")||!columns.Contains("gr_gtentered")||columns.Contains("gr_entered")) throw new Exception("Job GreenTree validation columns are invalid");
                } else if(columns.Contains("gr_registrationvoid")||columns.Contains("gr_gtentered")||!columns.Contains("gr_entered")) throw new Exception("Ledger GreenTree validation columns are invalid");
            });
            Test(t+" server denies invalid GreenTree status",()=>{var row=GreenTreeTarget(t,"open");row["gr_greentreestatus"]="complete";Denied(()=>GreenTreeStatusWritePolicy.Validate(row,GreenTreeCurrent(t,null)));});
            Test(t+" server denies GreenTree status regression",()=>Denied(()=>GreenTreeStatusWritePolicy.Validate(GreenTreeTarget(t,"open"),GreenTreeCurrent(t,"closed"))));
        }
        Test("server denies GreenTree status without marker",()=>{var row=GreenTreeTarget("gr_job","open");row.Attributes.Remove("gr_gtentered");Denied(()=>GreenTreeStatusWritePolicy.Validate(row,GreenTreeCurrent("gr_job",null)));});
        Test("server denies GreenTree future check time",()=>{var row=GreenTreeTarget("gr_job",null);row["gr_greentreestatuscheckedon"]=DateTime.UtcNow.AddHours(1);Denied(()=>GreenTreeStatusWritePolicy.Validate(row,GreenTreeCurrent("gr_job",null)));});
        Test("server denies mixed GreenTree and TimeCloud patch",()=>{var row=GreenTreeTarget("gr_job","open");row["gr_timecloudentered"]=true;Denied(()=>GreenTreeStatusWritePolicy.Validate(row,GreenTreeCurrent("gr_job",null)));});
        Test("server denies inactive GreenTree record",()=>{var current=GreenTreeCurrent("gr_job",null);current["statecode"]=new OptionSetValue(1);Denied(()=>GreenTreeStatusWritePolicy.Validate(GreenTreeTarget("gr_job",null),current));});
        Test("server denies void GreenTree Job",()=>{var current=GreenTreeCurrent("gr_job",null);current["gr_registrationvoid"]=true;Denied(()=>GreenTreeStatusWritePolicy.Validate(GreenTreeTarget("gr_job",null),current));});
        Test("dedicated GreenTree configuration is opt in",()=>new RestrictedAccessPlugin(null,GreenTreeConfig));
        Test("partial GreenTree configuration fails closed",()=>Denied(()=>new RestrictedAccessPlugin(null,LegacyConfig+";greentreerole="+GreenTreeRole)));
        Test("GreenTree role cannot reuse a human profile",()=>Denied(()=>new RestrictedAccessPlugin(null,GreenTreeConfig.Replace(GreenTreeRole.ToString(),OfficeRole.ToString()))));
        Test("GreenTree and TimeCloud identities must be distinct",()=>Denied(()=>new RestrictedAccessPlugin(null,TimeCloudConfig+";greentreerole="+GreenTreeRole+";greentreeuser="+TimeCloudUser+";greentreeapplication="+GreenTreeApp)));
        Test("GreenTree requires exact application user and role",()=>GreenTreeStatusWritePolicy.ValidateCaller(GreenTreeUser,GreenTreeCaller(),new[]{GreenTreeRole},GreenTreeUser,GreenTreeApp,GreenTreeRole));
        Test("other GreenTree application is denied",()=>{var caller=GreenTreeCaller();caller["applicationid"]=OtherId;Denied(()=>GreenTreeStatusWritePolicy.ValidateCaller(GreenTreeUser,caller,new[]{GreenTreeRole},GreenTreeUser,GreenTreeApp,GreenTreeRole));});
        Test("guard executes exact GreenTree status path",()=>ExecuteGreenTreeGuard(GreenTreeTarget("gr_job","open"),new[]{GreenTreeRole},GreenTreeCaller()));
        Test("guard executes exact regional GreenTree status path",()=>ExecuteGreenTreeGuard(GreenTreeTarget("gr_waikatojobbookentry","closed"),new[]{GreenTreeRole},GreenTreeCaller()));
        Test("TimeCloud identity cannot write GreenTree status",()=>Denied(()=>ExecuteTimeCloudGuard(GreenTreeTarget("gr_job","open"),new[]{TimeCloudRole},TimeCloudCaller())));
    }
    static Entity GreenTreeCaller() { var row=new Entity("systemuser",GreenTreeUser); row["applicationid"]=GreenTreeApp; row["isdisabled"]=false; return row; }
    static void ExecuteGreenTreeGuard(Entity target, Guid[] held, Entity caller)
    {
        var identityReads=0;var membershipReads=0;
        var context=Proxy.For<IPluginExecutionContext>(new Dictionary<string,object>{
            {"Stage",20},{"Mode",0},{"IsInTransaction",true},{"UserId",GreenTreeUser},{"InitiatingUserId",GreenTreeUser},{"MessageName","Update"},
            {"InputParameters",new ParameterCollection{{"Target",target}}}
        });
        var service=Proxy.For<IOrganizationService>(new Dictionary<string,object>{
            {"RetrieveMultiple",new Func<object[],object>(args=>{var query=(Microsoft.Xrm.Sdk.Query.QueryExpression)args[0];var result=new EntityCollection();if(query.EntityName=="systemuserroles")foreach(var id in held){var row=new Entity("systemuserroles");row["roleid"]=id;result.Entities.Add(row);}return result;})},
            {"Retrieve",new Func<object[],object>(args=>{if((string)args[0]=="systemuser")throw new Exception("Caller service must not read the application identity");return GreenTreeCurrent(target.LogicalName,null);})}
        });
        var identityService=Proxy.For<IOrganizationService>(new Dictionary<string,object>{
            {"Retrieve",new Func<object[],object>(args=>{if((string)args[0]!="systemuser"||(Guid)args[1]!=GreenTreeUser)throw new Exception("Elevated identity lookup escaped its exact user target");identityReads++;return caller;})},
            {"RetrieveMultiple",new Func<object[],object>(args=>{var query=(Microsoft.Xrm.Sdk.Query.QueryExpression)args[0];if(query.EntityName!="systemuserroles"||query.Criteria.Conditions.Count!=2)throw new Exception("Elevated membership lookup escaped its exact association");membershipReads++;var result=new EntityCollection();if(Array.IndexOf(held,GreenTreeRole)>=0)result.Entities.Add(new Entity("systemuserroles"));return result;})}
        });
        var factory=Proxy.For<IOrganizationServiceFactory>(new Dictionary<string,object>{{"CreateOrganizationService",new Func<object[],object>(args=>{if(args[0]==null)return identityService;if((Guid)args[0]!=GreenTreeUser)throw new Exception("Impersonation is forbidden");return service;})}});
        var provider=Proxy.For<IServiceProvider>(new Dictionary<string,object>{{"GetService",new Func<object[],object>(args=>(Type)args[0]==typeof(IPluginExecutionContext)?(object)context:(Type)args[0]==typeof(IOrganizationServiceFactory)?(object)factory:null)}});
        new RestrictedAccessPlugin(null,GreenTreeConfig).Execute(provider);
        if(identityReads!=1||membershipReads!=1)throw new Exception("Expected one exact elevated identity and membership read");
    }
    static void ExecuteTimeCloudGuard(Entity target, Guid[] held, Entity caller)
    {
        var identityReads=0;var membershipReads=0;
        var context=Proxy.For<IPluginExecutionContext>(new Dictionary<string,object>{
            {"Stage",20},{"Mode",0},{"IsInTransaction",true},{"UserId",TimeCloudUser},{"InitiatingUserId",TimeCloudUser},{"MessageName","Update"},
            {"InputParameters",new ParameterCollection{{"Target",target}}}
        });
        var service=Proxy.For<IOrganizationService>(new Dictionary<string,object>{
            {"RetrieveMultiple",new Func<object[],object>(args=>{var query=(Microsoft.Xrm.Sdk.Query.QueryExpression)args[0];var result=new EntityCollection();if(query.EntityName=="systemuserroles")foreach(var id in held){var row=new Entity("systemuserroles");row["roleid"]=id;result.Entities.Add(row);}return result;})},
            {"Retrieve",new Func<object[],object>(args=>{if((string)args[0]=="systemuser")throw new Exception("Caller service must not read the application identity");return GreenTreeStatusWritePolicy.IsTarget(target)?GreenTreeCurrent(target.LogicalName,null):TimeCloudCurrent();})}
        });
        var identityService=Proxy.For<IOrganizationService>(new Dictionary<string,object>{
            {"Retrieve",new Func<object[],object>(args=>{if((string)args[0]!="systemuser"||(Guid)args[1]!=TimeCloudUser)throw new Exception("Elevated identity lookup escaped its exact user target");identityReads++;return caller;})},
            {"RetrieveMultiple",new Func<object[],object>(args=>{var query=(Microsoft.Xrm.Sdk.Query.QueryExpression)args[0];if(query.EntityName!="systemuserroles"||query.Criteria.Conditions.Count!=2)throw new Exception("Elevated membership lookup escaped its exact association");membershipReads++;var result=new EntityCollection();if(Array.IndexOf(held,TimeCloudRole)>=0)result.Entities.Add(new Entity("systemuserroles"));return result;})}
        });
        var factory=Proxy.For<IOrganizationServiceFactory>(new Dictionary<string,object>{{"CreateOrganizationService",new Func<object[],object>(args=>{if(args[0]==null)return identityService;if((Guid)args[0]!=TimeCloudUser)throw new Exception("Impersonation is forbidden");return service;})}});
        var provider=Proxy.For<IServiceProvider>(new Dictionary<string,object>{{"GetService",new Func<object[],object>(args=>(Type)args[0]==typeof(IPluginExecutionContext)?(object)context:(Type)args[0]==typeof(IOrganizationServiceFactory)?(object)factory:null)}});
        new RestrictedAccessPlugin(null,TimeCloudConfig).Execute(provider);
        if(identityReads!=1||membershipReads!=1)throw new Exception("Expected one exact elevated identity and membership read");
    }

    static Entity RegistrationLedger(string table, Guid ledgerId, Guid jobId)
    {
        var row = new Entity(table, ledgerId);
        row["gr_stage"] = new OptionSetValue(122830004); row["gr_registeredjob"] = new EntityReference("gr_job", jobId);
        row["gr_registrationfingerprint"] = new string('a', 64); row["gr_description"] = "Repair mast"; row["gr_customerpo"] = "PO-1";
        row["gr_site"] = new EntityReference("gr_site", OtherId); row["gr_customer"] = new EntityReference("gr_customer", OtherId);
        row["gr_customersnapshot"] = "Customer"; row["gr_sitesnapshot"] = "Site"; row["gr_addresssnapshot"] = "Address";
        row["gr_entered"] = false; row["gr_timecloudentered"] = false; row["gr_addressverified"] = false;
        row["gr_addressnotfoundconfirmed"] = false; row["gr_equipmentreviewrequired"] = true;
        return row;
    }

    static IPluginExecutionContext Context(string message, ParameterCollection inputs, IPluginExecutionContext parent, int stage)
    {
        return Proxy.For<IPluginExecutionContext>(new Dictionary<string, object> {
            { "MessageName", message }, { "InputParameters", inputs }, { "ParentContext", parent },
            { "Stage", stage }, { "Mode", 0 }, { "IsInTransaction", true }, { "InitiatingUserId", Id }
        });
    }
    sealed class Proxy : RealProxy
    {
        readonly Dictionary<string, object> values;
        Proxy(Type type, Dictionary<string, object> data) : base(type) { values = data; }
        internal static T For<T>(Dictionary<string, object> data) { return (T)new Proxy(typeof(T), data).GetTransparentProxy(); }
        public override IMessage Invoke(IMessage message)
        {
            var call = (IMethodCallMessage)message; object value;
            if(values.TryGetValue(call.MethodName,out value) && value is Func<object[],object>)
                return new ReturnMessage(((Func<object[],object>)value)(call.Args),null,0,call.LogicalCallContext,call);
            if (!call.MethodName.StartsWith("get_") || !values.TryGetValue(call.MethodName.Substring(4), out value)) throw new Exception("Unexpected context member: " + call.MethodName);
            return new ReturnMessage(value, null, 0, call.LogicalCallContext, call);
        }
    }
}
