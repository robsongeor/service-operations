# Site Maintenance Settings Dataverse Schema

The Customer Dashboard Site Settings feature adds one optional local Choice column to
`gr_site`.

| Display name | Logical name | Type | Values |
| --- | --- | --- | --- |
| Default Maintenance Profile | `gr_defaultmaintenanceprofile` | Local Choice | High Usage `122830000`; Standard `122830001`; Low Usage `122830002`; Custom `122830003` |

The values intentionally match Equipment `gr_maintenanceprofile`. The column stores only a
default for future or explicitly selected Equipment. It does not establish a relationship
and does not modify service plans or maintenance history.

Provision with `scripts/setup-site-maintenance-settings-schema.ps1` after reviewing the
target environment and solution. The application change does not run provisioning.
