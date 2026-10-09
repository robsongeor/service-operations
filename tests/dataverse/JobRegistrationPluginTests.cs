using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Runtime.Remoting.Messaging;
using System.Runtime.Remoting.Proxies;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace ServiceOperations.JobRegistration.Tests
{
    // Simulates an ambient transaction using an isolated working set and conditional commit.
    // This verifies plugin logic, NOT Dataverse isolation, security grants or installed metadata.
    public static class RegistrationTests
    {
        static readonly Guid Caller = Id(901), Site = Id(101), Customer = Id(102), Equipment = Id(103), Mechanic = Id(104), Contact = Id(105);
        static int passed;
        static Guid Id(int n) { return new Guid("00000000-0000-4000-8000-" + n.ToString("D12")); }
        static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
        static void Test(string name, Action action) { action(); passed++; Console.WriteLine("PASS " + name); }
        static void Reject(Action action, string code) { try { action(); } catch (InvalidPluginExecutionException error) { Check(error.Message.Contains(code), "Expected " + code + ", received " + error.Message); return; } throw new Exception("Expected rejection: " + code); }
        static ParameterCollection NewRequest(int n = 1, string book = "auckland") { return new ParameterCollection {
            { "RequestId", Id(n) }, { "Book", book }, { "Description", "Sample work" }, { "OrderNumber", "PO-1" },
            { "SiteId", Site }, { "EquipmentId", Equipment }, { "EquipmentUnknown", false }, { "MechanicId", Mechanic }, { "ContactId", Contact }
        }; }
        static ParameterCollection AllocateRequest(Entity job, int n = 2, string book = "waikato") { return new ParameterCollection {
            { "RequestId", Id(n) }, { "Book", book }, { "JobId", job.Id }, { "ExpectedRowVersion", job.RowVersion }
        }; }
        static ParameterCollection ManageRequest(Entity job) { return new ParameterCollection {
            { "JobId", job.Id }, { "ExpectedJobRowVersion", job.RowVersion }
        }; }
        static ParameterCollection VoidRequest(Entity job, Entity ledger, string book = "auckland", string reason = "Entered twice") { return new ParameterCollection {
            { "Book", book }, { "JobId", job.Id }, { "LedgerId", ledger.Id },
            { "ExpectedJobRowVersion", job.RowVersion }, { "ExpectedLedgerRowVersion", ledger.RowVersion }, { "Reason", reason }
        }; }
        static ParameterCollection DispatchRequest(Entity job, int n = 50) { return new ParameterCollection {
            { "RequestId", Id(n) }, { "JobId", job.Id }, { "ExpectedJobRowVersion", job.RowVersion },
            { "RecipientEmail", "tech@example.invalid" }, { "Subject", "Job details" }, { "Body", "<p>Safe fixture body</p>" }
        }; }
        static Database Fixture()
        {
            var db = new Database();
            db.Put(new Entity("gr_customer", Customer) { Attributes = { { "gr_name", "Sample Customer" }, { "statecode", new OptionSetValue(0) } } });
            db.Put(new Entity("gr_site", Site) { Attributes = { { "gr_name", "Sample Site" }, { "gr_address", "Test address" }, { "gr_customer", new EntityReference("gr_customer", Customer) }, { "statecode", new OptionSetValue(0) } } });
            db.Put(new Entity("gr_equipment", Equipment) { Attributes = { { "gr_fleet", "F1" }, { "statecode", new OptionSetValue(0) } } });
            db.Put(new Entity("gr_mechanic", Mechanic) { Attributes = { { "gr_name", "Sample Technician" }, { "gr_email", "tech@example.invalid" }, { "statecode", new OptionSetValue(0) }, { "gr_jobassignmentenabled", true } } });
            db.Put(new Entity("gr_sitecontact", Contact) { Attributes = { { "gr_site", new EntityReference("gr_site", Site) }, { "gr_contact", new EntityReference("gr_contact", Contact) }, { "statecode", new OptionSetValue(0) } } });
            return db;
        }
        static Entity Draft(Database db)
        {
            var job = new Entity("gr_job", Id(700)) { Attributes = {
                { "gr_description", "Staged work" }, { "gr_site", new EntityReference("gr_site", Site) },
                { "gr_status", new OptionSetValue(122830005) }, { "gr_jobtype", new OptionSetValue(122830000) },
                { "gr_coordinatormanaged", true }, { "gr_gtentered", true }, { "gr_techniciansubmissionstory", "Immutable evidence" }
            } };
            db.Put(job); return db.Get("gr_job", job.Id);
        }
        public static void Run()
        {
            foreach (string book in new[] { "auckland", "waikato", "hastings", "christchurch" })
            {
                string selected = book;
                Test("register " + selected + " atomically with server-generated number", () => {
                    var db = Fixture(); var output = db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(1, selected));
                    var job = db.Get("gr_job", Id(1)); var ledger = db.Get(Table(selected), Id(1));
                    Check(db.Count("gr_job") == 1 && db.Count(Table(selected)) == 1, "One Job and one ledger expected");
                    Check(job.GetAttributeValue<string>("gr_jobnumber") == (string)output["JobNumber"], "Number mismatch");
                    Check(ledger.GetAttributeValue<EntityReference>(JobRegistrationPlugin.RegisteredJob).Id == job.Id, "Missing Job link");
                    Check(!job.Contains("gr_jobtype") && !job.GetAttributeValue<bool>(JobRegistrationPlugin.CoordinatorManaged), "Basic Job entered operational workflow");
                    Check(job.GetAttributeValue<EntityReference>("gr_mechanic").Id == Mechanic, "Initial technician was lost");
                    Check(!ledger.Contains("gr_promotedjob") && !ledger.GetAttributeValue<bool>("gr_addressverified"), "Invented promotion/verification");
                    Check(db.LastServiceUser == Caller, "Service must use caller identity");
                });
            }
            Test("unknown Equipment is explicit and preserves Customer/Site", () => {
                var db = Fixture(); var request = NewRequest(); request.Remove("EquipmentId"); request["EquipmentUnknown"] = true;
                db.Invoke(JobRegistrationPlugin.RegisterMessage, request);
                Check(db.Get("gr_jobbookentry", Id(1)).GetAttributeValue<bool>("gr_equipmentreviewrequired"), "Unknown Equipment missing");
                Check(db.Get("gr_job", Id(1)).GetAttributeValue<EntityReference>("gr_site").Id == Site, "Missing Site");
            });
            Test("unassigned new entry remains valid and unallocated", () => {
                var db = Fixture(); var request = NewRequest(); request.Remove("MechanicId");
                db.Invoke(JobRegistrationPlugin.RegisterMessage, request);
                Check(db.Get("gr_job", Id(1)).GetAttributeValue<OptionSetValue>("gr_status").Value == 122830001, "Unexpected status");
            });
            Test("external supplier is stored without a Staff lookup", () => {
                var db = Fixture(); var request = NewRequest(); request.Remove("MechanicId"); request["ExternalSupplierDetails"] = "AutoTreads - large tyres";
                db.Invoke(JobRegistrationPlugin.RegisterMessage, request);
                var job = db.Get("gr_job", Id(1)); var ledger = db.Get("gr_jobbookentry", Id(1));
                Check(!job.Contains("gr_mechanic") && job.GetAttributeValue<string>("gr_externalsupplierdetails") == "AutoTreads - large tyres", "External supplier was not stored separately");
                Check(ledger.GetAttributeValue<string>("gr_mechanictext") == "AutoTreads - large tyres", "External supplier snapshot missing");
                Check(job.GetAttributeValue<OptionSetValue>("gr_status").Value == 122830000, "Assigned external work should be Allocated");
                var invalid = NewRequest(2); invalid["ExternalSupplierDetails"] = "AutoTreads";
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, invalid), "INVALID");
            });
            Test("lost-response replay returns the same number without writes or directory reads", () => {
                var db = Fixture(); var first = db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                db.Records.Remove(Key("gr_site", Site));
                var second = db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                Check((bool)second["WasReplay"] && (string)first["JobNumber"] == (string)second["JobNumber"], "Replay changed number");
                Check(db.LastWrites == 0 && db.LastReads == 2, "Replay repeated lookups or writes");
            });
            Test("replay preserves later corrections and Void history", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                db.Get("gr_job", Id(1))["gr_description"] = "Later correction";
                db.Get("gr_jobbookentry", Id(1))["gr_stage"] = new OptionSetValue(122830003);
                db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                Check(db.Get("gr_job", Id(1)).GetAttributeValue<string>("gr_description") == "Later correction", "Replay reverted correction");
                Check(db.Get("gr_jobbookentry", Id(1)).GetAttributeValue<OptionSetValue>("gr_stage").Value == 122830003, "Replay restored Void");
            });
            Test("changed details, actor or region cannot reuse a creation request", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                var altered = NewRequest(); altered["Description"] = "Different";
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, altered), "REQUEST_REUSED");
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(), Id(902)), "REQUEST_REUSED");
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(1, "waikato")), "REQUEST_REUSED");
                Check(db.Count("gr_job") == 1 && db.Count(Table("waikato")) == 0, "Request duplicated");
            });
            foreach (string field in new[] { "JobNumber", "JobType", "Status", "CoordinatorManaged", "Email", "ActorId", "Schedules", "GtEntered" })
            {
                string key = field;
                Test("registration rejects unexpected " + key, () => {
                    var db = Fixture(); var request = NewRequest(); request[key] = "tampered";
                    Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, request), "INVALID");
                    Check(db.LastWrites == 0, "Unexpected write");
                });
            }
            Test("invalid technician, Site, Contact and Equipment decisions allocate nothing", () => {
                foreach (int scenario in new[] { 0, 1, 2, 3, 4 }) {
                    var db = Fixture(); var request = NewRequest();
                    if (scenario == 0) db.Get("gr_mechanic", Mechanic)["gr_jobassignmentenabled"] = false;
                    if (scenario == 1) db.Get("gr_site", Site)["gr_address"] = " ";
                    if (scenario == 2) request["ContactId"] = Id(999);
                    if (scenario == 3) request.Remove("EquipmentId");
                    if (scenario == 4) db.Get("gr_customer", Customer)["statecode"] = new OptionSetValue(1);
                    Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, request), "INVALID");
                    Check(db.Count("gr_job") == 0 && db.LastWrites == 0, "Validation happened after allocation");
                }
            });
            Test("every write failure rolls back Job and ledger together", () => {
                for (int stage = 1; stage <= 3; stage++) {
                    var db = Fixture(); db.FailWrite = stage;
                    Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest()), "SAVE_FAILED");
                    Check(db.Count("gr_job") == 0 && db.Count("gr_jobbookentry") == 0, "Partial write survived");
                    db.FailWrite = 0;
                    db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                    Check(db.Count("gr_job") == 1 && db.Count("gr_jobbookentry") == 1, "Failed request could not safely retry");
                }
            });
            Test("existing staging allocation changes only number, retaining status, membership and evidence", () => {
                var db = Fixture(); var draft = Draft(db); var request = AllocateRequest(draft);
                var result = db.Invoke(JobRegistrationPlugin.AllocateMessage, request);
                var saved = db.Get("gr_job", draft.Id);
                Check(saved.GetAttributeValue<string>("gr_jobnumber").StartsWith("WJ"), "Wrong region");
                Check(saved.GetAttributeValue<OptionSetValue>("gr_status").Value == 122830005, "Status changed");
                Check(saved.GetAttributeValue<bool>(JobRegistrationPlugin.CoordinatorManaged), "Membership changed");
                Check(saved.GetAttributeValue<string>("gr_techniciansubmissionstory") == "Immutable evidence", "Evidence changed");
                Check(db.Get(Table("waikato"), Id(2)).GetAttributeValue<bool>("gr_entered"), "Factual marker lost");
                Check((bool)db.Invoke(JobRegistrationPlugin.AllocateMessage, request)["WasReplay"], "Allocation replay failed");
                Check((Guid)result["JobId"] == draft.Id && db.Count("gr_job") == 1, "Created another Job");
            });
            Test("stale or numbered Jobs cannot allocate", () => {
                var db = Fixture(); var job = Draft(db); var request = AllocateRequest(job);
                job.RowVersion = "999";
                Reject(() => db.Invoke(JobRegistrationPlugin.AllocateMessage, request), "CONFLICT");
                job["gr_jobnumber"] = "OLD123";
                Reject(() => db.Invoke(JobRegistrationPlugin.AllocateMessage, AllocateRequest(job)), "ALREADY_NUMBERED");
                Check(db.Count(Table("waikato")) == 0, "Allocated despite conflict");
            });
            Test("two requests racing for one Job commit exactly one allocation", () => {
                var db = Fixture(); var job = Draft(db); var first = AllocateRequest(job, 2, "waikato"); var second = AllocateRequest(job, 3, "hastings");
                db.BeforeNumberUpdate = () => db.Invoke(JobRegistrationPlugin.AllocateMessage, second);
                Reject(() => db.Invoke(JobRegistrationPlugin.AllocateMessage, first), "SAVE_FAILED");
                Check(db.Count(Table("waikato")) == 0 && db.Count(Table("hastings")) == 1, "Race left orphan ledger");
                Check(db.Get("gr_job", job.Id).GetAttributeValue<string>("gr_jobnumber").StartsWith("HJ"), "Winning number lost");
                Check((bool)db.Invoke(JobRegistrationPlugin.AllocateMessage, second)["WasReplay"], "Winner replay failed");
            });
            Test("colliding legacy number rolls back without silently skipping to another number", () => {
                var db = Fixture(); var old = Draft(db); old["gr_jobnumber"] = "900001";
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest()), "SAVE_FAILED");
                Check(db.Count("gr_job") == 1 && db.Count("gr_jobbookentry") == 0, "Legacy collision left new rows");
            });
            Test("simultaneous creation replay commits one Job and one ledger", () => {
                var db = Fixture(); var request = NewRequest();
                db.BeforeNumberUpdate = () => db.Invoke(JobRegistrationPlugin.RegisterMessage, request);
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, request), "SAVE_FAILED");
                Check(db.Count("gr_job") == 1 && db.Count("gr_jobbookentry") == 1, "Duplicate request committed twice");
                Check((bool)db.Invoke(JobRegistrationPlugin.RegisterMessage, request)["WasReplay"], "Concurrent winner was not replayable");
            });
            Test("historical ledger is never adopted by request-ID collision", () => {
                var db = Fixture(); db.Put(new Entity("gr_jobbookentry", Id(1)) { Attributes = { { "gr_jobnumber", "145999" }, { "gr_stage", new OptionSetValue(122830002) } } });
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest()), "REQUEST_REUSED");
                Check(db.Count("gr_job") == 0, "Historical ledger was promoted");
            });
            Test("specialist Jobs use the reviewed regional allocation adapter", () => {
                foreach (int type in new[] { 122830003, 122830004 }) {
                    var db = Fixture(); var job = Draft(db); job["gr_jobtype"] = new OptionSetValue(type);
                    var output = db.Invoke(JobRegistrationPlugin.AllocateMessage, AllocateRequest(job));
                    var saved = db.Get("gr_job", job.Id);
                    Check(saved.GetAttributeValue<OptionSetValue>("gr_jobtype").Value == type, "Specialist Job type changed");
                    Check(saved.GetAttributeValue<string>("gr_techniciansubmissionstory") == "Immutable evidence", "Specialist evidence changed");
                    Check(saved.GetAttributeValue<string>("gr_jobnumber") == (string)output["JobNumber"], "Specialist number was not allocated");
                    Check(db.Count(Table("waikato")) == 1, "Specialist allocation did not create its regional ledger");
                }
            });
            Test("Manage job changes only coordinator membership and safely replays", () => {
                var db = Fixture(); var job = Draft(db); job[JobRegistrationPlugin.CoordinatorManaged] = false;
                var request = ManageRequest(job); var first = db.Invoke(JobWorkflowPlugin.ManageMessage, request);
                var saved = db.Get("gr_job", job.Id);
                Check(saved.GetAttributeValue<bool>(JobRegistrationPlugin.CoordinatorManaged), "Membership was not enabled");
                Check(saved.GetAttributeValue<OptionSetValue>("gr_status").Value == 122830005 && saved.GetAttributeValue<string>("gr_techniciansubmissionstory") == "Immutable evidence", "Manage changed operational data");
                Check(!(bool)first["WasReplay"] && (bool)db.Invoke(JobWorkflowPlugin.ManageMessage, request)["WasReplay"], "Manage replay failed");
            });
            Test("Manage job rejects stale, Void and additional-field requests", () => {
                var db = Fixture(); var job = Draft(db); job[JobRegistrationPlugin.CoordinatorManaged] = false;
                var stale = ManageRequest(job); job.RowVersion = "999";
                Reject(() => db.Invoke(JobWorkflowPlugin.ManageMessage, stale), "CONFLICT");
                job[JobWorkflowPlugin.RegistrationVoid] = true;
                Reject(() => db.Invoke(JobWorkflowPlugin.ManageMessage, ManageRequest(job)), "INVALID");
                var tampered = ManageRequest(job); tampered["JobType"] = 122830000;
                Reject(() => db.Invoke(JobWorkflowPlugin.ManageMessage, tampered), "INVALID");
            });
            foreach (string book in new[] { "auckland", "waikato", "hastings", "christchurch" })
            {
                string selected = book;
                Test("Void registered " + selected + " entry atomically and safely replay", () => {
                    var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(1, selected));
                    var job = db.Get("gr_job", Id(1)); var ledger = db.Get(Table(selected), Id(1));
                    var request = VoidRequest(job, ledger, selected); var output = db.Invoke(JobWorkflowPlugin.VoidMessage, request);
                    var savedJob = db.Get("gr_job", job.Id); var savedLedger = db.Get(Table(selected), ledger.Id);
                    Check(savedJob.GetAttributeValue<bool>(JobWorkflowPlugin.RegistrationVoid) && savedJob.GetAttributeValue<string>(JobWorkflowPlugin.RegistrationVoidReason) == "Entered twice", "Job Void state missing");
                    Check(savedLedger.GetAttributeValue<OptionSetValue>("gr_stage").Value == JobWorkflowPlugin.VoidStage && savedLedger.GetAttributeValue<string>("gr_voidreason") == "Entered twice", "Ledger Void state missing");
                    Check(savedJob.GetAttributeValue<string>("gr_jobnumber") == savedLedger.GetAttributeValue<string>("gr_jobnumber"), "Number changed");
                    Check(!(bool)output["WasReplay"] && (bool)db.Invoke(JobWorkflowPlugin.VoidMessage, request)["WasReplay"], "Void replay failed");
                });
            }
            Test("registered Void rejects markers, coordinator membership and mismatched links", () => {
                for (int scenario = 0; scenario < 4; scenario++) {
                    var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                    var job = db.Get("gr_job", Id(1)); var ledger = db.Get(Table("auckland"), Id(1));
                    if (scenario == 0) job["gr_gtentered"] = true;
                    if (scenario == 1) job["gr_timecloudentered"] = true;
                    if (scenario == 2) job[JobRegistrationPlugin.CoordinatorManaged] = true;
                    if (scenario == 3) ledger[JobRegistrationPlugin.RegisteredJob] = new EntityReference("gr_job", Id(999));
                    Reject(() => db.Invoke(JobWorkflowPlugin.VoidMessage, VoidRequest(job, ledger)), scenario == 3 ? "INCONSISTENT" : "INVALID");
                    Check(!job.GetAttributeValue<bool>(JobWorkflowPlugin.RegistrationVoid) && ledger.GetAttributeValue<OptionSetValue>("gr_stage").Value == JobRegistrationPlugin.RegisteredStage, "Rejected Void changed state");
                }
            });
            Test("registered Void requires exact versions and rolls back both writes", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                var job = db.Get("gr_job", Id(1)); var ledger = db.Get(Table("auckland"), Id(1)); var stale = VoidRequest(job, ledger);
                job.RowVersion = "999";
                Reject(() => db.Invoke(JobWorkflowPlugin.VoidMessage, stale), "CONFLICT");
                job.RowVersion = (int.Parse(stale["ExpectedJobRowVersion"].ToString()) + 1).ToString();
                var current = VoidRequest(job, ledger); db.FailWrite = 2;
                Reject(() => db.Invoke(JobWorkflowPlugin.VoidMessage, current), "SAVE_FAILED");
                Check(!db.Get("gr_job", job.Id).GetAttributeValue<bool>(JobWorkflowPlugin.RegistrationVoid) && db.Get(Table("auckland"), ledger.Id).GetAttributeValue<OptionSetValue>("gr_stage").Value == JobRegistrationPlugin.RegisteredStage, "Partial Void survived rollback");
            });
            Test("registered Void validates reason, region and input allowlist before writes", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                var job = db.Get("gr_job", Id(1)); var ledger = db.Get(Table("auckland"), Id(1));
                foreach (string reason in new[] { " ", new string('x', 1001) }) Reject(() => db.Invoke(JobWorkflowPlugin.VoidMessage, VoidRequest(job, ledger, "auckland", reason)), "INVALID");
                Reject(() => db.Invoke(JobWorkflowPlugin.VoidMessage, VoidRequest(job, ledger, "unknown")), "INVALID");
                var tampered = VoidRequest(job, ledger); tampered["GtEntered"] = false;
                Reject(() => db.Invoke(JobWorkflowPlugin.VoidMessage, tampered), "INVALID");
                Check(db.LastWrites == 0, "Invalid Void wrote data");
            });
            Test("initial dispatch verifies the assigned technician and safely replays", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                var job = db.Get("gr_job", Id(1)); var request = DispatchRequest(job);
                var first = db.Invoke(JobWorkflowPlugin.DispatchMessage, request);
                var dispatch = db.Get("gr_emaildispatch", Id(50));
                Check((Guid)first["DispatchId"] == Id(50) && !(bool)first["WasReplay"], "Dispatch response mismatch");
                Check(dispatch.GetAttributeValue<EntityReference>("gr_job").Id == job.Id && dispatch.GetAttributeValue<string>("gr_recipientemail") == "tech@example.invalid", "Dispatch target mismatch");
                Check(!dispatch.Contains("gr_jobassignment") && !dispatch.GetAttributeValue<bool>("gr_emailsent"), "Dispatch changed assignment or invented delivery");
                Check((bool)db.Invoke(JobWorkflowPlugin.DispatchMessage, request)["WasReplay"] && db.Count("gr_emaildispatch") == 1, "Dispatch replay duplicated delivery");
            });
            Test("initial dispatch rejects stale Jobs, recipient overrides and unrelated inputs", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                var job = db.Get("gr_job", Id(1)); var stale = DispatchRequest(job); job.RowVersion = "999";
                Reject(() => db.Invoke(JobWorkflowPlugin.DispatchMessage, stale), "CONFLICT");
                var changedRecipient = DispatchRequest(job); changedRecipient["RecipientEmail"] = "other@example.invalid";
                Reject(() => db.Invoke(JobWorkflowPlugin.DispatchMessage, changedRecipient), "INVALID");
                var tampered = DispatchRequest(job); tampered["MechanicId"] = Mechanic;
                Reject(() => db.Invoke(JobWorkflowPlugin.DispatchMessage, tampered), "INVALID");
                Check(db.Count("gr_emaildispatch") == 0, "Rejected dispatch created a row");
            });
            Test("initial dispatch fails closed for ineligible Job or technician state", () => {
                for (int scenario = 0; scenario < 6; scenario++) {
                    var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                    var job = db.Get("gr_job", Id(1)); var mechanic = db.Get("gr_mechanic", Mechanic);
                    if (scenario == 0) job["gr_jobnumber"] = null;
                    if (scenario == 1) job[JobWorkflowPlugin.RegistrationVoid] = true;
                    if (scenario == 2) job["gr_status"] = new OptionSetValue(122830005);
                    if (scenario == 3) job["gr_jobtype"] = new OptionSetValue(122830004);
                    if (scenario == 4) mechanic["statecode"] = new OptionSetValue(1);
                    if (scenario == 5) mechanic["gr_jobassignmentenabled"] = false;
                    Reject(() => db.Invoke(JobWorkflowPlugin.DispatchMessage, DispatchRequest(job)), "INVALID");
                }
            });
            Test("initial dispatch write failure creates no delivery and same request can retry", () => {
                var db = Fixture(); db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest());
                var job = db.Get("gr_job", Id(1)); var request = DispatchRequest(job); db.FailWrite = 1;
                Reject(() => db.Invoke(JobWorkflowPlugin.DispatchMessage, request), "SAVE_FAILED");
                Check(db.Count("gr_emaildispatch") == 0, "Failed dispatch survived rollback");
                db.FailWrite = 0; db.Invoke(JobWorkflowPlugin.DispatchMessage, request);
                Check(db.Count("gr_emaildispatch") == 1, "Dispatch retry did not save exactly once");
            });
            Test("missing transaction, async execution and impersonation fail closed", () => {
                var db = Fixture();
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(), Caller, false), "CONFIGURATION");
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(), Caller, true, 1), "CONFIGURATION");
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest(), Caller, true, 0, Id(902)), "FORBIDDEN");
                Check(db.Count("gr_job") == 0, "Unsafe context wrote records");
            });
            Test("caller data permissions are not elevated or bypassed", () => {
                var db = Fixture(); db.DenyWrites = true;
                Reject(() => db.Invoke(JobRegistrationPlugin.RegisterMessage, NewRequest()), "SAVE_FAILED");
                Check(db.LastServiceUser == Caller && db.Count("gr_job") == 0, "Privilege bypass");
            });
            Test("server guard rejects renumbering, clearing and deleting all regional allocations", () => {
                foreach (string table in new[] { "gr_job", Table("auckland"), Table("waikato"), Table("hastings"), Table("christchurch") }) {
                    var before = new Entity(table, Id(1)) { Attributes = { { "gr_jobnumber", "WJ1234567" } } };
                    foreach (string number in new[] { "WJ1234568", "", null }) {
                        var patch = new Entity(table, Id(1)); patch["gr_jobnumber"] = number;
                        Reject(() => Guard("Update", patch, before), "cannot be replaced or cleared");
                    }
                    Reject(() => Guard("Delete", new Entity(table, Id(1)), before), "cannot be deleted");
                }
            });
            Test("server guard permits ordinary corrections, but not immutable ledger snapshot changes", () => {
                var before = new Entity("gr_job", Id(1)) { Attributes = { { "gr_jobnumber", "123" } } };
                var patch = new Entity("gr_job", Id(1)) { Attributes = { { "gr_description", "Corrected" } } };
                Guard("Update", patch, before);
                var ledger = new Entity("gr_jobbookentry", Id(1)) { Attributes = { { "gr_jobnumber", "123" }, { JobRegistrationPlugin.RegisteredJob, new EntityReference("gr_job", Id(1)) } } };
                Reject(() => Guard("Update", new Entity(ledger.LogicalName, ledger.Id), ledger), "snapshots are immutable");
            });
            Test("server guard permits only the exact atomic registered Void child update", () => {
                var before = new Entity("gr_jobbookentry", Id(1)) { Attributes = {
                    { "gr_jobnumber", "900001" }, { JobRegistrationPlugin.RegisteredJob, new EntityReference("gr_job", Id(700)) },
                    { JobRegistrationPlugin.Fingerprint, "fingerprint" }, { "gr_stage", new OptionSetValue(JobRegistrationPlugin.RegisteredStage) }
                } };
                var target = new Entity(before.LogicalName, before.Id) { Attributes = { { "gr_stage", new OptionSetValue(JobWorkflowPlugin.VoidStage) }, { "gr_voidreason", "Duplicate" } } };
                var parent = new ParameterCollection { { "Book", "auckland" }, { "JobId", Id(700) }, { "LedgerId", before.Id }, { "Reason", "Duplicate" } };
                Guard("Update", target, before, parent, JobWorkflowPlugin.VoidMessage);
                Reject(() => Guard("Update", target, before), "snapshots are immutable");
                target["gr_description"] = "tampered";
                Reject(() => Guard("Update", target, before, parent, JobWorkflowPlugin.VoidMessage), "snapshots are immutable");
            });
            Test("only the matching server registration context may allocate", () => {
                var before = new Entity("gr_job", Id(1)); var patch = new Entity("gr_job", Id(1)) { Attributes = { { "gr_jobnumber", "123" } } };
                Reject(() => Guard("Update", patch, before), "through the regional");
                Guard("Update", patch, before, NewRequest());
                Reject(() => Guard("Update", patch, before, NewRequest(2)), "through the regional");
                Guard("Create", new Entity("gr_jobbookentry", Id(1)), null, NewRequest());
                Guard("Create", new Entity("gr_jobbookentry", Id(1)) { Attributes = { { "gr_jobnumber", "123" } } }, null, NewRequest());
                Reject(() => Guard("Create", new Entity("gr_waikatojobbookentry", Id(1)), null, NewRequest()), "registration only");
            });
            Test("direct ledger creation, manual numbers and missing pre-images fail closed", () => {
                Reject(() => Guard("Create", new Entity("gr_jobbookentry", Id(1)), null), "registration only");
                var numbered = new Entity("gr_job", Id(1)) { Attributes = { { "gr_jobnumber", "123" } } };
                Reject(() => Guard("Create", numbered, null), "not manual entry");
                Reject(() => Guard("Update", numbered, null), "required record image");
                Guard("Delete", new Entity("gr_job", Id(1)), new Entity("gr_job", Id(1)));
            });
            Console.WriteLine("Plugin tests passed: " + passed);
        }
        static void Guard(string message, Entity target, Entity before, ParameterCollection parentRequest = null, string parentMessage = null)
        {
            var parent = parentRequest == null ? null : InterfaceProxy.For<IPluginExecutionContext>(new Dictionary<string, object> {
                { "Stage", 30 }, { "Mode", 0 }, { "IsInTransaction", true }, { "InitiatingUserId", Caller },
                { "MessageName", parentMessage ?? JobRegistrationPlugin.RegisterMessage }, { "InputParameters", parentRequest }, { "ParentContext", null }
            });
            var images = new EntityImageCollection(); if (before != null) images["Before"] = before;
            var context = InterfaceProxy.For<IPluginExecutionContext>(new Dictionary<string, object> {
                { "Stage", 20 }, { "Mode", 0 }, { "IsInTransaction", true }, { "InitiatingUserId", Caller },
                { "PrimaryEntityId", target.Id }, { "PrimaryEntityName", target.LogicalName }, { "MessageName", message },
                { "InputParameters", new ParameterCollection { { "Target", target } } }, { "PreEntityImages", images }, { "ParentContext", parent }
            });
            new JobNumberInvariantPlugin().Execute(new Provider(context, null));
        }
        static string Table(string book) { return book == "auckland" ? "gr_jobbookentry" : "gr_" + book + "jobbookentry"; }
        internal static string Key(string table, Guid id) { return table + ":" + id.ToString("D"); }
        internal static Entity Clone(Entity row) { var copy = new Entity(row.LogicalName, row.Id) { RowVersion = row.RowVersion }; foreach (var pair in row.Attributes) copy[pair.Key] = pair.Value; return copy; }

        sealed class Database
        {
            internal Dictionary<string, Entity> Records = new Dictionary<string, Entity>();
            internal int Clock, LastWrites, LastReads, FailWrite;
            internal bool DenyWrites;
            internal Guid LastServiceUser;
            internal Action BeforeNumberUpdate;
            readonly Dictionary<string, long> sequences = new Dictionary<string, long>();
            internal void Put(Entity row) { row.RowVersion = (++Clock).ToString(); Records[Key(row.LogicalName, row.Id)] = row; }
            internal Entity Get(string table, Guid id) { return Records[Key(table, id)]; }
            internal int Count(string table) { return Records.Values.Count(row => row.LogicalName == table); }
            internal string Next(string table)
            {
                long value; if (!sequences.TryGetValue(table, out value)) value = table == "gr_jobbookentry" ? 900000 : 99999;
                sequences[table] = ++value;
                return (table.Contains("waikato") ? "WJ" : table.Contains("hastings") ? "HJ" : table.Contains("christchurch") ? "CJ" : "") + value;
            }
            internal ParameterCollection Invoke(string message, ParameterCollection request, Guid? actor = null, bool transaction = true, int mode = 0, Guid? impersonate = null)
            {
                var service = new Transaction(this); var output = new ParameterCollection();
                var identity = actor ?? Caller;
                var context = InterfaceProxy.For<IPluginExecutionContext>(new Dictionary<string, object> {
                    { "Mode", mode }, { "Stage", 30 }, { "IsInTransaction", transaction }, { "UserId", impersonate ?? identity },
                    { "InitiatingUserId", identity }, { "MessageName", message }, { "InputParameters", request }, { "OutputParameters", output }
                });
                try {
                    if (message == JobWorkflowPlugin.ManageMessage || message == JobWorkflowPlugin.VoidMessage || message == JobWorkflowPlugin.DispatchMessage)
                        new JobWorkflowPlugin().Execute(new Provider(context, new Factory(this, service)));
                    else new JobRegistrationPlugin().Execute(new Provider(context, new Factory(this, service)));
                    service.Commit(); return output;
                } finally { LastReads = service.Reads; LastWrites = service.Writes; }
            }
        }
        sealed class Transaction : IOrganizationService
        {
            readonly Database db;
            readonly Dictionary<string, Entity> rows;
            readonly Dictionary<string, string> originals;
            readonly HashSet<string> touched = new HashSet<string>();
            internal int Writes, Reads;
            internal Transaction(Database database) { db = database; rows = db.Records.ToDictionary(pair => pair.Key, pair => Clone(pair.Value)); originals = db.Records.ToDictionary(pair => pair.Key, pair => pair.Value.RowVersion); }
            void Write() { Writes++; if (db.DenyWrites || Writes == db.FailWrite) throw new Exception("Simulated Dataverse failure; private details must not leak"); }
            internal void Commit()
            {
                foreach (var key in touched) {
                    Entity current; string version;
                    if (db.Records.TryGetValue(key, out current) != originals.TryGetValue(key, out version) || (current != null && current.RowVersion != version)) throw new InvalidPluginExecutionException("[JOB_REGISTRATION_SAVE_FAILED] Concurrent commit");
                }
                foreach (var key in touched) db.Records[key] = Clone(rows[key]);
            }
            public Guid Create(Entity entity)
            {
                Write(); var key = Key(entity.LogicalName, entity.Id); if (rows.ContainsKey(key)) throw new Exception("Duplicate ID");
                var row = Clone(entity); if (entity.LogicalName.EndsWith("jobbookentry")) row["gr_jobnumber"] = db.Next(entity.LogicalName);
                row.RowVersion = (++db.Clock).ToString(); rows[key] = row; touched.Add(key); return row.Id;
            }
            public Entity Retrieve(string name, Guid id, ColumnSet columns) { Reads++; return Clone(rows[Key(name, id)]); }
            public EntityCollection RetrieveMultiple(QueryBase queryBase)
            {
                Reads++; var query = (QueryExpression)queryBase; Check(query.TopCount == 1, "Unbounded query");
                var matches = rows.Values.Where(row => row.LogicalName == query.EntityName && query.Criteria.Conditions.All(condition => Equals(Value(row, condition.AttributeName), condition.Values[0]))).Take(1).Select(Clone).ToList();
                return new EntityCollection(matches);
            }
            static object Value(Entity row, string key) { if (key == row.LogicalName + "id") return row.Id; object value; if (!row.Attributes.TryGetValue(key, out value)) return null; if (value is EntityReference) return ((EntityReference)value).Id; if (value is OptionSetValue) return ((OptionSetValue)value).Value; return value; }
            public OrganizationResponse Execute(OrganizationRequest request)
            {
                var update = request as UpdateRequest; if (update == null) throw new Exception("Unexpected operation");
                Write(); var callback = db.BeforeNumberUpdate; db.BeforeNumberUpdate = null; if (callback != null) callback();
                var key = Key(update.Target.LogicalName, update.Target.Id); var current = rows[key];
                Check(update.ConcurrencyBehavior == ConcurrencyBehavior.IfRowVersionMatches, "Conditional update required");
                Entity authoritative;
                if (current.RowVersion != update.Target.RowVersion || (db.Records.TryGetValue(key, out authoritative) && authoritative.RowVersion != originals[key])) throw new Exception("Version conflict");
                if (update.Target.Contains("gr_jobnumber")) {
                    var number = update.Target.GetAttributeValue<string>("gr_jobnumber");
                    if (rows.Values.Any(row => row.LogicalName == "gr_job" && row.Id != current.Id && row.GetAttributeValue<string>("gr_jobnumber") == number)) throw new Exception("Unique number conflict");
                }
                foreach (var field in update.Target.Attributes) current[field.Key] = field.Value;
                current.RowVersion = (++db.Clock).ToString(); touched.Add(key); return new UpdateResponse();
            }
            public void Update(Entity entity) { throw new Exception("Unconditional updates forbidden"); }
            public void Delete(string name, Guid id) { throw new Exception("Deletion forbidden"); }
            public void Associate(string name, Guid id, Relationship relationship, EntityReferenceCollection related) { throw new NotSupportedException(); }
            public void Disassociate(string name, Guid id, Relationship relationship, EntityReferenceCollection related) { throw new NotSupportedException(); }
        }
        sealed class Factory : IOrganizationServiceFactory
        {
            readonly Database db; readonly IOrganizationService service;
            internal Factory(Database database, IOrganizationService value) { db = database; service = value; }
            public IOrganizationService CreateOrganizationService(Guid? userId) { Check(userId.HasValue, "SYSTEM service forbidden"); db.LastServiceUser = userId.Value; return service; }
        }
        sealed class Provider : IServiceProvider
        {
            readonly IPluginExecutionContext context; readonly IOrganizationServiceFactory factory;
            internal Provider(IPluginExecutionContext value, IOrganizationServiceFactory services) { context = value; factory = services; }
            public object GetService(Type type) { return type == typeof(IPluginExecutionContext) ? (object)context : type == typeof(IOrganizationServiceFactory) ? factory : null; }
        }
        sealed class InterfaceProxy : RealProxy
        {
            readonly Dictionary<string, object> values;
            InterfaceProxy(Type type, Dictionary<string, object> data) : base(type) { values = data; }
            internal static T For<T>(Dictionary<string, object> data) { return (T)new InterfaceProxy(typeof(T), data).GetTransparentProxy(); }
            public override IMessage Invoke(IMessage message)
            {
                var call = (IMethodCallMessage)message; object value;
                if (!call.MethodName.StartsWith("get_") || !values.TryGetValue(call.MethodName.Substring(4), out value)) throw new Exception("Unexpected context member: " + call.MethodName);
                return new ReturnMessage(value, null, 0, call.LogicalCallContext, call);
            }
        }
    }
}
