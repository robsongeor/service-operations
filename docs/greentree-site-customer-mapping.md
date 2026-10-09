# GreenTree Site customer mapping

Service Operations and GreenTree model customers for different purposes. Service Operations uses
`Customer → Site → Equipment → Job` to show who currently has the Equipment and where work happens.
GreenTree uses the debtor/account selected for accounting entry. GreenTree data quality must not
rewrite or weaken the operational relationships in Dataverse.

Each `gr_site` may therefore hold an optional default GreenTree customer:

| Display name | Logical name | Type |
|---|---|---|
| Default GreenTree Customer Code | `gr_greentreecustomercode` | Text 50, optional |
| Default GreenTree Customer Name | `gr_greentreecustomername` | Text 200, optional |

The mapping is a default for future GreenTree entry. It does not assert that every historical Job at
that Site used the same account. Prep, rental, company-vehicle, or other exceptional Jobs may use a
different GreenTree customer without changing the Site mapping.

## Safety boundaries

- Dataverse Customer, Site, Equipment location, Job description and dates remain operationally
  authoritative.
- The GreenTree API integration is read-only. It never POSTs, PATCHes, or deletes GreenTree data.
- Reconciliation may store GreenTree-derived integration state in Dataverse, but it must not change
  operational Customer/Site/Equipment relationships.
- Historical GreenTree Jobs are evidence, not a source for silently rewriting operational data.
- Conflict decisions are reviewed by Site and preserved in
  `config/greentree-site-conflict-decisions.json`; an explicit `skip` remains blank.

## Provision and backfill

Provision the optional columns with:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/manage-greentree-customer-mapping-schema.ps1
```

The Node backfill planner is read-only. It combines the generated review data with the reviewed
conflict decisions and creates an exact plan:

```powershell
node scripts/backfill-greentree-site-customers.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/apply-greentree-site-customer-backfill.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/apply-greentree-site-customer-backfill.ps1 -Apply
```

The application identity intentionally remains read-only. Applying the reviewed plan requires the
delegated admin connection and an explicit `-Apply` switch.

Sites with one observed GreenTree account use that evidence. Conflicting Sites require a recorded
decision. Sites with no evidence and explicitly skipped Sites remain blank.
