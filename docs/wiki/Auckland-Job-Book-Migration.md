# Auckland Job Book migration

From **Wednesday 21 October 2026**, the Auckland Job Book spreadsheet will no longer be used for new
Jobs. Auckland Job Book Admins and Office Admins must create and maintain Job Book entries in
**[Service Operations](https://kind-wave-0cdea2200.2.azurestaticapps.net/)**.

This change applies to **Auckland only**. Waikato, Hastings and Christchurch continue using their
existing processes until a separate change is announced.

## What changes

- New Auckland Jobs are created from **Job Book** using **+ New entry**.
- The app allocates the next permanent Auckland Job Number after the entry is saved.
- The saved Job is created in Service Operations and sent automatically to TimeCloud.
- Job details are maintained in the app instead of the Auckland spreadsheet.

## Before creating a Job

Search Job Book first to confirm that the work has not already been entered. Then check that you
have the correct Equipment, Customer, Site, address, Contact, description, mechanic and Customer PO.

> **Important:** creating a Job is irreversible. After **Add to Job Book** allocates a permanent Job
> Number, the Job cannot be deleted, the number cannot be reused and the creation cannot be undone.
> An eligible entry may later be marked Void, but Void retains the Job Number and full history; it
> is not a deletion.

## Create an Auckland Job

1. Open **Job Book**.
2. Select **Auckland** and confirm the heading says **Auckland Job Book**.
3. Select **+ New entry**.
4. Select the correct Equipment, or **Equipment not known yet** when it genuinely cannot be
   identified.
5. Check the Customer, Site and address. When the required record does not exist, use **+ Add new
   site** or **+ Add new contact** from the relevant selector.
6. Enter a clear **Description of the job**.
7. Select the mechanic, or leave the Job **Unassigned** if this is not known yet.
8. Enter the Customer PO when one was supplied.
9. Recheck the complete entry, then select **Add to Job Book** once.
10. Wait for the allocated Job Number and saved row to appear.

Do not create another entry while the save is pending. If the app retains the request for recovery,
use **Resume saved request** so the same request is completed without allocating a duplicate number.

## TimeCloud status

TimeCloud creation starts automatically in production mode after the permanent Job Number is saved.
The Job Book shows a read-only status:

| Status | Meaning |
| --- | --- |
| **Uploading…** | The automatic TimeCloud request is still running. Wait for it to finish. |
| **Entered** | TimeCloud confirmed the entry and Service Operations saved that confirmation. |
| **Error** | TimeCloud did not confirm the request. The Service Operations Job is still saved. Report the error; do not create the Job again. |

There is no TimeCloud checkbox to select manually. **Entered** means TimeCloud confirmed the
production entry and Service Operations saved its TimeCloud identity.

## GreenTree status

The **GT Status** value shows the last known GreenTree result. Select the status button to check that
Job Number in GreenTree again. Closed or finalised GreenTree Jobs are not loaded into Service
coordination, which keeps the active list smaller.

## Not included in this release

- Bulk Job creation is not available.
- Site Check creation is not available from this Job Book workflow.
- Other branches are not moving from their existing Job Book process yet.

These capabilities may be added in a future release.

## Help and screenshots

Report issues as soon as possible. Include what you were trying to do, what happened, the Job Number
when available and the exact message shown on screen.

On Windows, hold **Windows key + Shift + S**, select the affected area, then paste the screenshot
into your support email.

See also: [Getting started and signing in](Getting-Started-and-Signing-In) · [Job Book Admin guide](Job-Book-Admin-Guide) · [Office Admin guide](Office-Admin-Guide) · [Customers, Sites and Contacts](Customers-Sites-and-Contacts)

_Last reviewed: 20 October 2026._
