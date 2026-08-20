# Equipment Photo Upload Architecture

## Overview

`/equipment-photos` is an authenticated, mobile-first office workflow for attaching workshop
evidence to a Job. SharePoint stores only files and deterministic folders. The shared `Working
Folder` library is not given feature-specific columns; Dataverse remains the intended owner for a
later upload-audit table and searchable business metadata.

## Storage path

The fixed server-owned root is:

```text
Working Folder/Workshop/Equipment Photo Storage
```

The server re-reads the selected Job and creates collision-safe folders beneath that root:

```text
Customer (id)/Site (id)/Equipment (id)/Job Number (id)/
```

The browser supplies only the Job ID, image payload, capture timestamp, and idempotent client upload
ID. Customer, Site, Equipment, Job Number, path, and final filename are derived server-side. Jobs
without all four relationships fail safely.

## Security boundary

The client acquires one delegated Dataverse token for a search or upload batch and sends it in
`X-Dataverse-Authorization`. `/api/equipmentphotos` validates the caller with Dataverse `WhoAmI`
and performs a bounded authoritative Job read. The bearer token is not stored or logged.

The Function then uses a separate confidential Entra identity for Microsoft Graph. Grant that
identity application permission `Sites.Selected` and write access only to the Liftrucks Team Site.
Do not grant tenant-wide `Sites.ReadWrite.All` or `Files.ReadWrite.All` and do not expose the Graph
secret through a `VITE_` setting.

Required server settings are documented in `.env.example`. `EQUIPMENT_PHOTO_UPLOAD_ENABLED` is a
fail-closed release gate and must remain false until the site-specific Graph grant and target path
have been verified.

## File controls

- JPEG, PNG, WebP, HEIC, and HEIF are accepted.
- Declared media type, byte length, decoded length, and binary signature must agree.
- Each image is limited to 8 MiB.
- A stable client upload ID produces the same target filename on retry.
- Upstream bodies, tokens, Job data, and SharePoint paths are not logged in safe errors.

Pending and failed photos are stored in IndexedDB with their immutable selected-Job snapshot and
stable client upload ID. Closing or refreshing the page does not discard them; an interrupted
`uploading` item returns to `pending` when restored. Completed photos are removed from local storage
after SharePoint confirms the upload. Automatic background authentication is deliberately avoided,
so restored and failed items wait for an explicit user retry. A Dataverse audit record still requires
a separately reviewed audit-table schema before it is added.

## Related files

- [`../../src/alpha/equipment-photos/EquipmentPhotoUploadScreen.tsx`](../../src/alpha/equipment-photos/EquipmentPhotoUploadScreen.tsx)
- [`../../src/alpha/equipment-photos/equipmentPhotoApi.ts`](../../src/alpha/equipment-photos/equipmentPhotoApi.ts)
- [`../../api/equipmentphotos/index.js`](../../api/equipmentphotos/index.js)
- [`../../api/services/equipmentPhotoService.js`](../../api/services/equipmentPhotoService.js)
- [Authentication](authentication.md)
- [Security](security.md)
- [Deployment](deployment.md)
