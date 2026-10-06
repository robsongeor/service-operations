# Unified Job workflow — signing-key custody

Status: primary local key and signed package created 6 October 2026; recovery backup remains required
before production deployment.

## Current custody record

- Primary owner: George Robson.
- Private key: `%LOCALAPPDATA%\ServiceOperations\SigningKeys\ServiceOperations.UnifiedJobWorkflow.v1.snk`.
- Access: George's Windows account and `SYSTEM`, Full Control, inheritance disabled.
- Generation: 2,048-bit Microsoft Strong Cryptographic Provider signature key, created locally with
  `scripts/new-unified-job-workflow-signing-key.ps1`.
- Assembly identity: `ServiceOperations.UnifiedJobWorkflow`, version `1.0.0.0`, public key token
  `0edea2881bb8578c`.
- Reviewed package: `%LOCALAPPDATA%\ServiceOperations\Packages\ServiceOperations.UnifiedJobWorkflow-1.0.0-20261006-r2`.
- Assembly SHA-256: `621a914b204f0c1bef8243924212fe3533c6ef4f7cf8e558cbae0351b10af45f`.
- The original non-`r2` package predates the guarded registration-child fix and is superseded.
- Deployment performed: no.
- Open custody gate: nominate a backup owner, create protected recovery storage and prove recovery with
  a test build. The PC-local copy alone is not sufficient production recovery.

The earlier unversioned local key is not the selected identity because its general RSA exchange-key
format was incompatible with .NET Framework strong-name signing. It has not signed or deployed an
assembly and remains protected locally pending deliberate cleanup.

## Recommendation

Maintain one durable strong-name `.snk` for the `ServiceOperations.UnifiedJobWorkflow` assembly outside
the repository. A named company owner must control generation, secure storage, backup and recovery.
The private key is build input only: never commit it, copy it into a package directory, paste it into
task output, email it or store it in ignored repository folders.

Strong-name signing supplies stable assembly identity; it is not a substitute for code signing,
Dataverse privileges, caller-context enforcement or release approval.

## Required custody record

Before Package mode is approved, record outside the repository:

- accountable owner and backup owner;
- secure storage location and access-control group;
- generation tool/date and recovery test date;
- backup/escrow location;
- public key token after the first reviewed build;
- permitted build operators and package destination;
- rotation/compromise procedure and old-version recovery plan.

The private key must be recoverable for future compatible assembly upgrades. Losing it can break the
stable assembly identity; casually rotating it creates a different identity and requires a separately
reviewed Dataverse replacement path.

## Packaging controls

`scripts/build-unified-job-workflow-plugin.ps1 -Mode Package`:

- requires an existing `.snk` path outside the repository;
- refuses to overwrite an existing DLL or manifest;
- compiles the exact five reviewed source files as assembly version `1.0.0.0`;
- requires a non-empty public key token;
- writes the signed DLL and a companion JSON manifest containing the public token, assembly hash,
  source hashes and plugin type list;
- never connects to Dataverse or deploys the output.

Example for a future reviewed package:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-unified-job-workflow-plugin.ps1 `
  -Mode Package `
  -SigningKeyPath D:\SecureBuildKeys\ServiceOperations.UnifiedJobWorkflow.snk `
  -OutputDirectory D:\ReviewedPackages\ServiceOperations.UnifiedJobWorkflow-1.0.0
```

Those paths are examples, not approved locations. The output manifest may be retained with release
evidence; the private key must never be copied alongside it.

## Rotation or compromise

Stop packaging and deployment. Preserve deployed evidence and determine whether the existing private
key is recoverable and trustworthy. A replacement key changes assembly identity; do not overwrite or
re-register automatically. Prepare an explicit replacement/rollback plan, test it outside production,
and obtain fresh approval.
