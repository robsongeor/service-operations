using System;
using System.Collections.Generic;
using System.Linq;
using System.Globalization;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace ServiceOperations.Access
{
    // Meter-writer extension is opt-in; legacy four-profile configurations stay valid.
    // Register only after exact identity/role configuration and target-environment tests.
    public sealed class RestrictedAccessPlugin : IPlugin
    {
        readonly Dictionary<string, HashSet<Guid>> roles = new Dictionary<string, HashSet<Guid>>();
        readonly Dictionary<string, Guid> meter = new Dictionary<string, Guid>();
        public RestrictedAccessPlugin(string unsecure, string secure)
        {
            if (String.IsNullOrWhiteSpace(secure)) throw new InvalidPluginExecutionException("Missing access role configuration.");
            foreach (string part in secure.Split(';'))
            {
                string[] pair = part.Split('=');
                if (pair.Length == 2 && new[] { "meterrole", "meteruser", "meterapplication" }.Contains(pair[0]))
                {
                    Guid value;
                    if (meter.ContainsKey(pair[0]) || !Guid.TryParse(pair[1], out value) || value == Guid.Empty)
                        throw new InvalidPluginExecutionException("Invalid meter writer configuration.");
                    meter.Add(pair[0], value);
                    continue;
                }
                if (pair.Length != 2 || !new[] { "full", "coordinator", "office", "book" }.Contains(pair[0]) || roles.ContainsKey(pair[0]))
                    throw new InvalidPluginExecutionException("Invalid access role configuration.");
                roles.Add(pair[0], new HashSet<Guid>(pair[1].Split(',').Select(value => Guid.Parse(value.Trim()))));
            }
            if (roles.Count != 4 || roles.Values.Any(set => set.Contains(Guid.Empty)) || roles.Values.Sum(set => set.Count) != roles.Values.SelectMany(set => set).Distinct().Count())
                throw new InvalidPluginExecutionException("Access roles must be distinct and complete.");
            if (meter.Count != 0 && (meter.Count != 3 || roles.Values.Any(set => set.Contains(meter["meterrole"]))))
                throw new InvalidPluginExecutionException("Meter writer requires a separate role, user and application.");
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
            // Check BEFORE privileged human profiles. A meter identity never gains the full/coordinator
            // bypass, even if somebody accidentally also assigns a broader configured role.
            if (meter.Count == 3 && (context.InitiatingUserId == meter["meteruser"] || held.Contains(meter["meterrole"])))
            {
                var caller = service.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("applicationid", "isdisabled"));
                MeterWritePolicy.ValidateCaller(context.InitiatingUserId, caller, held, meter["meteruser"], meter["meterapplication"], meter["meterrole"]);
                var change = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
                MeterWritePolicy.ValidateTarget(context.MessageName, change);
                var current = service.Retrieve("gr_job", change.Id, new ColumnSet("gr_status", "statecode", "gr_registrationvoid", "gr_equipment", "gr_hourmeter", "gr_hourmeterrecordeddate", "gr_hourmeterreadingtype", "gr_hourmeterapprovalreference"));
                var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("New Zealand Standard Time")).Date;
                MeterWritePolicy.Validate(change, current, today);
                return;
            }
            string profile = new[] { "full", "coordinator", "office", "book" }.FirstOrDefault(key => roles[key].Overlaps(held));
            if (profile == null) throw new InvalidPluginExecutionException("No permitted application data role.");
            if (profile == "full" || profile == "coordinator") return;
            var target = context.InputParameters.Contains("Target") ? context.InputParameters["Target"] as Entity : null;
            var before = context.PreEntityImages.Contains("Before") ? context.PreEntityImages["Before"] : null;
            if (target == null) throw new InvalidPluginExecutionException("This record operation is not permitted.");
            if (context.MessageName == "Update" && (before == null || before.Id != target.Id || before.LogicalName != target.LogicalName))
                throw new InvalidPluginExecutionException("Required access guard image is unavailable.");
            if ((profile == "office" || profile == "book") && (IsRegistrationChild(context, target) || IsRegisteredVoidChild(context, target) || IsInitialDispatchChild(context, target))) return;
            RestrictedWritePolicy.Validate(profile, context.MessageName, target, before);
        }

        internal static bool IsRegistrationChild(IPluginExecutionContext context, Entity target)
        {
            var parent = context.ParentContext;
            for (int depth = 0; parent != null && depth < 8; depth++, parent = parent.ParentContext)
            {
                if (parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || parent.InitiatingUserId != context.InitiatingUserId ||
                    (parent.MessageName != "gr_RegisterJobBookJob" && parent.MessageName != "gr_AllocateJobBookNumber")) continue;
                bool creating = parent.MessageName == "gr_RegisterJobBookJob";
                Guid requestId;
                if (!TryId(parent.InputParameters, "RequestId", out requestId)) return false;
                Guid jobId = requestId;
                if (!creating && !TryId(parent.InputParameters, "JobId", out jobId)) return false;
                string book = parent.InputParameters.Contains("Book") ? parent.InputParameters["Book"] as string : null;
                string table = book == "auckland" ? "gr_jobbookentry" :
                    book == "waikato" || book == "hastings" || book == "christchurch" ? "gr_" + book + "jobbookentry" : null;
                if (table == null) return false;

                if (target.LogicalName == "gr_job" && context.MessageName == "Create" && creating)
                {
                    var expected = new HashSet<string>(new[] { "gr_description", "gr_ordernumber", "gr_site", "gr_status", "gr_coordinatormanaged" });
                    foreach (var pair in new[] { new[] { "EquipmentId", "gr_equipment", "gr_equipment" }, new[] { "ContactId", "gr_contact", "gr_contact" }, new[] { "MechanicId", "gr_mechanic", "gr_mechanic" } })
                        if (parent.InputParameters.Contains(pair[0]) && parent.InputParameters[pair[0]] is Guid && (Guid)parent.InputParameters[pair[0]] != Guid.Empty) expected.Add(pair[1]);
                    string externalSupplier = parent.InputParameters.Contains("ExternalSupplierDetails") ? parent.InputParameters["ExternalSupplierDetails"] as string : null;
                    if (!String.IsNullOrWhiteSpace(externalSupplier)) expected.Add("gr_externalsupplierdetails");
                    Guid siteId;
                    bool unknown = parent.InputParameters.Contains("EquipmentUnknown") && parent.InputParameters["EquipmentUnknown"] is bool && (bool)parent.InputParameters["EquipmentUnknown"];
                    var status = target.GetAttributeValue<OptionSetValue>("gr_status");
                    return target.Id == requestId && target.Attributes.Keys.Count == expected.Count && target.Attributes.Keys.All(expected.Contains) &&
                        TryId(parent.InputParameters, "SiteId", out siteId) && Reference(target, "gr_site", "gr_site", siteId) &&
                        SameOptionalReference(parent.InputParameters, target, "EquipmentId", "gr_equipment", "gr_equipment") &&
                        SameOptionalReference(parent.InputParameters, target, "ContactId", "gr_contact", "gr_contact") &&
                        SameOptionalReference(parent.InputParameters, target, "MechanicId", "gr_mechanic", "gr_mechanic") &&
                        unknown != target.Contains("gr_equipment") && status != null && status.Value == (target.Contains("gr_mechanic") || target.Contains("gr_externalsupplierdetails") ? 122830000 : 122830001) &&
                        !target.GetAttributeValue<bool>("gr_coordinatormanaged") &&
                        SameText(parent.InputParameters, "Description", target.GetAttributeValue<string>("gr_description")) &&
                        SameText(parent.InputParameters, "OrderNumber", target.GetAttributeValue<string>("gr_ordernumber")) &&
                        SameText(parent.InputParameters, "ExternalSupplierDetails", target.GetAttributeValue<string>("gr_externalsupplierdetails"));
                }
                if (target.LogicalName == "gr_job" && context.MessageName == "Update")
                {
                    string number = target.GetAttributeValue<string>("gr_jobnumber");
                    return target.Id == jobId && target.Attributes.Keys.Count == 1 && target.Contains("gr_jobnumber") &&
                        ValidNumber(book, number);
                }
                if (target.LogicalName == table && context.MessageName == "Create")
                {
                    var required = new HashSet<string>(new[] { "gr_stage", "gr_registeredjob", "gr_registrationfingerprint", "gr_description", "gr_customerpo", "gr_site", "gr_customer", "gr_customersnapshot", "gr_sitesnapshot", "gr_addresssnapshot", "gr_entered", "gr_timecloudentered", "gr_addressverified", "gr_addressnotfoundconfirmed", "gr_equipmentreviewrequired" });
                    var allowed = new HashSet<string>(required.Concat(new[] { "gr_jobnumber", "gr_equipment", "gr_fleetsnapshot", "gr_serialsnapshot", "gr_makesnapshot", "gr_modelsnapshot", "gr_contact", "gr_mechanic", "gr_mechanictext" }));
                    var stage = target.GetAttributeValue<OptionSetValue>("gr_stage");
                    string fingerprint = target.GetAttributeValue<string>("gr_registrationfingerprint");
                    bool equipmentReview = target.GetAttributeValue<bool>("gr_equipmentreviewrequired");
                    bool equipmentComplete = new[] { "gr_equipment", "gr_fleetsnapshot", "gr_serialsnapshot", "gr_makesnapshot", "gr_modelsnapshot" }.All(target.Contains);
                    bool equipmentAbsent = new[] { "gr_equipment", "gr_fleetsnapshot", "gr_serialsnapshot", "gr_makesnapshot", "gr_modelsnapshot" }.All(key => !target.Contains(key));
                    bool externalSupplier = parent.InputParameters.Contains("ExternalSupplierDetails") && !String.IsNullOrWhiteSpace(parent.InputParameters["ExternalSupplierDetails"] as string);
                    bool mechanicComplete = externalSupplier
                        ? !target.Contains("gr_mechanic") && target.Contains("gr_mechanictext")
                        : target.Contains("gr_mechanic") == target.Contains("gr_mechanictext");
                    string number = target.GetAttributeValue<string>("gr_jobnumber");
                    return target.Id == requestId && target.Attributes.Keys.All(allowed.Contains) && required.All(target.Contains) &&
                        stage != null && stage.Value == 122830004 && Reference(target, "gr_registeredjob", "gr_job", jobId) &&
                        !String.IsNullOrWhiteSpace(fingerprint) && fingerprint.Length == 64 && fingerprint.All(character => Uri.IsHexDigit(character)) &&
                        (equipmentReview ? equipmentAbsent : equipmentComplete) && mechanicComplete &&
                        (!target.Contains("gr_jobnumber") || ValidNumber(book, number));
                }
                return false;
            }
            return false;
        }

        static bool TryId(ParameterCollection values, string key, out Guid id)
        {
            id = Guid.Empty;
            if (!values.Contains(key) || !(values[key] is Guid)) return false;
            id = (Guid)values[key];
            return id != Guid.Empty;
        }
        static bool Reference(Entity target, string field, string table, Guid id)
        {
            var reference = target.GetAttributeValue<EntityReference>(field);
            return reference != null && reference.LogicalName == table && reference.Id == id;
        }
        static bool SameOptionalReference(ParameterCollection inputs, Entity target, string input, string field, string table)
        {
            bool supplied = inputs.Contains(input) && inputs[input] is Guid && (Guid)inputs[input] != Guid.Empty;
            return supplied ? Reference(target, field, table, (Guid)inputs[input]) : !target.Contains(field);
        }
        static bool SameText(ParameterCollection inputs, string input, string value)
        {
            string supplied = inputs.Contains(input) ? inputs[input] as string : null;
            return String.Equals((supplied ?? "").Trim(), value ?? "", StringComparison.Ordinal);
        }
        static bool ValidNumber(string book, string number)
        {
            if (String.IsNullOrWhiteSpace(number) || number.Length > 30) return false;
            string prefix = book == "waikato" ? "WJ" : book == "hastings" ? "HJ" : book == "christchurch" ? "CJ" : "";
            return System.Text.RegularExpressions.Regex.IsMatch(number, "^" + prefix + "[0-9]+$");
        }

        internal static bool IsRegisteredVoidChild(IPluginExecutionContext context, Entity target)
        {
            if (context.MessageName != "Update") return false;
            var parent = context.ParentContext;
            for (int depth = 0; parent != null && depth < 8; depth++, parent = parent.ParentContext)
            {
                if (parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || parent.InitiatingUserId != context.InitiatingUserId ||
                    parent.MessageName != "gr_VoidRegisteredJobBookEntry") continue;
                string reason = parent.InputParameters.Contains("Reason") ? parent.InputParameters["Reason"] as string : null;
                reason = reason == null ? null : reason.Trim();
                if (target.LogicalName == "gr_job")
                {
                    return parent.InputParameters.Contains("JobId") && parent.InputParameters["JobId"] is Guid &&
                        (Guid)parent.InputParameters["JobId"] == target.Id && target.Attributes.Keys.Count == 2 &&
                        target.GetAttributeValue<bool>("gr_registrationvoid") &&
                        String.Equals(target.GetAttributeValue<string>("gr_registrationvoidreason"), reason, StringComparison.Ordinal);
                }
                if (!new[] { "gr_jobbookentry", "gr_waikatojobbookentry", "gr_hastingsjobbookentry", "gr_christchurchjobbookentry" }.Contains(target.LogicalName)) return false;
                string book = parent.InputParameters.Contains("Book") ? parent.InputParameters["Book"] as string : null;
                string table = book == "auckland" ? "gr_jobbookentry" :
                    book == "waikato" || book == "hastings" || book == "christchurch" ? "gr_" + book + "jobbookentry" : null;
                var stage = target.GetAttributeValue<OptionSetValue>("gr_stage");
                return table == target.LogicalName && parent.InputParameters.Contains("LedgerId") && parent.InputParameters["LedgerId"] is Guid &&
                    (Guid)parent.InputParameters["LedgerId"] == target.Id && target.Attributes.Keys.Count == 2 &&
                    stage != null && stage.Value == 122830003 && String.Equals(target.GetAttributeValue<string>("gr_voidreason"), reason, StringComparison.Ordinal);
            }
            return false;
        }

        internal static bool IsInitialDispatchChild(IPluginExecutionContext context, Entity target)
        {
            if (context.MessageName != "Create" || target.LogicalName != "gr_emaildispatch") return false;
            var parent = context.ParentContext;
            for (int depth = 0; parent != null && depth < 8; depth++, parent = parent.ParentContext)
            {
                if (parent.Stage != 30 || parent.Mode != 0 || !parent.IsInTransaction || parent.InitiatingUserId != context.InitiatingUserId ||
                    parent.MessageName != "gr_QueueInitialJobDispatch") continue;
                var expected = new HashSet<string>(new[] { "gr_name", "gr_recipientemail", "gr_recipientname", "gr_subject", "gr_body", "gr_emailsent", "gr_requestedon", "gr_job", "gr_jobdispatchfingerprint" });
                var job = target.GetAttributeValue<EntityReference>("gr_job");
                string fingerprint = target.GetAttributeValue<string>("gr_jobdispatchfingerprint");
                return target.Attributes.Keys.Count == expected.Count && target.Attributes.Keys.All(expected.Contains) &&
                    parent.InputParameters.Contains("RequestId") && parent.InputParameters["RequestId"] is Guid && (Guid)parent.InputParameters["RequestId"] == target.Id &&
                    parent.InputParameters.Contains("JobId") && parent.InputParameters["JobId"] is Guid && job != null && job.LogicalName == "gr_job" && job.Id == (Guid)parent.InputParameters["JobId"] &&
                    parent.InputParameters.Contains("RecipientEmail") && String.Equals((parent.InputParameters["RecipientEmail"] as string ?? "").Trim(), target.GetAttributeValue<string>("gr_recipientemail"), StringComparison.OrdinalIgnoreCase) &&
                    parent.InputParameters.Contains("Subject") && String.Equals((parent.InputParameters["Subject"] as string ?? "").Trim(), target.GetAttributeValue<string>("gr_subject"), StringComparison.Ordinal) &&
                    parent.InputParameters.Contains("Body") && String.Equals((parent.InputParameters["Body"] as string ?? "").Trim(), target.GetAttributeValue<string>("gr_body"), StringComparison.Ordinal) &&
                    !target.GetAttributeValue<bool>("gr_emailsent") && target["gr_requestedon"] is DateTime &&
                    !String.IsNullOrWhiteSpace(target.GetAttributeValue<string>("gr_name")) && !String.IsNullOrWhiteSpace(target.GetAttributeValue<string>("gr_recipientname")) &&
                    !String.IsNullOrWhiteSpace(fingerprint) && fingerprint.Length == 64 && fingerprint.All(character => Uri.IsHexDigit(character));
            }
            return false;
        }
    }

    public static class MeterWritePolicy
    {
        static readonly string[] Fields = { "gr_hourmeter", "gr_hourmeterreadingtype", "gr_hourmeterrecordeddate", "gr_hourmeterapprovalreference" };
        static void Require(bool value) { if (!value) throw new InvalidPluginExecutionException("The requested change is outside the approved Job meter operation."); }
        public static void ValidateCaller(Guid callerId, Entity caller, IEnumerable<Guid> held, Guid userId, Guid applicationId, Guid roleId)
        {
            Require(userId != Guid.Empty && applicationId != Guid.Empty && roleId != Guid.Empty && callerId == userId &&
                caller != null && caller.Id == userId && caller.LogicalName == "systemuser" &&
                caller.GetAttributeValue<Guid>("applicationid") == applicationId && caller.Contains("isdisabled") &&
                !caller.GetAttributeValue<bool>("isdisabled") && held.Contains(roleId));
        }
        public static void ValidateTarget(string message, Entity target)
        {
            Require(message == "Update" && target != null && target.LogicalName == "gr_job" && target.Id != Guid.Empty);
            Require(target.Attributes.Count == Fields.Length && Fields.All(target.Contains));
            Require(target["gr_hourmeter"] is int && (int)target["gr_hourmeter"] >= 0 &&
                target["gr_hourmeterreadingtype"] is OptionSetValue && ((OptionSetValue)target["gr_hourmeterreadingtype"]).Value == 122830000 &&
                target["gr_hourmeterrecordeddate"] is DateTime && target["gr_hourmeterapprovalreference"] is string);
        }
        public static void Validate(Entity target, Entity current, DateTime today)
        {
            ValidateTarget("Update", target);
            Require(current != null && current.Id == target.Id && current.LogicalName == "gr_job");
            Require(current.GetAttributeValue<OptionSetValue>("statecode") != null && current.GetAttributeValue<OptionSetValue>("statecode").Value == 0 &&
                current.GetAttributeValue<OptionSetValue>("gr_status") != null && current.GetAttributeValue<OptionSetValue>("gr_status").Value != 122830003 &&
                !current.GetAttributeValue<bool>("gr_registrationvoid"));
            var equipment = current.GetAttributeValue<EntityReference>("gr_equipment");
            Require(equipment != null && equipment.LogicalName == "gr_equipment" && equipment.Id != Guid.Empty);
            var date = (DateTime)target["gr_hourmeterrecordeddate"];
            Require(date.TimeOfDay == TimeSpan.Zero && date.Date <= today.Date && date.Year >= 1);
            var reference = ((string)target["gr_hourmeterapprovalreference"]).Split('|');
            Guid reviewId;
            Require(reference.Length == 4 && Guid.TryParseExact(reference[0], "D", out reviewId) && reviewId != Guid.Empty);
            Require(reference[1] == ((int)target["gr_hourmeter"]).ToString(CultureInfo.InvariantCulture) &&
                reference[2] == date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) &&
                String.Equals(reference[3], equipment.Id.ToString("D"), StringComparison.OrdinalIgnoreCase));
            var previous = current.GetAttributeValue<DateTime?>("gr_hourmeterrecordeddate");
            Require(!previous.HasValue || previous.Value.Date <= date.Date);
            Require(!previous.HasValue || previous.Value.Date != date.Date || !current.Contains("gr_hourmeter") ||
                current.GetAttributeValue<int?>("gr_hourmeter") == (int)target["gr_hourmeter"]);
            if (String.Equals(current.GetAttributeValue<string>("gr_hourmeterapprovalreference"), (string)target["gr_hourmeterapprovalreference"], StringComparison.Ordinal))
                Require(current.GetAttributeValue<int?>("gr_hourmeter") == (int)target["gr_hourmeter"] && previous.HasValue && previous.Value.Date == date.Date &&
                    current.GetAttributeValue<OptionSetValue>("gr_hourmeterreadingtype") != null && current.GetAttributeValue<OptionSetValue>("gr_hourmeterreadingtype").Value == 122830000);
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
