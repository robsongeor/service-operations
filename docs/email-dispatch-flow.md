# Email Dispatch test flow

The application creates an **Email Dispatch** row whenever Email or Send job is pressed. Power Automate completes the request by setting **Email Sent** to Yes. The app waits for that result before changing the technician status to Sent.

## Test flow

The automated test flow is created by `scripts/setup-email-dispatch-flow.ps1` inside the Service Operations solution. The steps below describe its generated definition.

The current environment contains the active flow **Test Job Email Dispatch** (`933d522f-9f82-f111-ab0e-70a8a5564ae2`). Run `scripts/test-email-dispatch-flow.ps1` to create a temporary dispatch, verify that the flow returns Email Sent = Yes, and remove the test row.

1. Select **Microsoft Dataverse — When a row is added, modified or deleted**.
2. Set **Change type** to `Added`.
3. Set **Table name** to `Email Dispatches`.
4. Set **Scope** to `Organization`.
5. Add **Microsoft Dataverse — Update a row**.
6. Set **Table name** to `Email Dispatches`.
7. Set **Row ID** to the trigger's `Email Dispatch` unique identifier.
8. Set **Email Sent** to `Yes`.
9. Set **Completed On** to the expression `utcNow()`.
10. Save the flow and turn it on.

For the real flow, insert **Office 365 Outlook — Send an email (V2)** before Update a row. Use Recipient Email, Subject, and Body from the trigger. Only set Email Sent to Yes after the Outlook action succeeds.
