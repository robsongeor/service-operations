using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace ServiceOperations.Access
{
    // LOCAL SOURCE ONLY. Register only after the reviewed privilege manifest, secure role-ID
    // configuration and all write paths pass target-environment tests. No name/email trust.
    public sealed class RestrictedAccessPlugin : IPlugin
    {
        readonly Dictionary<string, HashSet<Guid>> roles = new Dictionary<string, HashSet<Guid>>();
        public RestrictedAccessPlugin(string unsecure, string secure)
        {
            if (String.IsNullOrWhiteSpace(secure)) throw new InvalidPluginExecutionException("Missing access role configuration.");
            foreach (string part in secure.Split(';'))
            {
                string[] pair = part.Split('=');
                if (pair.Length != 2 || !new[] { "full", "coordinator", "office", "book" }.Contains(pair[0]) || roles.ContainsKey(pair[0]))
                    throw new InvalidPluginExecutionException("Invalid access role configuration.");
                roles.Add(pair[0], new HashSet<Guid>(pair[1].Split(',').Select(value => Guid.Parse(value.Trim()))));
            }
            if (roles.Count != 4 || roles.Values.Any(set => set.Contains(Guid.Empty)) || roles.Values.Sum(set => set.Count) != roles.Values.SelectMany(set => set).Distinct().Count())
                throw new InvalidPluginExecutionException("Access roles must be distinct and complete.");
        }

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            if (context == null || context.Stage != 20 || context.Mode != 0 || !context.IsInTransaction || context.UserId != context.InitiatingUserId)
                throw new InvalidPluginExecutionException("Access guard requires synchronous caller-context PreOperation.");
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.InitiatingUserId);
            var direct = new QueryExpression("systemuserroles") { ColumnSet = new ColumnSet("roleid") };
            direct.Criteria.AddCondition("systemuserid", ConditionOperator.Equal, context.InitiatingUserId);
            var held = new HashSet<Guid>(service.RetrieveMultiple(direct).Entities.Select(row => row.GetAttributeValue<Guid>("roleid")));
            var teams = new QueryExpression("teamroles") { ColumnSet = new ColumnSet("roleid") };
            teams.AddLink("teammembership", "teamid", "teamid").LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, context.InitiatingUserId);
            foreach (var row in service.RetrieveMultiple(teams).Entities) held.Add(row.GetAttributeValue<Guid>("roleid"));
            string profile = new[] { "full", "coordinator", "office", "book" }.FirstOrDefault(key => roles[key].Overlaps(held));
            if (profile == null) throw new InvalidPluginExecutionException("No permitted application data role.");
            if (profile == "full" || profile == "coordinator") return;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            var before = context.PreEntityImages.Contains("Before") ? context.PreEntityImages["Before"] : null;
            if (target == null) throw new InvalidPluginExecutionException("This record operation is not permitted.");
            if (context.MessageName == "Update" && (before == null || before.Id != target.Id || before.LogicalName != target.LogicalName))
                throw new InvalidPluginExecutionException("Required access guard image is unavailable.");
            RestrictedWritePolicy.Validate(profile, context.MessageName, target, before);
        }
    }

    public static class RestrictedWritePolicy
    {
        static readonly string[] Ledgers = { "gr_jobbookentry", "gr_waikatojobbookentry", "gr_hastingsjobbookentry", "gr_christchurchjobbookentry" };
        static readonly string[] JobDetails = { "gr_description", "gr_ordernumber", "gr_equipment", "gr_site", "gr_contact" };
        static readonly string[] EquipmentDetails = { "gr_fleet", "gr_alternatefleetnumbers", "gr_make", "gr_model", "gr_serial", "gr_site" };
        static readonly string[] IntakeDetails = { "gr_description", "gr_customerpo", "gr_equipment", "gr_customer", "gr_site", "gr_contact", "gr_fleetsnapshot", "gr_serialsnapshot", "gr_makesnapshot", "gr_modelsnapshot", "gr_customersnapshot", "gr_sitesnapshot", "gr_addresssnapshot", "gr_addressverified", "gr_addressnotfoundconfirmed", "gr_equipmentreviewrequired" };
        static void Deny() { throw new InvalidPluginExecutionException("The requested change is outside this role's permitted actions."); }
        static void Fields(Entity target, IEnumerable<string> allowed)
        {
            var set = new HashSet<string>(allowed, StringComparer.OrdinalIgnoreCase);
            if (target.Attributes.Keys.Any(key => !set.Contains(key))) Deny();
        }
        public static void Validate(string profile, string message, Entity target, Entity before)
        {
            if (profile != "office" && profile != "book") { Deny(); return; }
            bool office = profile == "office";
            if (message == "Create")
            {
                if (target.LogicalName == "gr_customer") { Fields(target, new[] { "gr_name" }); return; }
                if (target.LogicalName == "gr_site") { Fields(target, new[] { "gr_name", "gr_address", "gr_customer" }); return; }
                // Registration/dispatch require dedicated guarded operations. Do not authorize
                // generic Job/ledger/Email Dispatch creation merely from an Admin role.
                Deny(); return;
            }
            if (message != "Update" || before == null || before.Id != target.Id || before.LogicalName != target.LogicalName) { Deny(); return; }
            if (target.LogicalName == "gr_equipment") { Fields(target, EquipmentDetails); return; }
            if (target.LogicalName == "gr_job")
            {
                if (before.GetAttributeValue<bool>("gr_registrationvoid")) Deny();
                Fields(target, JobDetails.Concat(office ? new[] { "gr_gtentered", "gr_timecloudentered" } : new string[0]));
                return;
            }
            if (Ledgers.Contains(target.LogicalName))
            {
                var stage = before.GetAttributeValue<OptionSetValue>("gr_stage");
                if (stage == null || stage.Value != 122830000 || before.GetAttributeValue<EntityReference>("gr_registeredjob") != null || before.GetAttributeValue<EntityReference>("gr_promotedjob") != null) Deny();
                if (target.Contains("gr_stage") || target.Contains("gr_voidreason"))
                {
                    Fields(target, new[] { "gr_stage", "gr_voidreason" });
                    var next = target.GetAttributeValue<OptionSetValue>("gr_stage");
                    string reason = target.GetAttributeValue<string>("gr_voidreason");
                    // Require both markers to be present in the configured pre-image. Unknown is
                    // not evidence that entry in the external systems has not occurred.
                    if (!before.Contains("gr_entered") || !before.Contains("gr_timecloudentered") || before.GetAttributeValue<bool>("gr_entered") || before.GetAttributeValue<bool>("gr_timecloudentered") || next == null || next.Value != 122830003 || String.IsNullOrWhiteSpace(reason) || reason.Length > 1000) Deny();
                    return;
                }
                Fields(target, IntakeDetails.Concat(office ? new[] { "gr_entered", "gr_timecloudentered" } : new string[0]));
                return;
            }
            Deny();
        }
    }
}
