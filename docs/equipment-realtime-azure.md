# Equipment realtime updates on Azure

Dataverse remains the source of truth. This integration broadcasts invalidation events only; it does not create another Equipment database.

## Azure resources

1. Create an Azure SignalR Service resource in **Serverless** mode.
2. Create a standalone Azure Function App using Node.js 24 on Flex Consumption. The existing Static Web Apps managed API cannot host SignalR bindings because managed APIs support HTTP bindings only.
3. Deploy the `realtime-api` directory to that Function App.
4. Configure `AzureSignalRConnectionString`, `DATAVERSE_URL`, and `APP_ORIGIN` in Function App settings. Keep all values server-side.
5. Allow the production app origin in the Function App CORS settings.
6. Set `VITE_EQUIPMENT_REALTIME_API_URL` to the Function App `/api` URL when building the frontend.

## GitHub deployment settings

The development deployment uses:

- Function App `serviceops-equipment-realtime-bbd3f9` in East Asia on Node.js 24 Flex Consumption.
- SignalR `serviceops-equipment-signalr-bbd3f9` in Serverless mode on Free F1.
- Storage `serviceopsequiprtbbd3f9` using Standard LRS.
- Frontend realtime URL `https://serviceops-equipment-realtime-bbd3f9.azurewebsites.net/api`.

Add this repository setting before running **Deploy Equipment Realtime Function**:

- Secret `AZURE_REALTIME_FUNCTIONAPP_PUBLISH_PROFILE`: the Function App publish profile XML.

The realtime workflow is manual, so normal application deployments cannot fail because the backend publish-profile secret has not been configured.

## Dataverse registration

Using the Plug-in Registration Tool, register an asynchronous webhook pointing to:

`https://serviceops-equipment-realtime-bbd3f9.azurewebsites.net/api/equipmentchanged`

Use `WebhookKey` authentication with the `equipmentchanged` Azure Function key. Dataverse sends it as the `code` query-string value and Azure validates it before invoking the handler.

Register PostOperation, asynchronous steps for `Create`, `Update`, and `Delete` on the `gr_equipment` table. For Update, configure filtering attributes for the Equipment fields used by the app so unrelated writes do not broadcast.

The development Dataverse registration is `Service Operations Equipment Realtime` (`85b89b0f-bd59-44cb-9d98-86cc3660963e`). Its three steps are enabled, asynchronous, PostOperation, and configured to delete successful system jobs automatically.

## Security and operation

- The negotiate endpoint validates the caller's Dataverse bearer token with `WhoAmI` before returning a short-lived SignalR connection token.
- Azure Functions validates the Dataverse webhook key before invoking the handler.
- SignalR messages contain only Equipment ID, operation, and event time.
- Connected clients debounce event bursts before refreshing the authoritative Dataverse snapshot.
