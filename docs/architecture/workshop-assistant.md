# Workshop Assistant Architecture

## Status and scope

The initial Workshop Assistant is a read-only private pilot available only to the existing Service
Operations administrator `georger@liftrucks.co.nz`. It answers questions about Equipment and Jobs
through Azure OpenAI Realtime. It cannot create or change a Job, Equipment, task, transport request,
booking, email, or any other operational record.

The dedicated Azure OpenAI resource and V3 backend settings are provisioned. Deployment of the
frontend flags and George-only live acceptance are tracked separately from source readiness.

## Boundaries

The authenticated app shell renders the launcher only when both client flags are enabled and
`isServiceOperationsAdministrator` accepts the active MSAL account. This UI check is not the
security boundary. `/api/workshopassistant` validates the caller's delegated Dataverse token with
`WhoAmI`, reads the exact `systemuser`, and requires the same administrator email before requesting
a short-lived Realtime client secret.

The Azure OpenAI API key is server-only. The browser receives only a short-lived session secret,
the configured deployment name and the fixed WebRTC calls URL. The endpoint is fail-closed unless
the backend gate and all required server settings are present.

The private V3 pilot uses the East US 2 resource `serviceops-workshop-ai-bbd3f9`. Its
`workshop-realtime` deployment runs `gpt-realtime-mini` (`2025-12-15`) and
`workshop-transcribe` runs `gpt-4o-mini-transcribe` (`2025-12-15`). The subscription had no quota
for the full `gpt-realtime` model; the mini deployment uses the available single-user pilot quota.

Realtime function calls are handled by a fixed four-tool client adapter using the caller's existing
delegated Dataverse token:

- `search_equipment`
- `get_equipment_context`
- `search_jobs`
- `get_job_context`

There is no generic OData/HTTP tool and no mutation tool. Search results are capped at eight;
descriptions, office updates and source chips are bounded. Exact-context tools require Dataverse
GUIDs returned by a prior disambiguating search. Job Card photos, bearer tokens, contact email and
phone values are not provided to the model.

## UI and data flow

`WorkshopAssistantLauncher` is an app-shell overlay using the shared `EditDrawerShell`. Text input
and press-and-hold microphone input share one Realtime session. Microphone permission is requested
only from the explicit push-to-talk action. The UI shows the conversational transcript, connection
state, privacy/read-only notice and the Job/Equipment records checked by tool calls.

The assistant uses the established focused services for exact Equipment, Equipment Job history,
exact Job and scoped Job Office Updates. Job search adds a new bounded `$top=8` projection. It does
not populate or alter the shared operational caches because the pilot has no mutations.

## Configuration

All gates default to false:

```text
VITE_WORKSHOP_ASSISTANT_ENABLED
VITE_WORKSHOP_ASSISTANT_REALTIME_ENABLED
WORKSHOP_ASSISTANT_BACKEND_ENABLED
```

Server-only configuration:

```text
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_REALTIME_DEPLOYMENT
AZURE_OPENAI_REALTIME_VOICE
AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT
```

The current managed Static Web Apps API uses a server-only key for this source slice. Before a
broader or long-lived production rollout, move the AI gateway to an Azure Function/App service
with managed identity and grant only `Cognitive Services OpenAI User`.

## Future action workflow

Workshop Task and Transport Request preparation remain unimplemented. They require separately
reviewed Dataverse metadata and a pending-action approval boundary. Model output must never execute
a mutation. A future manager approval endpoint must re-authenticate, re-read current targets, check
ETags/idempotency and use an atomic Dataverse change set when it updates more than one record.

## Related source

- `src/alpha/workshop-assistant/`
- `api/workshopassistant/`
- `api/services/workshopAssistantService.js`
- `tests/workshopAssistantAccess.test.ts`
- `tests/workshopAssistantService.test.cjs`
