using System;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;

namespace ServiceOperations.JobRegistration
{
    // Install only with the unified-workflow cutover. Existing manual imports/Intake creates must
    // finish before this guard is registered. PreOperation, synchronous, all five tables, Before image.
    public sealed class JobNumberInvariantPlugin : IPlugin
    {
        static readonly string[] Ledgers = { "gr_jobbookentry", "gr_waikatojobbookentry", "gr_hastingsjobbookentry", "gr_christchurchjobbookentry" };
        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Stage != 20 || context.Mode != 0 || !context.IsInTransaction)
                throw new InvalidPluginExecutionException("The number guard requires synchronous PreOperation registration.");
            bool job = context.PrimaryEntityName == "gr_job";
            if (!job && !Ledgers.Contains(context.PrimaryEntityName)) throw new InvalidPluginExecutionException("Unsupported number-guard table.");
            if (context.MessageName != "Create" && context.MessageName != "Update" && context.MessageName != "Delete") throw new InvalidPluginExecutionException("Unsupported number-guard operation.");
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            if (context.MessageName == "Create")
            {
                if (target == null) throw new InvalidPluginExecutionException("A record is required.");
                if (job && !string.IsNullOrWhiteSpace(target.GetAttributeValue<string>("gr_jobnumber"))) throw new InvalidPluginExecutionException("Numbers must come from the regional allocation operation, not manual entry.");
                // Ledger AutoNumber may be populated by the platform before this step. The trusted
                // registration operation never accepts or supplies it; validate the parent, not timing.
                if (!job && !IsRegistration(context, target.Id)) throw new InvalidPluginExecutionException("Create number-ledger records through registration only.");
                return;
            }
            var before = context.PreEntityImages.Contains("Before") ? context.PreEntityImages["Before"] : null;
            if (before == null || before.Id != context.PrimaryEntityId || before.LogicalName != context.PrimaryEntityName)
                throw new InvalidPluginExecutionException("The number guard is missing its required record image.");
            string oldNumber = before.GetAttributeValue<string>("gr_jobnumber");
            if (context.MessageName == "Delete")
            {
                if (!job || !string.IsNullOrWhiteSpace(oldNumber)) throw new InvalidPluginExecutionException("Allocated numbers and number-ledger history cannot be deleted.");
                return;
            }
            if (target == null) throw new InvalidPluginExecutionException("A record update is required.");
            if (!job)
            {
                bool registered = before.GetAttributeValue<EntityReference>(JobRegistrationPlugin.RegisteredJob) != null ||
                    !string.IsNullOrWhiteSpace(before.GetAttributeValue<string>(JobRegistrationPlugin.Fingerprint));
                if (registered)
                {
                    if (!IsRegisteredVoid(context, target))
                        throw new InvalidPluginExecutionException("Registered number-ledger snapshots are immutable. Correct the working Job instead.");
                    return;
                }
                if (target.Contains(JobRegistrationPlugin.RegisteredJob) || target.Contains(JobRegistrationPlugin.Fingerprint) ||
                    (target.GetAttributeValue<OptionSetValue>("gr_stage") != null && target.GetAttributeValue<OptionSetValue>("gr_stage").Value == JobRegistrationPlugin.RegisteredStage))
                    throw new InvalidPluginExecutionException("Historical Intake cannot be relinked by ordinary editing.");
            }
            if (!target.Contains("gr_jobnumber")) return;
            string next = target.GetAttributeValue<string>("gr_jobnumber");
            if (string.Equals(oldNumber, next, StringComparison.Ordinal)) return;
            if (!string.IsNullOrWhiteSpace(oldNumber)) throw new InvalidPluginExecutionException("An allocated Job number cannot be replaced or cleared.");
            if (!job || !IsRegistration(context, context.PrimaryEntityId) || string.IsNullOrWhiteSpace(next) || next.Length > 30 || !Regex.IsMatch(next, "^(WJ|HJ|CJ)?[0-9]+$"))
                throw new InvalidPluginExecutionException("Allocate the Job number through the regional registration operation.");
        }

        static bool IsRegistration(IPluginExecutionContext context, Guid recordId)
        {
            var parent = context.ParentContext;
            for (int depth = 0; parent != null && depth < 8; depth++, parent = parent.ParentContext)
            {
                if (parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || parent.InitiatingUserId != context.InitiatingUserId) continue;
                bool registering = parent.MessageName == JobRegistrationPlugin.RegisterMessage;
                if (!registering && parent.MessageName != JobRegistrationPlugin.AllocateMessage) continue;
                string key = context.PrimaryEntityName == "gr_job" && !registering ? "JobId" : "RequestId";
                if (!parent.InputParameters.Contains(key) || !(parent.InputParameters[key] is Guid) || (Guid)parent.InputParameters[key] != recordId) return false;
                if (context.PrimaryEntityName == "gr_job") return true;
                string book = parent.InputParameters.Contains("Book") ? parent.InputParameters["Book"] as string : null;
                string table = book == "auckland" ? "gr_jobbookentry" : "gr_" + book + "jobbookentry";
                return table == context.PrimaryEntityName;
            }
            return false;
        }

        static bool IsRegisteredVoid(IPluginExecutionContext context, Entity target)
        {
            if (target.Attributes.Keys.Any(key => key != "gr_stage" && key != "gr_voidreason") ||
                target.GetAttributeValue<OptionSetValue>("gr_stage") == null ||
                target.GetAttributeValue<OptionSetValue>("gr_stage").Value != JobWorkflowPlugin.VoidStage ||
                String.IsNullOrWhiteSpace(target.GetAttributeValue<string>("gr_voidreason"))) return false;
            var parent = context.ParentContext;
            for (int depth = 0; parent != null && depth < 8; depth++, parent = parent.ParentContext)
            {
                if (parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction ||
                    parent.InitiatingUserId != context.InitiatingUserId || parent.MessageName != JobWorkflowPlugin.VoidMessage) continue;
                if (!parent.InputParameters.Contains("LedgerId") || !(parent.InputParameters["LedgerId"] is Guid) ||
                    (Guid)parent.InputParameters["LedgerId"] != target.Id) return false;
                string book = parent.InputParameters.Contains("Book") ? parent.InputParameters["Book"] as string : null;
                string table = book == "auckland" ? "gr_jobbookentry" :
                    book == "waikato" || book == "hastings" || book == "christchurch" ? "gr_" + book + "jobbookentry" : null;
                string reason = parent.InputParameters.Contains("Reason") ? parent.InputParameters["Reason"] as string : null;
                return table == target.LogicalName && String.Equals(reason == null ? null : reason.Trim(), target.GetAttributeValue<string>("gr_voidreason"), StringComparison.Ordinal);
            }
            return false;
        }
    }
}
