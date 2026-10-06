using System;
using Microsoft.Xrm.Sdk;
using ServiceOperations.Access;

public static class RestrictedAccessTests
{
    static int passed;
    static readonly Guid Id = new Guid("00000000-0000-4000-8000-000000000001");
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
        Console.WriteLine(passed+" restricted-access tests passed (offline; no live security claim).");
    }
}
