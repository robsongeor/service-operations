# Site Maintenance Settings Dataverse Schema

The Customer Dashboard Site Settings feature uses these Dataverse columns on
`gr_site`.

| Display name | Logical name | Type | Values |
| --- | --- | --- | --- |
| Default Maintenance Profile | `gr_defaultmaintenanceprofile` | Local Choice | High Usage `122830000`; Standard `122830001`; Low Usage `122830002`; Custom `122830003` |
| Inductions required | `gr_inductionrequired` | Two Options | Yes/No |
| Induction requirements | `gr_inductionrequirements` | Multi-line Text | Required induction/safety instructions and requirements for this site |

The values intentionally match Equipment `gr_maintenanceprofile`. The column stores only a
default for future or explicitly selected Equipment. It does not establish a relationship
and does not modify service plans or maintenance history.

Site induction and safety documents are stored in Dataverse `annotation` records
where `subject` is `Site Induction Documents: <site id>`.
The note text is set to `Site induction/safety document`.

Provision with `scripts/setup-site-maintenance-settings-schema.ps1` after reviewing the
target environment and solution. The application change does not run provisioning.
