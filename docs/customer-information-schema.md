# Customer information schema

The Customer Dashboard stores its general information fields directly on `gr_customer`.

| UI field | Dataverse column | Type |
| --- | --- | --- |
| Accounts contact | `gr_accountscontact` | Text 200 |
| Accounts phone | `gr_accountsphone` | Text 100 |
| Accounts email | `gr_accountsemail` | Text 320 |
| Purchase order requirements | `gr_purchaseorderrequirements` | Multiline text 4,000 |
| Customer notes | `gr_customernotes` | Multiline text 10,000 |

Provision or verify the columns with:

```powershell
./scripts/manage-customer-information-schema.ps1 -Mode Provision
./scripts/manage-customer-information-schema.ps1 -Mode Verify
```

The script uses the current Azure CLI sign-in, adds columns to the `ServiceOperationsNew` solution,
publishes `gr_customer` after a change, and never prints the access token. Customer and Site creation
from the combined drawer now creates real Dataverse rows. Site operating hours are intentionally not
offered because no authoritative Dataverse field exists for them.
