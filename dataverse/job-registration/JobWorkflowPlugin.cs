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
    // Local implementation. Custom APIs, columns, privileges and steps are NOT deployed.
    public sealed class JobWorkflowPlugin : IPlugin
    {
        public const string ManageMessage = "gr_ManageJobBookJob";
        public const string VoidMessage = "gr_VoidRegisteredJobBookEntry";
        public const string DispatchMessage = "gr_QueueInitialJobDispatch";
        public const string RegistrationVoid = "gr_registrationvoid";
        public const string RegistrationVoidReason = "gr_registrationvoidreason";
        public const string DispatchFingerprint = "gr_jobdispatchfingerprint";
        public const int VoidStage = 122830003;

        private static readonly Dictionary<string, string> Tables = new Dictionary<string, string> {
            { "auckland", "gr_jobbookentry" }, { "waikato", "gr_waikatojobbookentry" },
            { "hastings", "gr_hastingsjobbookentry" }, { "christchurch", "gr_christchurchjobbookentry" }
        };

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Mode != 0 || !context.IsInTransaction || context.Stage != 30)
                throw Failure("CONFIGURATION", "Job workflow changes require a synchronous transactional Custom API.");
            if (context.UserId == Guid.Empty || context.UserId != context.InitiatingUserId)
                throw Failure("FORBIDDEN", "Job workflow changes must run as the signed-in caller, without impersonation.");
            if (context.MessageName != ManageMessage && context.MessageName != VoidMessage && context.MessageName != DispatchMessage)
                throw Failure("CONFIGURATION", "This operation is not supported.");

            // Each Custom API must also have a reviewed ExecutePrivilegeName. The service remains
            // caller-scoped so table privileges and synchronous access guards are never bypassed.
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            try { Run(service, context); }
            catch (InvalidPluginExecutionException) { throw; }
            catch (Exception)
            {
                throw Failure("SAVE_FAILED", "The Job workflow change was not confirmed. Reload before trying again.");
            }
        }

        private static void Run(IOrganizationService service, IPluginExecutionContext context)
        {
            if (context.MessageName == ManageMessage) Manage(service, context);
            else if (context.MessageName == VoidMessage) Void(service, context);
            else Dispatch(service, context);
        }

        private static void Manage(IOrganizationService service, IPluginExecutionContext context)
        {
            RequireOnly(context.InputParameters, "JobId", "ExpectedJobRowVersion");
            Guid jobId = RequiredId(context.InputParameters, "JobId");
            string expected = Version(context.InputParameters, "ExpectedJobRowVersion");
            var job = Find(service, "gr_job", jobId, JobRegistrationPlugin.CoordinatorManaged, RegistrationVoid);
            if (job == null) throw Failure("NOT_FOUND", "The Job is no longer available.");
            if (job.GetAttributeValue<bool>(RegistrationVoid)) throw Failure("INVALID", "A Void Job cannot enter Service coordination.");
            if (job.GetAttributeValue<bool>(JobRegistrationPlugin.CoordinatorManaged))
            {
                Output(context, job, null, true);
                return;
            }
            if (job.RowVersion != expected) throw Failure("CONFLICT", "The Job changed elsewhere. Reload before managing it.");

            var patch = new Entity("gr_job", jobId) { RowVersion = expected };
            patch[JobRegistrationPlugin.CoordinatorManaged] = true;
            ConditionalUpdate(service, patch);
            Output(context, service.Retrieve("gr_job", jobId, new ColumnSet(JobRegistrationPlugin.CoordinatorManaged)), null, false);
        }

        private static void Void(IOrganizationService service, IPluginExecutionContext context)
        {
            RequireOnly(context.InputParameters, "Book", "JobId", "LedgerId", "ExpectedJobRowVersion", "ExpectedLedgerRowVersion", "Reason");
            string book = Text(context.InputParameters, "Book", 20, true);
            if (!Tables.ContainsKey(book)) throw Failure("INVALID", "Select a supported regional Job Book.");
            string table = Tables[book];
            Guid jobId = RequiredId(context.InputParameters, "JobId");
            Guid ledgerId = RequiredId(context.InputParameters, "LedgerId");
            string expectedJob = Version(context.InputParameters, "ExpectedJobRowVersion");
            string expectedLedger = Version(context.InputParameters, "ExpectedLedgerRowVersion");
            string reason = Text(context.InputParameters, "Reason", 1000, true);

            var job = Find(service, "gr_job", jobId, "gr_jobnumber", "gr_gtentered", "gr_timecloudentered",
                JobRegistrationPlugin.CoordinatorManaged, RegistrationVoid, RegistrationVoidReason);
            var ledger = Find(service, table, ledgerId, "gr_jobnumber", "gr_stage", "gr_voidreason", JobRegistrationPlugin.RegisteredJob);
            if (job == null || ledger == null) throw Failure("NOT_FOUND", "The registered Job Book entry is no longer available.");
            var link = ledger.GetAttributeValue<EntityReference>(JobRegistrationPlugin.RegisteredJob);
            if (link == null || link.LogicalName != "gr_job" || link.Id != jobId ||
                String.IsNullOrWhiteSpace(job.GetAttributeValue<string>("gr_jobnumber")) ||
                job.GetAttributeValue<string>("gr_jobnumber") != ledger.GetAttributeValue<string>("gr_jobnumber"))
                throw Failure("INCONSISTENT", "The Job and regional number ledger need reconciliation before Void.");

            bool jobVoid = job.GetAttributeValue<bool>(RegistrationVoid);
            var stage = ledger.GetAttributeValue<OptionSetValue>("gr_stage");
            bool ledgerVoid = stage != null && stage.Value == VoidStage;
            if (jobVoid || ledgerVoid)
            {
                if (jobVoid && ledgerVoid && job.GetAttributeValue<string>(RegistrationVoidReason) == reason && ledger.GetAttributeValue<string>("gr_voidreason") == reason)
                {
                    Output(context, job, ledger, true);
                    return;
                }
                throw Failure("INCONSISTENT", "The Job and regional number ledger have conflicting Void state.");
            }
            if (stage == null || stage.Value != JobRegistrationPlugin.RegisteredStage ||
                job.GetAttributeValue<bool>(JobRegistrationPlugin.CoordinatorManaged) ||
                job.GetAttributeValue<bool>("gr_gtentered") || job.GetAttributeValue<bool>("gr_timecloudentered"))
                throw Failure("INVALID", "Only an unmanaged registered entry with both external-entry markers clear can be voided.");
            if (job.RowVersion != expectedJob || ledger.RowVersion != expectedLedger)
                throw Failure("CONFLICT", "The Job or regional number ledger changed elsewhere. Reload before Void.");

            var jobPatch = new Entity("gr_job", jobId) { RowVersion = expectedJob };
            jobPatch[RegistrationVoid] = true;
            jobPatch[RegistrationVoidReason] = reason;
            ConditionalUpdate(service, jobPatch);
            var ledgerPatch = new Entity(table, ledgerId) { RowVersion = expectedLedger };
            ledgerPatch["gr_stage"] = new OptionSetValue(VoidStage);
            ledgerPatch["gr_voidreason"] = reason;
            ConditionalUpdate(service, ledgerPatch);
            Output(context,
                service.Retrieve("gr_job", jobId, new ColumnSet(RegistrationVoid, RegistrationVoidReason)),
                service.Retrieve(table, ledgerId, new ColumnSet("gr_stage", "gr_voidreason")), false);
        }

        private static void Dispatch(IOrganizationService service, IPluginExecutionContext context)
        {
            RequireOnly(context.InputParameters, "RequestId", "JobId", "ExpectedJobRowVersion", "RecipientEmail", "Subject", "Body");
            Guid requestId = RequiredId(context.InputParameters, "RequestId");
            Guid jobId = RequiredId(context.InputParameters, "JobId");
            string expected = Version(context.InputParameters, "ExpectedJobRowVersion");
            string recipient = Email(context.InputParameters, "RecipientEmail");
            string subject = Text(context.InputParameters, "Subject", 500, true);
            string body = Text(context.InputParameters, "Body", 100000, true);
            string fingerprint = Hash(new[] { context.MessageName, context.InitiatingUserId.ToString("D"), requestId.ToString("D"), jobId.ToString("D"), expected, recipient, subject, body });

            var existing = Find(service, "gr_emaildispatch", requestId, DispatchFingerprint, "gr_job");
            if (existing != null)
            {
                var existingJob = existing.GetAttributeValue<EntityReference>("gr_job");
                if (existing.GetAttributeValue<string>(DispatchFingerprint) != fingerprint || existingJob == null || existingJob.LogicalName != "gr_job" || existingJob.Id != jobId)
                    throw Failure("REQUEST_REUSED", "This dispatch request already belongs to different details. Reload the delivery history.");
                DispatchOutput(context, existing.Id, true);
                return;
            }

            var job = Find(service, "gr_job", jobId, "gr_jobnumber", "gr_status", "gr_jobtype", "gr_sitecheck", "gr_mechanic", RegistrationVoid);
            if (job == null) throw Failure("NOT_FOUND", "The Job is no longer available.");
            if (job.RowVersion != expected) throw Failure("CONFLICT", "The Job changed elsewhere. Reopen the email preview before sending.");
            var status = job.GetAttributeValue<OptionSetValue>("gr_status");
            var type = job.GetAttributeValue<OptionSetValue>("gr_jobtype");
            var mechanicRef = job.GetAttributeValue<EntityReference>("gr_mechanic");
            if (String.IsNullOrWhiteSpace(job.GetAttributeValue<string>("gr_jobnumber")) || job.GetAttributeValue<bool>(RegistrationVoid) ||
                (status != null && status.Value == 122830005) || (type != null && type.Value == 122830004) ||
                job.GetAttributeValue<EntityReference>("gr_sitecheck") != null || mechanicRef == null || mechanicRef.LogicalName != "gr_mechanic")
                throw Failure("INVALID", "Only an eligible numbered ordinary Job with an assigned technician can be dispatched.");
            var mechanic = service.Retrieve("gr_mechanic", mechanicRef.Id, new ColumnSet("gr_name", "gr_email", "statecode", "gr_jobassignmentenabled"));
            var mechanicState = mechanic.GetAttributeValue<OptionSetValue>("statecode");
            string mechanicEmail = NormalizeEmail(mechanic.GetAttributeValue<string>("gr_email"));
            if ((mechanicState != null && mechanicState.Value != 0) ||
                (mechanic.Contains("gr_jobassignmentenabled") && mechanic["gr_jobassignmentenabled"] is bool && !(bool)mechanic["gr_jobassignmentenabled"]) ||
                String.IsNullOrWhiteSpace(mechanicEmail) || !String.Equals(mechanicEmail, recipient, StringComparison.OrdinalIgnoreCase))
                throw Failure("INVALID", "The dispatch recipient must be the active technician currently assigned to this Job.");

            var dispatch = new Entity("gr_emaildispatch", requestId);
            string mechanicName = (mechanic.GetAttributeValue<string>("gr_name") ?? "Technician").Trim();
            dispatch["gr_name"] = Truncate("Job email to " + mechanicName, 200);
            dispatch["gr_recipientemail"] = mechanicEmail;
            dispatch["gr_recipientname"] = Truncate(mechanicName, 200);
            dispatch["gr_subject"] = subject;
            dispatch["gr_body"] = body;
            dispatch["gr_emailsent"] = false;
            dispatch["gr_requestedon"] = DateTime.UtcNow;
            dispatch["gr_job"] = new EntityReference("gr_job", jobId);
            dispatch[DispatchFingerprint] = fingerprint;
            service.Create(dispatch);
            DispatchOutput(context, requestId, false);
        }

        private static void ConditionalUpdate(IOrganizationService service, Entity target)
        {
            service.Execute(new UpdateRequest { Target = target, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
        }

        private static Entity Find(IOrganizationService service, string table, Guid id, params string[] columns)
        {
            var query = new QueryExpression(table) { ColumnSet = new ColumnSet(columns), TopCount = 1 };
            query.Criteria.AddCondition(table + "id", ConditionOperator.Equal, id);
            return service.RetrieveMultiple(query).Entities.FirstOrDefault();
        }

        private static void Output(IPluginExecutionContext context, Entity job, Entity ledger, bool replay)
        {
            context.OutputParameters["JobId"] = job.Id;
            context.OutputParameters["JobRowVersion"] = job.RowVersion ?? "";
            context.OutputParameters["CoordinatorManaged"] = job.GetAttributeValue<bool>(JobRegistrationPlugin.CoordinatorManaged);
            context.OutputParameters["RegistrationVoid"] = job.GetAttributeValue<bool>(RegistrationVoid);
            context.OutputParameters["WasReplay"] = replay;
            if (ledger != null)
            {
                context.OutputParameters["LedgerId"] = ledger.Id;
                context.OutputParameters["LedgerRowVersion"] = ledger.RowVersion ?? "";
            }
        }

        private static void RequireOnly(ParameterCollection parameters, params string[] allowed)
        {
            if (parameters.Keys.Any(key => !allowed.Contains(key)))
                throw Failure("INVALID", "This operation cannot change unrelated Job, scheduling, evidence or marker fields.");
        }
        private static Guid RequiredId(ParameterCollection parameters, string name)
        {
            if (!parameters.Contains(name) || !(parameters[name] is Guid) || (Guid)parameters[name] == Guid.Empty)
                throw Failure("INVALID", name + " must identify a saved record.");
            return (Guid)parameters[name];
        }
        private static string Version(ParameterCollection parameters, string name)
        {
            string value = Text(parameters, name, 30, true);
            if (!Regex.IsMatch(value, "^[0-9]+$")) throw Failure("INVALID", "An exact record version is required.");
            return value;
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
        private static string Email(ParameterCollection parameters, string name)
        {
            string value = NormalizeEmail(Text(parameters, name, 320, true));
            if (!Regex.IsMatch(value, "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) throw Failure("INVALID", "The assigned technician needs a valid email address.");
            return value;
        }
        private static string NormalizeEmail(string value) { return (value ?? "").Trim().ToLowerInvariant(); }
        private static string Truncate(string value, int maximum) { return value.Length <= maximum ? value : value.Substring(0, maximum); }
        private static string Hash(IEnumerable<string> values)
        {
            string canonical = String.Join("|", values.Select(value => value.Length.ToString(CultureInfo.InvariantCulture) + ":" + value));
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(canonical))).Replace("-", "").ToLowerInvariant();
        }
        private static void DispatchOutput(IPluginExecutionContext context, Guid dispatchId, bool replay)
        {
            context.OutputParameters["DispatchId"] = dispatchId;
            context.OutputParameters["WasReplay"] = replay;
        }
        private static InvalidPluginExecutionException Failure(string code, string message)
        {
            return new InvalidPluginExecutionException("[JOB_WORKFLOW_" + code + "] " + message);
        }
    }
}
