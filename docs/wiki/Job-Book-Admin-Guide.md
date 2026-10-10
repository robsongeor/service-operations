# Job Book Admin guide

This guide is for people assigned the **Job Book Admin** role.

Rollout note (10 October 2026): mechanic selection and approved Equipment editing are intended
capabilities, but a known server-policy mismatch can currently reject these saves. Report the
failure rather than creating replacement records or asking for broader access. Wider rollout
still requires named-user acceptance.

## What this role can do

Job Book Admins can:

- view all available regional Job Books;
- search and filter Job Book entries;
- create a new entry and receive the allocated Job Number after saving;
- assign or reassign the mechanic attending the job;
- correct Equipment, Customer/Site, Contact, job description and Customer PO details;
- create a Customer and Site when the correct records do not already exist;
- update approved Equipment details and explicitly move Equipment to the correct Site; and
- mark an eligible entry **Void** with a required reason while retaining its number and history.

Job Book Admins cannot:

- email a technician from the Job Book;
- schedule operational work;
- change GreenTree or Timecloud entry markers;
- review Job Cards or private Job Card evidence;
- move work into Service coordination; or
- delete history or manually change a permanent Job Number.

## Open the correct Job Book

1. Select **Job Book** from the left menu.
2. If regional tabs are shown, select the required Job Book before searching or creating an entry.
3. Check the heading to confirm the region.

If a region says its allocation is protected, you may review migrated entries but cannot allocate a
new number until that region's final migration seed has been verified.

## Find an existing entry

1. Open **Job Book**.
2. Expand **Filters**.
3. Use **Search all columns** for a Job Number, description, PO number or address.
4. Add Date, Equipment, Mechanic, or Customer/Site filters when needed.
5. Select **Clear filters** to return to the normal list.

The table shows the Job Number, date, recorded mechanic, Equipment, Customer/Site, work description,
address, PO and entry status. GreenTree and Timecloud information is read-only for this role.

## Add a Job Book entry

Search first to make sure the work has not already been entered.

1. Select the correct regional Job Book.
2. Select **+ New entry**.
3. Search for and select the Equipment.
   - Search by fleet number, alternate fleet number, serial number, make or model.
   - Check the make, model, Customer and Site shown in the search result before selecting it. Similar
     fleet numbers may belong to an attachment or a different machine.
   - If the machine is genuinely not known yet, select **Equipment not known yet**. The entry must
     be reconciled with the correct Equipment later.
   - If no matching Equipment exists, use **Equipment not known yet** and ask an authorised person
     to create or reconcile the Equipment record.
4. Check the Customer, Site and address that appear after selecting the Equipment. Use **Change** if
   you selected the wrong machine.
5. Select the Site Contact when one is available and relevant. Leave **No contact** selected when no
   contact should be recorded for the Job.
6. Enter a clear **Description of the job**. This field is required.
7. Enter the **Customer PO** if one was supplied.
8. Select the **Mechanic** who should attend, or leave the entry **Unassigned** if this is not yet
   known. Use the search box when the technician list is long.
9. Leave operational scheduling to the Service Coordinator.
10. Select **Add to Job Book** once.
11. Wait for the saved entry and its allocated Job Number to appear before closing the page.

The permanent number is allocated by the system. Never try to invent, reuse or manually replace it.

### Screenshots

#### Search for the equipment

