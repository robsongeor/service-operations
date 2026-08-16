# Job Description Length

The managed Job description is stored in `gr_job.gr_description` and supports up to 4,000
characters. This matches the separate Job Book Intake `gr_jobbookentry.gr_description` limit.

The existing Job column is enlarged in place by
`scripts/manage-job-description-schema.ps1`; provisioning does not rewrite or backfill Job rows.
The Job create drawer, edit drawer, Jobs table inline editor, and Job Book controls use the same
shared application limit.
