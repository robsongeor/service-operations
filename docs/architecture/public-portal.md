# Public Portal Architecture

## Boundary

The public portal provides token-scoped technician workflows outside the authenticated
management shell. Its server boundary uses Azure Table and private Blob Storage only.

```text
Licensed office user + delegated Dataverse token
    → authenticated snapshot generation
    → Azure Table dispatch snapshot + hashed token
    → anonymous technician portal
    → Azure Table structured evidence + private Blob photos
    → pending office review + notification
    → authenticated office review page
```

`/api/jobsubmission` supports authenticated link generation, anonymous snapshot lookup,
one-photo-at-a-time private server upload, and final submission. `/api/jobcardreviews`
requires the established office bearer for queue, detail, photo, and mark-reviewed actions.

Tokens contain 32 random bytes, expire after seven days by default, and are consumed with
an ETag-conditional update. Raw tokens, Storage credentials, Blob URLs, and Dataverse
credentials are never returned by public responses. Safe terminal responses distinguish
invalid, expired, and used links without exposing business data.

Local/test mode uses an in-memory adapter and console/no-send notification adapter. It is
explicitly unsafe for production and must never be enabled in Azure.

See [Technician submission](technician-job-submission.md), [Authentication](authentication.md),
[Security](security.md), and [Azure Job Card Storage](../azure-job-card-storage.md).