![Search results for equipment FN2695](https://github.com/user-attachments/assets/889f666e-4a10-441f-bb84-d9582da401a0)

#### Check the customer, site and contact

![Selected equipment with customer, site and contact](https://github.com/user-attachments/assets/87978002-62bd-4d3b-869b-72c2f2a724bc)

#### Review the completed entry before saving

![Completed Job Book entry ready for review](https://github.com/user-attachments/assets/b3664bb1-7ed0-4355-a993-d6d3de45b6e6)

### Final check before saving

Before selecting **Add to Job Book**, confirm that the form shows:

- the correct Equipment, including fleet number and make/model;
- the Customer, Site and address where the Equipment is currently located;
- the relevant Site Contact, or **No contact**;
- a clear description of the required work;
- the correct Mechanic, or **Unassigned** when this is not yet known; and
- the Customer PO when one was supplied.

The **Add to Job Book** button becomes available once the required Equipment and job description
are present and any location check has finished.

### If a save needs confirmation

If the page says **An entry save needs confirmation**, the original request has been retained.
Select **Resume saved request**. Do not create another entry, because the first request may already
have allocated a number.

If the app says the Job was saved but its details could not be confirmed, use the same resume action
or report the exact message. Do not retry as a new Job.

## Correct an entry

1. Find the entry in Job Book.
2. Select **Edit entry**.
3. Correct only the factual information that is wrong:
   - Equipment;
   - Customer and Site;
   - Contact;
   - assigned mechanic;
   - job description; or
   - Customer PO.
4. Review the location carefully. The Job address follows the selected Site.
5. Select **Save changes**.

Changing the location recorded on a Job is not the same as moving the Equipment. If the machine has
actually moved, use the approved location action from **Equipment** so its current Site is updated
explicitly. Historical Jobs keep their recorded locations.

If another person changed the entry while you had it open, the save may be refused. Reload the latest
record, recheck the intended correction and apply it again rather than overwriting their change.

## Mark an entry Void

Void is for an entry that must remain in the register but should not continue as work.

1. Find the entry.
2. Select the **Mark as void** action in its Actions column.
3. Read the warning and confirm that this is the correct entry.
4. Enter a clear reason. The reason becomes part of the retained history.
5. Confirm the action.

Void keeps the allocated Job Number, original details and audit history. It is not an undo or delete
action. A Void entry becomes read-only.

The action is unavailable after coordinator handoff or when protected GreenTree/Timecloud conditions
apply. If the button is disabled, read its on-screen explanation and ask a Service Coordinator rather
than trying to alter the record another way.

## Customers and Sites

Use **Customers** to search before creating anything.

- Create a new Customer and Site only when the correct records do not already exist.
- Use the verified address returned by the address search.
- Creating a Customer or Site is saved independently. Cancelling a later Job Book entry does not
  remove the Customer or Site you already created.
- Do not rename or rewrite an existing Customer or Site merely to make one Job look correct.

## Equipment

Use **Equipment** to find machines and maintain the approved details available to this role, such as
fleet identifiers, make, model, serial number, Site and road-compliance details.

- Search by fleet number or serial number before creating Equipment.
- Move Equipment only when its real current location has changed.
- Check the destination Customer and Site before saving; Customer follows Site.
- Do not attempt to change maintenance plans, historical meter/service evidence or unrelated
  operational information.

An Equipment move is saved separately from a Job Book entry. Cancelling the Job Book entry does not
reverse a completed Equipment move.

## Troubleshooting

| Situation | What to do |
| --- | --- |
| **+ New entry** is disabled for a region | Read the regional protection notice. That region is not ready to allocate numbers. |
| Equipment cannot be found | Search fleet, alternate fleet, serial, make and model. Use **Equipment not known yet**, then ask an authorised person to create or reconcile the Equipment record. |
| **Edit entry** is not available | The entry may be Void, historical, or outside the permitted correction workflow. Read the status shown in the row. |
| Void is disabled | Read the button explanation. Coordinator-managed or protected entered work cannot be voided by this role. |
| A save reports a conflict | Reload the current record, recheck the correction and try once more. |
| The page shows **GT sync warning** or **Load warning** | Avoid guessing the missing status. Retry once when offered, then report the exact warning. |
| A mechanic cannot be found | Open the **Mechanic** list and search by name or contact detail. Leave the entry **Unassigned** if the correct person is not yet known. |
| Email or marker controls are unavailable | This is expected for Job Book Admin. Ask a Service Coordinator or Office Admin to perform the separately authorised action. |

Back to [Service Operations user guides](Home) · [Getting started and signing in](Getting-Started-and-Signing-In)

_Last reviewed: 9 October 2026._
