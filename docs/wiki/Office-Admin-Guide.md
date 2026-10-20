# Office Admin guide

This guide is for people assigned the **Office Admin** role. In the app this access profile is also
called Job Card Admin. The Auckland spreadsheet migration begins on **Wednesday 21 October 2026**.

## What this role can do

Office Admins can:

- create and correct Auckland Job Book entries;
- select the initial mechanic and email the assigned technician from an eligible Job Book row;
- monitor GreenTree and TimeCloud status;
- review submitted Job Cards and record office processing;
- view Quotes; and
- view Customers and Equipment and use the permitted Job Book master-data actions.

Office Admins cannot:

- schedule operational work;
- use Service coordination;
- close the operational Job merely by completing a Job Card review; or
- delete a Job or manually change a permanent Job Number.

## Create a Job

Use the same Auckland creation workflow described in the [Job Book Admin guide](Job-Book-Admin-Guide):

1. Search Job Book first.
2. Select **Auckland**, then **+ New entry**.
3. Select and verify Equipment, Customer, Site, address and Contact.
4. Use **Create new Site** or **Create new Contact** when the correct record does not exist.
5. Enter the description, initial mechanic and Customer PO.
6. Recheck everything and select **Add to Job Book** once.
7. Wait for the permanent Job Number and TimeCloud status.

> **Creating a Job is irreversible.** The allocated Job Number cannot be deleted, reused or undone.
> An eligible Void action retains the number and history; it does not remove the Job.

TimeCloud shows **Uploading…** while the automatic request is running, **Entered** after confirmation
and **Error** only when the request fails. The Service Operations Job is already saved if TimeCloud
shows Error, so report it instead of creating another Job.

## Email the assigned technician

The email action is available only when the numbered Job has an assigned technician with a valid
email address.

1. Find the Job Book row and check the assigned technician.
2. Select the email action.
3. Review the recipient, subject and Job details.
4. Add email-only comments when needed.
5. Send once and wait for the delivery result.

Sending the email does not change the Job status, GreenTree status or TimeCloud status.

## Review Job Cards

Open **Job Card reviews**. The queue is divided into:

- **Open jobs** — numbered Jobs sent to technicians and awaiting submission;
- **Submitted** — technician Job Cards ready for office entry;
- **Review** — cards being processed or needing follow-up; and
- **Completed** — office processing history.

For a submitted card:

1. Open the submission and check the Job, technician, work details, hours, notes and attachments.
2. Select **Start GreenTree entry** when you begin processing it.
3. Record a correction, request clarification or place it on hold when necessary. Include a clear
   office note.
4. When GreenTree entry is genuinely complete, use the completion action and provide any requested
   reference or hour-meter confirmation.

Completing office review records the review outcome. It does not close the operational Job and does
not itself send information to GreenTree.

## GreenTree and TimeCloud status

- Select a Job Book row's **GT Status** button to perform a fresh GreenTree check.
- TimeCloud status is automatic and read-only: **Uploading…**, **Entered** or **Error**.
- Do not create another Job to resolve a status error.

## Current limitations

- Bulk Job creation is not available.
- Site Check creation is not available from this workflow.
- Only Auckland is migrating from the spreadsheet in this rollout.

## Report an issue

Report problems as soon as possible. Include what you were trying to do, what happened, the Job
Number and the exact message. Hold **Windows key + Shift + S**, select the affected area, then paste
the screenshot into your email.

Back to [Service Operations user guides](Home) · [Auckland Job Book migration](Auckland-Job-Book-Migration) · [Getting started and signing in](Getting-Started-and-Signing-In)

_Last reviewed: 20 October 2026._
