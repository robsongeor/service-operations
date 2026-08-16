# Job Email Dispatch flow

The application creates an **Email Dispatch** row when a confirmed Job Card email is sent. The
active **Job Email Dispatch** Power Automate flow sends its HTML body through Office 365 Outlook,
then sets **Email Sent** to Yes and records **Completed On**. Failed or timed-out Outlook delivery
leaves Email Sent false and records a safe Error Message.

## Active delivery flow

The original marker-only test flow was created by `scripts/setup-email-dispatch-flow.ps1` inside the
Service Operations solution. `scripts/manage-job-email-delivery-flow.ps1` upgrades and verifies that
same flow in place, reusing the existing WSSOperations Outlook connection reference.

The current environment contains the active flow **Job Email Dispatch**
(`933d522f-9f82-f111-ab0e-70a8a5564ae2`). The flow was upgraded and independently verified on
16 August 2026 without sending a test email.

1. Trigger on an added `Email Dispatch` Dataverse row at Organization scope.
2. Run **Office 365 Outlook — Send an email (V2)** using Recipient Email, Subject, and the HTML
   Body from the trigger row.
3. On success, update that Email Dispatch row with Email Sent = Yes and Completed On = `utcNow()`.
4. On failure or timeout, keep Email Sent = No and record Completed On plus the safe Error Message.

The Jobs-table composer returns as soon as the dispatch row is accepted. Delivery confirmation is
monitored in the background so the user can continue working; Job Card status changes to Sent only
after the flow confirms success.

## Site Checks

Site Checks does not use this flow. Its approved workflow still generates the occurrence link and
opens the configured email client with recipient, subject, and body prefilled. It does not create an
Email Dispatch row or claim confirmed delivery.

An optional `gr_emaildispatch.gr_sitecheck` relationship was provisioned during the earlier
investigation, but it is unused. The existing required Job lookup was not changed. Do not provision
a separate Site Check Email Dispatch table or extend this flow unless the product decision changes
explicitly.
# Public Job Card links

`VITE_PUBLIC_APP_URL` optionally overrides the browser origin used for generated technician Job
Card links. Local development sets it to the deployed Azure Static Web Apps origin so a phone can
open the link; production can omit it and use its own origin. Only credential-free HTTPS origins
are accepted, and the secure token remains stored and validated in Dataverse.
