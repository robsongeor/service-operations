# Staff Directory Dataverse Schema

Status: all three columns were provisioned, published, and verified in the target Dataverse
environment on 13 August 2026. The customer-email CC column was completed through one explicitly
approved interactive connection after the no-prompt preflight stopped safely before metadata changes.

## Existing table

The feature extends the existing user-owned `gr_mechanic` table (`gr_mechanics`, primary key
`gr_mechanicid`, primary name `gr_name`). No table, lookup, ownership, or historical relationship
is replaced.

| Display name | Logical name | Type | Contract |
| --- | --- | --- | --- |
| Department | `gr_department` | Local Choice | Service `122830000`; Accounts `122830001`; Sales `122830002`; Management `122830003`; Other `122830004` |
| Can be assigned Jobs | `gr_jobassignmentenabled` | Yes/No | Default Yes for new rows; null legacy values are interpreted as Yes by the application |
| CC on customer emails | `gr_customeremailccenabled` | Yes/No | Default No; only explicit Yes on an active Staff row with a valid email adds that address to customer-email CC |

The columns are optional so existing records remain valid. They do not introduce new table
privileges; users still require their existing read/write access to `gr_mechanic`.

## Provisioning gate

Validate locally without authentication:

```powershell
pwsh scripts/manage-staff-directory-schema.ps1 -ValidateDefinition
```

Inspection and verification default to `LoginPrompt Never`. Provisioning, publishing, or an
interactive sign-in must not be run without explicit approval:

```powershell
pwsh scripts/manage-staff-directory-schema.ps1 -Mode Inspect
pwsh scripts/manage-staff-directory-schema.ps1 -Mode Provision -LoginPrompt Auto
pwsh scripts/manage-staff-directory-schema.ps1 -Mode Verify
```

Provision mode creates only the three columns in solution `ServiceOperationsNew`, publishes
`gr_mechanic`, and verifies the exact types, Choice values and Boolean defaults in the same connection.
The approved customer-email CC run completed successfully on 13 August 2026; no role, record, role
assignment, credential, or cloud configuration was changed.
