# Job Book Admin guide

This guide is for people assigned the **Job Book Admin** role. The Auckland spreadsheet migration
begins on **Wednesday 21 October 2026**. Other branches continue using their existing processes
until a separate change is announced.

## What this role can do

Job Book Admins can:

- open Job Book, Customers and Equipment;
- search and filter Job Book entries;
- create a new Auckland entry and receive the permanent Job Number after saving;
- select the initial mechanic or leave the Job Unassigned;
- correct permitted Equipment, Customer/Site, Contact, description and Customer PO details; and
- mark an eligible entry **Void** while retaining its permanent number and history.

Job Book Admins cannot:

- email a technician from Job Book;
- schedule operational work;
- review Job Cards;
- use Service coordination; or
- delete a Job or manually change a permanent Job Number.

## Find an existing entry

1. Open **Job Book**.
2. Select **Auckland** and confirm the heading says **Auckland Job Book**.
3. Expand **Filters**.
4. Search by Job Number, description, PO number, address, Equipment, mechanic or Customer/Site.
5. Select **Clear filters** to return to the normal list.

Search before creating a new Job so the same work is not entered twice.

## Add an Auckland Job Book entry

1. Select **Auckland** in Job Book.
2. Select **+ New entry**.
3. Search for and select the correct Equipment.
   - Search by fleet number, alternate fleet number, serial number, make or model.
   - Check the make, model, Customer and Site shown before selecting it.
   - Use **Equipment not known yet** only when the machine genuinely cannot be identified.
4. Check the Customer, Site and address.
5. Select the Site Contact when one is relevant. Leave **No contact** when no contact should be
   recorded.
6. If the correct Site or Contact does not exist, select **+ Add new site** or **+ Add new contact**
   from the relevant selector and complete the requested information.
7. Enter a clear **Description of the job**.
8. Select the mechanic, or leave the Job **Unassigned** if this is not known yet.
9. Enter the **Customer PO** when one was supplied.
10. Complete the final check below, then select **Add to Job Book** once.
11. Wait for the saved entry and allocated Job Number to appear.

### Final check before saving

Confirm:

- the Equipment and fleet number;
- the Customer, Site and address;
- the Contact, or **No contact**;
- a clear description of the required work;
- the mechanic, or **Unassigned**; and
- the Customer PO, when supplied.

> **Creating a Job is irreversible.** Once a permanent Job Number is allocated, the Job cannot be
> deleted, the number cannot be reused and creation cannot be undone. Void retains the number and
> history; it is not a delete action.

### If a save needs confirmation

If the page says **An entry save needs confirmation**, the original request has been retained.
Select **Resume saved request**. Do not create another entry because the first request may already
have allocated a number.

## TimeCloud status

The TimeCloud entry is created automatically after the Job Number is saved. It currently uses
controlled test mode, so the TimeCloud item is labelled **[TEST ONLY - SAFE TO DELETE]**. Do not
rename it or treat it as production TimeCloud work.

| Status | Meaning |
| --- | --- |
| **Uploading…** | The automatic request is still running. Wait for it to finish. |
| **Entered** | TimeCloud confirmed the entry. |
| **Error** | TimeCloud did not confirm the request. The Service Operations Job is still saved. Report the error and do not create another Job. |

The status is read-only. There is no TimeCloud checkbox to select. **Entered** means the controlled
test item was confirmed; it does not mean production mode has been enabled.

## GreenTree status

Select the **GT Status** button on a Job Book row to check that Job Number in GreenTree. The button
temporarily shows **Checking…**, then displays the latest result. This check does not create or close
a GreenTree Job.

## Correct an entry

1. Find the entry in Job Book.
2. Select **Edit entry**.
3. Correct only the factual information that is wrong.
4. Recheck the Equipment location. The Job address follows the selected Site.
5. Select **Save changes**.

If another person changed the entry while it was open, reload the latest record and apply the
correction again. Do not overwrite or duplicate their work.

## Mark an eligible entry Void

Void keeps the Job Number, details, reason and audit history. It is not an undo or deletion.

1. Select the Void action for the correct row.
2. Read the warning.
3. Enter a clear reason.
4. Confirm the action.

The action is unavailable after protected GreenTree or TimeCloud conditions apply. If it is
disabled, read the explanation and report the issue instead of trying to create replacement history.

## Current limitations

- Bulk Job creation is not available.
- Site Check creation is not available from this workflow.
- Job Book Admins cannot schedule or email technicians.
- Only Auckland is migrating from the spreadsheet in this rollout.

## Troubleshooting

| Situation | What to do |
| --- | --- |
| Equipment cannot be found | Search fleet, alternate fleet, serial, make and model. Use **Equipment not known yet** only when necessary. |
| The Site or Contact is missing | Use **+ Add new site** or **+ Add new contact** from the selector. Search first to avoid duplicates. |
| A save is still pending | Wait. If prompted, use **Resume saved request**. Do not create another Job. |
| TimeCloud shows **Error** | The Job is already saved. Report the error and Job Number; do not create it again. |
| A save reports a conflict | Reload the current record, recheck the correction and try once more. |
| Email or review controls are unavailable | This is expected for Job Book Admin. Ask an Office Admin to perform the authorised action. |

When reporting a problem, include what you were doing, the Job Number, the exact message and a
screenshot. Hold **Windows key + Shift + S**, select the affected area, then paste it into the email.

Back to [Service Operations user guides](Home) · [Auckland Job Book migration](Auckland-Job-Book-Migration) · [Customers, Sites and Contacts](Customers-Sites-and-Contacts) · [Equipment guide](Equipment-Guide)

_Last reviewed: 20 October 2026._
