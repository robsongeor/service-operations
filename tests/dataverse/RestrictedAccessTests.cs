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
        foreach (string role in new[] { "office", "book" })
        {
            string r = role;
            Test(r+" corrects managed Job description", () => Change(r, "gr_job", "gr_description", "Corrected"));
            Test(r+" edits Equipment details", () => Change(r, "gr_equipment", "gr_serial", "Corrected serial"));
            Test(r+" moves Equipment", () => Change(r, "gr_equipment", "gr_site", new EntityReference("gr_site", Id)));
            Test(r+" creates Customer", () => { var target=Row("gr_customer"); target["gr_name"]="New Customer"; RestrictedWritePolicy.Validate(r,"Create",target,null); });
            Test(r+" creates Site", () => { var target=Row("gr_site"); target["gr_name"]="New Site"; target["gr_customer"]=new EntityReference("gr_customer",Id); RestrictedWritePolicy.Validate(r,"Create",target,null); });
            foreach (string field in new[] { "gr_mechanic", "gr_status", "gr_jobtype", "gr_jobnumber", "gr_coordinatormanaged", "gr_techniciansubmissionstory" })
            {
                string f=field; Test(r+" rejects Job field "+f, () => Denied(() => Change(r,"gr_job",f,"tampered")));
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
        Test("book rejects Timecloud marker", () => Denied(() => Change("book","gr_job","gr_timecloudentered",true)));
        Test("office may record GreenTree marker", () => Change("office","gr_job","gr_gtentered",true));
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
            job["gr_site"]=new EntityReference("gr_site",OtherId); job["gr_status"]=new OptionSetValue(122830001); job["gr_coordinatormanaged"]=false;
            if (!RestrictedAccessPlugin.IsRegistrationChild(create, job)) throw new Exception("Exact registration Job create was not accepted");
            var ledger = RegistrationLedger("gr_jobbookentry", Id, Id);
            if (!RestrictedAccessPlugin.IsRegistrationChild(create, ledger)) throw new Exception("Exact registration ledger create was not accepted");
            var update = Context("Update", new ParameterCollection(), parent, 20);
            var number = Row("gr_job"); number["gr_jobnumber"]="123456";
            if (!RestrictedAccessPlugin.IsRegistrationChild(update, number)) throw new Exception("Exact registration Job number update was not accepted");
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
            var job = new Entity("gr_job", OtherId); job["gr_jobnumber"]="WJ1548";
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
            if (!call.MethodName.StartsWith("get_") || !values.TryGetValue(call.MethodName.Substring(4), out value)) throw new Exception("Unexpected context member: " + call.MethodName);
            return new ReturnMessage(value, null, 0, call.LogicalCallContext, call);
        }
    }
}
