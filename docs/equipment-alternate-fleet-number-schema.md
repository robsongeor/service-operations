# Equipment Alternate Fleet Numbers Schema

## Purpose

Equipment retains one primary Fleet Number in `gr_fleet` while also recording identifiers used on
the physical machine, by a Customer or Site, or by an earlier ownership arrangement. Alternate
identifiers improve lookup without changing the current primary/Greentree Fleet Number.

## Equipment column

| Display name | Logical name | Type | Required | Purpose |
| --- | --- | --- | --- | --- |
| Alternate Fleet Numbers | `gr_alternatefleetnumbers` | Multiple lines of text, 2,000 characters | No | Former, Customer, Site-specific, and other recognised Fleet Numbers; one normalized identifier per line |

The application accepts newline, comma, or semicolon-separated input, removes blank and
case-insensitive duplicate values, excludes the current primary Fleet Number, and stores one value
per line. It allows at most 20 identifiers of at most 100 characters each.

## Behaviour

- `gr_fleet` remains the primary current identifier and is displayed with the greatest visual weight.
- Changing the primary Fleet Number through the canonical Equipment drawer automatically adds the
  previous primary value to Alternate Fleet Numbers.
- Alternate values participate in Equipment lookup and search, but do not replace primary Fleet
  Number values in Job, Quote, or administrative snapshots.
- Alternate values are current Equipment master data. They do not rewrite historical Jobs or other
  operational evidence.
- Duplicate aliases within one Equipment record are prevented. Cross-Equipment conflicts are
  detected by the application when creating Equipment, but this multiline column cannot carry a
  Dataverse alternate key; the Equipment Dataverse ID remains authoritative.

## Provisioning

Use `scripts/manage-equipment-alternate-fleet-schema.ps1` with `Inspect`, `Provision`, or `Verify`.
The script is idempotent, adds the optional field to `ServiceOperationsNew`, publishes Equipment
metadata, and verifies the field type and length. `-LoginPrompt Never` is the safe default;
interactive sign-in requires an explicit `-LoginPrompt Auto` invocation.
