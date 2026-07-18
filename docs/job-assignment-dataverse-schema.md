# Technician job assignments

Jobs retain a current technician lookup for fast filtering and the Mechanics page. The organization-owned **Job Assignment** table preserves every technician visit and its individual email and paperwork history.

## Job Assignment table

| Display name | Schema name | Type | Required |
| --- | --- | --- | --- |
| Name | `gr_name` | Text | Yes |
| Job | `gr_job` | Lookup to Job | Yes |
| Technician | `gr_mechanic` | Lookup to Mechanic | Yes |
| Work Instructions | `gr_workinstructions` | Multiline text | No |
| Job Card Status | `gr_jobcardstatus` | Existing global choice | Yes |
| Assigned On | `gr_assignedon` | Date and time | No |
| Email Sent On | `gr_emailsenton` | Date and time | No |
| Submitted On | `gr_submittedon` | Date and time | No |
| Closed On | `gr_closedon` | Date and time | No |

The table is organization-owned so office users with table access see the complete assignment history.

## Behaviour

- Adding an assignment records the technician and instructions, and makes that technician the job's current mechanic.
- Previous assignments are not overwritten.
- Email and job-card status are tracked independently for every assignment.
- The Jobs table action displays an assignment summary without adding a column.
- Overall Job Card Status remains office-controlled and is closed only after all required technician paperwork has been accepted.

Run `scripts/setup-job-assignment-schema.ps1` to create and publish the schema in the Service Operations solution.
