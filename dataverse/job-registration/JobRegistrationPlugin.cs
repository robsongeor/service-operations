using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace ServiceOperations.JobRegistration
{
    // Local implementation. API definitions, new columns, privilege gates and registration are NOT deployed.
    public sealed class JobRegistrationPlugin : IPlugin
    {
        public const string RegisterMessage = "gr_RegisterJobBookJob";
        public const string AllocateMessage = "gr_AllocateJobBookNumber";
        public const string RegisteredJob = "gr_registeredjob";
        public const string Fingerprint = "gr_registrationfingerprint";
        public const string CoordinatorManaged = "gr_coordinatormanaged";
        public const int RegisteredStage = 122830004; // Proposed new Choice; never reinterpret historical Promoted.
        private const int Unallocated = 122830001;
        private const int Allocated = 122830000;

        private static readonly Dictionary<string, string> Tables = new Dictionary<string, string> {
            { "auckland", "gr_jobbookentry" }, { "waikato", "gr_waikatojobbookentry" },
            { "hastings", "gr_hastingsjobbookentry" }, { "christchurch", "gr_christchurchjobbookentry" }
        };
        private static readonly Dictionary<string, string> Prefixes = new Dictionary<string, string> {
            { "auckland", "" }, { "waikato", "WJ" }, { "hastings", "HJ" }, { "christchurch", "CJ" }
        };

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Mode != 0 || !context.IsInTransaction || context.Stage != 30)
                throw Failure("CONFIGURATION", "Registration requires a synchronous transactional Custom API.");
            if (context.UserId == Guid.Empty || context.UserId != context.InitiatingUserId)
                throw Failure("FORBIDDEN", "Registration must run as the signed-in caller, without impersonation.");
            if (context.MessageName != RegisterMessage && context.MessageName != AllocateMessage)
                throw Failure("CONFIGURATION", "This operation is not supported.");

            // The Custom API's ExecutePrivilegeName is an additional, mandatory deployment-time gate.
            // Never create a SYSTEM service or accept identities/capabilities from request parameters.
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            try { Run(service, context); }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception)
            {
                // Throw out of the ambient transaction. Never catch a failed write and continue/retry inside it.
                throw Failure("SAVE_FAILED", "Registration was not confirmed. Retry the same request or reload; do not request another number.");
            }
        }

        private static void Run(IOrganizationService service, IPluginExecutionContext context)
        {
            bool creating = context.MessageName == RegisterMessage;
            var allowed = creating
                ? new[] { "RequestId", "Book", "Description", "OrderNumber", "SiteId", "EquipmentId", "EquipmentUnknown", "ContactId", "MechanicId" }
                : new[] { "RequestId", "Book", "JobId", "ExpectedRowVersion" };
            if (context.InputParameters.Keys.Any(key => !allowed.Contains(key)))
                throw Failure("INVALID", "This operation cannot change operational controls or accept additional fields.");
            Guid requestId = RequiredId(context.InputParameters, "RequestId");
            string book = Text(context.InputParameters, "Book", 20, true);
            if (!Tables.ContainsKey(book)) throw Failure("INVALID", "Select a supported regional Job Book.");
            string table = Tables[book];
            Guid jobId = creating ? requestId : RequiredId(context.InputParameters, "JobId");
            var values = new List<string> { context.MessageName, context.InitiatingUserId.ToString("D"), requestId.ToString("D"), book, jobId.ToString("D") };
            Entity job;
            string expectedVersion = null;

            if (creating)
            {
                job = new Entity("gr_job", jobId);
                job["gr_description"] = Text(context.InputParameters, "Description", 4000, true);
                job["gr_ordernumber"] = Text(context.InputParameters, "OrderNumber", 100, false);
                job["gr_site"] = new EntityReference("gr_site", RequiredId(context.InputParameters, "SiteId"));
                AddReference(job, context.InputParameters, "EquipmentId", "gr_equipment", "gr_equipment");
                AddReference(job, context.InputParameters, "ContactId", "gr_contact", "gr_contact");
                AddReference(job, context.InputParameters, "MechanicId", "gr_mechanic", "gr_mechanic");
                bool unknown = RequiredBool(context.InputParameters, "EquipmentUnknown");
                if (unknown == job.Contains("gr_equipment")) throw Failure("INVALID", "Select Equipment or explicitly confirm it is not known yet.");
                job["gr_status"] = new OptionSetValue(job.Contains("gr_mechanic") ? Allocated : Unallocated);
                job[CoordinatorManaged] = false;
                // Deliberately no Job type, number, scheduling, service/completion, marker or evidence input.
                foreach (string name in new[] { "gr_description", "gr_ordernumber", "gr_site", "gr_equipment", "gr_contact", "gr_mechanic" })
                    values.Add(CanonicalValue(job, name));
                values.Add(unknown.ToString());
            }
            else
            {
                expectedVersion = Text(context.InputParameters, "ExpectedRowVersion", 30, true);
                if (!Regex.IsMatch(expectedVersion, "^[0-9]+$")) throw Failure("INVALID", "An exact Job version is required.");
                values.Add(expectedVersion);
                job = null;
            }
            string fingerprint = Hash(values);

            // Bounded query avoids catching a not-found service fault inside a transaction.
            var existingLedger = Find(service, table, requestId, "gr_jobnumber", RegisteredJob, Fingerprint, "gr_stage");
            if (existingLedger != null)
            {
                var link = existingLedger.GetAttributeValue<EntityReference>(RegisteredJob);
                if (existingLedger.GetAttributeValue<string>(Fingerprint) != fingerprint || link == null || link.LogicalName != "gr_job" || link.Id != jobId)
                    throw Failure("REQUEST_REUSED", "This request already belongs to different details. Reload and review it.");
                var saved = Find(service, "gr_job", jobId, "gr_jobnumber");
                if (saved == null || string.IsNullOrWhiteSpace(saved.GetAttributeValue<string>("gr_jobnumber")) ||
                    saved.GetAttributeValue<string>("gr_jobnumber") != existingLedger.GetAttributeValue<string>("gr_jobnumber"))
                    throw Failure("INCONSISTENT", "The saved Job and number ledger need reconciliation. No new number was requested.");
                // Replay also works after later edits/Void; it does not restore or reapply the original data.
                Output(context, book, saved, existingLedger, true);
                return;
            }

            var current = Find(service, "gr_job", jobId, "gr_jobnumber", "gr_description", "gr_ordernumber", "gr_site", "gr_equipment", "gr_contact", "gr_mechanic", "gr_jobtype", "gr_gtentered", "gr_timecloudentered");
            if (creating && current != null) throw Failure("REQUEST_REUSED", "A Job already uses this request identifier. Reload before continuing.");
            if (!creating)
            {
                if (current == null) throw Failure("NOT_FOUND", "The Job is no longer available.");
                if (!string.IsNullOrWhiteSpace(current.GetAttributeValue<string>("gr_jobnumber")))
                    throw Failure("ALREADY_NUMBERED", "The Job already has a number. It cannot receive another.");
                if (current.RowVersion != expectedVersion) throw Failure("CONFLICT", "The Job changed elsewhere. Reload before allocating its number.");
                // WOF/Site Check require their own reviewed adapter and must not bypass specialist flows.
                int? jobType = current.GetAttributeValue<OptionSetValue>("gr_jobtype") == null ? (int?)null : current.GetAttributeValue<OptionSetValue>("gr_jobtype").Value;
                if (jobType == 122830003 || jobType == 122830004) throw Failure("SPECIALIST", "Allocate this number through the specialist workflow once supported.");
                job = current;
            }

            var ledger = BuildLedger(service, job, table, requestId, fingerprint);
            if (creating) service.Create(job);
            service.Create(ledger); // Dataverse, not this code, assigns the regional AutoNumber.
            var savedLedger = service.Retrieve(table, requestId, new ColumnSet("gr_jobnumber", RegisteredJob, Fingerprint));
            string number = savedLedger.GetAttributeValue<string>("gr_jobnumber");
            if (number == null || number.Length > 30 || !Regex.IsMatch(number, "^" + Prefixes[book] + "[0-9]+$"))
                throw Failure("CONFIGURATION", "The regional number format is not configured correctly.");
            var patch = new Entity("gr_job", jobId) { RowVersion = creating
                ? service.Retrieve("gr_job", jobId, new ColumnSet("gr_jobnumber")).RowVersion : expectedVersion };
            if (string.IsNullOrWhiteSpace(patch.RowVersion)) throw Failure("CONFIGURATION", "Job concurrency protection is unavailable.");
            patch["gr_jobnumber"] = number;
            service.Execute(new UpdateRequest { Target = patch, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
            var savedJob = service.Retrieve("gr_job", jobId, new ColumnSet("gr_jobnumber"));
            Output(context, book, savedJob, savedLedger, false);
        }

        private static Entity BuildLedger(IOrganizationService service, Entity job, string table, Guid requestId, string fingerprint)
        {
            string description = job.GetAttributeValue<string>("gr_description");
            if (string.IsNullOrWhiteSpace(description) || description.Length > 4000) throw Failure("INVALID", "A Job description is required (up to 4,000 characters).");
            var siteRef = job.GetAttributeValue<EntityReference>("gr_site");
            if (siteRef == null) throw Failure("INVALID", "Select a Customer and Site before requesting a number.");
            var site = service.Retrieve("gr_site", siteRef.Id, new ColumnSet("gr_name", "gr_address", "gr_customer", "statecode"));
            var customerRef = site.GetAttributeValue<EntityReference>("gr_customer");
            if (Inactive(site) || customerRef == null || string.IsNullOrWhiteSpace(site.GetAttributeValue<string>("gr_address")))
                throw Failure("INVALID", "The Site must be active and have a Customer and address.");
            var customer = service.Retrieve("gr_customer", customerRef.Id, new ColumnSet("gr_name", "statecode"));
            if (Inactive(customer)) throw Failure("INVALID", "Select an active Customer.");
            var ledger = new Entity(table, requestId);
            ledger["gr_stage"] = new OptionSetValue(RegisteredStage);
            ledger[RegisteredJob] = job.ToEntityReference();
            ledger[Fingerprint] = fingerprint;
            ledger["gr_description"] = description;
            ledger["gr_customerpo"] = job.GetAttributeValue<string>("gr_ordernumber");
            ledger["gr_site"] = siteRef;
            ledger["gr_customer"] = customerRef;
            ledger["gr_customersnapshot"] = Snapshot(customer, "gr_name", 200);
            ledger["gr_sitesnapshot"] = Snapshot(site, "gr_name", 200);
            ledger["gr_addresssnapshot"] = Snapshot(site, "gr_address", 500);
            ledger["gr_entered"] = job.GetAttributeValue<bool>("gr_gtentered");
            ledger["gr_timecloudentered"] = job.GetAttributeValue<bool>("gr_timecloudentered");
            // No invented address verification. Existing Site is authoritative; evidence flags stay factual.
            ledger["gr_addressverified"] = false;
            ledger["gr_addressnotfoundconfirmed"] = false;
            var equipmentRef = job.GetAttributeValue<EntityReference>("gr_equipment");
            ledger["gr_equipmentreviewrequired"] = equipmentRef == null;
            if (equipmentRef != null)
            {
                var equipment = service.Retrieve("gr_equipment", equipmentRef.Id, new ColumnSet("gr_fleet", "gr_serial", "gr_make", "gr_model", "statecode"));
                if (Inactive(equipment)) throw Failure("INVALID", "Select active Equipment.");
                ledger["gr_equipment"] = equipmentRef;
                ledger["gr_fleetsnapshot"] = Snapshot(equipment, "gr_fleet", 100);
                ledger["gr_serialsnapshot"] = Snapshot(equipment, "gr_serial", 150);
                ledger["gr_makesnapshot"] = Snapshot(equipment, "gr_make", 100);
                ledger["gr_modelsnapshot"] = Snapshot(equipment, "gr_model", 100);
            }
            var contactRef = job.GetAttributeValue<EntityReference>("gr_contact");
            if (contactRef != null)
            {
                var query = new QueryExpression("gr_sitecontact") { ColumnSet = new ColumnSet(false), TopCount = 1 };
                query.Criteria.AddCondition("gr_site", ConditionOperator.Equal, siteRef.Id);
                query.Criteria.AddCondition("gr_contact", ConditionOperator.Equal, contactRef.Id);
                query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
                if (service.RetrieveMultiple(query).Entities.Count != 1) throw Failure("INVALID", "The Contact must belong to the selected Site.");
                ledger["gr_contact"] = contactRef;
            }
            var mechanicRef = job.GetAttributeValue<EntityReference>("gr_mechanic");
            if (mechanicRef != null)
            {
                var mechanic = service.Retrieve("gr_mechanic", mechanicRef.Id, new ColumnSet("gr_name", "statecode", "gr_jobassignmentenabled"));
                if (Inactive(mechanic) || (mechanic.Contains("gr_jobassignmentenabled") && mechanic["gr_jobassignmentenabled"] is bool && !(bool)mechanic["gr_jobassignmentenabled"]))
                    throw Failure("INVALID", "Select an active, assignable technician.");
                ledger["gr_mechanic"] = mechanicRef;
                ledger["gr_mechanictext"] = Snapshot(mechanic, "gr_name", 200);
            }
            return ledger;
        }

        private static bool Inactive(Entity entity) { var state = entity.GetAttributeValue<OptionSetValue>("statecode"); return state != null && state.Value != 0; }
        private static string Snapshot(Entity entity, string field, int maximum) { var value = entity.GetAttributeValue<string>(field) ?? ""; return value.Length <= maximum ? value : value.Substring(0, maximum); }
        private static Entity Find(IOrganizationService service, string table, Guid id, params string[] columns)
        {
            var query = new QueryExpression(table) { ColumnSet = new ColumnSet(columns), TopCount = 1 };
            query.Criteria.AddCondition(table + "id", ConditionOperator.Equal, id);
            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }
        private static void Output(IPluginExecutionContext context, string book, Entity job, Entity ledger, bool replay)
        {
            context.OutputParameters["JobId"] = job.Id;
            context.OutputParameters["LedgerId"] = ledger.Id;
            context.OutputParameters["JobNumber"] = ledger.GetAttributeValue<string>("gr_jobnumber");
            context.OutputParameters["Book"] = book;
            context.OutputParameters["WasReplay"] = replay;
            context.OutputParameters["JobRowVersion"] = job.RowVersion ?? "";
        }
        private static Guid RequiredId(ParameterCollection parameters, string name)
        {
            if (!parameters.Contains(name) || !(parameters[name] is Guid) || (Guid)parameters[name] == Guid.Empty)
                throw Failure("INVALID", name + " must identify a saved record or a new request.");
            return (Guid)parameters[name];
        }
        private static bool RequiredBool(ParameterCollection parameters, string name)
        {
            if (!parameters.Contains(name) || !(parameters[name] is bool)) throw Failure("INVALID", name + " is required.");
            return (bool)parameters[name];
        }
        private static void AddReference(Entity entity, ParameterCollection parameters, string input, string field, string table)
        {
            if (!parameters.Contains(input) || parameters[input] == null || (parameters[input] is Guid && (Guid)parameters[input] == Guid.Empty)) return;
            entity[field] = new EntityReference(table, RequiredId(parameters, input));
        }
        private static string Text(ParameterCollection parameters, string name, int maximum, bool required)
        {
            object raw = parameters.Contains(name) ? parameters[name] : null;
            if (raw != null && !(raw is string)) throw Failure("INVALID", name + " must be text.");
            string value = ((string)raw ?? "").Trim();
            if ((required && value.Length == 0) || value.Length > maximum || Regex.IsMatch(value, "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]"))
                throw Failure("INVALID", name + " is missing, too long or contains unsupported characters.");
            return value;
        }
        private static string CanonicalValue(Entity entity, string key)
        {
            if (!entity.Contains(key)) return "";
            var reference = entity[key] as EntityReference;
            return reference == null ? Convert.ToString(entity[key], CultureInfo.InvariantCulture) : reference.Id.ToString("D");
        }
        private static string Hash(IEnumerable<string> values)
        {
            string canonical = string.Join("|", values.Select(value => value.Length.ToString(CultureInfo.InvariantCulture) + ":" + value));
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(canonical))).Replace("-", "").ToLowerInvariant();
        }
        private static InvalidPluginExecutionException Failure(string code, string message) { return new InvalidPluginExecutionException("[JOB_REGISTRATION_" + code + "] " + message); }
    }
}
